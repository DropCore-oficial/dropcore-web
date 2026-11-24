/**
 * Varre falha de sync com o ML acumulada (pendente ou esgotada) e avisa o admin quando
 * passa do limite — achado 2026-11-24: a Coimbra Company rodou o dia inteiro com
 * centenas de falha ("not authorized") sem ninguém saber, porque nada avisava o admin.
 * Dedup por janela de tempo (não manda um aviso novo a cada rodada do cron enquanto o
 * problema persiste — um aviso por "episódio" já é suficiente pro admin agir).
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { notifyAdminsMlSyncFalhaRecorrente } from "@/lib/notifyAdminsMlSyncProblema";

const LIMITE_FALHAS = 5;
const JANELA_DEDUP_HORAS = 2;

type ResumoFalha = {
  seller_id: string;
  seller_nome: string;
  fornecedor_id: string | null;
  fornecedor_nome: string | null;
  qtd_pendente: number;
  qtd_esgotado: number;
  ultimo_erro: string | null;
  ultima_tentativa: string;
};

async function jaAvisadoRecentemente(orgId: string, sellerId: string, fornecedorId: string | null): Promise<boolean> {
  const desde = new Date(Date.now() - JANELA_DEDUP_HORAS * 60 * 60 * 1000).toISOString();
  const { data } = await supabaseAdmin
    .from("notifications")
    .select("id, metadata")
    .eq("tipo", "ml_sync_falha_recorrente_admin")
    .gte("criado_em", desde)
    .limit(50);
  return (data ?? []).some((n) => {
    const m = (n as { metadata?: { seller_id?: string; fornecedor_id?: string | null } }).metadata;
    return m?.seller_id === sellerId && (m?.fornecedor_id ?? null) === fornecedorId;
  });
}

export async function runMlSyncAlertaAdmin(): Promise<{ orgs_avaliadas: number; avisos_enviados: number }> {
  const { data: orgsComFalha } = await supabaseAdmin
    .from("ml_sync_falhas")
    .select("org_id")
    .in("status", ["pendente", "esgotado"]);

  const orgIds = Array.from(new Set((orgsComFalha ?? []).map((r) => String((r as { org_id: string }).org_id))));
  let avisos = 0;

  for (const orgId of orgIds) {
    const { data: resumo, error } = await supabaseAdmin.rpc("fn_ml_sync_falhas_resumo_admin", { p_org_id: orgId });
    if (error) {
      console.error("[runMlSyncAlertaAdmin] resumo", orgId, error.message);
      continue;
    }
    for (const linha of (resumo ?? []) as ResumoFalha[]) {
      const total = linha.qtd_pendente + linha.qtd_esgotado;
      if (total < LIMITE_FALHAS) continue;
      if (await jaAvisadoRecentemente(orgId, linha.seller_id, linha.fornecedor_id)) continue;

      await notifyAdminsMlSyncFalhaRecorrente({
        org_id: orgId,
        seller_id: linha.seller_id,
        seller_nome: linha.seller_nome,
        fornecedor_id: linha.fornecedor_id,
        fornecedor_nome: linha.fornecedor_nome,
        qtd_pendente: linha.qtd_pendente,
        qtd_esgotado: linha.qtd_esgotado,
        ultimo_erro: linha.ultimo_erro,
      });
      avisos += 1;
    }
  }

  return { orgs_avaliadas: orgIds.length, avisos_enviados: avisos };
}
