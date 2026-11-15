/**
 * Lembrete diário de devolução contestada pelo fornecedor ainda sem decisão do admin —
 * achado real 2026-11-11: a contestação trava a liberação automática de 72h e não existe
 * nenhum outro gatilho que force uma decisão; sem isso, um caso real ficou 8 dias parado até
 * alguém notar por acaso. Reaproveita `notifyAdminDevolucaoContestada` (que já tem dedupe de
 * 24h por ledger) — então rodar isso 1x/dia é seguro, nunca manda 2 e-mails no mesmo dia pro
 * mesmo caso.
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { notifyAdminDevolucaoContestada } from "@/lib/notifyAdminDevolucaoContestada";

const HORAS_ANTES_LEMBRAR = 48;

export async function lembrarDevolucoesContestadasPendentes(): Promise<{
  pendentesEncontradas: number;
  erros: number;
}> {
  const corte = new Date(Date.now() - HORAS_ANTES_LEMBRAR * 60 * 60 * 1000).toISOString();

  const { data: pendentes, error } = await supabaseAdmin
    .from("financial_ledger")
    .select("id, org_id, pedido_id, fornecedor_id, pedidos(marketplace_numero)")
    .eq("status", "EM_DEVOLUCAO")
    .not("fornecedor_contestou_em", "is", null)
    .lte("fornecedor_contestou_em", corte);

  if (error) {
    console.error("[devolucao-contestada-lembrete] erro ao listar pendentes:", error.message);
    return { pendentesEncontradas: 0, erros: 1 };
  }
  if (!pendentes || pendentes.length === 0) return { pendentesEncontradas: 0, erros: 0 };

  const fornecedorIds = [...new Set(pendentes.map((p) => p.fornecedor_id as string | null).filter(Boolean))] as string[];
  const { data: fornecedoresRows } = fornecedorIds.length
    ? await supabaseAdmin.from("fornecedores").select("id, nome").in("id", fornecedorIds)
    : { data: [] as Array<{ id: string; nome: string | null }> };
  const nomeFornecedor = new Map((fornecedoresRows ?? []).map((f) => [f.id as string, f.nome as string | null]));

  let erros = 0;
  for (const row of pendentes as unknown as Array<{
    id: string;
    org_id: string;
    pedido_id: string | null;
    fornecedor_id: string | null;
    pedidos: { marketplace_numero: string | null } | null;
  }>) {
    try {
      await notifyAdminDevolucaoContestada({
        org_id: row.org_id,
        ledger_id: row.id,
        pedido_id: row.pedido_id,
        marketplace_numero: row.pedidos?.marketplace_numero ?? null,
        fornecedor_nome: row.fornecedor_id ? (nomeFornecedor.get(row.fornecedor_id) ?? null) : null,
      });
    } catch (e) {
      erros++;
      console.error(`[devolucao-contestada-lembrete] erro no ledger ${row.id}:`, e);
    }
  }

  return { pendentesEncontradas: pendentes.length, erros };
}
