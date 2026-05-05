"use client";

import Link from "next/link";
import { SellerNav } from "../../SellerNav";
import { SellerPageHeader } from "@/components/seller/SellerPageHeader";

export default function SellerMapeamentoSkuPage() {
  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] app-bg pt-[calc(3.5rem+env(safe-area-inset-top,0px))] md:pt-14 pb-[calc(6.25rem+env(safe-area-inset-bottom,0px))] md:pb-8">
      <SellerNav active="integracoes" />
      <div className="dropcore-shell-4xl py-5 md:py-7 space-y-5 md:space-y-6">
        <SellerPageHeader
          surface="hero"
          title="Mapeamento de SKU"
          subtitle="Como alinhar marketplace, ERP e DropCore sem divergência de estoque ou saldo."
        />

        <div>
          <Link
            href="/seller/integracoes-erp"
            className="inline-flex text-sm font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
          >
            Voltar para Integrações ERP
          </Link>
        </div>

        <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] shadow-sm transition-shadow hover:shadow-md p-5 sm:p-6 space-y-5 text-sm text-[var(--muted)] leading-relaxed">
          <section>
            <h2 className="text-base font-semibold text-[var(--foreground)] mb-2">Regra de ouro</h2>
            <p>
              O <strong className="text-[var(--foreground)]">SKU que aparece no catálogo do seller</strong> no DropCore é o mesmo identificador que deve ir no{" "}
              <strong className="text-[var(--foreground)]">pedido enviado pelo ERP</strong> na API do DropCore. Se o ERP mandar outro código (ML interno, SKU
              “fantasia”, etc.), o sistema não associa ao produto certo.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-[var(--foreground)] mb-2">Fluxo recomendado</h2>
            <ol className="list-decimal pl-5 space-y-2">
              <li>
                No DropCore, o fornecedor cadastra produtos; cada variante tem um <strong className="text-[var(--foreground)]">SKU estável</strong> (ex.: código
                de fábrica + sufixo de cor/tamanho).
              </li>
              <li>
                O seller importa ou copia do catálogo DropCore o <strong className="text-[var(--foreground)]">mesmo SKU</strong> para o cadastro do produto no
                ERP (Tiny, Bling, planilha intermediária, etc.).
              </li>
              <li>
                No marketplace (ex.: Mercado Livre), o anúncio continua com o SKU interno da plataforma; no ERP, a ponte é
                o <strong className="text-[var(--foreground)]">mapeamento anúncio → produto/SKU do ERP</strong>, onde o produto no ERP usa o SKU do DropCore.
              </li>
              <li>
                Quando o pedido fecha no marketplace, o ERP monta o payload para o DropCore com as linhas já usando esse
                SKU — o mesmo da tela <Link href="/seller/produtos" className="text-emerald-600 dark:text-emerald-400 font-medium hover:underline">Produtos</Link>.
              </li>
            </ol>
          </section>

          <section>
            <h2 className="text-base font-semibold text-[var(--foreground)] mb-2">Checklist rápido</h2>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>Um registro de produto no ERP = um SKU DropCore (por variante).</li>
              <li>Evite renomear SKU depois de pedidos reais; prefira criar variante nova.</li>
              <li>Use o checklist “Pronto p/ vender” no catálogo antes de escalar anúncios.</li>
              <li>Se algo não bater, compare primeiro <strong className="text-[var(--foreground)]">SKU na nota / ERP</strong> com <strong className="text-[var(--foreground)]">SKU no catálogo</strong>.</li>
            </ul>
          </section>

        </div>

        <section className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] shadow-sm transition-shadow hover:shadow-md p-5 sm:p-6 text-xs text-[var(--muted)] leading-relaxed">
          <div className="rounded-xl border border-[var(--primary-blue)]/25 bg-[var(--surface-subtle)] px-4 py-3">
            <strong className="text-[var(--foreground)]">Estoque de volta ao ERP.</strong> Depois de cada{" "}
            <strong className="text-[var(--foreground)]">POST /api/erp/pedidos</strong> aceito, o DropCore pode chamar um <strong className="text-[var(--foreground)]">webhook HTTPS</strong> seu (em{" "}
            <Link href="/seller/integracoes-erp" className="font-medium text-emerald-600 dark:text-emerald-400 hover:underline">
              Integrações ERP
            </Link>
            ) com o evento <code className="text-[10px] bg-[var(--card)] px-1 rounded border border-[var(--card-border)]">dropcore.estoque_atualizado</code> e o estoque já debitado, ideal para n8n ou middleware que atualiza Bling/Tiny.
          </div>
        </section>

        <section className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] shadow-sm transition-shadow hover:shadow-md p-5 sm:p-6 text-xs text-[var(--muted)] leading-relaxed">
          <div className="rounded-xl border border-[var(--primary-blue)]/25 bg-[var(--surface-subtle)] px-4 py-3">
            <strong className="text-[var(--foreground)]">Operação da org.</strong> Quem cadastra fornecedor
            e vincula seller precisa garantir que o seller está no armazém certo; o catálogo já filtra pelo fornecedor
            conectado ao seller.
          </div>
        </section>
      </div>
    </div>
  );
}
