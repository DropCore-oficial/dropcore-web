"use client";

import Link from "next/link";
import type { SellerCatalogoItem } from "@/components/seller/SellerCatalogoGrupoUi";
import { agruparPaiFilhosSeller as agruparPaiFilhos, infoDoGrupo, strSellerCatalogo as str } from "@/components/seller/SellerCatalogoGrupoUi";
import { agruparVariantesPorCor } from "@/lib/armazemAgruparCor";
import { catalogoV2UrlImagem } from "@/components/seller/catalogo/v2/catalogoV2Imagem";

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export type GrupoPreview = { paiKey: string; pai: SellerCatalogoItem | null; filhos: SellerCatalogoItem[] };

export function itensDoGrupo(grupo: GrupoPreview): SellerCatalogoItem[] {
  return grupo.pai ? [grupo.pai, ...grupo.filhos] : grupo.filhos;
}

/** Foto representativa do card — 1ª foto encontrada entre as variantes (ordenado por SKU, mesmo
 * critério já usado em `SellerListaGrupoArmazem.tsx`). Não existe galeria estruturada nos dados
 * hoje, então isso é a melhor foto "de capa" disponível. */
function primeiraImagemGrupo(grupo: GrupoPreview): string | null {
  const comFoto = itensDoGrupo(grupo).filter((i) => str(i.imagem_url).trim().length > 0);
  if (comFoto.length === 0) return null;
  return [...comFoto].sort((a, b) => a.sku.localeCompare(b.sku))[0].imagem_url ?? null;
}

function faixaPrecoGrupo(grupo: GrupoPreview): string {
  const valores = itensDoGrupo(grupo)
    .map((i) => i.custo_total)
    .filter((v): v is number => v != null && Number.isFinite(v) && v > 0);
  if (valores.length === 0) return "—";
  const min = Math.min(...valores);
  const max = Math.max(...valores);
  return min === max ? BRL.format(min) : `${BRL.format(min)} a ${BRL.format(max)}`;
}

function variantesResumoGrupo(grupo: GrupoPreview): string {
  const itens = itensDoGrupo(grupo);
  const cores = agruparVariantesPorCor(itens).length;
  const tamanhos = new Set(itens.map((i) => str(i.tamanho).trim().toUpperCase()).filter(Boolean)).size;
  const partes: string[] = [];
  if (cores > 0) partes.push(`${cores} ${cores === 1 ? "cor" : "cores"}`);
  if (tamanhos > 0) partes.push(`${tamanhos} ${tamanhos === 1 ? "tamanho" : "tamanhos"}`);
  return partes.join(" · ") || `${itens.length} SKU(s)`;
}

/** Card de 1 produto (foto + nome + faixa de preço + variantes) — reaproveitado tanto na
 * grade (página de 1 fornecedor) quanto na linha com scroll lateral (vitrine combinada). */
export function SellerCatalogoProdutoCard({ fornecedorId, grupo }: { fornecedorId: string; grupo: GrupoPreview }) {
  const rep = infoDoGrupo(grupo);
  const nomeGrupo = rep ? str(rep.nome_produto) || grupo.paiKey : grupo.paiKey;
  const foto = primeiraImagemGrupo(grupo);
  const fotoSrc = foto ? catalogoV2UrlImagem(foto) : null;
  return (
    <Link
      href={`/seller/catalogo/fornecedor/${encodeURIComponent(fornecedorId)}/produto/${encodeURIComponent(grupo.paiKey)}`}
      className="group block rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-3 text-left shadow-sm transition-all hover:border-emerald-300 hover:shadow-md dark:hover:border-emerald-700"
    >
      <div className="aspect-square w-full overflow-hidden rounded-xl bg-[var(--muted)]/10">
        {fotoSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={fotoSrc}
            alt={nomeGrupo}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[11px] text-[var(--muted)]">Sem foto</div>
        )}
      </div>
      <p className="mt-2.5 line-clamp-2 min-h-[2.5rem] text-[13px] font-semibold leading-snug text-[var(--foreground)]">
        {nomeGrupo}
      </p>
      <p className="mt-1 text-sm font-bold tabular-nums text-[var(--foreground)]">{faixaPrecoGrupo(grupo)}</p>
      <p className="mt-0.5 text-[11px] text-[var(--muted)]">{variantesResumoGrupo(grupo)}</p>
    </Link>
  );
}

type Props = {
  fornecedorId: string;
  items: SellerCatalogoItem[];
  vazioMensagem?: string;
};

/** Grade de produtos (várias linhas, quebra normal) — usada na página com todos os produtos
 * de 1 fornecedor só (sem scroll lateral). */
export function SellerCatalogoProdutoGrid({ fornecedorId, items, vazioMensagem }: Props) {
  const grupos = agruparPaiFilhos(items);

  if (grupos.length === 0) {
    return (
      <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/60 p-12 text-center text-sm text-neutral-500">
        {vazioMensagem ?? "Sem SKUs ativos para este armazém."}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
      {grupos.map((grupo) => (
        <SellerCatalogoProdutoCard key={grupo.paiKey} fornecedorId={fornecedorId} grupo={grupo} />
      ))}
    </div>
  );
}
