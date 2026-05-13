"use client";

import type { ReactNode } from "react";
import { AmberPremiumCallout } from "@/components/ui/AmberPremiumCallout";
import { cn } from "@/lib/utils";

const stepShell =
  "rounded-xl border border-[var(--card-border)] bg-[var(--card)] shadow-[0_1px_0_rgb(0_0_0/0.04)] dark:shadow-none dark:bg-neutral-900/40";

function StepBlock({
  n,
  title,
  children,
}: {
  n: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <li className={cn("space-y-2.5 p-3 sm:space-y-3 sm:p-4", stepShell)}>
      <StepHeader n={n} title={title} />
      <div className="text-sm leading-relaxed text-neutral-600 dark:text-neutral-300 sm:pl-[2.875rem]">{children}</div>
    </li>
  );
}

function StepHeader({ n, title }: { n: string; title: string }) {
  return (
    <div className="flex items-start gap-2.5 sm:gap-3">
      <span
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-[11px] font-bold text-white shadow-sm ring-2 ring-emerald-500/25 sm:h-8 sm:w-8 sm:text-xs dark:bg-emerald-600 dark:ring-emerald-400/20"
        aria-hidden
      >
        {n}
      </span>
      <p className="min-w-0 flex-1 text-[15px] font-semibold leading-snug text-neutral-900 sm:text-sm dark:text-neutral-100">
        {title}
      </p>
    </div>
  );
}

export function SellerOlistConnectGuidePanel({ id = "guia-olist" }: { id?: string }) {
  return (
    <div id={id} className="scroll-mt-24 space-y-4">
      <h2 className="text-base font-semibold text-[var(--foreground)]">Como conectar a Olist/Tiny</h2>

      <AmberPremiumCallout title="Leia antes de abrir a Olist/Tiny" className="rounded-2xl px-3 py-3.5 sm:px-5">
        <p className="text-pretty leading-relaxed">
          Você <strong className="text-[var(--foreground)]">não</strong> cria um app DropCore na Olist/Tiny. Gere o{" "}
          <strong className="text-[var(--foreground)]">token API</strong> na sua conta e cole aqui no DropCore.
        </p>
        <p className="mt-2 text-pretty leading-relaxed">
          <strong className="text-[var(--foreground)]">Não use</strong> o menu Integrações da Olist/Tiny para marketplace — isso é
          canal de venda (Shopee, Mercado Livre), não a API do DropCore.
        </p>
      </AmberPremiumCallout>

      <div className={cn("space-y-5 p-3 sm:space-y-6 sm:p-6", stepShell)}>
        <ol className="space-y-3 sm:space-y-4">
          <StepBlock n="1" title="Abrir configurações na Olist/Tiny">
            <p>
              No ERP Olist/Tiny, clique na <strong className="text-neutral-900 dark:text-neutral-100">engrenagem</strong> (canto
              inferior esquerdo) e abra <strong className="text-neutral-900 dark:text-neutral-100">Configurações</strong>.
            </p>
          </StepBlock>
          <StepBlock n="2" title="Ir em Token API">
            <p>
              Em <strong className="text-neutral-900 dark:text-neutral-100">Outras configurações</strong>, abra{" "}
              <strong className="text-neutral-900 dark:text-neutral-100">Token API</strong> (não “Configurações de API”, que só
              ajusta estoque).
            </p>
          </StepBlock>
          <StepBlock n="3" title="Gerar e copiar o token">
            <p>
              Clique em <strong className="text-neutral-900 dark:text-neutral-100">gerar token API</strong>, copie o valor e guarde
              em local seguro. Quem tiver o token pode operar sua conta via API.
            </p>
          </StepBlock>
          <StepBlock n="4" title="Colar no DropCore">
            <p>
              Volte em <strong className="text-neutral-900 dark:text-neutral-100">Integração ERP</strong>, cole o token e salve. O
              DropCore valida com a Olist/Tiny e mostra o nome da conta quando der certo.
            </p>
          </StepBlock>
          <StepBlock n="5" title="Webhook de pedidos (opcional)">
            <p>
              Na mesma página <strong className="text-neutral-900 dark:text-neutral-100">Integração ERP</strong>, copie a{" "}
              <strong className="text-neutral-900 dark:text-neutral-100">URL do webhook</strong> exibida no cartão “Webhook de
              pedidos”. Na Olist/Tiny, use um plano com extensão de <strong className="text-neutral-900 dark:text-neutral-100">Webhooks</strong>{" "}
              e cadastre essa URL nas notificações de pedido. O CNPJ enviado pela Olist associa o evento à sua conta no DropCore
              depois que o CNPJ estiver gravado (mensagem verde na página).
            </p>
          </StepBlock>
        </ol>
      </div>
    </div>
  );
}
