"use client";

import { AmberPremiumCallout } from "@/components/ui/AmberPremiumCallout";

type Props = {
  className?: string;
  compact?: boolean;
};

/** Aviso: estoque na grade Olist (linha pai) vs variações — evita seller achar bug no DropCore. */
export function SellerOlistEstoqueGradeCallout({ className, compact = false }: Props) {
  return (
    <AmberPremiumCallout
      title="Estoque na lista da Olist (produtos com variações)"
      className={className}
    >
      {compact ? (
        <p className="text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
          O DropCore exporta estoque <strong className="text-[var(--foreground)]">por SKU</strong> e inclui a{" "}
          <strong className="text-[var(--foreground)]">soma no pai</strong> na planilha. Na Olist, produtos com{" "}
          <strong className="text-[var(--foreground)]">muitas variações</strong> às vezes deixam a coluna de estoque{" "}
          <strong className="text-[var(--foreground)]">vazia na linha do produto pai</strong>, mesmo com cada variação certa
          dentro do cadastro. Isso <strong className="text-[var(--foreground)]">não impede venda</strong> — marketplace e pedidos
          usam o estoque de <strong className="text-[var(--foreground)]">cada SKU filho</strong>.
        </p>
      ) : (
        <>
          <p className="text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
            O DropCore envia estoque correto <strong className="text-[var(--foreground)]">em cada variação</strong> (SKU filho) e
            coloca a <strong className="text-[var(--foreground)]">soma na linha pai</strong> do CSV. A integração (API, webhook e
            planilha) está alinhada com o catálogo daqui.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
            Na <strong className="text-[var(--foreground)]">listagem de produtos da Olist</strong>, grades grandes (ex.: dezenas de
            cores/tamanhos) podem mostrar estoque <strong className="text-[var(--foreground)]">vazio no pai</strong>, enquanto produtos
            com poucas variações aparecem somados — comportamento da Olist, não falha de sync do DropCore.
          </p>
          <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">
            Como conferir: abra o produto na Olist → aba <strong className="text-[var(--foreground)]">variações</strong> → estoque por
            SKU (ex. 50). Compare com o catálogo DropCore. Na importação, marque{" "}
            <strong className="text-[var(--foreground)]">Atualizar preço de custo e estoque</strong> e reconheça por{" "}
            <strong className="text-[var(--foreground)]">apenas código (SKU)</strong>.
          </p>
        </>
      )}
    </AmberPremiumCallout>
  );
}
