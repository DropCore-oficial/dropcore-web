/**
 * Notificação in-app (sino) quando uma rodada de gestor de IA termina — hoje o seller só
 * descobria entrando na tela /seller/gestores-ia. Mesmo padrão de notifications já usado em
 * todo o resto do sistema (ver web/scripts/add-notifications.sql).
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { GestorId } from "./gestorPrompts";

const NOME_GESTOR: Record<GestorId, string> = {
  estoque_fulfillment: "Risco de Ruptura & Fulfillment",
  anuncios_seo: "Anúncios & SEO",
  reputacao: "Reputação",
  ads: "Ads",
  atendimento: "Atendimento",
};

export async function notificarSellerGestorConcluido(
  sellerId: string,
  gestor: GestorId,
  status: "ok" | "erro"
): Promise<void> {
  const { data: seller } = await supabaseAdmin
    .from("sellers")
    .select("user_id")
    .eq("id", sellerId)
    .maybeSingle();
  if (!seller?.user_id) return;

  const nomeGestor = NOME_GESTOR[gestor];
  const titulo = status === "ok" ? `${nomeGestor}: nova análise pronta` : `${nomeGestor}: erro na análise`;
  const mensagem =
    status === "ok"
      ? "Sua análise mais recente já está disponível em Gestores de IA."
      : "Não conseguimos processar a análise dessa vez — tentamos de novo na próxima rodada.";

  await supabaseAdmin.from("notifications").insert({
    user_id: seller.user_id,
    tipo: "gestor_ia_concluido",
    titulo,
    mensagem,
    metadata: { gestor, status },
  });
}
