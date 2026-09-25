/**
 * GET /api/fornecedor/pedidos
 * Lista pedidos que o fornecedor autenticado deve atender.
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { motivoBloqueioParaPortal } from "@/lib/pedidoBloqueioResponsavel";
import { buscarPrevisaoEtiquetaMlPendentes } from "@/lib/pedidoEtiquetaMercadoLivreBuffer";
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
  etiqueta_impressa_em?: string | null;
  referencia_externa: string | null;
  motivo_bloqueio?: string | null;
  motivo_bloqueio_responsavel?: "seller" | "fornecedor" | null;
  marketplace_numero?: string | null;
  marketplace_pack_id?: string | null;
  comprador_nome?: string | null;
  comprador_cidade?: string | null;
  comprador_uf?: string | null;
  comprador_fone?: string | null;
  metodo_envio?: string | null;
  tracking_codigo?: string | null;
  canal_venda?: string | null;
  e_teste?: boolean;
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
    const limit = Math.min(300, Math.max(1, parseInt(searchParams.get("limit") || "10", 10) || 10));
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabaseAdmin
      .from("pedidos")
      .select(
        "id, seller_id, fornecedor_id, sku_id, nome_produto, preco_venda, valor_fornecedor, status, motivo_bloqueio, motivo_bloqueio_responsavel, criado_em, etiqueta_pdf_url, etiqueta_pdf_base64, etiqueta_impressa_em, marketplace_numero, marketplace_pack_id, comprador_nome, comprador_cidade, comprador_uf, comprador_fone, referencia_externa, metodo_envio, tracking_codigo, canal_venda, e_teste",
        { count: "exact" }
      )
      .eq("org_id", ctx.org_id)
      .eq("fornecedor_id", ctx.fornecedor_id)
      // Pedido com produto fora do catálogo do fornecedor vinculado nunca é dele de
      // verdade (sem saldo, sem etiqueta) — não aparece na tela do fornecedor, só na do
      // seller (ver web/lib/erp/submitSellerErpPedido.ts).
      .neq("status", "produto_nao_vinculado")
      .neq("status", "anuncio_sem_sku")
      .order("criado_em", { ascending: false })
      .range(from, to);

    if (status && ["enviado", "aguardando_repasse", "entregue", "devolvido", "cancelado", "erro_saldo", "pendente_estoque", "bloqueado"].includes(status)) {
      query = query.eq("status", status);
    }

    let data: PedidoRow[] | null;
    let error: { message: string; code?: string } | null;
    let total: number | null;
    ({ data, error, count: total } = await query);
    if (error) {
      const msg = String(error.message ?? "").toLowerCase();
      const colunaAusente =
        msg.includes("marketplace_numero") ||
        msg.includes("comprador_") ||
        msg.includes("motivo_bloqueio") ||
        msg.includes("etiqueta_impressa_em") ||
        error.code === "42703";
      if (colunaAusente) {
        let fallbackQuery = supabaseAdmin
          .from("pedidos")
          .select(
            "id, seller_id, fornecedor_id, sku_id, nome_produto, preco_venda, valor_fornecedor, status, criado_em, etiqueta_pdf_url, etiqueta_pdf_base64, referencia_externa, e_teste",
            { count: "exact" }
          )
          .eq("org_id", ctx.org_id)
          .eq("fornecedor_id", ctx.fornecedor_id)
          .neq("status", "produto_nao_vinculado")
          .neq("status", "anuncio_sem_sku")
          .order("criado_em", { ascending: false })
          .range(from, to);
        if (status && ["enviado", "aguardando_repasse", "entregue", "devolvido", "cancelado", "erro_saldo", "pendente_estoque", "bloqueado"].includes(status)) {
          fallbackQuery = fallbackQuery.eq("status", status);
        }
        ({ data, error, count: total } = await fallbackQuery);
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

    const alvoParaMl: {
      id: string;
      seller_id: string;
      status: string;
      canal_venda: string | null;
      referencia_externa: string | null;
      marketplace_numero: string | null;
      tem_etiqueta: boolean;
    }[] = [];

    const items = (data ?? []).map((p) => {
      const itens = itensPorPedido.get(p.id) ?? [];
      const primeiro = itens[0] ?? null;
      const skuLegado = !primeiro && p.sku_id ? skusMapLegado.get(p.sku_id) : null;
      const url = (p as { etiqueta_pdf_url?: string | null }).etiqueta_pdf_url?.trim() ?? "";
      const b64 = (p as { etiqueta_pdf_base64?: string | null }).etiqueta_pdf_base64;
      const tem_etiqueta_oficial = Boolean(url) || Boolean(b64 && String(b64).trim().length > 0);
      alvoParaMl.push({
        id: p.id,
        seller_id: p.seller_id,
        status: p.status,
        canal_venda: p.canal_venda ?? null,
        referencia_externa: p.referencia_externa,
        marketplace_numero: p.marketplace_numero ?? null,
        tem_etiqueta: tem_etiqueta_oficial,
      });
      const {
        etiqueta_pdf_url: _u,
        etiqueta_pdf_base64: _b,
        motivo_bloqueio: _mb,
        motivo_bloqueio_responsavel: responsavel,
        ...rest
      } = p as Record<string, unknown>;
      return {
        ...rest,
        id: p.id,
        valor_fornecedor: p.valor_fornecedor,
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
        etiqueta_ml_previsao: null as string | null,
        pack_pedido_ids: [p.id] as string[],
      };
    });

    // Comprador que leva >1 unidade num único checkout do ML às vezes gera vários
    // order_id/pedidos separados que são, na prática, 1 pacote/1 etiqueta só (confirmado
    // ao vivo 2026-09-23 — ver docs/SCHEMA.md). Agrupa nessa página antes da previsão de
    // etiqueta, pra não repetir a mesma chamada por irmão.
    const idsPrincipais = new Set<string>();
    const porPack = new Map<string, typeof items>();
    const itemsAgrupados: typeof items = [];
    for (const p of items) {
      const packId = (p as { marketplace_pack_id?: string | null }).marketplace_pack_id;
      if (!packId) {
        itemsAgrupados.push(p);
        idsPrincipais.add(p.id);
        continue;
      }
      const grupo = porPack.get(packId);
      if (!grupo) {
        porPack.set(packId, [p]);
        itemsAgrupados.push(p);
        idsPrincipais.add(p.id);
        continue;
      }
      grupo.push(p);
      const principal = itemsAgrupados.find((it) => it.pack_pedido_ids[0] === grupo[0].id);
      if (principal) {
        principal.valor_fornecedor = Number(principal.valor_fornecedor ?? 0) + Number(p.valor_fornecedor ?? 0);
        principal.itens = [...principal.itens, ...p.itens];
        principal.pack_pedido_ids = [...principal.pack_pedido_ids, p.id];
        (principal as { marketplace_numero?: string | null }).marketplace_numero = packId;
        if (!principal.tem_etiqueta_oficial && p.tem_etiqueta_oficial) {
          principal.tem_etiqueta_oficial = true;
        }
      }
    }
    const alvoParaMlAgrupado = alvoParaMl.filter((a) => idsPrincipais.has(a.id));

    // Mesma lógica do `/api/seller/pedidos`: pedido "enviado" sem etiqueta que veio direto
    // do ML mostra a data real de liberação em vez do alerta "Sem etiqueta" (que é
    // especificamente pro caso Olist, onde o seller precisa colar o link manualmente).
    const previsaoMlPorPedido = await buscarPrevisaoEtiquetaMlPendentes(alvoParaMlAgrupado);
    for (let i = 0; i < itemsAgrupados.length; i++) {
      const previsao = previsaoMlPorPedido.get(itemsAgrupados[i].id);
      if (previsao !== undefined) {
        (itemsAgrupados[i] as { etiqueta_ml_previsao: string | null }).etiqueta_ml_previsao = previsao;
      }
    }

    return NextResponse.json({
      items: itemsAgrupados,
      total: total ?? itemsAgrupados.length,
      page,
      limit,
      expedicao_padrao: expedicaoPadrao,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
