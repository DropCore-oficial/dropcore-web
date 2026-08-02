"use client";

import { AmberPremiumCallout } from "@/components/ui/AmberPremiumCallout";
import { AMBER_PREMIUM_TEXT_SOFT } from "@/lib/amberPremium";
import {
  isOlistSyncStale,
  OLIST_CRON_ESTOQUE_FORNECEDOR_MIN,
  OLIST_CRON_PEDIDOS_MIN,
  OLIST_CRON_PRECOS_MIN,
  resolverOlistModoOperacao,
} from "@/lib/olistModoOperacaoUi";
import { DANGER_PREMIUM_TEXT_BODY } from "@/lib/semanticPremium";
import { cn } from "@/lib/utils";

type Props = {
  papel: "seller" | "fornecedor";
  connected: boolean;
  tokenUsable: boolean;
  webhookLastAt: string | null;
  syncLastAt: string | null;
  syncIntervalMinutes: number;
  syncLabel: string;
};

export function OlistModoOperacaoPainel(props: Props) {
  if (!props.connected || !props.tokenUsable) return null;

  const modo = resolverOlistModoOperacao(props.webhookLastAt);
  const cronStale = isOlistSyncStale(props.syncLastAt, props.syncIntervalMinutes);

  if (modo === "webhook_ativo") {
    return (
      <div className="space-y-3">
        {cronStale ? (
          <p className={cn("rounded-xl border border-[var(--card-border)] px-3 py-2.5 text-xs leading-relaxed", AMBER_PREMIUM_TEXT_SOFT, "bg-[var(--surface-subtle)]")}>
            O cron de backup não rodou há mais de ~{props.syncIntervalMinutes * 3} min. O estoque na hora continua
            pelo webhook quando a Olist avisar; se persistir, fale com o suporte DropCore.
          </p>
        ) : null}
        <p className="text-xs text-emerald-700 dark:text-emerald-300">
          Webhook Olist ativo — último evento em{" "}
          {new Date(props.webhookLastAt!).toLocaleString("pt-BR")}. O cron continua como rede de segurança.
        </p>
      </div>
    );
  }

  const atrasoPedidos = `até ~${OLIST_CRON_PEDIDOS_MIN} min`;
  const atrasoEstoque = `até ~${OLIST_CRON_ESTOQUE_FORNECEDOR_MIN} min`;
  const atrasoPrecos = `até ~${OLIST_CRON_PRECOS_MIN} min`;

  return (
    <div className="space-y-3">
      <AmberPremiumCallout title="Modo consulta automática (sem webhook Olist)" className="rounded-xl px-3 py-3 sm:px-4">
        <p className="text-pretty text-xs leading-relaxed">
          A extensão <strong className="text-[var(--foreground)]">Webhooks</strong> na Olist exige plano Impulsione ou superior.
          Sem ela, o DropCore <strong className="text-[var(--foreground)]">consulta a API periodicamente</strong> — funciona, mas
          não é instantâneo.
        </p>
        <ul className="mt-2.5 space-y-1 text-xs leading-relaxed">
          {props.papel === "seller" ? (
            <>
              <li>
                <strong className="text-[var(--foreground)]">Pedidos</strong> (Olist → DropCore): {atrasoPedidos}
              </li>
              <li>
                <strong className="text-[var(--foreground)]">Estoque</strong> (armazém → DropCore → sua Olist): {atrasoEstoque}{" "}
                quando muda no armazém; <strong className="text-[var(--foreground)]">na hora</strong> quando você vende no DropCore
              </li>
              <li>
                <strong className="text-[var(--foreground)]">Preços/custos</strong> (DropCore → sua Olist): {atrasoPrecos}
              </li>
            </>
          ) : (
            <>
              <li>
                <strong className="text-[var(--foreground)]">Estoque</strong> (Olist armazém → DropCore → sellers): {atrasoEstoque}
              </li>
              <li>
                <strong className="text-[var(--foreground)]">Vendas no DropCore</strong> → Olist armazém: na hora
              </li>
            </>
          )}
        </ul>
        <p className="mt-2 text-xs leading-relaxed">
          Use os painéis abaixo para ver <strong className="text-[var(--foreground)]">última execução</strong>, erros e botões de
          consulta manual quando precisar na hora.
        </p>
      </AmberPremiumCallout>

      {cronStale ? (
        <p className={cn("rounded-xl border border-[var(--card-border)] bg-[var(--surface-subtle)] px-3 py-2.5 text-xs", DANGER_PREMIUM_TEXT_BODY)}>
          {props.syncLabel} não roda há mais de ~{props.syncIntervalMinutes * 3} min. Use o botão de consulta manual
          abaixo ou fale com o suporte DropCore.
        </p>
      ) : null}
    </div>
  );
}
