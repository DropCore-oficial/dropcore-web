import { mapWithConcurrency } from "@/lib/mapWithConcurrency";
import { processBlingPedidoImport } from "@/lib/sellerBlingPedidoImport";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const BLING_SYNC_CONCURRENCY = 3;
/** Não reprocessa logs mais novos que isso — dá tempo do fire-and-forget do webhook terminar sozinho. */
const MIN_LOG_AGE_MS = 2 * 60_000;
/** Não vale a pena reprocessar eventos muito antigos (pedido provavelmente já resolvido por outra via). */
const MAX_LOG_AGE_MS = 24 * 60 * 60_000;
const MAX_LOGS_PER_RUN = 200;

type BlingWebhookLogRow = {
  id: string;
  seller_id: string;
  org_id: string;
  event_type: string | null;
  payload: { data?: { id?: number | string } } | null;
  criado_em: string;
};

function extractOrderId(payload: BlingWebhookLogRow["payload"]): number | null {
  const raw = payload?.data?.id;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim() && !Number.isNaN(Number(raw))) return Number(raw);
  return null;
}

export type SellerBlingSyncSummary = {
  logs_avaliados: number;
  reprocessados: number;
  ja_importados: number;
  falhas: number;
};

/**
 * Rede de segurança do Bling: como o import de pedido roda fire-and-forget no
 * webhook (não pode travar a resposta em 5s), esse cron reprocessa eventos de
 * pedido recentes que ainda não geraram um pedido no DropCore — cobre falha de
 * rede, timeout da API do Bling, ou erro transitório no fire-and-forget.
 * Não busca pedidos direto na API do Bling (evita depender de um endpoint de
 * listagem cujo schema não foi verificado) — só reprocessa o que já está
 * registrado em bling_webhook_logs.
 */
export async function runSellerBlingSync(): Promise<SellerBlingSyncSummary> {
  const now = Date.now();
  const desde = new Date(now - MAX_LOG_AGE_MS).toISOString();
  const ate = new Date(now - MIN_LOG_AGE_MS).toISOString();

  const { data: logs, error } = await supabaseAdmin
    .from("bling_webhook_logs")
    .select("id, seller_id, org_id, event_type, payload, criado_em")
    .like("event_type", "order.%")
    .not("seller_id", "is", null)
    .gte("criado_em", desde)
    .lte("criado_em", ate)
    .order("criado_em", { ascending: false })
    .limit(MAX_LOGS_PER_RUN);

  if (error) {
    console.error("[sellerBlingSync] listar logs:", error.message);
    return { logs_avaliados: 0, reprocessados: 0, ja_importados: 0, falhas: 0 };
  }

  const rows = (logs ?? []) as BlingWebhookLogRow[];
  let reprocessados = 0;
  let jaImportados = 0;
  let falhas = 0;

  await mapWithConcurrency(rows, BLING_SYNC_CONCURRENCY, async (log) => {
    const pedidoId = extractOrderId(log.payload);
    if (pedidoId == null) return;

    const referencia = `bling:${pedidoId}`;
    const { data: existente } = await supabaseAdmin
      .from("pedidos")
      .select("id")
      .eq("org_id", log.org_id)
      .eq("seller_id", log.seller_id)
      .eq("referencia_externa", referencia)
      .maybeSingle();

    if (existente) {
      jaImportados += 1;
      return;
    }

    reprocessados += 1;
    const result = await processBlingPedidoImport({
      org_id: log.org_id,
      seller_id: log.seller_id,
      bling_pedido_id: pedidoId,
      is_delete_event: log.event_type === "order.deleted",
    });
    if (!result.ok) {
      falhas += 1;
      console.error("[sellerBlingSync] reprocessar pedido falhou:", log.id, result.error);
    }
  });

  return { logs_avaliados: rows.length, reprocessados, ja_importados: jaImportados, falhas };
}
