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
  pedido_origem_troca_id?: string | null;
  pedido_reposicao_id?: string | null;
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
  "devolucao_nao_procede",
  "troca_em_andamento",
  "troca_concluida",
  "cancelado",
  "erro_saldo",
] as const;

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

    // 'somente' = só os em buffer do ML (sem etiqueta ainda); 'excluir' = pra_enviar sem
    // misturar buffer; null = sem filtro (ex: aba Todos).
    const bufferMlParam = searchParams.get("buffer_ml")?.trim();
    const bufferMl = bufferMlParam === "somente" || bufferMlParam === "excluir" ? bufferMlParam : null;

    // 'somente' = só etiqueta já impressa pelo fornecedor (aba "Para retirar" — não basta
    // existir, tem que ter sido realmente impressa); 'excluir' = pra_enviar sem misturar
    // quem já imprimiu; null = sem filtro.
    const etiquetaImpressaParam = searchParams.get("etiqueta_impressa")?.trim();
    const etiquetaImpressa = etiquetaImpressaParam === "somente" || etiquetaImpressaParam === "excluir" ? etiquetaImpressaParam : null;

    let data: PedidoRow[] | null = [];
    let pedidosCount = 0;
    let abas = { todos: 0, pendencias: 0, pra_enviar: 0, buffer: 0, retirada: 0, enviados: 0, devolucao: 0, concluidos: 0, cancelados: 0 };

    {
      const from = (page - 1) * pageSize;

      // RPC (regra 9): além de ler, ordena priorizando pedido com etiqueta recém-liberada e
      // ainda não impressa — expressão de ordenação (CASE) que o PostgREST não faz direto.
      // Ver fn_seller_pedidos_lista em web/scripts/add-seller-pedidos-aba-retirada.sql.
      const { data: rpcRows, error: rpcErr } = await supabaseAdmin.rpc("fn_seller_pedidos_lista", {
        p_org_id: seller.org_id,
        p_seller_id: seller.id,
        p_status: statusArray && statusArray.length > 0 ? statusArray : null,
        p_limit: pageSize,
        p_offset: from,
        p_produto: produtoParam,
        p_desde: desdeValido,
        p_ate: ateValido,
        p_buffer_ml: bufferMl,
        p_etiqueta_impressa: etiquetaImpressa,
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
        total_count_buffer: number;
        total_count_retirada: number;
        total_count_enviados: number;
        total_count_devolucao: number;
        total_count_entregue: number;
        total_count_cancelado: number;
      };
      const rows = (rpcRows ?? []) as (PedidoRow & Contadores)[];
      // RPC agora separa contador de listagem (fix-seller-pedidos-contadores-pacote-e-aba-
      // vazia.sql): a 1ª linha sempre traz os contadores, mesmo quando a aba ativa não tem
      // nenhum pedido — nesse caso ela vem com id=null e precisa ser descartada da listagem.
      const contadores = rows[0] as (Partial<PedidoRow> & Contadores) | undefined;
      const pedidoRows = rows.filter((r) => r.id != null);
      data = pedidoRows.map(
        ({
          total_count: _tc,
          total_count_geral: _tcg,
          total_count_pendencias: _tcp,
          total_count_pra_enviar: _tcpe,
          total_count_buffer: _tcb,
          total_count_retirada: _tcr,
          total_count_enviados: _tce,
          total_count_devolucao: _tcd,
          total_count_entregue: _tcen,
          total_count_cancelado: _tcc,
          ...p
        }) => p
      );
      pedidosCount = contadores?.total_count ?? 0;
      abas = {
        todos: contadores?.total_count_geral ?? 0,
        pendencias: contadores?.total_count_pendencias ?? 0,
        pra_enviar: contadores?.total_count_pra_enviar ?? 0,
        buffer: contadores?.total_count_buffer ?? 0,
        retirada: contadores?.total_count_retirada ?? 0,
        enviados: contadores?.total_count_enviados ?? 0,
        devolucao: contadores?.total_count_devolucao ?? 0,
        concluidos: contadores?.total_count_entregue ?? 0,
        cancelados: contadores?.total_count_cancelado ?? 0,
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
    // Chave de agrupamento é pack + status (não só pack): itens do mesmo pacote com
    // desfechos diferentes (ex.: 1 "devolucao_nao_procede" + 1 "devolvido") não podem virar
    // 1 card só com 1 badge só — isso escondia o status de um dos dois atrás do outro. Itens
    // com o mesmo pack E mesmo status continuam fundindo normal (ex.: 2 itens "enviado" do
    // mesmo pacote = 1 etiqueta só).
    const porPackEStatus = new Map<string, typeof itemsSemAgrupar>();
    const items: typeof itemsSemAgrupar = [];
    for (const p of itemsSemAgrupar) {
      const packId = (p as { marketplace_pack_id?: string | null }).marketplace_pack_id;
      if (!packId) {
        items.push(p);
        continue;
      }
      const chave = `${packId}::${p.status}`;
      const grupo = porPackEStatus.get(chave);
      if (!grupo) {
        porPackEStatus.set(chave, [p]);
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

    // Pedidos "enviado" sem etiqueta que vieram direto do ML — busca a data em que o
    // próprio Mercado Livre prevê liberar a etiqueta (buffer de transportadora, achado ao
    // vivo 2026-09-22), pra não confundir com os demais canais (onde o seller precisa
    // colar o link manualmente — ver "Etiqueta pendente" no JSX).
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

    const merged = items;
    const total = pedidosCount;

    // Pedido de reposição de troca referenciado pelo original — busca só o marketplace_numero
    // pra mostrar o link direto no card de "Troca concluída" (achado real 2026-11-15: pedido
    // ficava "perdido" no meio de muitos concluídos).
    const reposicaoIds = [...new Set(merged.map((it) => (it as { pedido_reposicao_id?: string | null }).pedido_reposicao_id).filter(Boolean))] as string[];
    const { data: reposicaoRows } = reposicaoIds.length
      ? await supabaseAdmin.from("pedidos").select("id, marketplace_numero").in("id", reposicaoIds)
      : { data: [] as Array<{ id: string; marketplace_numero: string | null }> };
    const reposicaoMap = new Map((reposicaoRows ?? []).map((r) => [r.id, r.marketplace_numero]));
    const mergedComReposicao = merged.map((it) => {
      const reposicaoId = (it as { pedido_reposicao_id?: string | null }).pedido_reposicao_id;
      return {
        ...it,
        pedido_reposicao_marketplace_numero: reposicaoId ? reposicaoMap.get(reposicaoId) ?? null : null,
      };
    });

    return NextResponse.json({ items: mergedComReposicao, total, page, limit: pageSize, abas });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
