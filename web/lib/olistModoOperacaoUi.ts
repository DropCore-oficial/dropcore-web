/** Intervalos esperados dos crons Olist (minutos). */
export const OLIST_CRON_PEDIDOS_MIN = 1;
export const OLIST_CRON_ESTOQUE_FORNECEDOR_MIN = 1;
export const OLIST_CRON_PRECOS_MIN = 10;

/** Alerta se última sync passou de N× o intervalo (cron parado ou falhou). */
export const OLIST_SYNC_STALE_MULTIPLIER = 3;

export function isOlistSyncStale(
  lastAt: string | null | undefined,
  intervalMinutes: number,
  multiplier = OLIST_SYNC_STALE_MULTIPLIER,
): boolean {
  if (!lastAt?.trim()) return false;
  const t = new Date(lastAt).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t > intervalMinutes * 60 * 1000 * multiplier;
}

export function olistWebhookJaRecebido(webhookLastAt: string | null | undefined): boolean {
  return Boolean(webhookLastAt?.trim());
}

export type OlistModoOperacao = "webhook_ativo" | "consulta_automatica";

export function resolverOlistModoOperacao(webhookLastAt: string | null | undefined): OlistModoOperacao {
  return olistWebhookJaRecebido(webhookLastAt) ? "webhook_ativo" : "consulta_automatica";
}

export function formatOlistTempoDesde(iso: string | null | undefined): string | null {
  if (!iso?.trim()) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const diffMs = Date.now() - t;
  if (diffMs < 0) return "agora";
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return "agora há pouco";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 48) return `há ${h} h`;
  const d = Math.floor(h / 24);
  return `há ${d} dia${d === 1 ? "" : "s"}`;
}

export function latestOlistIso(a: string | null | undefined, b: string | null | undefined): string | null {
  const ta = a?.trim();
  const tb = b?.trim();
  if (!ta) return tb ?? null;
  if (!tb) return ta;
  return new Date(ta) >= new Date(tb) ? ta : tb;
}

export type OlistIntegracaoSaudeNivel = "ok" | "atencao" | "critico";

/** Saúde da integração de estoque do fornecedor (webhook + cron backup). */
export function resolveFornecedorEstoqueSaude(opts: {
  webhookLastAt: string | null;
  syncLastAt: string | null;
  cronLastAt: string | null;
}): {
  nivel: OlistIntegracaoSaudeNivel;
  titulo: string;
  detalhe: string;
  ultimaAtualizacao: string | null;
  cronBackupAtrasado: boolean;
} {
  const hasWebhook = olistWebhookJaRecebido(opts.webhookLastAt);
  const ultimaAtualizacao = latestOlistIso(opts.webhookLastAt, opts.syncLastAt);
  const cronStale = isOlistSyncStale(
    opts.cronLastAt,
    OLIST_CRON_ESTOQUE_FORNECEDOR_MIN,
  );
  const principalStale = isOlistSyncStale(
    hasWebhook ? opts.webhookLastAt : opts.syncLastAt,
    OLIST_CRON_ESTOQUE_FORNECEDOR_MIN,
  );

  if (!hasWebhook && principalStale) {
    return {
      nivel: "critico",
      titulo: "Estoque sem atualizar pelo cron",
      detalhe:
        "O cron deveria consultar a Olist a cada ~1 min. Confira os jobs no Supabase (quota/cron) ou use o botão manual abaixo.",
      ultimaAtualizacao,
      cronBackupAtrasado: true,
    };
  }

  if (hasWebhook && cronStale) {
    return {
      nivel: "atencao",
      titulo: "Cron de rede de segurança atrasado",
      detalhe:
        "O webhook cobre estoque na hora quando a Olist avisa. O cron de backup não roda há mais de ~3 min — vale conferir o Supabase (banner de quota/cron). Sem movimento na Olist, é normal não haver webhook recente.",
      ultimaAtualizacao,
      cronBackupAtrasado: true,
    };
  }

  return {
    nivel: "ok",
    titulo: hasWebhook ? "Integração ativa (webhook + cron)" : "Integração ativa (cron)",
    detalhe: hasWebhook
      ? "Estoque entra na hora pelo webhook quando há movimento na Olist; o cron segue como backup."
      : "O cron consulta a Olist do armazém a cada ~1 min.",
    ultimaAtualizacao,
    cronBackupAtrasado: false,
  };
}

/** Saúde sync de pedidos do seller. */
export function resolveSellerPedidosSaude(opts: {
  webhookLastAt: string | null;
  syncLastAt: string | null;
}): {
  nivel: OlistIntegracaoSaudeNivel;
  titulo: string;
  detalhe: string;
  ultimaAtualizacao: string | null;
} {
  const hasWebhook = olistWebhookJaRecebido(opts.webhookLastAt);
  const ultimaAtualizacao = latestOlistIso(opts.webhookLastAt, opts.syncLastAt);
  const stale = isOlistSyncStale(
    hasWebhook && opts.webhookLastAt ? opts.webhookLastAt : opts.syncLastAt,
    OLIST_CRON_PEDIDOS_MIN,
  );

  if (!hasWebhook && stale) {
    return {
      nivel: "critico",
      titulo: "Pedidos sem sync recente",
      detalhe: "O cron de pedidos deveria rodar a cada ~1 min. Confira o Supabase ou use Sincronizar pedidos agora.",
      ultimaAtualizacao,
    };
  }

  if (hasWebhook && isOlistSyncStale(opts.syncLastAt, OLIST_CRON_PEDIDOS_MIN)) {
    return {
      nivel: "atencao",
      titulo: "Cron de pedidos atrasado (backup)",
      detalhe: "Webhook é o caminho principal; o cron de backup não rodou há ~3 min. Confira o Supabase se persistir.",
      ultimaAtualizacao,
    };
  }

  return {
    nivel: "ok",
    titulo: hasWebhook ? "Pedidos: webhook + cron" : "Pedidos: cron ativo",
    detalhe: hasWebhook
      ? "Novos pedidos na Olist entram pelo webhook ou pelo cron (~1 min)."
      : "Novos pedidos entram pelo cron a cada ~1 min.",
    ultimaAtualizacao,
  };
}
