/**
 * Notifica admins/owners da org quando existe ciclo de repasse (terça-feira) já vencido
 * (anterior a hoje) que ainda não foi fechado em `/admin/repasse-fornecedor`.
 * Mesmo padrão de `inadimplenciaOrgNotifications.ts`: idempotente por 24h (não repete
 * notificação se já avisou no último dia) e limpa a notificação quando não há mais atraso.
 * Rodar em cron (`/api/cron/repasse-fornecedor-atrasado`) — não em GET de dashboard.
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const READY_STATUSES = ["ENTREGUE", "AGUARDANDO_REPASSE"] as const;
const TIPO_NOTIFICACAO = "repasse_fornecedor_atrasado";

function hojeSaoPauloYmd(d = new Date()): string {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const y = partes.find((p) => p.type === "year")?.value;
  const mo = partes.find((p) => p.type === "month")?.value;
  const da = partes.find((p) => p.type === "day")?.value;
  return y && mo && da ? `${y}-${mo}-${da}` : d.toISOString().slice(0, 10);
}

function diasEntre(ymdMaisAntigo: string, hojeYmd: string): number {
  const ms = new Date(`${hojeYmd}T00:00:00Z`).getTime() - new Date(`${ymdMaisAntigo}T00:00:00Z`).getTime();
  return Math.max(0, Math.round(ms / 86_400_000));
}

function formatDataBR(ymd: string): string {
  const [ano, mes, dia] = ymd.split("-");
  return `${dia}/${mes}/${ano}`;
}

async function limparNotificacoes(adminUserIds: string[]): Promise<void> {
  for (const userId of adminUserIds) {
    await supabaseAdmin.from("notifications").delete().eq("user_id", userId).eq("tipo", TIPO_NOTIFICACAO);
  }
}

export async function syncRepasseFornecedorAtrasadoNotifications(orgId: string): Promise<void> {
  const hoje = hojeSaoPauloYmd();

  const { data: adminsOrg } = await supabaseAdmin
    .from("org_members")
    .select("user_id")
    .eq("org_id", orgId)
    .in("role_base", ["owner", "admin"]);
  const adminUserIds = (adminsOrg ?? []).map((a) => a.user_id as string).filter(Boolean);
  if (adminUserIds.length === 0) return;

  const { data: ledgerRows } = await supabaseAdmin
    .from("financial_ledger")
    .select("ciclo_repasse")
    .eq("org_id", orgId)
    .in("tipo", ["BLOQUEIO", "VENDA"])
    .in("status", [...READY_STATUSES])
    .lt("ciclo_repasse", hoje);

  const ciclosComPendencia = [
    ...new Set((ledgerRows ?? []).map((r) => r.ciclo_repasse as string).filter(Boolean)),
  ];

  if (ciclosComPendencia.length === 0) {
    await limparNotificacoes(adminUserIds);
    return;
  }

  const { data: fechadosRows } = await supabaseAdmin
    .from("financial_ciclos_repasse")
    .select("ciclo_repasse")
    .eq("org_id", orgId)
    .eq("status", "fechado")
    .in("ciclo_repasse", ciclosComPendencia);

  const fechados = new Set((fechadosRows ?? []).map((r) => r.ciclo_repasse as string));
  const atrasados = ciclosComPendencia.filter((c) => !fechados.has(c)).sort();

  if (atrasados.length === 0) {
    await limparNotificacoes(adminUserIds);
    return;
  }

  const maisAntigo = atrasados[0];
  const diasAtraso = diasEntre(maisAntigo, hoje);
  const dataFmt = formatDataBR(maisAntigo);

  const mensagem =
    atrasados.length === 1
      ? `O repasse do ciclo de ${dataFmt} ainda não foi fechado — ${diasAtraso} dia(s) de atraso.`
      : `${atrasados.length} ciclos de repasse não foram fechados. O mais antigo é de ${dataFmt} — ${diasAtraso} dia(s) de atraso.`;

  const desde = new Date();
  desde.setHours(desde.getHours() - 24);

  for (const userId of adminUserIds) {
    const { data: jaExiste } = await supabaseAdmin
      .from("notifications")
      .select("id")
      .eq("user_id", userId)
      .eq("tipo", TIPO_NOTIFICACAO)
      .gte("criado_em", desde.toISOString())
      .limit(1)
      .maybeSingle();
    if (jaExiste) continue;

    await supabaseAdmin.from("notifications").insert({
      user_id: userId,
      tipo: TIPO_NOTIFICACAO,
      titulo: "Repasse ao fornecedor atrasado",
      mensagem,
      metadata: { ciclos_atrasados: atrasados.length, ciclo_mais_antigo: maisAntigo, dias_atraso: diasAtraso },
    });
  }
}
