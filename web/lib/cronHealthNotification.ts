import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProblemaCron } from "@/lib/cronHealthCheck";

const TIPO = "cron_saude";

function descreverProblema(p: ProblemaCron): string {
  switch (p.tipo) {
    case "nao_agendado":
      return `${p.jobname}: não está agendado (rota existe, cron.schedule nunca rodou)`;
    case "nunca_rodou":
      return `${p.jobname}: agendado, mas nunca executou`;
    case "falhou":
      return `${p.jobname}: última execução falhou (${p.ultimoStart})`;
    case "atrasado":
      return `${p.jobname}: sem rodar com sucesso há ${p.gapHoras}h (esperado bem mais frequente)`;
  }
}

/** Notifica todos os owner/admin de todas as orgs — é infra de plataforma, não de uma org específica. */
export async function notificarProblemasCron(sb: SupabaseClient, problemas: ProblemaCron[]): Promise<void> {
  const { data: admins } = await sb
    .from("org_members")
    .select("user_id")
    .in("role_base", ["owner", "admin"]);

  const userIds = [...new Set((admins ?? []).map((a) => a.user_id).filter(Boolean))];

  if (problemas.length === 0) {
    for (const userId of userIds) {
      await sb.from("notifications").delete().eq("user_id", userId).eq("tipo", TIPO);
    }
    return;
  }

  const msg = problemas.map(descreverProblema).join(" · ");
  const desde = new Date();
  desde.setHours(desde.getHours() - 24);

  for (const userId of userIds) {
    const { data: jaExiste } = await sb
      .from("notifications")
      .select("id")
      .eq("user_id", userId)
      .eq("tipo", TIPO)
      .gte("criado_em", desde.toISOString())
      .limit(1)
      .maybeSingle();
    if (!jaExiste) {
      await sb.from("notifications").insert({
        user_id: userId,
        tipo: TIPO,
        titulo: `${problemas.length} cron(s) com problema`,
        mensagem: msg,
        metadata: {},
      });
    }
  }
}
