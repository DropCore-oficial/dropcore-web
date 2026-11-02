/**
 * GET /api/seller/pedidos — Lista pedidos do seller autenticado.
 */
import { NextResponse } from "next/server";
import { motivoBloqueioParaPortal } from "@/lib/pedidoBloqueioResponsavel";
import { buscarPrevisaoEtiquetaMlPendentes } from "@/lib/pedidoEtiquetaMercadoLivreBuffer";
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
  etiqueta_pdf_base64?: string | null;
  etiqueta_tentativas: number | null;
  etiqueta_impressa_em?: string | null;
  etiqueta_liberada_em?: string | null;
  motivo_bloqueio?: string | null;
  motivo_bloqueio_responsavel?: "seller" | "fornecedor" | null;
  cancelado_motivo?: string | null;
  marketplace_numero?: string | null;
  marketplace_pack_id?: string | null;
  comprador_nome?: string | null;
  comprador_cidade?: string | null;
  comprador_uf?: string | null;
  comprador_fone?: string | null;
  canal_venda?: string | null;
};

const STATUS_FILTER = [
  "pendente_estoque",
  "bloqueado",
  "produto_nao_vinculado",
  "anuncio_sem_sku",
  "enviado",
  "aguardando_repasse",
  "entregue",
  "em_devolucao",
  "devolvido",
  "devolucao_sem_fornecedor",
  "cancelado",
  "erro_saldo",
] as const;

/** Mesmo grupo computado na RPC (total_count_pendencias) — usado aqui só pra decidir se a
 * reserva "aguardando pagamento" deve entrar junto (ela não tem fornecedor_id/não vem da
 * RPC, mas pertence ao mesmo balde visual "precisa de atenção"). */
const STATUS_PENDENCIAS = ["bloqueado", "produto_nao_vinculado", "anuncio_sem_sku", "pendente_estoque", "erro_saldo"];

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
    // Aceita vários status de uma vez, separados por vírgula (grupo de abas da tela).
    const statusParam = searchParams.get("status")?.trim();
    const statusArray = statusParam
      ? statusParam.split(",").map((s) => s.trim()).filter((s) => (STATUS_FILTER as readonly string[]).includes(s))
      : null;
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
    const pageSize = Math.min(300, Math.max(1, parseInt(searchParams.get("limit") || "10", 10) || 10));

    // Busca por nome do produto + período — opcionais, combinam com a aba ativa. (Busca por
    // fornecedor não fazia sentido aqui: hoje cada seller só tem 1 fornecedor conectado.)
    const produtoParam = searchParams.get("produto")?.trim() || null;
    const desdeParam = searchParams.get("desde")?.trim() || null;
    const desdeValido = desdeParam && !Number.isNaN(new Date(desdeParam).getTime()) ? desdeParam : null;
    const ateParam = searchParams.get("ate")?.trim() || null;
    const ateValido = ateParam && !Number.isNaN(new Date(ateParam).getTime()) ? ateParam : null;

    let data: PedidoRow[] | null = [];
    let pedidosCount = 0;
    let abas = { todos: 0, pendencias: 0, pra_enviar: 0, enviados: 0, devolucao: 0, concluidos: 0, cancelados: 0 };

    {
      const from = (page - 1) * pageSize;

      // RPC (regra 9): além de ler, ordena priorizando pedido com etiqueta recém-liberada e
      // ainda não impressa — expressão de ordenação (CASE) que o PostgREST não faz direto.
      // Ver fn_seller_pedidos_lista em web/scripts/add-seller-pedidos-lista-abas.sql.
      const { data: rpcRows, error: rpcErr } = await supabaseAdmin.rpc("fn_seller_pedidos_lista", {
        p_org_id: seller.org_id,
        p_seller_id: seller.id,
        p_status: statusArray && statusArray.length > 0 ? statusArray : null,
        p_limit: pageSize,
        p_offset: from,
        p_produto: produtoParam,
        p_desde: desdeValido,
        p_ate: ateValido,
      });

      if (rpcErr) {
        console.error("[seller/pedidos GET]", rpcErr.message);
        return NextResponse.json({ error: "Erro ao buscar pedidos." }, { status: 500 });
      }

      type Contadores = {
        total_count: number;
        total_count_geral: number;
        total_count_pendencias: number;
        total_count_pra_enviar: number;
        total_count_enviados: number;
        total_count_devolucao: number;
        total_count_entregue: number;
        total_count_cancelado: number;
      };
      const rows = (rpcRows ?? []) as (PedidoRow & Contadores)[];
      data = rows.map(
        ({
          total_count: _tc,
          total_count_geral: _tcg,
          total_count_pendencias: _tcp,
          total_count_pra_enviar: _tcpe,
          total_count_enviados: _tce,
          total_count_devolucao: _tcd,
          total_count_entregue: _tcen,
          total_count_cancelado: _tcc,
          ...p
        }) => p
      );
      pedidosCount = rows[0]?.total_count ?? 0;
      abas = {
        todos: rows[0]?.total_count_geral ?? 0,
        pendencias: rows[0]?.total_count_pendencias ?? 0,
        pra_enviar: rows[0]?.total_count_pra_enviar ?? 0,
        enviados: rows[0]?.total_count_enviados ?? 0,
        devolucao: rows[0]?.total_count_devolucao ?? 0,
        concluidos: rows[0]?.total_count_entregue ?? 0,
        cancelados: rows[0]?.total_count_cancelado ?? 0,
      };
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

    const itemsSemAgrupar = (data ?? []).map((p) => {
      const row = p as typeof p & {
        motivo_bloqueio_responsavel?: "seller" | "fornecedor" | null;
        marketplace_pack_id?: string | null;
      };
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
        etiqueta_ml_previsao: null as string | null,
        pack_pedido_ids: [p.id] as string[],
      };
    });

    // Comprador que leva >1 unidade num único checkout do ML às vezes gera vários
    // order_id/pedidos separados que são, na prática, 1 pacote/1 etiqueta só (confirmado
    // ao vivo 2026-09-23 — ver docs/SCHEMA.md). Agrupa nessa página antes de tudo (inclusive
    // antes da busca de previsão de etiqueta, pra não repetir a mesma chamada por irmão).
    const porPack = new Map<string, typeof itemsSemAgrupar>();
    const items: typeof itemsSemAgrupar = [];
    for (const p of itemsSemAgrupar) {
      const packId = (p as { marketplace_pack_id?: string | null }).marketplace_pack_id;
      if (!packId) {
        items.push(p);
        continue;
      }
      const grupo = porPack.get(packId);
      if (!grupo) {
        porPack.set(packId, [p]);
        items.push(p);
        continue;
      }
      grupo.push(p);
      const principal = items.find((it) => it.pack_pedido_ids[0] === grupo[0].id);
      if (principal) {
        principal.valor_total = Number(principal.valor_total ?? 0) + Number(p.valor_total ?? 0);
        principal.preco_venda = (principal.preco_venda ?? 0) + (p.preco_venda ?? 0);
        principal.itens = [...principal.itens, ...p.itens];
        principal.pack_pedido_ids = [...principal.pack_pedido_ids, p.id];
        // Mostra o pack_id como "Pedido marketplace" quando agrupado — é o número que o
        // ML/Upseller usam pra identificar o pacote (não o order_id individual de 1 item).
        principal.marketplace_numero = packId;
        // Mesmo pacote/mesma etiqueta física — se qualquer irmão já tiver o PDF (o cron
        // processa cada order_id separado, pode não bater exatamente no mesmo instante),
        // o grupo inteiro já conta como "tem etiqueta".
        if (!principal.tem_etiqueta && p.tem_etiqueta) {
          principal.tem_etiqueta = true;
          principal.etiqueta_pdf_url = p.etiqueta_pdf_url;
          principal.etiqueta_pdf_base64 = p.etiqueta_pdf_base64;
        }
      }
    }

    // Pedidos "enviado" sem etiqueta que vieram direto do ML (não via Olist) — busca a
    // data em que o próprio Mercado Livre prevê liberar a etiqueta (buffer de
    // transportadora, achado ao vivo 2026-09-22), pra não confundir com o caso Olist
    // (onde o seller precisa colar o link manualmente — ver "Etiqueta pendente" no JSX).
    const previsaoMlPorPedido = await buscarPrevisaoEtiquetaMlPendentes(
      items.map((p) => ({
        id: p.id,
        seller_id: seller.id,
        status: p.status,
        canal_venda: p.canal_venda ?? null,
        referencia_externa: p.referencia_externa,
        marketplace_numero: p.marketplace_numero ?? null,
        tem_etiqueta: p.tem_etiqueta,
      }))
    );
    for (const p of items) {
      if (previsaoMlPorPedido.has(p.id)) {
        p.etiqueta_ml_previsao = previsaoMlPorPedido.get(p.id) ?? null;
      }
    }

    // Pedidos Olist "Em aberto" (aguardando pagamento) — reserva estoque mas ainda não
    // vira `pedidos`/`financial_ledger`. Entra na aba "Todos" e na aba "Pendências"
    // (a busca por produto não filtra reserva — RPC só olha `pedidos.nome_produto`).
    const incluirReservas = !statusArray || statusArray.some((s) => STATUS_PENDENCIAS.includes(s));
    let reservaItems: typeof items = [];

    if (incluirReservas) {
      let reservasQuery = supabaseAdmin
        .from("estoque_reservas")
        .select(
          "referencia_externa, quantidade, comprador_nome, marketplace_numero, canal_venda, criado_em, skus(sku, nome_produto, cor, tamanho)"
        )
        .eq("org_id", seller.org_id)
        .eq("seller_id", seller.id)
        .eq("status", "ativa");
      if (desdeValido) reservasQuery = reservasQuery.gte("criado_em", desdeValido);
      if (ateValido) reservasQuery = reservasQuery.lte("criado_em", ateValido);
      const { data: reservas, error: reservasErr } = await reservasQuery.order("criado_em", { ascending: false });

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
        pack_pedido_ids: [`reserva:${referenciaExterna}`] as string[],
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
        canal_venda: g.canal_venda,
        itens: g.itens,
        etiqueta_pdf_url: null,
        etiqueta_pdf_base64: null,
        etiqueta_tentativas: 0,
        tem_etiqueta: false,
        is_reserva: true,
        etiqueta_ml_previsao: null as string | null,
      }));
    }

    const byDateDesc = (a: { criado_em: string }, b: { criado_em: string }) =>
      new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime();

    // `pedidos` já vem paginado do banco (`.range()`). Reservas não têm página própria —
    // como a lista costuma ser pequena, elas só entram inteiras na página 1 (mais recentes
    // primeiro), sem tentar intercalar duas fontes paginadas separadamente.
    const merged = page === 1 ? [...reservaItems, ...items].sort(byDateDesc) : items;
    const total = pedidosCount + reservaItems.length;

    // Reserva engorda a mesma aba visual "Pendências" (e "Todos") — soma depois da RPC,
    // que não sabe nada sobre `estoque_reservas`.
    if (reservaItems.length > 0) {
      abas = { ...abas, todos: abas.todos + reservaItems.length, pendencias: abas.pendencias + reservaItems.length };
    }

    return NextResponse.json({ items: merged, total, page, limit: pageSize, abas });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
