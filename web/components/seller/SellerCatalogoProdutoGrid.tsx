"use client";

import { useEffect, useState } from "react";
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
 * grade (página de 1 fornecedor) quanto na linha com scroll lateral (vitrine combinada).
 * Foto é clicável e abre modal (mesmo padrão de `CatalogoV2FotoPreview`); o resto do card
 * (nome/preço) continua levando pro produto. Zoom leve na foto + elevação do card no hover. */
export function SellerCatalogoProdutoCard({ fornecedorId, grupo }: { fornecedorId: string; grupo: GrupoPreview }) {
  const rep = infoDoGrupo(grupo);
  const nomeGrupo = rep ? str(rep.nome_produto) || grupo.paiKey : grupo.paiKey;
  const foto = primeiraImagemGrupo(grupo);
  const fotoSrc = foto ? catalogoV2UrlImagem(foto) : null;
  const [previewAberto, setPreviewAberto] = useState(false);

  useEffect(() => {
    if (!previewAberto) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setPreviewAberto(false);
    }
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [previewAberto]);

  return (
    <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-3 shadow-sm transition-all hover:-translate-y-[1px] hover:border-emerald-300 hover:shadow-md dark:hover:border-emerald-700">
      <button
        type="button"
        onClick={() => fotoSrc && setPreviewAberto(true)}
        disabled={!fotoSrc}
        className="group block aspect-square w-full overflow-hidden rounded-xl border-0 bg-[var(--muted)]/10 p-0 disabled:cursor-default"
      >
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
      </button>
      <Link
        href={`/seller/catalogo/fornecedor/${encodeURIComponent(fornecedorId)}/produto/${encodeURIComponent(grupo.paiKey)}`}
        className="block text-left"
      >
        <p className="mt-2.5 line-clamp-2 min-h-[2.5rem] text-[13px] font-semibold leading-snug text-[var(--foreground)]">
          {nomeGrupo}
        </p>
        <p className="mt-1 text-sm font-bold tabular-nums text-[var(--foreground)]">{faixaPrecoGrupo(grupo)}</p>
        <p className="mt-0.5 text-[11px] text-[var(--muted)]">{variantesResumoGrupo(grupo)}</p>
      </Link>

      {previewAberto && fotoSrc && (
        <div
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center p-4 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label="Visualização da foto"
        >
          <button
            type="button"
            className="absolute inset-0 cursor-default border-0 bg-[color-mix(in_srgb,var(--foreground)_45%,transparent)] p-0"
            aria-label="Fechar"
            onClick={() => setPreviewAberto(false)}
          />
          <div className="relative z-[110] w-full max-w-lg rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-2 shadow-2xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={fotoSrc}
              alt={nomeGrupo}
              className="block h-auto max-h-[min(85dvh,28rem)] w-full rounded-lg object-contain"
            />
          </div>
        </div>
      )}
    </div>
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
