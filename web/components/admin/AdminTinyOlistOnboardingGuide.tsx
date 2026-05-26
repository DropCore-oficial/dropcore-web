"use client";

import Link from "next/link";
import { AmberPremiumCallout } from "@/components/ui/AmberPremiumCallout";
import { cn } from "@/lib/utils";

const stepShell =
  "rounded-xl border border-[var(--card-border)] bg-[var(--card)] shadow-[0_1px_0_rgb(0_0_0/0.04)] dark:shadow-none";

function StepBlock({
  n,
  title,
  children,
}: {
  n: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className={cn("space-y-2.5 p-3 sm:space-y-3 sm:p-4", stepShell)}>
      <div className="flex items-start gap-2.5 sm:gap-3">
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-[11px] font-bold text-white sm:h-8 sm:w-8 sm:text-xs"
          aria-hidden
        >
          {n}
        </span>
        <p className="min-w-0 flex-1 text-[15px] font-semibold leading-snug text-[var(--foreground)] sm:text-sm">{title}</p>
      </div>
      <div className="text-sm leading-relaxed text-[var(--muted)] sm:pl-[2.875rem]">{children}</div>
    </li>
  );
}

function CheckItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2 text-sm leading-relaxed text-[var(--muted)]">
      <span className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden>
        □
      </span>
      <span>{children}</span>
    </li>
  );
}

export function AdminTinyOlistOnboardingGuide() {
  const appOrigin =
    typeof window !== "undefined" ? window.location.origin : "https://www.dropcore.com.br";

  return (
    <div className="space-y-6">
      <AmberPremiumCallout title="Uso interno — treinamento com o seller" className="rounded-2xl px-3 py-3.5 sm:px-5">
        <p className="text-pretty leading-relaxed">
          Este roteiro é para <strong className="text-[var(--foreground)]">você (admin DropCore)</strong> conduzir a call e
          integrar junto com o seller. O seller também tem o guia em{" "}
          <strong className="text-[var(--foreground)]">Integração ERP</strong> no painel dele — use os dois em paralelo na
          tela compartilhada.
        </p>
      </AmberPremiumCallout>

      <section className={cn("p-4 sm:p-5", stepShell)}>
        <h2 className="text-base font-semibold text-[var(--foreground)]">Antes da call (15 min)</h2>
        <ul className="mt-3 space-y-2">
          <CheckItem>
            Seller já entrou no DropCore (convite usado) e está em{" "}
            <Link href="/admin/sellers" className="font-semibold text-emerald-600 hover:underline dark:text-emerald-400">
              Admin → Sellers
            </Link>{" "}
            com status <strong className="text-[var(--foreground)]">ativo</strong>.
          </CheckItem>
          <CheckItem>
            Fornecedor/CD vinculado e SKUs habilitados no catálogo do seller (
            <code className="text-[11px]">/seller/produtos</code>).
          </CheckItem>
          <CheckItem>
            Seller com saldo para teste (ou avisar que pedido real bloqueia sem saldo).
          </CheckItem>
          <CheckItem>
            Conta <strong className="text-[var(--foreground)]">Olist/Tiny</strong> do seller com permissão de{" "}
            <strong className="text-[var(--foreground)]">Token API</strong> (ideal: plano com Webhooks de pedidos).
          </CheckItem>
          <CheckItem>
            <strong className="text-[var(--foreground)]">Não</strong> usar{" "}
            <Link href="/admin/integracoes-erp" className="font-semibold text-emerald-600 hover:underline dark:text-emerald-400">
              Admin → Integração ERP
            </Link>{" "}
            — aquela tela é a chave API da <em>org</em> para ERP genérico. A integração Olist/Tiny do seller é no{" "}
            <strong className="text-[var(--foreground)]">painel do seller</strong>.
          </CheckItem>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-[var(--foreground)]">Roteiro da call (faça com o seller logado)</h2>
        <p className="text-sm text-[var(--muted)]">
          Peça para o seller abrir{" "}
          <a
            href={`${appOrigin}/seller/integracoes-erp`}
            className="font-semibold text-emerald-600 hover:underline dark:text-emerald-400"
            target="_blank"
            rel="noopener noreferrer"
          >
            {appOrigin}/seller/integracoes-erp
          </a>{" "}
          (ou compartilhe a tela dele). Siga o checklist verde que aparece na página dele.
        </p>

        <ol className="space-y-3">
          <StepBlock n="1" title="Token API na Olist/Tiny">
            <p>
              Na Tiny: engrenagem → <strong className="text-[var(--foreground)]">Configurações</strong> →{" "}
              <strong className="text-[var(--foreground)]">Outras configurações → Token API</strong> → gerar e copiar.
            </p>
            <p className="mt-2">
              Guia visual para o seller:{" "}
              <Link
                href="/seller/integracoes-erp/como-conectar"
                className="font-semibold text-emerald-600 hover:underline dark:text-emerald-400"
              >
                Como conectar (passo a passo)
              </Link>
              .
            </p>
            <p className="mt-2 text-xs">
              <strong className="text-[var(--foreground)]">Não</strong> é o menu “Integrações” de marketplace (Shopee/ML) — é só
              Token API.
            </p>
          </StepBlock>

          <StepBlock n="2" title="Colar token no DropCore (painel seller)">
            <p>
              Na mesma página <code className="text-xs">/seller/integracoes-erp</code>, cole o token e salve. Deve aparecer o{" "}
              <strong className="text-[var(--foreground)]">nome da conta</strong> e prefixo do token.
            </p>
            <p className="mt-2">
              Se der erro de criptografia: conferir <code className="text-[11px]">SELLER_ERP_CREDENTIALS_KEY</code> na Vercel (
              <code className="text-[11px]">dropcore-web</code>) e gerar token novo na Tiny se a chave mudou.
            </p>
          </StepBlock>

          <StepBlock n="3" title="CNPJ gravado (obrigatório para webhook)">
            <p>
              Após salvar, o aviso âmbar “Webhook ainda não associa” deve sumir e aparecer mensagem verde de{" "}
              <strong className="text-[var(--foreground)]">CNPJ gravado</strong>.
            </p>
            <p className="mt-2 text-xs">
              Se não sumir: rodar no Supabase{" "}
              <code className="font-mono text-[10px]">add-seller-olist-webhook.sql</code> e{" "}
              <code className="font-mono text-[10px]">add-seller-olist-ingest-token.sql</code>, depois{" "}
              <strong className="text-[var(--foreground)]">salvar o token de novo</strong>.
            </p>
          </StepBlock>

          <StepBlock n="4" title="Catálogo: mesmo SKU nos dois lados">
            <p>
              Antes de escalar vendas: cada variante na Tiny deve usar o{" "}
              <strong className="text-[var(--foreground)]">mesmo SKU</strong> do catálogo DropCore.
            </p>
            <p className="mt-2">
              Exportar CSV: seller em <code className="text-xs">/seller/produtos</code> → Exportar para Olist → importar planilha
              na Tiny. Roteiro:{" "}
              <Link
                href="/seller/integracoes-erp/mapeamento"
                className="font-semibold text-emerald-600 hover:underline dark:text-emerald-400"
              >
                Mapeamento SKU
              </Link>
              .
            </p>
          </StepBlock>

          <StepBlock n="5" title="Webhook de pedidos (recomendado — pedido na hora)">
            <p>
              No cartão <strong className="text-[var(--foreground)]">Webhook de pedidos</strong>, botão{" "}
              <strong className="text-[var(--foreground)]">Copiar URL</strong> (com <code className="text-[10px]">?w=</code>).
              Cadastrar na Tiny em notificações/webhooks de <strong className="text-[var(--foreground)]">pedido</strong>.
            </p>
            <p className="mt-2">
              Validação: checklist do seller deve marcar{" "}
              <strong className="text-[var(--foreground)]">Webhook testado</strong> com data do último evento (após um pedido de
              teste ou venda real).
            </p>
            <p className="mt-2 text-xs">
              Rede de segurança: sync automático a cada ~1 min (cron Supabase) — não depende só do botão do seller.
            </p>
          </StepBlock>

          <StepBlock n="6" title="Teste de ponta a ponta">
            <p>
              Disparar pedido na Tiny (status aprovado/enviado conforme regra) ou aguardar sync. No DropCore: pedido em{" "}
              <Link href="/admin/pedidos" className="font-semibold text-emerald-600 hover:underline dark:text-emerald-400">
                Admin → Pedidos
              </Link>
              , estoque debitado, saldo bloqueado.
            </p>
            <p className="mt-2">
              Se falhar com <code className="text-xs">ESTOQUE_INSUFICIENTE</code>: SKU diferente ou sem estoque no catálogo — não é
              “atraso do cron”; o DropCore barra de propósito.
            </p>
          </StepBlock>
        </ol>
      </section>

      <section className={cn("p-4 sm:p-5", stepShell)}>
        <h2 className="text-base font-semibold text-[var(--foreground)]">Depois da call — você confere</h2>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-[var(--muted)]">
          <li>
            Em <Link href="/admin/sellers" className="text-emerald-600 hover:underline dark:text-emerald-400">Sellers</Link>, abra o
            cadastro: plano, fornecedor, saldo.
          </li>
          <li>Na página do seller, “Última sync” com status ok (importado/ignorado).</li>
          <li>Webhook: data do último evento no checklist (se vazio, Tiny ainda não chamou a URL).</li>
          <li>Pedido teste visível em Pedidos com SKU e valores corretos.</li>
        </ul>
      </section>

      <section className={cn("p-4 sm:p-5", stepShell)}>
        <h2 className="text-base font-semibold text-[var(--foreground)]">Problemas frequentes</h2>
        <dl className="mt-3 space-y-3 text-sm">
          <div>
            <dt className="font-medium text-[var(--foreground)]">Pedido não entra no DropCore</dt>
            <dd className="mt-0.5 text-[var(--muted)]">
              Webhook não cadastrado ou URL antiga (sem <code className="text-[10px]">?w=</code>). Aguardar até 1 min pelo cron.
              Status do pedido na Tiny precisa ser importável (aprovado, enviado, etc.).
            </dd>
          </div>
          <div>
            <dt className="font-medium text-[var(--foreground)]">ESTOQUE_INSUFICIENTE</dt>
            <dd className="mt-0.5 text-[var(--muted)]">
              SKU na Tiny ≠ SKU DropCore, ou estoque zero no fornecedor. Ajustar cadastro — não aumentar frequência do cron.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-[var(--foreground)]">Token salvo mas “inacessível”</dt>
            <dd className="mt-0.5 text-[var(--muted)]">
              Chave <code className="text-[10px]">SELLER_ERP_CREDENTIALS_KEY</code> na Vercel; gerar token novo e salvar de novo.
            </dd>
          </div>
        </dl>
      </section>

      <section className={cn("p-4 sm:p-5", stepShell)}>
        <h2 className="text-base font-semibold text-[var(--foreground)]">Scripts SQL (só se algo falhar)</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">Pasta <code className="text-xs">web/scripts/</code> no repositório:</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 font-mono text-[11px] text-[var(--muted)]">
          <li>add-seller-olist-integration.sql</li>
          <li>add-seller-olist-webhook.sql</li>
          <li>add-seller-olist-ingest-token.sql</li>
          <li>add-seller-olist-sync.sql</li>
          <li>supabase-cron-jobs.sql (cron 1 min + inadimplência horária)</li>
        </ul>
      </section>
    </div>
  );
}
