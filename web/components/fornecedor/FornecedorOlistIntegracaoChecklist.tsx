"use client";

import { cn } from "@/lib/utils";

type Props = {
  connected: boolean;
  tokenUsable: boolean;
  cnpjReady: boolean;
  webhookUrl: string | null;
  webhookLastReceivedAt: string | null;
  syncLastAt: string | null;
  syncStatus: string | null;
};

function StepRow(props: { ok: boolean; label: string; detail?: string }) {
  return (
    <li className="flex gap-2.5 text-sm leading-snug">
      <span
        className={cn(
          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
          props.ok
            ? "bg-emerald-600 text-white dark:bg-emerald-500"
            : "border border-[var(--card-border)] bg-[var(--background)] text-[var(--muted)]",
        )}
        aria-hidden
      >
        {props.ok ? "✓" : "·"}
      </span>
      <div className="min-w-0">
        <p className={props.ok ? "font-medium text-[var(--foreground)]" : "text-[var(--muted)]"}>{props.label}</p>
        {props.detail ? <p className="mt-0.5 text-xs text-[var(--muted)]">{props.detail}</p> : null}
      </div>
    </li>
  );
}

/** Checklist — estoque via webhook (se plano Olist permitir) ou cron ~1 min. */
export function FornecedorOlistIntegracaoChecklist(props: Props) {
  const url = props.webhookUrl?.trim() ?? "";
  const hasIngestUrl = url.includes("?w=");

  const tokenOk = props.connected && props.tokenUsable;
  const webhookTested = Boolean(props.webhookLastReceivedAt);
  const cronBackupOk =
    Boolean(props.syncLastAt) &&
    props.syncStatus != null &&
    props.syncStatus !== "webhook";

  return (
    <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] px-3 py-3 sm:px-4">
      <div>
        <p className="font-medium text-[var(--foreground)]">Checklist — integração completa</p>
        <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
          Com webhook na Olist (planos Impulsione+), estoque entra na hora. Sem webhook, o DropCore consulta a API a
          cada <strong className="text-[var(--foreground)]">~1 minuto</strong>. Vendas no DropCore continuam empurrando
          estoque para a Olist na hora.
        </p>
      </div>

      <ol className="mt-3 space-y-2.5">
        <StepRow
          ok={tokenOk}
          label="Token API salvo e válido no DropCore"
          detail={tokenOk ? undefined : "Cole o token da Olist/Tiny do armazém e salve nesta página."}
        />
        <StepRow
          ok={props.cnpjReady}
          label="CNPJ da conta Olist gravado"
          detail={props.cnpjReady ? undefined : "Rode add-fornecedor-olist-webhook.sql no Supabase e salve o token de novo."}
        />
        <StepRow
          ok={hasIngestUrl && props.cnpjReady}
          label="URL do webhook de estoque com ?w= (só seu fornecedor)"
          detail={
            hasIngestUrl
              ? "Copie a URL abaixo e cadastre em Configurações → Webhooks → URL de notificações do estoque."
              : "Conecte o token para gerar o link com token próprio."
          }
        />
        <StepRow
          ok={webhookTested}
          label="Webhook testado (Olist já chamou o DropCore)"
          detail={
            webhookTested
              ? `Último evento: ${new Date(props.webhookLastReceivedAt!).toLocaleString("pt-BR")}`
              : "Após cadastrar na Olist, movimente estoque ou aguarde uma venda real."
          }
        />
        <StepRow
          ok={cronBackupOk}
          label="Sync automático de estoque já rodou"
          detail={
            cronBackupOk
              ? `Última execução: ${new Date(props.syncLastAt!).toLocaleString("pt-BR")}`
              : "Normal em até ~1 minuto após salvar o token (cron no Supabase)."
          }
        />
      </ol>

      <p className="mt-3 text-xs text-[var(--muted)]">
        SKUs do armazém devem ser os mesmos cadastrados no DropCore (ex.: DJU001001, DJU001002…).
      </p>
    </div>
  );
}
