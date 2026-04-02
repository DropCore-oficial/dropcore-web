/**
 * GET /api/fornecedor/pedidos/[id]/etiqueta
 * Retorna dados para impressão (etiqueta de embalagem/separação) do pedido.
 *
 * Observação: hoje o sistema não armazena endereço/CEP/ticket de frete do cliente,
 * então a etiqueta é focada em "o que separar" (itens, cor/tamanho/categoria).
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getFornecedorFromToken(req: Request): Promise<{ fornecedor_id: string; org_id: string } | null> {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return null;

  const sbAnon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );

  const { data: userData, error: userErr } = await sbAnon.auth.getUser(token);
  if (userErr || !userData?.user) return null;

  const { data: member } = await supabaseAdmin
    .from("org_members")
    .select("org_id, fornecedor_id")
    .eq("user_id", userData.user.id)
    .not("fornecedor_id", "is", null)
    .limit(1)
    .maybeSingle();

  if (!member?.fornecedor_id) return null;
  return { fornecedor_id: member.fornecedor_id, org_id: member.org_id };
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getFornecedorFromToken(req);
    if (!ctx) {
      return NextResponse.json({ error: "Não autenticado como fornecedor." }, { status: 401 });
    }

    const { id: pedido_id } = await params;
    if (!pedido_id) return NextResponse.json({ error: "ID do pedido é obrigatório." }, { status: 400 });

    const { data: pedido, error: pedidoErr } = await supabaseAdmin
      .from("pedidos")
      .select(
        "id, seller_id, status, criado_em, valor_fornecedor, nome_produto, referencia_externa, sku_id, etiqueta_pdf_url, etiqueta_pdf_base64, tracking_codigo, metodo_envio"
      )
      .eq("org_id", ctx.org_id)
      .eq("fornecedor_id", ctx.fornecedor_id)
      .eq("id", pedido_id)
      .maybeSingle();

    if (pedidoErr) return NextResponse.json({ error: pedidoErr.message }, { status: 500 });
    if (!pedido) return NextResponse.json({ error: "Pedido não encontrado." }, { status: 404 });

    const { data: seller } = await supabaseAdmin
      .from("sellers")
      .select("nome")
      .eq("id", pedido.seller_id)
      .maybeSingle();

    const seller_nome = seller?.nome ?? "—";

    // Itens detalhados (onde cor/tamanho/categoria moram).
    // Não usar pedido_itens.nome_produto: em alguns bancos a tabela foi criada só com sku_id/qtd/valores (create-pedidos.sql).
    const { data: itensRaw, error: itensErr } = await supabaseAdmin
      .from("pedido_itens")
      .select("sku_id, quantidade, valor_total")
      .eq("pedido_id", pedido_id);

    if (itensErr) return NextResponse.json({ error: itensErr.message }, { status: 500 });

    const itens = (itensRaw ?? []).map((i) => ({
      sku_id: i.sku_id as string | null,
      quantidade: Number(i.quantidade ?? 1),
      valor_total: Number(i.valor_total ?? 0),
    }));

    const skuIds = [...new Set(itens.map((i) => i.sku_id).filter(Boolean))] as string[];
    const { data: skus } =
      skuIds.length > 0
        ? await supabaseAdmin.from("skus").select("id, sku, cor, tamanho, categoria, nome_produto").in("id", skuIds)
        : { data: [] as any[] };

    const skusMap = new Map<string, any>();
    for (const s of skus ?? []) skusMap.set(s.id, s);

    const itensComDetalhes =
      itens.length > 0
        ? itens.map((i) => {
            const s = i.sku_id ? skusMap.get(i.sku_id) : undefined;
            return {
              sku_id: i.sku_id,
              nome_produto: s?.nome_produto ?? pedido.nome_produto ?? null,
              sku: s?.sku ?? null,
              cor: s?.cor ?? null,
              tamanho: s?.tamanho ?? null,
              categoria: s?.categoria ?? null,
              quantidade: i.quantidade,
              valor_total: i.valor_total,
            };
          })
        : [
            {
              sku_id: pedido.sku_id ?? null,
              nome_produto: pedido.nome_produto ?? null,
              sku: null,
              cor: null,
              tamanho: null,
              categoria: null,
              quantidade: 1,
              valor_total: Number(pedido.valor_fornecedor ?? 0),
            },
          ];

    const { data: eventosRaw } = await supabaseAdmin
      .from("pedido_eventos")
      .select("id, tipo, origem, descricao, criado_em, metadata")
      .eq("org_id", ctx.org_id)
      .eq("pedido_id", pedido_id)
      .order("criado_em", { ascending: false })
      .limit(8);

    return NextResponse.json({
      pedido: {
        id: pedido.id,
        status: pedido.status,
        criado_em: pedido.criado_em,
        valor_fornecedor: Number(pedido.valor_fornecedor ?? 0),
        referencia_externa: pedido.referencia_externa ?? null,
        seller_nome,
        etiqueta_pdf_url: (pedido as any).etiqueta_pdf_url ?? null,
        etiqueta_pdf_base64: (pedido as any).etiqueta_pdf_base64 ?? null,
        tracking_codigo: (pedido as any).tracking_codigo ?? null,
        metodo_envio: (pedido as any).metodo_envio ?? null,
      },
      itens: itensComDetalhes,
      eventos: (eventosRaw ?? []).map((e) => ({
        id: e.id,
        tipo: e.tipo,
        origem: e.origem,
        descricao: e.descricao,
        criado_em: e.criado_em,
        metadata: e.metadata ?? null,
      })),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

