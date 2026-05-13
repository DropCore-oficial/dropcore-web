"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ProdutoResumoListaGrupo } from "@/components/fornecedor/ProdutoResumoListaGrupo";
import { CorCelulaProduto } from "@/components/fornecedor/CorCelulaProduto";
import type { SellerCatalogoItem } from "@/components/seller/SellerCatalogoGrupoUi";
import {
  isGrupoOcultoSellerCatalogo as isGrupoOculto,
  isSementeSellerCatalogo as isSemente,
  strSellerCatalogo as str,
} from "@/components/seller/SellerCatalogoGrupoUi";
import { linhasGrupo, statusGeralGrupo, type GrupoCatalogoV2, type LinhaCatalogoV2 } from "./aggregates";
import { CatalogoV2CorGrupoApiToggle, CatalogoV2VariacaoApiToggle } from "./CatalogoV2VariacaoRow";
import { catalogoV2UrlImagem } from "./catalogoV2Imagem";
import { CatalogoV2FotoPreview } from "./CatalogoV2FotoPreview";
import { sellerGrupoToProdutoResumoListaGrupoProps } from "./mapSellerGrupoToProdutoResumoLista";
import { linkFotosComoSrcMiniatura } from "@/lib/fornecedorProdutoImagemSrc";
import { agruparVariantesPorCor } from "@/lib/armazemAgruparCor";
import { skuProntoParaVender } from "@/lib/sellerSkuReadiness";
import {
  AMBER_PREMIUM_SURFACE_TRANSPARENT,
  AMBER_PREMIUM_TEXT_PRIMARY,
} from "@/lib/amberPremium";
import { cn } from "@/lib/utils";

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function paiKeySku(sku: string): string {
  const s = (sku || "").trim().toUpperCase();
  const m = s.match(/^([A-Z]+)(\d{3})(\d{3})$/);
  if (!m) return s;
  return `${m[1]}${m[2]}000`;
}

function getLinkFotosSeller(row: SellerCatalogoItem, todos: SellerCatalogoItem[]): string | null {
  if (str(row.link_fotos).trim()) return str(row.link_fotos);
  const pk = paiKeySku(row.sku);
  if (row.sku === pk) return null;
  const pai = todos.find((p) => p.sku === pk);
  return pai?.link_fotos?.trim() ? str(pai.link_fotos) : null;
}

function fmtCusto(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v) || v <= 0) return "—";
  return BRL.format(v);
}

function primeiraImagemUrlEntreFilhos(filhos: SellerCatalogoItem[]): string | null {
  const comFoto = filhos.filter((f) => str(f.imagem_url).trim().length > 0);
  if (comFoto.length === 0) return null;
  comFoto.sort((a, b) => a.sku.localeCompare(b.sku));
  return comFoto[0].imagem_url ?? null;
}

function candidatosMiniaturaGrupo(g: GrupoCatalogoV2): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (u: string | null | undefined) => {
    const s = str(u).trim();
    if (!s || seen.has(s)) return;
    seen.add(s);
    out.push(s);
  };
  add(g.pai?.imagem_url);
  const filhos = [...g.filhos].sort((a, b) => a.sku.localeCompare(b.sku));
  for (const f of filhos) add(f.imagem_url);
  add(g.pai?.link_fotos);
  return out;
}

function MiniaturaListaGrupoSeller({ g }: { g: GrupoCatalogoV2 }) {
  const representante = g.pai ?? g.filhos[0];
  const lfLink = representante ? getLinkFotosSeller(representante, linhasGrupo(g.pai, g.filhos)) || str(representante.link_fotos) : null;
  const fotoSig = [
    g.pai?.imagem_url ?? "",
    g.pai?.link_fotos ?? "",
    ...g.filhos.map((f) => `${f.id}:${f.imagem_url ?? ""}`),
  ].join("|");
  const candidatos = useMemo(() => candidatosMiniaturaGrupo(g), [g.paiKey, fotoSig]);
  const [failIdx, setFailIdx] = useState(0);
  useEffect(() => {
    setFailIdx(0);
  }, [g.paiKey, fotoSig]);
  if (failIdx >= candidatos.length) {
    if (lfLink) {
      return (
        <a
          href={lfLink}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="flex h-full w-full items-center justify-center bg-[var(--muted)]/20 text-lg text-[var(--muted)] hover:bg-[var(--muted)]/30"
          title="Abrir link da foto"
        >
          📷
        </a>
      );
    }
    return <span className="text-lg text-[var(--muted)]">—</span>;
  }
  const raw = candidatos[failIdx];
  const src = catalogoV2UrlImagem(raw);
  if (!src) {
    return <span className="text-lg text-[var(--muted)]">—</span>;
  }
  return (
    <img
      src={src}
      alt=""
      className="h-full w-full object-contain object-top"
      onError={() => setFailIdx((i) => i + 1)}
    />
  );
}

function fallbackImagemSkuPai(row: SellerCatalogoItem, g: GrupoCatalogoV2): string | null {
  if (row.sku !== g.paiKey) return null;
  if (str(row.imagem_url).trim()) return null;
  return primeiraImagemUrlEntreFilhos(g.filhos);
}

const ORDEM_TAMANHO: Record<string, number> = {
  XXPP: 0,
  XPP: 1,
  PP: 2,
  P: 3,
  M: 4,
  G: 5,
  GG: 6,
  XG: 7,
  XGG: 8,
  EXG: 9,
  EXGG: 10,
  U: 11,
  UN: 11,
  UNICO: 11,
  "ÚNICO": 11,
};

function toLinhaCatalogo(it: SellerCatalogoItem) {
  const ativo = str(it.status).toLowerCase() === "ativo";
  const est = it.estoque_atual;
  const custo = it.custo_total;
  return {
    item: it,
    sku: it.sku,
    imagemUrl: it.imagem_url,
    cor: it.cor,
    tamanho: it.tamanho,
    estoque: typeof est === "number" && Number.isFinite(est) ? est : 0,
    custo: typeof custo === "number" && Number.isFinite(custo) ? custo : 0,
    ativo,
    prontoParaVender: skuProntoParaVender(it),
    habilitado: it.habilitado_venda === true,
  };
}

type Props = {
  grupo: GrupoCatalogoV2;
  exp: boolean;
  onToggleExpand: () => void;
  nomeArmazem: string | null;
  modoListaVariantes: "agrupado-cor" | "sku";
  setModoListaVariantes: (m: "agrupado-cor" | "sku") => void;
  mostrarFotosVariantes: boolean;
  setMostrarFotosVariantes: (v: boolean | ((p: boolean) => boolean)) => void;
  onOpenMedidas: () => void;
  bulkLoading: boolean;
  onBulkEnableValidas: () => void;
  onBulkDisableAll: () => void;
  toggleLoadingId: string | null;
  onToggleOne: (item: SellerCatalogoItem, ativar: boolean) => void;
  /** `${paiKey}:${corKey}` enquanto API da cor inteira está em curso */
  bulkCorLoadingKey: string | null;
  /** Liga/desliga todas as numerações da cor na API (uma ação em lote). */
  onToggleCorGrupo: (paiKey: string, corKey: string, items: SellerCatalogoItem[]) => void;
  /** Mensagem quando não dá para ligar na API (ex.: sem armazém gravado). */
  habilitarVendaApiBloqueioLigar: string | null;
};

export function SellerListaGrupoArmazem({
  grupo,
  exp,
  onToggleExpand,
  nomeArmazem,
  modoListaVariantes,
  setModoListaVariantes,
  mostrarFotosVariantes,
  setMostrarFotosVariantes,
  onOpenMedidas,
  bulkLoading,
  onBulkEnableValidas,
  onBulkDisableAll,
  toggleLoadingId,
  onToggleOne,
  bulkCorLoadingKey,
  onToggleCorGrupo,
  habilitarVendaApiBloqueioLigar,
}: Props) {
  const bulkRef = useRef<HTMLDetailsElement>(null);
  const fecharBulk = () => {
    if (bulkRef.current) bulkRef.current.open = false;
  };

  const representante = grupo.pai ?? grupo.filhos[0];
  const linhas = linhasGrupo(grupo.pai, grupo.filhos).filter((it) => !isSemente(it) && !isGrupoOculto(it.sku));
  const todosParaLink = linhasGrupo(grupo.pai, grupo.filhos);

  const nome =
    str(grupo.pai?.nome_produto).trim() ||
    str(grupo.filhos[0]?.nome_produto).trim() ||
    grupo.paiKey;

  const gruposCor = useMemo(() => agruparVariantesPorCor(linhas), [linhas]);

  const resumoCadastroProps = useMemo(() => {
    try {
      return sellerGrupoToProdutoResumoListaGrupoProps(grupo);
    } catch {
      return null;
    }
  }, [grupo]);

  const linhasToggle = useMemo(() => linhas.map(toLinhaCatalogo), [linhas]);

  const linhaPorId = useMemo(() => {
    const m = new Map<string, LinhaCatalogoV2>();
    for (const l of linhasToggle) m.set(l.item.id, l);
    return m;
  }, [linhasToggle]);

  const todosInativos = linhas.length > 0 && linhas.every((p) => str(p.status).toLowerCase() !== "ativo");
  const sg = statusGeralGrupo(grupo.pai, grupo.filhos);

  const badgeStatus = useMemo(() => {
    if (sg === "pendencias") {
      return (
        <span
          className={cn(
            AMBER_PREMIUM_SURFACE_TRANSPARENT,
            AMBER_PREMIUM_TEXT_PRIMARY,
            "inline-flex max-w-full rounded-full px-2 py-0.5 text-xs font-medium",
          )}
        >
          Com pendência
        </span>
      );
    }
    if (sg === "sem_estoque") {
      return (
        <span className="inline-flex rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium ring-1 ring-neutral-200 dark:bg-neutral-800 dark:ring-neutral-700 dark:text-neutral-300">
          Sem estoque
        </span>
      );
    }
    if (sg === "pausado") {
      return (
        <span className="inline-flex rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium ring-1 ring-neutral-200 dark:bg-neutral-800 dark:ring-neutral-700 dark:text-neutral-300">
          Pausado
        </span>
      );
    }
    return (
      <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-900 ring-1 ring-emerald-500/25 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-400/35">
        Pronto
      </span>
    );
  }, [sg]);

  const custoFaixaResumo = useMemo(() => {
    const custos = linhas.map((p) => p.custo_total).filter((c): c is number => c != null && Number.isFinite(c) && c > 0);
    if (custos.length === 0) return null;
    const min = Math.min(...custos);
    const max = Math.max(...custos);
    return min === max ? fmtCusto(min) : `${fmtCusto(min)} a ${fmtCusto(max)}`;
  }, [linhas]);

  const resumoApi = useMemo(() => {
    const n = linhas.length;
    const h = linhas.filter((p) => p.habilitado_venda === true).length;
    return { n, h };
  }, [linhas]);

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--card-border)] bg-[var(--card)] shadow-sm transition-colors hover:border-emerald-500/25 dark:shadow-none">
      <div
        className="cursor-pointer px-3 py-3 transition-colors hover:bg-[var(--muted)]/[0.06] sm:px-4 sm:py-3.5"
        onClick={onToggleExpand}
      >
        <div className="flex w-full min-w-0 items-start gap-3 sm:gap-3.5">
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              className="shrink-0 rounded-md p-1 text-[var(--muted)] hover:bg-[var(--muted)]/15 hover:text-[var(--foreground)]"
              aria-label={exp ? "Recolher" : "Expandir"}
              onClick={(e) => {
                e.stopPropagation();
                onToggleExpand();
              }}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className={cn("transition-transform duration-150", exp ? "rotate-90" : "")}
              >
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
            <div className="flex h-[3.625rem] w-[3.625rem] shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[var(--card-border)] bg-[var(--muted)]/10 p-0.5 sm:h-14 sm:w-14">
              <MiniaturaListaGrupoSeller g={grupo} />
            </div>
          </div>
          <div className="min-w-0 flex-1 overflow-hidden">
            <div className="min-w-0 space-y-1.5">
              <p className="text-[15px] font-semibold leading-snug text-[var(--foreground)] [overflow-wrap:anywhere] sm:text-base">
                {representante?.nome_produto ?? nome}
              </p>
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                {todosInativos ? (
                  <span
                    className={cn(
                      AMBER_PREMIUM_SURFACE_TRANSPARENT,
                      AMBER_PREMIUM_TEXT_PRIMARY,
                      "inline-flex shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold shadow-none",
                    )}
                  >
                    Inativo
                  </span>
                ) : null}
                {badgeStatus}
              </div>
            </div>
            <div className="mt-2 space-y-1 border-t border-[var(--card-border)]/60 pt-2 text-[12px] leading-snug text-[var(--muted)] sm:text-[13px]">
              <p className="[overflow-wrap:anywhere]">
                <span className="break-all font-mono text-[11px] text-[var(--foreground)] sm:text-xs">{grupo.paiKey}</span>
                {linhas.length > 0 ? (
                  <>
                    <span aria-hidden> · </span>
                    {linhas.length} var.
                    <span aria-hidden> · </span>
                    <span className="tabular-nums font-medium text-emerald-700 dark:text-emerald-400">{resumoApi.h}</span>
                    <span className="text-[var(--muted)]">/</span>
                    <span className="tabular-nums font-medium text-[var(--foreground)]">{resumoApi.n}</span>
                    <span> na API</span>
                  </>
                ) : null}
              </p>
              {custoFaixaResumo ? (
                <p>
                  Custo{" "}
                  <span className="font-semibold tabular-nums text-[var(--foreground)]">{custoFaixaResumo}</span>
                  <span> / un.</span>
                </p>
              ) : null}
              {nomeArmazem ? (
                <p className="flex gap-1.5 text-[11px] leading-snug sm:text-[12px]">
                  <svg
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    aria-hidden
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 9h18v10a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 9V7a2 2 0 012-2h14a2 2 0 012 2v2" />
                  </svg>
                  <span className="line-clamp-2 min-w-0 text-[var(--foreground)]">{nomeArmazem}</span>
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {exp && linhas.length > 0 && (
        <>
          <div className="border-t border-[var(--card-border)] bg-[var(--card)] px-3 py-2 sm:px-4 sm:py-2">
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-nowrap sm:items-center sm:justify-between sm:gap-2.5">
              <div className="inline-flex h-8 w-full min-w-0 rounded-lg border border-[var(--card-border)] bg-[var(--surface-subtle)] p-px shadow-none ring-1 ring-[var(--foreground)]/[0.04] sm:h-7 sm:w-auto sm:flex-none sm:rounded-md">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setModoListaVariantes("agrupado-cor");
                  }}
                  className={cn(
                    "flex h-full min-h-0 min-w-0 flex-1 items-center justify-center rounded-[6px] px-2.5 text-center text-[11px] font-medium leading-none transition sm:flex-initial sm:rounded-[5px] sm:px-3 sm:text-xs sm:font-normal",
                    modoListaVariantes === "agrupado-cor"
                      ? "bg-emerald-600 text-white hover:bg-emerald-700 sm:font-medium"
                      : "text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]",
                  )}
                  title="Agrupado por cor"
                >
                  <span className="sm:hidden">Por cor</span>
                  <span className="hidden sm:inline">Agrupado por cor</span>
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setModoListaVariantes("sku");
                  }}
                  className={cn(
                    "flex h-full min-h-0 min-w-0 flex-1 items-center justify-center rounded-[6px] px-2.5 text-center text-[11px] font-medium leading-none transition sm:flex-initial sm:rounded-[5px] sm:px-3 sm:text-xs sm:font-normal",
                    modoListaVariantes === "sku"
                      ? "bg-emerald-600 text-white hover:bg-emerald-700 sm:font-medium"
                      : "text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]",
                  )}
                  title="Detalhado por SKU"
                >
                  <span className="sm:hidden">Por SKU</span>
                  <span className="hidden sm:inline">Detalhado por SKU</span>
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMostrarFotosVariantes((v) => !v);
                  }}
                  className="inline-flex h-8 w-full shrink-0 items-center justify-center rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-3 text-[11px] font-medium text-[var(--foreground)] shadow-none transition hover:bg-[var(--muted)]/10 sm:h-7 sm:w-auto sm:rounded-md sm:px-2.5 sm:text-xs sm:font-normal"
                  title={mostrarFotosVariantes ? "Ocultar fotos das variantes" : "Mostrar fotos das variantes"}
                >
                  <span className="sm:hidden">{mostrarFotosVariantes ? "Ocultar" : "Fotos"}</span>
                  <span className="hidden sm:inline">{mostrarFotosVariantes ? "Ocultar fotos" : "Mostrar fotos"}</span>
                </button>
                <span className="hidden text-[var(--muted)] sm:inline" aria-hidden>
                  ·
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenMedidas();
                  }}
                  className="text-[12px] font-medium text-emerald-600 underline-offset-4 hover:text-emerald-700 hover:underline dark:text-emerald-400 dark:hover:text-emerald-300"
                >
                  Tabela de medidas
                </button>
                <span className="text-[var(--muted)]" aria-hidden>
                  ·
                </span>
                <details ref={bulkRef} className="relative" onClick={(e) => e.stopPropagation()}>
                  <summary className="cursor-pointer list-none text-[12px] font-medium text-[var(--muted)] [&::-webkit-details-marker]:hidden">
                    Ações em lote
                  </summary>
                  <div className="absolute left-0 top-full z-40 mt-2 min-w-[11rem] overflow-hidden rounded-xl border border-[var(--card-border)] bg-[var(--card)] py-1 shadow-lg">
                    <button
                      type="button"
                      disabled={bulkLoading}
                      onClick={() => {
                        onBulkEnableValidas();
                        fecharBulk();
                      }}
                      className="flex w-full px-3 py-2.5 text-left text-[13px] text-[var(--foreground)] hover:bg-[var(--muted)]/12 disabled:opacity-50"
                    >
                      Habilitar válidas
                    </button>
                    <button
                      type="button"
                      disabled={bulkLoading}
                      onClick={() => {
                        onBulkDisableAll();
                        fecharBulk();
                      }}
                      className="flex w-full px-3 py-2.5 text-left text-[13px] text-[var(--foreground)] hover:bg-[var(--muted)]/12 disabled:opacity-50"
                    >
                      Desabilitar todas
                    </button>
                  </div>
                </details>
              </div>
            </div>
          </div>

          {!mostrarFotosVariantes ? (
            <div className="border-t border-[var(--card-border)] bg-[var(--card)] px-3 py-4 text-sm text-[var(--muted)] sm:px-4">
              Variantes ocultas nesta visualização.
            </div>
          ) : null}

          {mostrarFotosVariantes && modoListaVariantes === "agrupado-cor" && (
            <div className="min-w-0 border-t border-[var(--card-border)] bg-[var(--card)] p-4">
              {/* Mesmo grid que /fornecedor/produtos: 1 col · md+ 2 colunas */}
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-3">
                {gruposCor.map((gc) => {
                  const rowCor = gc.itens[0];
                  if (!rowCor) return null;
                  const lfCor = getLinkFotosSeller(rowCor, todosParaLink) || str(rowCor.link_fotos);
                  const fallbackCor =
                    gc.itens.map((p) => str(p.imagem_url).trim()).find((u) => u.length > 0) ?? null;
                  const custos = gc.itens.map((p) => p.custo_total).filter((c): c is number => c != null && Number.isFinite(c) && c > 0);
                  const custoTxt =
                    custos.length === 0
                      ? "—"
                      : Math.min(...custos) === Math.max(...custos)
                        ? fmtCusto(custos[0])
                        : `${fmtCusto(Math.min(...custos))} a ${fmtCusto(Math.max(...custos))}`;
                  const itensOrdenados = [...gc.itens].sort((a, b) => {
                    const ta = str(a.tamanho).toUpperCase();
                    const tb = str(b.tamanho).toUpperCase();
                    const oa = ORDEM_TAMANHO[ta] ?? 999;
                    const ob = ORDEM_TAMANHO[tb] ?? 999;
                    if (oa !== ob) return oa - ob;
                    return ta.localeCompare(tb, "pt-BR", { numeric: true });
                  });
                  const estoqueTotal = itensOrdenados.reduce((acc, p) => acc + (p.estoque_atual ?? 0), 0);
                  return (
                    <div
                      key={`m-${gc.key}`}
                      className="min-w-0 rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4 shadow-sm transition-colors hover:border-emerald-500/35"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="min-w-0 space-y-2.5">
                        <div className="flex min-w-0 flex-nowrap items-center justify-between gap-2">
                          <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
                            <p className="min-w-0 truncate text-sm font-bold tracking-tight text-[var(--foreground)]">{gc.corLabel}</p>
                            <span className="inline-flex shrink-0 rounded-full bg-[var(--muted)]/12 px-2 py-0.5 text-xs font-medium text-[var(--foreground)]">
                              {gc.itens.length} SKU(s)
                            </span>
                            <div onClick={(e) => e.stopPropagation()} className="flex shrink-0 items-center">
                              <CatalogoV2CorGrupoApiToggle
                                linhas={
                                  itensOrdenados
                                    .map((p) => linhaPorId.get(p.id))
                                    .filter((x): x is LinhaCatalogoV2 => x != null)
                                }
                                busy={bulkCorLoadingKey === `${grupo.paiKey}:${gc.key}`}
                                onToggleGrupo={() => onToggleCorGrupo(grupo.paiKey, gc.key, gc.itens)}
                                bloqueioLigarMotivo={habilitarVendaApiBloqueioLigar}
                              />
                            </div>
                          </div>
                          {lfCor ? (
                            <a
                              href={lfCor}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex h-9 shrink-0 items-center justify-center rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-2.5 text-xs font-medium text-emerald-700 shadow-sm transition hover:bg-[var(--muted)]/10 dark:border-[var(--card-border)] dark:bg-[var(--card)] dark:text-emerald-400"
                              onClick={(e) => e.stopPropagation()}
                            >
                              Ver fotos
                            </a>
                          ) : null}
                        </div>
                        <div className="flex min-w-0 flex-row items-center justify-between gap-2 rounded-lg bg-[var(--muted)]/8 px-3 py-2 text-xs leading-snug sm:text-sm">
                          <span className="min-w-0 pr-1 text-[var(--foreground)]">
                            <span className="font-normal">Preço </span>
                            <span className="font-semibold tabular-nums">{custoTxt}</span>
                          </span>
                          <span className="h-3.5 w-px shrink-0 bg-[var(--card-border)] opacity-90 sm:h-4" aria-hidden />
                          <span className="shrink-0 whitespace-nowrap pl-1 text-right text-[var(--muted)]">
                            Total em estoque:{" "}
                            <span className="font-semibold tabular-nums text-[var(--foreground)]">{estoqueTotal}</span>
                          </span>
                        </div>
                      </div>

                      {/* Mobile: foto em cima + tabela · md+: igual fornecedor — foto | tabela */}
                      <div className="mt-4 flex min-w-0 flex-col gap-4 md:grid md:grid-cols-[10rem_minmax(0,1fr)] md:items-stretch md:gap-x-4">
                        <div className="flex w-full min-w-0 max-w-full shrink-0 flex-col md:h-full md:min-h-0 md:max-w-[10rem]">
                          <div className="relative w-full overflow-hidden rounded-xl bg-[var(--muted)]/8 md:h-40 md:w-40 md:max-w-none md:shrink-0">
                            <CatalogoV2FotoPreview
                              variant="grade"
                              imagemUrl={rowCor.imagem_url}
                              fallbackUrl={fallbackCor}
                              linkFotosUrl={lfCor}
                            />
                          </div>
                        </div>
                        <div className="min-w-0 w-full max-w-full overflow-x-visible rounded-xl bg-[var(--card)] max-md:overflow-hidden max-md:border-0 max-md:shadow-none md:border md:border-[var(--card-border)] md:shadow-sm md:overflow-x-auto md:[-webkit-overflow-scrolling:touch] md:overscroll-x-contain">
                          <div className="grid w-full min-w-0 grid-cols-[4.5rem_minmax(0,1fr)_3rem] rounded-t-xl border-b border-[var(--card-border)] bg-[var(--surface-subtle)] px-2.5 py-2 text-[11px] font-bold text-[var(--muted)] md:rounded-t-none">
                            <span>Numeração</span>
                            <span className="min-w-0">SKU</span>
                            <span className="text-right">Qtd.</span>
                          </div>
                          {itensOrdenados.map((p) => (
                            <div
                              key={p.id}
                              className="grid w-full min-w-0 grid-cols-[4.5rem_minmax(0,1fr)_3rem] items-center border-b border-[var(--card-border)]/50 px-2.5 py-2 text-xs last:border-b-0 max-md:last:rounded-b-xl"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <span className="font-bold text-[var(--foreground)]">{(p.tamanho ?? "—").toUpperCase()}</span>
                              <span className="min-w-0 whitespace-nowrap font-mono text-[11px] font-normal leading-snug text-[var(--muted)]">
                                {p.sku}
                              </span>
                              <span
                                className={`text-right text-xs font-bold tabular-nums ${(p.estoque_atual ?? 0) <= 0 ? "text-[var(--danger)]" : "text-[var(--foreground)]"}`}
                              >
                                {p.estoque_atual != null ? p.estoque_atual : "—"}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {mostrarFotosVariantes && modoListaVariantes === "sku" && (
            <>
              <div className="min-w-0 border-t border-[var(--card-border)] bg-[var(--card)] p-3 lg:hidden">
                {linhas.map((row) => {
                  const lf = getLinkFotosSeller(row, todosParaLink) || str(row.link_fotos);
                  const ltMob = linhaPorId.get(row.id);
                  return (
                    <div
                      key={row.id}
                      className="mb-3 min-w-0 rounded-2xl border border-[var(--card-border)] bg-[var(--card)] px-3 py-2.5 last:mb-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="mb-2 flex min-w-0 items-start justify-between gap-2">
                        <p className="min-w-0 flex-1 text-sm font-semibold leading-snug text-[var(--foreground)]">
                          <CorCelulaProduto cor={row.cor} />
                          <span className="mx-1 text-[var(--muted)]">·</span>
                          <span className="font-normal text-[var(--muted)]">{row.tamanho || "—"}</span>
                        </p>
                        {ltMob ? (
                          <CatalogoV2VariacaoApiToggle
                            linha={ltMob}
                            onToggleOne={onToggleOne}
                            busy={toggleLoadingId === row.id}
                          />
                        ) : null}
                      </div>
                      <div className="flex min-w-0 items-start gap-2.5">
                        <CatalogoV2FotoPreview
                          variant="thumb"
                          imagemUrl={row.imagem_url}
                          fallbackUrl={fallbackImagemSkuPai(row, grupo)}
                          linkFotosUrl={lf}
                        />
                        <div className="min-w-0 flex-1 pt-0.5">
                          <p className="break-all font-mono text-xs leading-tight text-[var(--muted)]">{row.sku}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-[var(--muted)]">
                            <span>
                              Custo{" "}
                              <span className="tabular-nums font-medium text-[var(--foreground)]">{fmtCusto(row.custo_total)}</span>
                            </span>
                            <span>
                              Estoque{" "}
                              <span
                                className={`tabular-nums font-medium ${(row.estoque_atual ?? 0) <= 0 ? "text-[var(--danger)]" : "text-[var(--foreground)]"}`}
                              >
                                {row.estoque_atual != null ? row.estoque_atual : "—"}
                              </span>
                            </span>
                            {lf ? (
                              <a
                                href={lf}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="break-all font-medium text-emerald-600 underline underline-offset-2 dark:text-emerald-400"
                              >
                                Link fotos
                              </a>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="hidden min-w-0 overflow-x-auto border-t border-[var(--card-border)]/60 lg:block">
                <table className="w-full min-w-[752px] table-fixed text-sm">
                  <thead>
                    <tr className="bg-[var(--muted)]/10 text-left text-xs text-[var(--muted)]">
                      <th className="w-[3.25rem] px-1 py-2 text-center font-medium lg:px-2">
                        <span className="block leading-tight">Na</span>
                        <span className="block text-[10px] font-normal text-[var(--muted)]">API</span>
                      </th>
                      <th className="w-[4.25rem] px-2 py-2 font-medium lg:px-3">
                        <span className="block">Foto</span>
                        <span className="block text-[10px] font-normal text-[var(--muted)]">SKU</span>
                      </th>
                      <th className="w-[18%] px-2 py-2 font-medium lg:px-3">Cor</th>
                      <th className="w-[7%] px-2 py-2 font-medium lg:px-3">Tam.</th>
                      <th className="w-[20%] px-2 py-2 font-medium lg:px-3">SKU</th>
                      <th className="w-[10%] px-2 py-2 text-right font-medium lg:px-3">Custo</th>
                      <th className="w-[6%] px-2 py-2 text-right font-medium lg:px-3">Est.</th>
                      <th className="w-[9%] px-2 py-2 font-medium lg:px-3">
                        <span className="block">Fotos</span>
                        <span className="block text-[10px] font-normal text-[var(--muted)]">Álbum</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--card-border)]/60">
                    {linhas.map((row) => {
                      const lf = getLinkFotosSeller(row, todosParaLink) || str(row.link_fotos);
                      const ltDesk = linhaPorId.get(row.id);
                      return (
                        <tr key={row.id} className="hover:bg-[var(--muted)]/8">
                          <td className="px-1 py-1.5 align-middle text-center lg:px-2" onClick={(e) => e.stopPropagation()}>
                            {ltDesk ? (
                              <div className="flex justify-center py-0.5">
                                <CatalogoV2VariacaoApiToggle
                                  linha={ltDesk}
                                  onToggleOne={onToggleOne}
                                  busy={toggleLoadingId === row.id}
                                />
                              </div>
                            ) : (
                              <span className="text-[var(--muted)]">—</span>
                            )}
                          </td>
                          <td className="px-2 py-1.5 align-top lg:px-3">
                            <div className="flex flex-col gap-1">
                              <CatalogoV2FotoPreview
                                variant="thumb"
                                imagemUrl={row.imagem_url}
                                fallbackUrl={fallbackImagemSkuPai(row, grupo)}
                                linkFotosUrl={lf}
                              />
                              <span className="font-mono text-[10px] leading-tight text-[var(--muted)] break-all">{row.sku}</span>
                            </div>
                          </td>
                          <td className="px-2 py-1.5 align-top break-words text-xs text-[var(--foreground)] lg:px-3">
                            <CorCelulaProduto cor={row.cor} />
                          </td>
                          <td className="px-2 py-1.5 align-top text-xs text-[var(--foreground)] lg:px-3">{row.tamanho || "—"}</td>
                          <td className="px-2 py-1.5 align-top font-mono text-[11px] leading-snug text-[var(--muted)] break-all lg:px-3">{row.sku}</td>
                          <td className="px-2 py-1.5 align-top text-right text-xs tabular-nums font-medium text-[var(--foreground)] lg:px-3">
                            {fmtCusto(row.custo_total)}
                          </td>
                          <td className="px-2 py-1.5 align-top text-right text-xs tabular-nums text-[var(--foreground)] lg:px-3">
                            {row.estoque_atual != null ? row.estoque_atual : "—"}
                          </td>
                          <td className="min-w-0 px-2 py-1.5 align-top lg:px-3">
                            {lf ? (
                              <a
                                href={lf}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block text-emerald-600 dark:text-emerald-400 text-xs break-all line-clamp-2 hover:text-emerald-700 dark:hover:text-emerald-300"
                              >
                                Ver
                              </a>
                            ) : (
                              <span className="text-[var(--muted)] text-xs">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {representante && resumoCadastroProps ? (
            <ProdutoResumoListaGrupo {...resumoCadastroProps} somenteLeitura />
          ) : null}
        </>
      )}
    </div>
  );
}
