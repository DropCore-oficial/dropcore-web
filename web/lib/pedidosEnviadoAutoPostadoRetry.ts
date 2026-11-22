import { mapWithConcurrency } from "@/lib/mapWithConcurrency";
import { getValidMercadoLivreAccessToken } from "@/lib/mercadoLivreApiClient";
import { processarShipmentMercadoLivre } from "@/lib/mercadoLivreShipmentIngest";
import { repararExtratoBloqueado } from "@/lib/pedidoPostadoPromote";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const RETRY_CONCURRENCY = 2;
const MAX_PEDIDOS_PER_RUN = 100;
/** Pedido recém-importado não teve tempo de o marketplace atualizar a situação ainda — evita checar à toa. */
const MIN_IDADE_MS = 30 * 60 * 1000;

export type PedidosEnviadoAutoPostadoSummary = {
  avaliados: number;
  promovidos: number;
  pendentes: number;
  falhas: number;
};

type PedidoEnviadoMl = {
  id: string;
  seller_id: string;
  marketplace_numero: string | null;
  status: string;
};

/**
 * "Frente 3": checker automático que promove pedido "enviado" pra "aguardando_repasse"
 * sozinho, sem o fornecedor/admin precisar clicar em nada — rede de segurança pro webhook
 * de shipments (mercadoLivreShipmentIngest.ts) perder a notificação. Busca o `shipping.id`
 * do pedido na API do ML e reaproveita o mesmo núcleo do webhook
 * (`processarShipmentMercadoLivre`) pra promover "enviado"/"aguardando_repasse" sozinho.
 */
export async function runPedidosEnviadoMlAutoPostadoRetry(): Promise<PedidosEnviadoAutoPostadoSummary> {
  const corteIdade = new Date(Date.now() - MIN_IDADE_MS).toISOString();

  const { data: rows, error } = await supabaseAdmin
    .from("pedidos")
    .select("id, seller_id, marketplace_numero, status")
    .in("status", ["enviado", "aguardando_repasse"])
    .eq("canal_venda", "mercado_livre")
    .like("referencia_externa", "ml:%")
    .lt("criado_em", corteIdade)
    .order("criado_em", { ascending: true })
    .limit(MAX_PEDIDOS_PER_RUN)
    .returns<PedidoEnviadoMl[]>();

  if (error) {
    console.error("[pedidosEnviadoMlAutoPostadoRetry] listar:", error.message);
    return { avaliados: 0, promovidos: 0, pendentes: 0, falhas: 0 };
  }

  const pedidos = (rows ?? []).filter((p): p is PedidoEnviadoMl & { marketplace_numero: string } =>
    Boolean(p.marketplace_numero)
  );
  let promovidos = 0;
  let pendentes = 0;
  let falhas = 0;

  const tokensPorSeller = new Map<string, Awaited<ReturnType<typeof getValidMercadoLivreAccessToken>>>();

  await mapWithConcurrency(pedidos, RETRY_CONCURRENCY, async (pedido) => {
    let ctx = tokensPorSeller.get(pedido.seller_id);
    if (ctx === undefined) {
      ctx = await getValidMercadoLivreAccessToken(pedido.seller_id);
      tokensPorSeller.set(pedido.seller_id, ctx);
    }
    if (!ctx) {
      falhas += 1;
      return;
    }

    const orderRes = await fetch(`https://api.mercadolibre.com/orders/${pedido.marketplace_numero}`, {
      headers: { Authorization: `Bearer ${ctx.accessToken}` },
      cache: "no-store",
    });
    if (!orderRes.ok) {
      pendentes += 1;
      return;
    }
    const order = (await orderRes.json()) as { shipping?: { id?: number | string | null } };
    const shippingId = order.shipping?.id != null ? String(order.shipping.id) : null;
    if (!shippingId) {
      pendentes += 1;
      return;
    }

    const resultado = await processarShipmentMercadoLivre({ sellerId: pedido.seller_id, shipmentId: shippingId });
    if (!resultado.ok) {
      falhas += 1;
      console.error("[pedidosEnviadoMlAutoPostadoRetry]", pedido.id, resultado.motivo);
      return;
    }
    if (resultado.status === "promovido_postado" || resultado.status === "promovido_entregue") {
      promovidos += 1;
    } else {
      pendentes += 1;
    }
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
