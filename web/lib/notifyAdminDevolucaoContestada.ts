/**
 * Avisa owners/admins da org (sino + e-mail) quando o fornecedor contesta uma devolução —
 * achado real 2026-11-11: a contestação só gravava no banco e travava a liberação
 * automática, sem avisar ninguém; um caso ficou 8 dias parado até alguém notar por acaso.
 * Também usada pelo lembrete diário (ver devolucaoContestadaLembrete.ts) pra casos ainda sem
 * decisão — por isso tem dedupe de 24h (não manda de novo se já mandou recente pro mesmo
 * ledger).
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { notifyUserEmail } from "@/lib/notifyEmail";

const TIPO = "devolucao_contestada_fornecedor_admin" as const;
const JANELA_DEDUPE_HORAS = 24;

export async function notifyAdminDevolucaoContestada(params: {
  org_id: string;
  ledger_id: string;
  pedido_id: string | null;
  marketplace_numero: string | null;
  fornecedor_nome: string | null;
}): Promise<void> {
  const desde = new Date(Date.now() - JANELA_DEDUPE_HORAS * 60 * 60 * 1000).toISOString();
  const { data: jaNotificado } = await supabaseAdmin
    .from("notifications")
    .select("id")
    .eq("tipo", TIPO)
    .gte("criado_em", desde)
    .contains("metadata", { ledger_id: params.ledger_id })
    .limit(1)
    .maybeSingle();
  if (jaNotificado) return;

  const { data: admins } = await supabaseAdmin
    .from("org_members")
    .select("user_id")
    .eq("org_id", params.org_id)
    .is("fornecedor_id", null)
    .is("seller_id", null)
    .in("role_base", ["owner", "admin"]);

  const destinatarios = (admins ?? []).filter(
    (a): a is { user_id: string } => typeof a.user_id === "string" && a.user_id.length > 0
  );
  if (destinatarios.length === 0) return;

  const pedidoRef = params.marketplace_numero ? ` (pedido #${params.marketplace_numero})` : "";
  const fornecedorRef = params.fornecedor_nome ? ` (${params.fornecedor_nome})` : "";
  const titulo = "Fornecedor contestou devolução";
  const mensagem = `O fornecedor${fornecedorRef} contestou uma devolução${pedidoRef} — precisa decidir: liberar pro seller ou manter a venda. Confira em Pedidos → Devolução → Contestadas.`;

  await Promise.all(
    destinatarios.map(async (a) => {
      await supabaseAdmin.from("notifications").insert({
        user_id: a.user_id,
        tipo: TIPO,
        titulo,
        mensagem,
        metadata: { ledger_id: params.ledger_id, pedido_id: params.pedido_id },
      });
      await notifyUserEmail({
        userId: a.user_id,
        subject: "Fornecedor contestou devolução — decisão necessária",
        titulo,
        mensagem,
        ctaUrl: "https://www.dropcore.com.br/admin/pedidos",
        ctaLabel: "Ver pedido",
      });
    })
  );
}

export { TIPO as NOTIFICACAO_TIPO_DEVOLUCAO_CONTESTADA_ADMIN };
