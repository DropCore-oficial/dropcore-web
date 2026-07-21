import { mapWithConcurrency } from "@/lib/mapWithConcurrency";
import { normalizeOlistSituacaoTextoBase } from "@/lib/olistPedidoImportPolicy";
import { isTinyRateLimitMessage, obterPedidoOlist } from "@/lib/olistTinyApi";
import { isSellerOlistRateLimited, markSellerOlistRateLimited } from "@/lib/olistRateLimitCooldown";
import { promoverPedidoParaPostado, repararExtratoBloqueado } from "@/lib/pedidoPostadoPromote";
import { getSellerOlistApiToken } from "@/lib/sellerOlistIntegration";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const RETRY_CONCURRENCY = 2;
const MAX_PEDIDOS_PER_RUN = 100;
/** Pedido recém-importado não teve tempo de a Olist atualizar a situação ainda — evita checar à toa. */
const MIN_IDADE_MS = 30 * 60 * 1000;

const SITUACOES_POSTADO = new Set(["enviado", "entregue"]);

export type PedidosEnviadoAutoPostadoSummary = {
  avaliados: number;
  promovidos: number;
  pendentes: number;
  falhas: number;
};

type PedidoEnviado = {
  id: string;
  org_id: string;
  seller_id: string;
  ledger_id: string | null;
  referencia_externa: string | null;
  tracking_codigo: string | null;
  criado_em: string;
};

function extrairOlistPedidoId(referenciaExterna: string | null): number | null {
  if (!referenciaExterna?.startsWith("olist:")) return null;
  const n = Number(referenciaExterna.slice("olist:".length));
  return Number.isFinite(n) ? n : null;
}

/**
 * Checker automático da Frente 3: quando o marketplace confirma o envio pro comprador, a
 * própria Olist já atualiza a `situacao` do pedido pra "enviado"/"entregue" sozinha — sem
 * ninguém clicar em nada do lado dela. A gente só nunca ia buscar esse dado de novo depois
 * de importar o pedido. Este checker reconsulta e promove pedidos "enviado" pra
 * "aguardando_repasse" sozinho, sem depender do fornecedor clicar "marcar postado".
 *
 * Fornecedor/admin continuam podendo marcar manualmente a qualquer momento — isso aqui é
 * um caminho automático a mais, não substitui o botão.
 */
export async function runPedidosEnviadoAutoPostadoRetry(): Promise<PedidosEnviadoAutoPostadoSummary> {
  const corteIdade = new Date(Date.now() - MIN_IDADE_MS).toISOString();

  const { data: rows, error } = await supabaseAdmin
    .from("pedidos")
    .select("id, org_id, seller_id, ledger_id, referencia_externa, tracking_codigo, criado_em")
    .eq("status", "enviado")
    .like("referencia_externa", "olist:%")
    .lt("criado_em", corteIdade)
    .order("criado_em", { ascending: true })
    .limit(MAX_PEDIDOS_PER_RUN)
    .returns<PedidoEnviado[]>();

  if (error) {
    console.error("[pedidosEnviadoAutoPostadoRetry] listar:", error.message);
    return { avaliados: 0, promovidos: 0, pendentes: 0, falhas: 0 };
  }

  const pedidos = rows ?? [];
  let promovidos = 0;
  let pendentes = 0;
  let falhas = 0;

  const sellerIds = [...new Set(pedidos.map((p) => p.seller_id))];
  const sellersBloqueados = new Set<string>();
  if (sellerIds.length > 0) {
    const { data: integracoes } = await supabaseAdmin
      .from("seller_olist_integrations")
      .select("seller_id, olist_rate_limited_until")
      .in("seller_id", sellerIds);
    for (const row of integracoes ?? []) {
      if (isSellerOlistRateLimited(row as { olist_rate_limited_until: string | null })) {
        sellersBloqueados.add((row as { seller_id: string }).seller_id);
      }
    }
  }

  await mapWithConcurrency(pedidos, RETRY_CONCURRENCY, async (pedido) => {
    if (sellersBloqueados.has(pedido.seller_id)) {
      pendentes += 1;
      return;
    }

    const olistPedidoId = extrairOlistPedidoId(pedido.referencia_externa);
    if (olistPedidoId == null) {
      falhas += 1;
      return;
    }

    const token = await getSellerOlistApiToken(pedido.seller_id);
    if (!token) {
      falhas += 1;
      return;
    }

    let detalhe;
    try {
      detalhe = await obterPedidoOlist(token, olistPedidoId);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "";
      if (isTinyRateLimitMessage(msg)) {
        sellersBloqueados.add(pedido.seller_id);
        await markSellerOlistRateLimited(pedido.seller_id);
      }
      pendentes += 1;
      return;
    }

    const situacao = normalizeOlistSituacaoTextoBase(detalhe.situacao);
    if (!SITUACOES_POSTADO.has(situacao)) {
      pendentes += 1;
      return;
    }

    if (detalhe.codigo_rastreamento && !pedido.tracking_codigo) {
      await supabaseAdmin
        .from("pedidos")
        .update({ tracking_codigo: detalhe.codigo_rastreamento })
        .eq("id", pedido.id);
    }

    const promote = await promoverPedidoParaPostado({
      org_id: pedido.org_id,
      pedido_id: pedido.id,
      ledger_id: pedido.ledger_id,
      evento: {
        tipo: "pedido_postado_via_erp",
        origem: "erp",
        actor_tipo: "sistema",
        descricao: `Situação "${detalhe.situacao}" confirmada automaticamente na Olist — pedido promovido sem ação manual.`,
        metadata: { via: "olist-situacao-auto", situacao: detalhe.situacao },
      },
    });

    if (!promote.ok) {
      falhas += 1;
      console.error("[pedidosEnviadoAutoPostadoRetry] promote:", pedido.id, promote.error);
      return;
    }

    promovidos += 1;
  });

  return { avaliados: pedidos.length, promovidos, pendentes, falhas };
}

export type ExtratoBloqueadoRepairSummary = {
  avaliados: number;
  reparados: number;
};

const MAX_EXTRATO_REPAIR_PER_RUN = 200;

/**
 * Varredura automática do que antes era o botão manual "Sincronizar extrato seller"
 * (removido de web/app/fornecedor/pedidos/page.tsx) — pedido já postado
 * (`aguardando_repasse`) cujo `financial_ledger` ficou parado em `BLOQUEADO` (ex.:
 * `ledger_id` não existia ainda no momento em que o pedido foi promovido). Roda na mesma
 * cron do checker de auto-postado (web/app/api/cron/pedidos-postado-auto-retry), não
 * precisa de agendamento próprio.
 */
export async function runExtratoBloqueadoRepair(): Promise<ExtratoBloqueadoRepairSummary> {
  type PedidoParaReparar = { id: string; org_id: string; ledger_id: string | null };
  const vistos = new Map<string, PedidoParaReparar>();

  const { data: semLedger } = await supabaseAdmin
    .from("pedidos")
    .select("id, org_id, ledger_id")
    .eq("status", "aguardando_repasse")
    .is("ledger_id", null)
    .limit(MAX_EXTRATO_REPAIR_PER_RUN)
    .returns<PedidoParaReparar[]>();
  for (const p of semLedger ?? []) vistos.set(p.id, p);

  const { data: ledgersBloqueados } = await supabaseAdmin
    .from("financial_ledger")
    .select("id")
    .eq("status", "BLOQUEADO")
    .limit(MAX_EXTRATO_REPAIR_PER_RUN)
    .returns<{ id: string }[]>();
  const ledgerIdsBloqueados = (ledgersBloqueados ?? []).map((l) => l.id);

  if (ledgerIdsBloqueados.length > 0) {
    const { data: comLedgerBloqueado } = await supabaseAdmin
      .from("pedidos")
      .select("id, org_id, ledger_id")
      .eq("status", "aguardando_repasse")
      .in("ledger_id", ledgerIdsBloqueados)
      .limit(MAX_EXTRATO_REPAIR_PER_RUN)
      .returns<PedidoParaReparar[]>();
    for (const p of comLedgerBloqueado ?? []) vistos.set(p.id, p);
  }

  const pedidos = [...vistos.values()];
  let reparados = 0;

  await mapWithConcurrency(pedidos, RETRY_CONCURRENCY, async (pedido) => {
    const resultado = await repararExtratoBloqueado({
      org_id: pedido.org_id,
      pedido_id: pedido.id,
      ledger_id: pedido.ledger_id,
    });
    if (resultado.reparado) reparados += 1;
  });

  return { avaliados: pedidos.length, reparados };
}
