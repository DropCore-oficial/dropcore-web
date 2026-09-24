import { notifyAdminsSlaAtraso } from "@/lib/notifyAdminsSlaAtraso";
import { notifyFornecedorSlaAtraso } from "@/lib/notifyFornecedorSlaAtraso";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const MAX_PEDIDOS_PER_RUN = 200;

export type SlaAtrasoCheckSummary = {
  avaliados: number;
  notificados: number;
};

type PedidoSlaAtrasado = {
  id: string;
  org_id: string;
  fornecedor_id: string;
  canal_venda: string | null;
};

/**
 * Cron: pedidos "enviado" cujo prazo de despacho (`sla_prazo_despacho`, ver
 * `pedidoSlaDespacho.ts`) já passou e ainda não foram notificados — avisa fornecedor +
 * admin e marca `sla_atraso_notificado_em` (nunca notifica 2x o mesmo pedido). V1 só
 * notifica, sem penalidade financeira.
 */
export async function verificarPedidosSlaAtrasados(): Promise<SlaAtrasoCheckSummary> {
  const agora = new Date().toISOString();

  const { data: rows, error } = await supabaseAdmin
    .from("pedidos")
    .select("id, org_id, fornecedor_id, canal_venda")
    .eq("status", "enviado")
    .not("sla_prazo_despacho", "is", null)
    .lt("sla_prazo_despacho", agora)
    .is("sla_atraso_notificado_em", null)
    .limit(MAX_PEDIDOS_PER_RUN)
    .returns<PedidoSlaAtrasado[]>();

  if (error) {
    console.error("[pedidoSlaAtrasoCheck] listar:", error.message);
    return { avaliados: 0, notificados: 0 };
  }

  const pedidos = rows ?? [];
  if (pedidos.length === 0) return { avaliados: 0, notificados: 0 };

  const fornecedorIds = [...new Set(pedidos.map((p) => p.fornecedor_id).filter(Boolean))];
  const nomesPorFornecedor = new Map<string, string>();
  if (fornecedorIds.length > 0) {
    const { data: fornecedores } = await supabaseAdmin
      .from("fornecedores")
      .select("id, nome")
      .in("id", fornecedorIds);
    for (const f of fornecedores ?? []) {
      nomesPorFornecedor.set((f as { id: string }).id, (f as { nome: string | null }).nome ?? "");
    }
  }

  let notificados = 0;
  for (const pedido of pedidos) {
    const canal = pedido.canal_venda ?? "outro";
    await Promise.all([
      notifyFornecedorSlaAtraso({
        org_id: pedido.org_id,
        fornecedor_id: pedido.fornecedor_id,
        pedido_id: pedido.id,
        canal_venda: canal,
      }),
      notifyAdminsSlaAtraso({
        org_id: pedido.org_id,
        pedido_id: pedido.id,
        canal_venda: canal,
        fornecedor_nome: nomesPorFornecedor.get(pedido.fornecedor_id) || null,
      }),
    ]);

    const { error: updateErr } = await supabaseAdmin
      .from("pedidos")
      .update({ sla_atraso_notificado_em: agora })
      .eq("id", pedido.id);
    if (updateErr) {
      console.error("[pedidoSlaAtrasoCheck] marcar notificado:", pedido.id, updateErr.message);
      continue;
    }
    notificados += 1;
  }

  return { avaliados: pedidos.length, notificados };
}
