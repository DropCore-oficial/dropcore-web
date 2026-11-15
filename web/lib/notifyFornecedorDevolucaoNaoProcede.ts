/**
 * Notifica o fornecedor quando o admin decide que a devolução contestada NÃO procede — a
 * venda segue normal, ele vai receber no próximo repasse. Sem isso o fornecedor não sabia
 * se a contestação dele tinha sido aceita ou não (achado real 2026-11-14, mesma lacuna da
 * contestação em si antes de notifyAdminDevolucaoContestada existir).
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { notifyUserEmail } from "@/lib/notifyEmail";

function formatMoney(n: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
}

export async function notifyFornecedorDevolucaoNaoProcede(params: {
  org_id: string;
  fornecedor_id: string;
  ledger_id: string;
  pedido_id: string | null;
  /** Valor que o fornecedor recebe (nunca valor_total — regra de privacidade do projeto). */
  valor_fornecedor: number;
}): Promise<void> {
  const { data: member } = await supabaseAdmin
    .from("org_members")
    .select("user_id")
    .eq("org_id", params.org_id)
    .eq("fornecedor_id", params.fornecedor_id)
    .limit(1)
    .maybeSingle();

  const memberUserId = member?.user_id ?? null;
  if (!memberUserId) return;

  const titulo = "Sua contestação foi aceita — venda mantida";
  const mensagem = `O admin decidiu que a devolução não procede. A venda segue normal — ${formatMoney(params.valor_fornecedor)} entram no próximo repasse.`;

  await supabaseAdmin.from("notifications").insert({
    user_id: memberUserId,
    tipo: "devolucao_nao_procede_fornecedor",
    titulo,
    mensagem,
    metadata: { ledger_id: params.ledger_id, pedido_id: params.pedido_id },
  });

  await notifyUserEmail({
    userId: memberUserId,
    subject: titulo,
    titulo,
    mensagem,
    ctaUrl: "https://www.dropcore.com.br/fornecedor/pedidos?status=devolucao",
    ctaLabel: "Ver pedido",
  });
}
