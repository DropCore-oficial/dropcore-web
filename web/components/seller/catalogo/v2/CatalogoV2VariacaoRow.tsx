"use client";

import type { LinhaCatalogoV2 } from "./aggregates";

/** Pílula estática — todo SKU ativo do fornecedor já vende na API, sem precisar de um
 * toggle manual por cor/variação (removido 2026-11-08, ver docs/SCHEMA.md). */
function AtivoNaApiPill({ ativo }: { ativo: boolean }) {
  if (!ativo) {
    return <span className="text-[10px] font-medium text-[var(--muted)]">—</span>;
  }
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-md bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-300">
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden />
      Ativo
    </span>
  );
}

/** Um indicador por cor no agrupamento — todas as numerações ativas da cor já vendem na API. */
export function CatalogoV2CorGrupoApiToggle({ linhas }: { linhas: LinhaCatalogoV2[] }) {
  const algumAtivo = linhas.some((l) => l.ativo);
  return (
    <span className="inline-flex shrink-0 max-w-full items-center gap-1.5 sm:gap-2">
      <span className="hidden select-none text-[10px] font-medium leading-tight text-[var(--muted)] sm:inline sm:text-[11px]">
        Venda na API
      </span>
      <AtivoNaApiPill ativo={algumAtivo} />
    </span>
  );
}

export function CatalogoV2VariacaoApiToggle({ linha }: { linha: LinhaCatalogoV2 }) {
  return <AtivoNaApiPill ativo={linha.ativo} />;
}
