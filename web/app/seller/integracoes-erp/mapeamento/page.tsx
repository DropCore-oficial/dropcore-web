"use client";

import Link from "next/link";
import { SellerNav } from "../../SellerNav";
import { SellerPageHeader } from "@/components/seller/SellerPageHeader";

export default function SellerMapeamentoSkuPage() {
  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] app-bg pt-[calc(3rem+env(safe-area-inset-top,0px))] md:pt-14 pb-[calc(6.25rem+env(safe-area-inset-bottom,0px))] md:pb-8">
      <div className="w-full max-w-2xl mx-auto dropcore-px-wide py-6 lg:py-8 space-y-6">
        <nav className="text-sm">
          <Link
            href="/seller/integracoes-erp"
            className="text-emerald-600 dark:text-emerald-400 font-medium hover:underline"
          >
            ← Voltar para Integrações ERP
          </Link>
        </nav>

        <SellerPageHeader
          title="Mapeamento de SKU"
          subtitle="Como alinhar marketplace, ERP e DropCore sem divergência de estoque ou saldo."
        />

        <div className="rounded-2xl border border-neutral-200/80 dark:border-neutral-700/50 bg-white dark:bg-neutral-900/80 shadow-sm p-5 sm:p-6 space-y-5 text-sm text-neutral-700 dark:text-neutral-300 leading-relaxed">
          <section>
            <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100 mb-2">Regra de ouro</h2>
            <p>
              O <strong>SKU que aparece no catálogo do seller</strong> no DropCore é o mesmo identificador que deve ir no{" "}
              <strong>pedido enviado pelo ERP</strong> na API do DropCore. Se o ERP mandar outro código (ML interno, SKU
              “fantasia”, etc.), o sistema não associa ao produto certo.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100 mb-2">Fluxo recomendado</h2>
            <ol className="list-decimal pl-5 space-y-2">
              <li>
                No DropCore, o fornecedor cadastra produtos; cada variante tem um <strong>SKU estável</strong> (ex.: código
                de fábrica + sufixo de cor/tamanho).
              </li>
              <li>
                O seller importa ou copia do catálogo DropCore o <strong>mesmo SKU</strong> para o cadastro do produto no
                ERP (Tiny, Bling, planilha intermediária, etc.).
              </li>
              <li>
                No marketplace (ex.: Mercado Livre), o anúncio continua com o SKU interno da plataforma; no ERP, a ponte é
                o <strong>mapeamento anúncio → produto/SKU do ERP</strong>, onde o produto no ERP usa o SKU do DropCore.
              </li>
              <li>
                Quando o pedido fecha no marketplace, o ERP monta o payload para o DropCore com as linhas já usando esse
                SKU — o mesmo da tela <Link href="/seller/produtos" className="text-emerald-600 dark:text-emerald-400 font-medium hover:underline">Produtos</Link>.
              </li>
            </ol>
          </section>

          <section>
            <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100 mb-2">Checklist rápido</h2>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>Um registro de produto no ERP = um SKU DropCore (por variante).</li>
              <li>Evite renomear SKU depois de pedidos reais; prefira criar variante nova.</li>
              <li>Use o checklist “Pronto p/ vender” no catálogo antes de escalar anúncios.</li>
              <li>Se algo não bater, compare primeiro <strong>SKU na nota / ERP</strong> com <strong>SKU no catálogo</strong>.</li>
            </ul>
          </section>

          <section className="rounded-xl border border-blue-200/80 dark:border-blue-900/50 bg-blue-50/60 dark:bg-blue-950/20 px-4 py-3 text-xs text-neutral-700 dark:text-neutral-300">
            <strong className="text-neutral-900 dark:text-neutral-100">Estoque de volta ao ERP.</strong> Depois de cada{" "}
            <strong>POST /api/erp/pedidos</strong> aceito, o DropCore pode chamar um <strong>webhook HTTPS</strong> seu (em{" "}
            <Link href="/seller/integracoes-erp" className="font-medium text-emerald-600 dark:text-emerald-400 hover:underline">
              Integrações ERP
            </Link>
            ) com o evento <code className="text-[10px]">dropcore.estoque_atualizado</code> e o estoque já debitado — ideal para n8n ou middleware que atualiza Bling/Tiny.
          </section>

          <section className="rounded-xl border border-blue-200/80 dark:border-blue-900/50 bg-blue-50/60 dark:bg-blue-950/20 px-4 py-3 text-xs text-neutral-700 dark:text-neutral-300">
            <strong className="text-neutral-900 dark:text-neutral-100">Operação da org.</strong> Quem cadastra fornecedor
            e vincula seller precisa garantir que o seller está no armazém certo; o catálogo já filtra pelo fornecedor
            conectado ao seller.
          </section>
        </div>
      </div>
      <SellerNav active="integracoes" />
    </div>
  );
}
