"use client";

import type { SellerCatalogoItem } from "@/components/seller/SellerCatalogoGrupoUi";
import { agruparPaiFilhosSeller as agruparPaiFilhos } from "@/components/seller/SellerCatalogoGrupoUi";
import { SellerCatalogoProdutoCard } from "@/components/seller/SellerCatalogoProdutoGrid";

type Props = {
  fornecedorId: string;
  items: SellerCatalogoItem[];
  vazioMensagem?: string;
};

/** Prévia em 1 linha só, com scroll lateral — usada na vitrine combinada (todos os
 * fornecedores). Pra ver todos os produtos numa grade normal (sem scroll), o link
 * "Todos os produtos" leva pra página de 1 fornecedor só (`SellerCatalogoProdutoGrid`). */
export function SellerCatalogoProdutoLinha({ fornecedorId, items, vazioMensagem }: Props) {
  const grupos = agruparPaiFilhos(items);

  if (grupos.length === 0) {
    return (
      <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-8 text-center text-sm text-[var(--muted)]">
        {vazioMensagem ?? "Sem SKUs ativos para este armazém."}
      </div>
    );
  }

  return (
    <div className="dropcore-scroll-x">
      {/* Larguras em % do container: mobile mostra 1 card cheio + uma tira do 2º;
       * desktop (lg+) mostra 3 cheios + tira do 4º — só rolando o scroll pra ver o resto. */}
      <div className="flex gap-3 pb-1">
        {grupos.map((grupo) => (
          <div key={grupo.paiKey} className="w-[85%] shrink-0 sm:w-[45%] lg:w-[31%]">
            <SellerCatalogoProdutoCard fornecedorId={fornecedorId} grupo={grupo} />
          </div>
        ))}
      </div>
    </div>
  );
}
