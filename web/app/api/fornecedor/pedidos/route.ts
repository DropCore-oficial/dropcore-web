/**
 * GET /api/fornecedor/pedidos
 * Lista pedidos que o fornecedor autenticado deve atender.
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { motivoBloqueioParaPortal } from "@/lib/pedidoBloqueioResponsavel";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PedidoRow = {
  id: string;
  seller_id: string;
  fornecedor_id: string;
  sku_id: string | null;
  nome_produto: string | null;
  preco_venda: number | null;
  valor_fornecedor: number;
  status: string;
  criado_em: string;
  etiqueta_pdf_url: string | null;
  etiqueta_pdf_base64: string | null;
  referencia_externa: string | null;
  motivo_bloqueio?: string | null;
  motivo_bloqueio_responsavel?: "seller" | "fornecedor" | null;
  marketplace_numero?: string | null;
  comprador_nome?: string | null;
  comprador_cidade?: string | null;
  comprador_uf?: string | null;
  comprador_fone?: string | null;
  metodo_envio?: string | null;
  tracking_codigo?: string | null;
};

type PedidoItemRow = {
  sku: string;
  quantidade: number;
  nome_produto: string | null;
  cor: string | null;
  tamanho: string | null;
  categoria: string | null;
  linha_despacho: string | null;
};

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

export async function GET(req: Request) {
  try {
    const ctx = await getFornecedorFromToken(req);
    if (!ctx) {
      return NextResponse.json({ error: "Não autenticado como fornecedor." }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status")?.trim();
    const limit = Math.min(100, parseInt(searchParams.get("limit") || "50", 10) || 50);

    let query = supabaseAdmin
      .from("pedidos")
      .select(
        "id, seller_id, fornecedor_id, sku_id, nome_produto, preco_venda, valor_fornecedor, status, motivo_bloqueio, motivo_bloqueio_responsavel, criado_em, etiqueta_pdf_url, etiqueta_pdf_base64, marketplace_numero, comprador_nome, comprador_cidade, comprador_uf, comprador_fone, referencia_externa, metodo_envio, tracking_codigo"
      )
      .eq("org_id", ctx.org_id)
      .eq("fornecedor_id", ctx.fornecedor_id)
      .order("criado_em", { ascending: false })
      .limit(limit);

    if (status && ["enviado", "aguardando_repasse", "entregue", "devolvido", "cancelado", "erro_saldo", "pendente_estoque", "bloqueado"].includes(status)) {
      query = query.eq("status", status);
    }

    let data: PedidoRow[] | null;
    let error: { message: string; code?: string } | null;
    ({ data, error } = await query);
    if (error) {
      const msg = String(error.message ?? "").toLowerCase();
      const colunaAusente =
        msg.includes("marketplace_numero") || msg.includes("comprador_") || msg.includes("motivo_bloqueio") || error.code === "42703";
      if (colunaAusente) {
        let fallbackQuery = supabaseAdmin
          .from("pedidos")
          .select(
            "id, seller_id, fornecedor_id, sku_id, nome_produto, preco_venda, valor_fornecedor, status, criado_em, etiqueta_pdf_url, etiqueta_pdf_base64, referencia_externa"
          )
          .eq("org_id", ctx.org_id)
          .eq("fornecedor_id", ctx.fornecedor_id)
          .order("criado_em", { ascending: false })
          .limit(limit);
        if (status && ["enviado", "aguardando_repasse", "entregue", "devolvido", "cancelado", "erro_saldo", "pendente_estoque", "bloqueado"].includes(status)) {
          fallbackQuery = fallbackQuery.eq("status", status);
        }
        ({ data, error } = await fallbackQuery);
      }
      if (error) {
        console.error("[fornecedor/pedidos GET]", error.message);
        return NextResponse.json({ error: "Erro ao buscar pedidos." }, { status: 500 });
      }
    }

    const sellerIds = [...new Set((data ?? []).map((p) => p.seller_id))];
    const sellersMap = new Map<string, string>();
    if (sellerIds.length > 0) {
      const { data: sellers } = await supabaseAdmin.from("sellers").select("id, nome").in("id", sellerIds);
      for (const s of sellers ?? []) sellersMap.set(s.id, s.nome ?? "—");
    }

    // Linha de despacho padrão do fornecedor (usada quando o SKU não tem override próprio).
    const { data: fornecedorRow } = await supabaseAdmin
      .from("fornecedores")
      .select("expedicao_padrao_linha")
      .eq("id", ctx.fornecedor_id)
      .maybeSingle();
    const expedicaoPadrao = String((fornecedorRow as { expedicao_padrao_linha?: string | null } | null)?.expedicao_padrao_linha ?? "").trim() || null;

    // Itens reais do pedido vêm de pedido_itens (multi-item) — pedidos.sku_id é legado
    // (só populado no fluxo manual do admin) e fica nulo pros pedidos vindos do ERP/Olist.
    const pedidoIds = (data ?? []).map((p) => p.id);
    const itensPorPedido = new Map<string, PedidoItemRow[]>();
    if (pedidoIds.length > 0) {
      const { data: itens, error: itensErr } = await supabaseAdmin
        .from("pedido_itens")
        .select("pedido_id, quantidade, skus(sku, nome_produto, cor, tamanho, categoria, expedicao_override_linha)")
        .in("pedido_id", pedidoIds);
      if (itensErr) {
        console.error("[fornecedor/pedidos GET] itens:", itensErr.message);
      }
      for (const row of itens ?? []) {
        const pid = row.pedido_id as string;
        const skusJoined = row.skus as unknown;
        const sku = (Array.isArray(skusJoined) ? skusJoined[0] : skusJoined) as
          | { sku?: string; nome_produto?: string | null; cor?: string | null; tamanho?: string | null; categoria?: string | null; expedicao_override_linha?: string | null }
          | null;
        const list = itensPorPedido.get(pid) ?? [];
        list.push({
          sku: sku?.sku ?? "—",
          quantidade: Number(row.quantidade ?? 1),
          nome_produto: sku?.nome_produto ?? null,
          cor: sku?.cor ?? null,
          tamanho: sku?.tamanho ?? null,
          categoria: sku?.categoria ?? null,
          linha_despacho: (sku?.expedicao_override_linha?.trim() || expedicaoPadrao) ?? null,
        });
        itensPorPedido.set(pid, list);
      }
    }

    // Fallback legado: pedidos manuais do admin ainda populam pedidos.sku_id direto.
    const skuIdsLegado = [...new Set((data ?? []).map((p) => p.sku_id).filter(Boolean))] as string[];
    const skusMapLegado = new Map<string, { cor: string | null; tamanho: string | null; categoria: string | null }>();
    if (skuIdsLegado.length > 0) {
      const { data: skus } = await supabaseAdmin
        .from("skus")
        .select("id, cor, tamanho, categoria")
        .in("id", skuIdsLegado);
      for (const s of skus ?? []) {
        skusMapLegado.set(s.id, { cor: (s.cor as string | null) ?? null, tamanho: (s.tamanho as string | null) ?? null, categoria: (s.categoria as string | null) ?? null });
      }
    }

    const items = (data ?? []).map((p) => {
      const itens = itensPorPedido.get(p.id) ?? [];
      const primeiro = itens[0] ?? null;
      const skuLegado = !primeiro && p.sku_id ? skusMapLegado.get(p.sku_id) : null;
      const url = (p as { etiqueta_pdf_url?: string | null }).etiqueta_pdf_url?.trim() ?? "";
      const b64 = (p as { etiqueta_pdf_base64?: string | null }).etiqueta_pdf_base64;
      const tem_etiqueta_oficial = Boolean(url) || Boolean(b64 && String(b64).trim().length > 0);
      const {
        etiqueta_pdf_url: _u,
        etiqueta_pdf_base64: _b,
        motivo_bloqueio: _mb,
        motivo_bloqueio_responsavel: responsavel,
        ...rest
      } = p as Record<string, unknown>;
      return {
        ...rest,
        motivo_bloqueio: motivoBloqueioParaPortal({
          portal: "fornecedor",
          responsavel: responsavel as "seller" | "fornecedor" | null,
          motivoCompleto: (p as { motivo_bloqueio?: string | null }).motivo_bloqueio,
        }),
        seller_nome: sellersMap.get(p.seller_id) ?? "—",
        cor: primeiro?.cor ?? skuLegado?.cor ?? null,
        tamanho: primeiro?.tamanho ?? skuLegado?.tamanho ?? null,
        categoria: primeiro?.categoria ?? skuLegado?.categoria ?? null,
        linha_despacho: primeiro?.linha_despacho ?? expedicaoPadrao,
        itens,
        tem_etiqueta_oficial,
      };
    });

    return NextResponse.json({ items });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
