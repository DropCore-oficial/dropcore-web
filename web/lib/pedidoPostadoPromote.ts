import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { resolveLedgerIdsForPedido } from "@/lib/resolveLedgerForPedido";
import { proximoCicloRepasse } from "@/lib/cicloRepasse";

/**
 * Núcleo compartilhado da transição `pedidos.status: enviado → aguardando_repasse`
 * (dispara o ciclo de repasse financeiro). Usado por três caminhos que só diferem em QUEM
 * decidiu que o pedido foi postado e COMO validam isso antes de chamar — a transição em si
 * (status, financial_ledger, evento) é sempre a mesma:
 *  - fornecedor clica "marcar postado" (web/app/api/fornecedor/pedidos/[id]/marcar-postado)
 *  - admin clica "confirmar envio" (web/app/api/org/pedidos/[id]/entregar)
 *  - checker automático detecta shipment "enviado"/"entregue" no Mercado Livre
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

  /**
   * Claim atômico: quem chama já checou `status === "enviado"` antes, mas entre essa
   * checagem e este update outra chamada concorrente (clique manual + checker automático
   * disparando junto) pode ter promovido o mesmo pedido primeiro. O `.eq("status", "enviado")`
   * garante que só a chamada que realmente vê a transição aplica o resto (ledger + evento).
   */
  const { data: claimedRows, error: upPedido } = await supabaseAdmin
    .from("pedidos")
    .update({ status: "aguardando_repasse", atualizado_em: now })
    .eq("id", pedido_id)
    .eq("org_id", org_id)
    .eq("status", "enviado")
    .select("id");

  if (upPedido) return { ok: false, error: upPedido.message };
  if (!claimedRows?.length) {
    return { ok: false, error: "Pedido já foi processado (postado) por outra operação." };
  }

  const ledgerIds = await resolveLedgerIdsForPedido(org_id, pedido_id, params.ledger_id);

  if (ledgerIds.length > 0 && !params.ledger_id) {
    await supabaseAdmin.from("pedidos").update({ ledger_id: ledgerIds[0], atualizado_em: now }).eq("id", pedido_id);
  }

  let ciclo_repasse: string | null = null;
  if (ledgerIds.length > 0) {
    const { data: cicloRow } = await supabaseAdmin.rpc("fn_ciclo_repasse", { data_evento: now });
    ciclo_repasse = cicloRow ?? proximoCicloRepasse();

    // 1 linha por fornecedor presente no pedido (ver blockSale.ts) — todas avançam juntas
    // na mesma transição de status, cada uma com seu próprio valor_fornecedor/fulfillment.
    const { error: upLedgerErr } = await supabaseAdmin
      .from("financial_ledger")
      .update({ status: "AGUARDANDO_REPASSE", ciclo_repasse, atualizado_em: now })
      .in("id", ledgerIds);

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
 * Núcleo compartilhado da transição `pedidos.status: aguardando_repasse → entregue` —
 * o cliente final recebeu o pedido. Diferente de `promoverPedidoParaPostado`, não mexe em
 * `financial_ledger`/ciclo de repasse: o repasse já se resolve inteiro na postagem, entrega
 * é só um marco informativo (histórico do pedido, filtro de status). Quem chama já deve ter
 * validado que `pedidos.status === "aguardando_repasse"` antes de invocar.
 */
export async function promoverPedidoParaEntregue(params: {
  org_id: string;
  pedido_id: string;
  evento: {
    tipo: string;
    origem: "manual" | "erp" | "sistema";
    actor_id?: string | null;
    actor_tipo?: "seller" | "fornecedor" | "admin" | "sistema" | null;
    descricao?: string | null;
    metadata?: Record<string, unknown> | null;
  };
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { org_id, pedido_id } = params;
  const now = new Date().toISOString();

  const { error: upPedido } = await supabaseAdmin
    .from("pedidos")
    .update({ status: "entregue", atualizado_em: now })
    .eq("id", pedido_id)
    .eq("org_id", org_id);

  if (upPedido) return { ok: false, error: upPedido.message };

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

  return { ok: true };
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
  const ledgerIds = await resolveLedgerIdsForPedido(params.org_id, params.pedido_id, params.ledger_id);

  if (ledgerIds.length > 0 && !params.ledger_id) {
    await supabaseAdmin.from("pedidos").update({ ledger_id: ledgerIds[0], atualizado_em: now }).eq("id", params.pedido_id);
  }
  if (ledgerIds.length === 0) return { reparado: false };

  const { data: ledRows } = await supabaseAdmin
    .from("financial_ledger")
    .select("id, status, ciclo_repasse")
    .in("id", ledgerIds);

  const bloqueados = (ledRows ?? []).filter((r) => r.status === "BLOQUEADO");
  if (bloqueados.length === 0) return { reparado: false };

  const ciclo = bloqueados.find((r) => r.ciclo_repasse)?.ciclo_repasse ?? proximoCicloRepasse();
  const { error: upLedgerErr } = await supabaseAdmin
    .from("financial_ledger")
    .update({ status: "AGUARDANDO_REPASSE", ciclo_repasse: ciclo, atualizado_em: now })
    .in("id", bloqueados.map((r) => r.id));

  if (upLedgerErr) {
    console.error("[repararExtratoBloqueado] ledger update:", upLedgerErr.message);
    return { reparado: false };
  }

  return { reparado: true };
}
