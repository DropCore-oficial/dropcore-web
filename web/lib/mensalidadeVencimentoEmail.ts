/**
 * E-mail individual de cobrança pro seller/fornecedor dono da mensalidade — dois momentos:
 * 1) `enviarEmailsMensalidadeVencida`: mensalidade acabou de virar inadimplente (chamado logo
 *    após `marcarInadimplentes`, que só retorna cada linha uma vez — idempotência natural).
 * 2) `enviarEmailsMensalidadeVencendo`: mensalidade ainda pendente, vence nos próximos 3 dias.
 *    Roda a cada hora (mesmo cron da inadimplência), por isso usa `notifications` como trava
 *    de "já avisei nas últimas 24h" pra não mandar o mesmo e-mail várias vezes por dia.
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { notifyUserEmail } from "@/lib/notifyEmail";
import type { MensalidadeMarcadaInadimplente } from "@/lib/inadimplencia";

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function formatDataBR(ymd: string | null): string {
  if (!ymd) return "";
  const [ano, mes, dia] = ymd.split("-");
  return `${dia}/${mes}/${ano}`;
}

async function getUserIdParaEntidade(tipo: "seller" | "fornecedor", entidadeId: string): Promise<string | null> {
  if (tipo === "seller") {
    const { data } = await supabaseAdmin.from("sellers").select("user_id").eq("id", entidadeId).maybeSingle();
    return (data?.user_id as string | null) ?? null;
  }
  const { data } = await supabaseAdmin
    .from("org_members")
    .select("user_id")
    .eq("fornecedor_id", entidadeId)
    .limit(1)
    .maybeSingle();
  return (data?.user_id as string | null) ?? null;
}

export async function enviarEmailsMensalidadeVencida(marcados: MensalidadeMarcadaInadimplente[]): Promise<void> {
  for (const m of marcados) {
    const userId = await getUserIdParaEntidade(m.tipo, m.entidade_id);
    if (!userId) continue;
    await notifyUserEmail({
      userId,
      subject: "Sua mensalidade DropCore venceu",
      titulo: "Mensalidade vencida",
      mensagem: `Sua mensalidade de ${BRL.format(m.valor)}, com vencimento em ${formatDataBR(
        m.vencimento_em
      )}, está em aberto. Regularize para evitar bloqueio de pedidos.`,
    });
  }
}

export async function enviarEmailsMensalidadeVencendo(orgId: string): Promise<void> {
  const hoje = new Date();
  const hojeStr = hoje.toISOString().slice(0, 10);
  const em3 = new Date(hoje);
  em3.setDate(em3.getDate() + 3);
  const em3Str = em3.toISOString().slice(0, 10);

  const { data: rows } = await supabaseAdmin
    .from("financial_mensalidades")
    .select("tipo, entidade_id, valor, vencimento_em")
    .eq("org_id", orgId)
    .eq("status", "pendente")
    .not("vencimento_em", "is", null)
    .gte("vencimento_em", hojeStr)
    .lte("vencimento_em", em3Str);
  if (!rows?.length) return;

  const desde = new Date();
  desde.setHours(desde.getHours() - 24);

  for (const r of rows) {
    const tipo = r.tipo as "seller" | "fornecedor";
    const entidadeId = r.entidade_id as string;
    const userId = await getUserIdParaEntidade(tipo, entidadeId);
    if (!userId) continue;

    const { data: jaAvisado } = await supabaseAdmin
      .from("notifications")
      .select("id")
      .eq("user_id", userId)
      .eq("tipo", "mensalidade_vencendo")
      .gte("criado_em", desde.toISOString())
      .limit(1)
      .maybeSingle();
    if (jaAvisado) continue;

    const valor = Number(r.valor);
    const vencimentoEm = r.vencimento_em as string;
    const mensagem = `Sua mensalidade de ${BRL.format(valor)} vence em ${formatDataBR(
      vencimentoEm
    )}. Evite o bloqueio de pedidos.`;

    await supabaseAdmin.from("notifications").insert({
      user_id: userId,
      tipo: "mensalidade_vencendo",
      titulo: "Mensalidade vencendo",
      mensagem,
      metadata: { valor, vencimento_em: vencimentoEm },
    });
    await notifyUserEmail({
      userId,
      subject: "Sua mensalidade DropCore vence em breve",
      titulo: "Mensalidade vencendo",
      mensagem,
    });
  }
}
