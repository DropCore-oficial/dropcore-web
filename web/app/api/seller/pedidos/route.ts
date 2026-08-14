/**
 * GET /api/seller/pedidos — Lista pedidos do seller autenticado.
 */
import { NextResponse } from "next/server";
import { motivoBloqueioParaPortal } from "@/lib/pedidoBloqueioResponsavel";
import { getSellerFromToken } from "@/lib/sellerSessionAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PedidoRow = {
  id: string;
  nome_produto: string | null;
  valor_total: number;
  preco_venda?: number | null;
  status: string;
  criado_em: string;
  referencia_externa: string | null;
  tracking_codigo: string | null;
  metodo_envio: string | null;
  etiqueta_pdf_url: string | null;
  etiqueta_tentativas: number | null;
  motivo_bloqueio?: string | null;
  motivo_bloqueio_responsavel?: "seller" | "fornecedor" | null;
  marketplace_numero?: string | null;
  comprador_nome?: string | null;
  comprador_cidade?: string | null;
  comprador_uf?: string | null;
  comprador_fone?: string | null;
};

const STATUS_FILTER = [
  "pendente_estoque",
  "bloqueado",
  "enviado",
  "aguardando_repasse",
  "entregue",
  "devolvido",
  "cancelado",
  "erro_saldo",
] as const;

/** Status sintético (não existe em `pedidos.status`) — pedido Olist "Em aberto"
 * (aguardando pagamento), montado a partir de `estoque_reservas`, sem valor nem ação. */
const STATUS_AGUARDANDO_PAGAMENTO = "aguardando_pagamento";

export async function GET(req: Request) {
  try {
    const seller = await getSellerFromToken(req);
    if (!seller) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status")?.trim();
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
    const pageSize = Math.min(300, Math.max(1, parseInt(searchParams.get("limit") || "10", 10) || 10));
    const somenteReservas = status === STATUS_AGUARDANDO_PAGAMENTO;

    let data: PedidoRow[] | null = [];
    let error: { message: string; code?: string } | null = null;
    let pedidosCount = 0;

    if (!somenteReservas) {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      let query = supabaseAdmin
        .from("pedidos")
        .select(
          "id, nome_produto, valor_total, preco_venda, status, motivo_bloqueio, motivo_bloqueio_responsavel, criado_em, referencia_externa, tracking_codigo, metodo_envio, marketplace_numero, comprador_nome, comprador_cidade, comprador_uf, comprador_fone, etiqueta_pdf_url, etiqueta_pdf_base64, etiqueta_tentativas",
          { count: "exact" }
        )
        .eq("org_id", seller.org_id)
        .eq("seller_id", seller.id)
        .order("criado_em", { ascending: false })
        .range(from, to);

      if (status && (STATUS_FILTER as readonly string[]).includes(status)) {
        query = query.eq("status", status);
      }

      const res = await query;
      data = res.data;
      error = res.error;
      pedidosCount = res.count ?? 0;
      if (error) {
        const msg = String(error.message ?? "").toLowerCase();
        const colunaAusente =
          msg.includes("marketplace_numero") ||
          msg.includes("comprador_") ||
          msg.includes("motivo_bloqueio") ||
          error.code === "42703";
        if (!colunaAusente) {
          console.error("[seller/pedidos GET]", error.message);
          return NextResponse.json({ error: "Erro ao buscar pedidos." }, { status: 500 });
        }
        let fallbackQuery = supabaseAdmin
          .from("pedidos")
          .select(
            "id, nome_produto, valor_total, status, criado_em, referencia_externa, tracking_codigo, metodo_envio, etiqueta_pdf_url, etiqueta_pdf_base64, etiqueta_tentativas",
            { count: "exact" }
          )
          .eq("org_id", seller.org_id)
          .eq("seller_id", seller.id)
          .order("criado_em", { ascending: false })
          .range(from, to);
        if (status && (STATUS_FILTER as readonly string[]).includes(status)) {
          fallbackQuery = fallbackQuery.eq("status", status);
        }
        const fallback = await fallbackQuery;
        if (fallback.error) {
          console.error("[seller/pedidos GET]", fallback.error.message);
          return NextResponse.json({ error: "Erro ao buscar pedidos." }, { status: 500 });
        }
        data = fallback.data;
        error = fallback.error;
        pedidosCount = fallback.count ?? 0;
      }
    }

    const pedidoIds = (data ?? []).map((p) => p.id);
    const itensPorPedido = new Map<string, Array<{ sku: string; quantidade: number; nome_produto: string | null }>>();

    if (pedidoIds.length > 0) {
      const { data: itens, error: itensErr } = await supabaseAdmin
        .from("pedido_itens")
        .select("pedido_id, quantidade, skus(sku, nome_produto)")
        .in("pedido_id", pedidoIds);

      if (itensErr) {
        console.error("[seller/pedidos GET] itens:", itensErr.message);
      }

      for (const row of itens ?? []) {
        const pid = row.pedido_id as string;
        const skuInfo = row.skus as { sku?: string; nome_produto?: string | null } | null;
        const list = itensPorPedido.get(pid) ?? [];
        list.push({
          sku: skuInfo?.sku ?? "—",
          quantidade: Number(row.quantidade ?? 1),
          nome_produto: skuInfo?.nome_produto ?? null,
        });
        itensPorPedido.set(pid, list);
      }
    }

    const items = (data ?? []).map((p) => {
      const row = p as typeof p & { motivo_bloqueio_responsavel?: "seller" | "fornecedor" | null };
      return {
        ...p,
        motivo_bloqueio: motivoBloqueioParaPortal({
          portal: "seller",
          responsavel: row.motivo_bloqueio_responsavel,
          motivoCompleto: row.motivo_bloqueio,
        }),
        itens: itensPorPedido.get(p.id) ?? [],
        etiqueta_tentativas: p.etiqueta_tentativas ?? 0,
        tem_etiqueta: Boolean(
          (p as { etiqueta_pdf_url?: string | null }).etiqueta_pdf_url?.trim() ||
            (p as { etiqueta_pdf_base64?: string | null }).etiqueta_pdf_base64?.trim()
        ),
        is_reserva: false,
      };
    });

    // Pedidos Olist "Em aberto" (aguardando pagamento) — reserva estoque mas ainda não
    // vira `pedidos`/`financial_ledger`. Só entra na lista quando o filtro é "Todos" ou
    // o próprio filtro "Aguardando pagamento".
    const incluirReservas = !status || somenteReservas;
    let reservaItems: typeof items = [];

    if (incluirReservas) {
      const { data: reservas, error: reservasErr } = await supabaseAdmin
        .from("estoque_reservas")
        .select(
          "referencia_externa, quantidade, comprador_nome, marketplace_numero, canal_venda, criado_em, skus(sku, nome_produto, cor, tamanho)"
        )
        .eq("org_id", seller.org_id)
        .eq("seller_id", seller.id)
        .eq("status", "ativa")
        .order("criado_em", { ascending: false });

      if (reservasErr) {
        console.error("[seller/pedidos GET] reservas:", reservasErr.message);
      }

      const porReferencia = new Map<
        string,
        {
          criado_em: string;
          comprador_nome: string | null;
          marketplace_numero: string | null;
          canal_venda: string | null;
          itens: Array<{ sku: string; quantidade: number; nome_produto: string | null }>;
        }
      >();

      for (const row of reservas ?? []) {
        const ref = row.referencia_externa as string;
        const skuInfo = row.skus as { sku?: string; nome_produto?: string | null; cor?: string | null; tamanho?: string | null } | null;
        const criadoEm = row.criado_em as string;
        const grupo = porReferencia.get(ref) ?? {
          criado_em: criadoEm,
          comprador_nome: (row.comprador_nome as string | null) ?? null,
          marketplace_numero: (row.marketplace_numero as string | null) ?? null,
          canal_venda: (row.canal_venda as string | null) ?? null,
          itens: [],
        };
        const nomeCompleto = skuInfo?.nome_produto
          ? [skuInfo.nome_produto, skuInfo.cor, skuInfo.tamanho]
              .map((p) => (p ? String(p).trim() : ""))
              .filter(Boolean)
              .join(" - ")
          : null;
        grupo.itens.push({
          sku: skuInfo?.sku ?? "—",
          quantidade: Number(row.quantidade ?? 1),
          nome_produto: nomeCompleto,
        });
        if (criadoEm && criadoEm < grupo.criado_em) grupo.criado_em = criadoEm;
        porReferencia.set(ref, grupo);
      }

      reservaItems = Array.from(porReferencia.entries()).map(([referenciaExterna, g]) => ({
        id: `reserva:${referenciaExterna}`,
        nome_produto: g.itens.map((i) => i.nome_produto).find(Boolean) ?? null,
        valor_total: 0,
        status: STATUS_AGUARDANDO_PAGAMENTO,
        motivo_bloqueio: null,
        criado_em: g.criado_em,
        referencia_externa: referenciaExterna,
        tracking_codigo: null,
        metodo_envio: null,
        marketplace_numero: g.marketplace_numero,
        comprador_nome: g.comprador_nome,
        comprador_cidade: null,
        comprador_uf: null,
        comprador_fone: null,
        itens: g.itens,
        etiqueta_pdf_url: null,
        etiqueta_pdf_base64: null,
        etiqueta_tentativas: 0,
        tem_etiqueta: false,
        is_reserva: true,
      }));
    }

    const byDateDesc = (a: { criado_em: string }, b: { criado_em: string }) =>
      new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime();

    let merged: typeof items;
    let total: number;

    if (somenteReservas) {
      // Só reservas ("Em aberto") — lista tende a ser pequena, pagina o array já
      // buscado inteiro em vez de fazer `.range()` no Supabase pra isso.
      const sorted = [...reservaItems].sort(byDateDesc);
      total = sorted.length;
      const from = (page - 1) * pageSize;
      merged = sorted.slice(from, from + pageSize);
    } else {
      // `pedidos` já vem paginado do banco (`.range()`). Reservas não têm página própria
      // — como a lista costuma ser pequena, elas só entram inteiras na página 1 (mais
      // recentes primeiro), sem tentar intercalar duas fontes paginadas separadamente.
      merged = page === 1 ? [...reservaItems, ...items].sort(byDateDesc) : items;
      total = pedidosCount + (incluirReservas ? reservaItems.length : 0);
    }

    return NextResponse.json({ items: merged, total, page, limit: pageSize });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
