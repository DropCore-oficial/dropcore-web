import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { resolveLedgerIdForPedido } from "@/lib/resolveLedgerForPedido";
import { proximoCicloRepasse } from "@/lib/cicloRepasse";

/**
 * Núcleo compartilhado da transição `pedidos.status: enviado → aguardando_repasse`
 * (dispara o ciclo de repasse financeiro). Usado por três caminhos que só diferem em QUEM
 * decidiu que o pedido foi postado e COMO validam isso antes de chamar — a transição em si
 * (status, financial_ledger, evento) é sempre a mesma:
 *  - fornecedor clica "marcar postado" (web/app/api/fornecedor/pedidos/[id]/marcar-postado)
 *  - admin clica "confirmar envio" (web/app/api/org/pedidos/[id]/entregar)
 *  - checker automático detecta situação "enviado"/"entregue" na Olist
 *    (web/lib/pedidosEnviadoAutoPostadoRetry.ts)
 *
 * Quem chama já deve ter validado que `pedidos.status === "enviado"` antes de invocar.
 */
export async function promoverPedidoParaPostado(params: {
  org_id: string;
  pedido_id: string;
  ledger_id: string | null;
  evento: {
    tipo: string;
    origem: "manual" | "erp" | "sistema";
    actor_id?: string | null;
    actor_tipo?: "seller" | "fornecedor" | "admin" | "sistema" | null;
    descricao?: string | null;
    metadata?: Record<string, unknown> | null;
  };
}): Promise<{ ok: true; ciclo_repasse: string | null } | { ok: false; error: string }> {
  const { org_id, pedido_id } = params;
  const now = new Date().toISOString();

  const { error: upPedido } = await supabaseAdmin
    .from("pedidos")
    .update({ status: "aguardando_repasse", atualizado_em: now })
    .eq("id", pedido_id)
    .eq("org_id", org_id);

  if (upPedido) return { ok: false, error: upPedido.message };

  const ledgerId = await resolveLedgerIdForPedido(org_id, pedido_id, params.ledger_id);

  if (ledgerId && !params.ledger_id) {
    await supabaseAdmin.from("pedidos").update({ ledger_id: ledgerId, atualizado_em: now }).eq("id", pedido_id);
  }

  let ciclo_repasse: string | null = null;
  if (ledgerId) {
    const { data: cicloRow } = await supabaseAdmin.rpc("fn_ciclo_repasse", { data_evento: now });
    ciclo_repasse = cicloRow ?? proximoCicloRepasse();

    const { error: upLedgerErr } = await supabaseAdmin
      .from("financial_ledger")
      .update({ status: "AGUARDANDO_REPASSE", ciclo_repasse, atualizado_em: now })
      .eq("id", ledgerId);

    if (upLedgerErr) {
      console.error("[promoverPedidoParaPostado] ledger update:", upLedgerErr.message);
      return { ok: false, error: "Erro ao atualizar extrato do seller: " + upLedgerErr.message };
    }
  }

  await supabaseAdmin.from("pedido_eventos").insert({
    org_id,
    pedido_id,
    tipo: params.evento.tipo,
    origem: params.evento.origem,
    actor_id: params.evento.actor_id ?? null,
    actor_tipo: params.evento.actor_tipo ?? null,
    descricao: params.evento.descricao ?? null,
    metadata: params.evento.metadata ?? null,
  });

  return { ok: true, ciclo_repasse };
}

/**
 * Repara o caso legado: pedido já em `aguardando_repasse` mas o `financial_ledger`
 * vinculado ficou parado em `BLOQUEADO` (ex.: `pedido.ledger_id` não existia ainda no
 * momento da promoção). Sem isso, o extrato do seller mostra "aguardando envio" pra um
 * pedido que já foi postado de verdade. Não mexe em `pedidos.status` — só sincroniza o
 * ledger.
 */
export async function repararExtratoBloqueado(params: {
  org_id: string;
  pedido_id: string;
  ledger_id: string | null;
}): Promise<{ reparado: boolean }> {
  const now = new Date().toISOString();
  const ledgerId = await resolveLedgerIdForPedido(params.org_id, params.pedido_id, params.ledger_id);

  if (ledgerId && !params.ledger_id) {
    await supabaseAdmin.from("pedidos").update({ ledger_id: ledgerId, atualizado_em: now }).eq("id", params.pedido_id);
  }
  if (!ledgerId) return { reparado: false };

  const { data: led } = await supabaseAdmin
    .from("financial_ledger")
    .select("status, ciclo_repasse")
    .eq("id", ledgerId)
    .maybeSingle();

  if (led?.status !== "BLOQUEADO") return { reparado: false };

  const ciclo = led.ciclo_repasse ?? proximoCicloRepasse();
  const { error: upLedgerErr } = await supabaseAdmin
    .from("financial_ledger")
    .update({ status: "AGUARDANDO_REPASSE", ciclo_repasse: ciclo, atualizado_em: now })
    .eq("id", ledgerId);

  if (upLedgerErr) {
    console.error("[repararExtratoBloqueado] ledger update:", upLedgerErr.message);
    return { reparado: false };
  }

  return { reparado: true };
}
