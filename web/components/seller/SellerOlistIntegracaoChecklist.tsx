"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

type Props = {
  connected: boolean;
  tokenUsable: boolean;
  cnpjReady: boolean;
  webhookUrl: string | null;
  webhookLastReceivedAt: string | null;
  syncLastAt: string | null;
};

function StepRow(props: { ok: boolean; label: string; detail?: string }) {
  return (
    <li className="flex gap-2.5 text-sm leading-snug">
      <span
        className={cn(
          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
          props.ok
            ? "bg-emerald-600 text-white dark:bg-emerald-500"
            : "border border-[var(--card-border)] bg-[var(--background)] text-[var(--muted)]"
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

export function SellerOlistIntegracaoChecklist(props: Props) {
  const url = props.webhookUrl?.trim() ?? "";
  const hasIngestUrl = url.includes("?w=");

  const tokenOk = props.connected && props.tokenUsable;
  const webhookTested = Boolean(props.webhookLastReceivedAt);
  const cronOk = Boolean(props.syncLastAt);

  return (
    <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] px-3 py-3 sm:px-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium text-[var(--foreground)]">Checklist — integração completa</p>
          <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
            Pedidos entram mais rápido pelo <strong className="text-[var(--foreground)]">webhook</strong> (planos Olist com extensão);
            sem webhook, o sync a cada ~1 minuto busca pedidos na API.
          </p>
        </div>
        <Link
          href="/seller/integracoes-erp/como-conectar"
          className="shrink-0 text-xs font-semibold text-emerald-600 hover:underline dark:text-emerald-400"
        >
          Guia passo a passo →
        </Link>
      </div>

      <ol className="mt-3 space-y-2.5">
        <StepRow
          ok={tokenOk}
          label="Token API salvo e válido no DropCore"
          detail={tokenOk ? undefined : "Cole o token da Olist/Tiny e salve nesta página."}
        />
        <StepRow
          ok={props.cnpjReady}
          label="CNPJ da conta Olist gravado"
          detail={props.cnpjReady ? undefined : "Salve o token de novo após rodar o SQL de CNPJ no Supabase."}
        />
        <StepRow
          ok={hasIngestUrl && props.cnpjReady}
          label="Webhook de pedidos (opcional — plano Impulsione+)"
          detail={
            hasIngestUrl
              ? "Se tiver a extensão Webhooks na Olist, cadastre a URL abaixo. Sem ela, o sync a cada ~1 min basta."
              : "Conecte o token para gerar o link — só necessário com extensão Webhooks na Olist."
          }
        />
        <StepRow
          ok={webhookTested}
          label="Webhook testado (opcional)"
          detail={
            webhookTested
              ? `Último evento: ${new Date(props.webhookLastReceivedAt!).toLocaleString("pt-BR")}`
              : "Sem extensão Webhooks na Olist? Ignore — o cron de ~1 min cobre pedidos."
          }
        />
        <StepRow
          ok={cronOk}
          label="Sync automático já rodou pelo menos uma vez"
          detail={
            cronOk
              ? `Última execução: ${new Date(props.syncLastAt!).toLocaleString("pt-BR")}`
              : "Normal em até ~1 minuto após salvar o token."
          }
        />
      </ol>

      <p className="mt-3 text-xs text-[var(--muted)]">
        SKUs iguais nos dois lados:{" "}
        <Link href="/seller/integracoes-erp/mapeamento" className="font-semibold text-emerald-600 hover:underline dark:text-emerald-400">
          checklist de mapeamento
        </Link>
        .
      </p>
    </div>
  );
}
