/**
 * Notificação (sino + e-mail) do resumo diário do Gestor avulso — espelha
 * `gestorNotificacao.ts` do hub, trocando `sellers` por `calculadora_assinantes`. Só
 * notifica quando há pelo menos 1 proposta no top3 (nada de "sem novidade hoje", seria
 * ruído diário sem valor).
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { notifyUserEmail } from "@/lib/notifyEmail";
import type { PropostaResumoDiarioAvulso } from "./gestorTiagoResumoDiarioAvulso";

function formatarMensagem(top3: PropostaResumoDiarioAvulso[]): string {
  return top3
    .map((p, i) => `${i + 1}. [${p.gestor_nome}] ${p.item_ou_sku} — ${p.acao} ${p.motivo}`)
    .join("\n");
}

export async function notificarAssinanteResumoDiarioAvulso(
  assinanteId: string,
  top3: PropostaResumoDiarioAvulso[]
): Promise<void> {
  if (top3.length === 0) return;

  const { data: assinante } = await supabaseAdmin
    .from("calculadora_assinantes")
    .select("user_id")
    .eq("id", assinanteId)
    .maybeSingle();
  if (!assinante?.user_id) return;

  const titulo = "Seu resumo diário dos Gestores de IA está pronto";
  const mensagem = formatarMensagem(top3);

  await supabaseAdmin.from("notifications").insert({
    user_id: assinante.user_id,
    tipo: "gestores_ia_avulso_resumo_diario",
    titulo,
    mensagem,
    metadata: { top3 },
  });

  await notifyUserEmail({
    userId: assinante.user_id,
    subject: titulo,
    titulo,
    mensagem,
    ctaUrl: "https://www.dropcore.com.br/seller/gestores-ia-avulso/tiago",
    ctaLabel: "Ver resumo completo",
  });
}
