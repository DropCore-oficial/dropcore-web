"use client";

import Link from "next/link";
import { SellerNav } from "../../SellerNav";
import { SellerPageHeader } from "@/components/seller/SellerPageHeader";

export default function SellerMapeamentoSkuPage() {
  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] app-bg pt-[calc(3.5rem+env(safe-area-inset-top,0px))] md:pt-14 pb-[calc(6.25rem+env(safe-area-inset-bottom,0px))] md:pb-8">
      <SellerNav active="integracoes" />
      <div className="dropcore-shell-4xl space-y-5 py-5 md:space-y-6 md:py-7">
        <SellerPageHeader
          surface="hero"
          title="SKUs e ERP (Olist/Tiny)"
          subtitle="Como manter o mesmo código de produto no DropCore e na Olist/Tiny, para pedidos e estoque baterem."
        />

        <div>
          <Link
            href="/seller/integracoes-erp"
            className="inline-flex text-sm font-semibold text-emerald-600 hover:underline dark:text-emerald-400"
          >
            Voltar para Integração ERP
          </Link>
        </div>

        <div className="space-y-5 rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-5 text-sm leading-relaxed text-[var(--muted)] shadow-sm transition-shadow hover:shadow-md sm:p-6">
          <section>
            <h2 className="mb-2 text-base font-semibold text-[var(--foreground)]">Regra de ouro</h2>
            <p>
              O <strong className="text-[var(--foreground)]">SKU que aparece no catálogo do seller</strong> no DropCore é o mesmo código que deve existir no{" "}
              <strong className="text-[var(--foreground)]">cadastro do produto na Olist/Tiny</strong> (por variante: cor, tamanho, etc.). Se a Olist/Tiny usar outro código
              interno só seu, o DropCore não associa ao item certo.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-[var(--foreground)]">Fluxo recomendado</h2>
            <ol className="list-decimal space-y-2 pl-5">
              <li>
                No DropCore, o fornecedor cadastra as variantes com um <strong className="text-[var(--foreground)]">SKU estável</strong> (fábrica + cor/tamanho, por exemplo).
              </li>
              <li>
                Na Olist/Tiny, cada produto/variação que você vende pelo DropCore deve usar <strong className="text-[var(--foreground)]">esse mesmo SKU</strong> como código do item.
              </li>
              <li>
                No marketplace (ex.: Mercado Livre), o anúncio pode ter código próprio da plataforma; na Olist/Tiny, a ponte é o{" "}
                <strong className="text-[var(--foreground)]">cadastro do item ligado ao SKU do DropCore</strong>.
              </li>
              <li>
                Confira sempre na tela{" "}
                <Link href="/seller/produtos" className="font-medium text-emerald-600 hover:underline dark:text-emerald-400">
                  Produtos
                </Link>{" "}
                antes de escalar anúncios.
              </li>
            </ol>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-[var(--foreground)]">Checklist rápido</h2>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>Uma variante na Olist/Tiny = um SKU DropCore.</li>
              <li>Evite trocar SKU depois de pedidos reais; prefira criar variante nova.</li>
              <li>Se algo não bater, compare <strong className="text-[var(--foreground)]">SKU na Olist/Tiny</strong> com <strong className="text-[var(--foreground)]">SKU no catálogo</strong>.</li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
