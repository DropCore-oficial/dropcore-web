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
          <StepBlock n="5" title="Exportar catálogo para a Olist (recomendado antes dos pedidos)">
            <p>
              Em <strong className="text-neutral-900 dark:text-neutral-100">Mais → Produtos</strong>, clique em{" "}
              <strong className="text-neutral-900 dark:text-neutral-100">Exportar para Olist</strong> em cada produto da lista (expandir o
              card) para baixar o CSV daquele grupo — pai, variações, estoque, NCM, peso, dimensões, marca, CEST e fotos. Importe em
              Cadastros → Produtos → Importar planilha na Olist/Tiny.
            </p>
            <p className="mt-2 text-pretty leading-relaxed">
              Com a Olist conectada em <strong className="text-neutral-900 dark:text-neutral-100">Integração ERP</strong>, o DropCore
              também envia o <strong className="text-neutral-900 dark:text-neutral-100">preço de custo</strong> automaticamente via API
              logo após o download (pai + variações). Confira na aba Custos do produto na Olist — se o SKU ainda não existir no ERP, importe
              o CSV primeiro e exporte de novo.
            </p>
            <p className="mt-2 text-pretty leading-relaxed">
              Na confirmação da importação, marque{" "}
              <strong className="text-neutral-900 dark:text-neutral-100">Atualizar preço de custo e estoque</strong> para reforçar custo e
              estoque pela planilha. Peso, NCM, CEST e dimensões cadastrados no fornecedor (mesmo só no representante do grupo) são
              herdados para o pai e para todas as variações na planilha. Categoria na planilha só entra se já existir na Olist no formato{" "}
              <code className="text-xs">Departamento &gt; Subcategoria</code> (ex.:{" "}
              <code className="text-xs">Vestuários &gt; Camisetas</code>).
            </p>
            <p className="mt-2 text-pretty leading-relaxed">
              Fotos na Olist vêm das miniaturas que o fornecedor já sobe em{" "}
              <strong className="text-neutral-900 dark:text-neutral-100">Info. de Variantes</strong> (por cor) — capa do pai usa
              essas fotos automaticamente. A aba Mídia é só se quiser uma capa diferente. No export, base64 antigo vira URL pública
              no Supabase. No catálogo DropCore o seller já vê as miniaturas antes de exportar.
            </p>
          </StepBlock>
          <StepBlock n="6" title="Webhook de pedidos (opcional)">
            <p>
              Na mesma página <strong className="text-neutral-900 dark:text-neutral-100">Integração ERP</strong>, copie a{" "}
              <strong className="text-neutral-900 dark:text-neutral-100">URL do webhook</strong> exibida no cartão “Webhook de
              pedidos”. Na Olist/Tiny, use um plano com extensão de <strong className="text-neutral-900 dark:text-neutral-100">Webhooks</strong>{" "}
              e cadastre essa URL nas notificações de pedido. O link inclui um token só seu (<code className="text-xs">?w=</code>); o
              CNPJ no corpo do evento precisa bater com o CNPJ gravado no DropCore (mensagem verde na página).
            </p>
          </StepBlock>
        </ol>
      </div>
    </div>
  );
}
