"use client";

import {
  formatOlistTempoDesde,
  olistWebhookJaRecebido,
  type OlistIntegracaoSaudeNivel,
} from "@/lib/olistModoOperacaoUi";
import { AMBER_PREMIUM_TEXT_SOFT } from "@/lib/amberPremium";
import {
  DANGER_PREMIUM_SURFACE_TRANSPARENT,
  DANGER_PREMIUM_TEXT_BODY,
  SUCCESS_PREMIUM_SURFACE_TRANSPARENT,
} from "@/lib/semanticPremium";
import { cn } from "@/lib/utils";

type Linha = { rotulo: string; iso: string | null; nota?: string };

type Props = {
  nivel: OlistIntegracaoSaudeNivel;
  titulo: string;
  detalhe: string;
  linhas: Linha[];
};

function nivelStyles(nivel: OlistIntegracaoSaudeNivel) {
  if (nivel === "critico") {
    return {
      shell: DANGER_PREMIUM_SURFACE_TRANSPARENT,
      badge: "bg-[var(--danger)]/15 text-[var(--danger)]",
      label: "Atenção necessária",
    };
  }
  if (nivel === "atencao") {
    return {
      shell: "border border-[var(--card-border)] bg-[var(--surface-subtle)]",
      badge: cn(AMBER_PREMIUM_TEXT_SOFT, "bg-[var(--muted)]/10"),
      label: "Verificar",
    };
  }
  return {
    shell: SUCCESS_PREMIUM_SURFACE_TRANSPARENT,
    badge: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300",
    label: "Operando",
  };
}

export function OlistIntegracaoSaudeCard(props: Props) {
  const s = nivelStyles(props.nivel);

  return (
    <div className={cn("rounded-xl px-3 py-3 sm:px-4", s.shell)}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-[var(--foreground)]">{props.titulo}</p>
          <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">{props.detalhe}</p>
        </div>
        <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold", s.badge)}>
          {s.label}
        </span>
      </div>

      <dl className="mt-3 grid gap-2 sm:grid-cols-2">
        {props.linhas.map((linha) => (
          <div
            key={linha.rotulo}
            className="rounded-lg border border-[var(--card-border)]/80 bg-[var(--background)]/60 px-2.5 py-2"
          >
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">{linha.rotulo}</dt>
            <dd className="mt-0.5 text-xs text-[var(--foreground)]">
              {linha.iso ? (
                <>
                  {new Date(linha.iso).toLocaleString("pt-BR")}
                  <span className="text-[var(--muted)]"> · {formatOlistTempoDesde(linha.iso)}</span>
                </>
              ) : (
                <span className="text-[var(--muted)]">Ainda não registrado</span>
              )}
              {linha.nota ? <p className="mt-0.5 text-[10px] text-[var(--muted)]">{linha.nota}</p> : null}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function buildFornecedorEstoqueSaudeLinhas(opts: {
  webhookLastAt: string | null;
  syncLastAt: string | null;
  cronLastAt: string | null;
}): Linha[] {
  return [
    {
      rotulo: "Último webhook (estoque)",
      iso: opts.webhookLastAt,
      nota: olistWebhookJaRecebido(opts.webhookLastAt)
        ? "Movimento na Olist do armazém"
        : "Opcional — plano com extensão Webhooks",
    },
    {
      rotulo: "Último cron (backup)",
      iso: opts.cronLastAt,
      nota: "Consulta API ~1 min no Supabase",
    },
    {
      rotulo: "Última atualização no DropCore",
      iso: opts.syncLastAt,
    },
    {
      rotulo: "Modo",
      iso: null,
      nota: olistWebhookJaRecebido(opts.webhookLastAt) ? "Webhook + cron backup" : "Só cron (~1 min)",
    },
  ];
}

export function buildSellerPedidosSaudeLinhas(opts: {
  webhookLastAt: string | null;
  syncLastAt: string | null;
  precosLastAt: string | null;
}): Linha[] {
  return [
    {
      rotulo: "Último webhook (pedidos)",
      iso: opts.webhookLastAt,
      nota: "Opcional — plano com extensão Webhooks",
    },
    {
      rotulo: "Último cron (pedidos)",
      iso: opts.syncLastAt,
      nota: "Consulta API ~1 min",
    },
    {
      rotulo: "Último sync preços",
      iso: opts.precosLastAt,
      nota: "Cron ~10 min",
    },
  ];
}
