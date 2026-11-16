"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { ProdutoResumoListaGrupo } from "@/components/fornecedor/ProdutoResumoListaGrupo";
import { ImagemMiniatura } from "@/components/ImagemMiniatura";
import { CorCelulaProduto } from "@/components/fornecedor/CorCelulaProduto";
import type { SellerCatalogoItem } from "@/components/seller/SellerCatalogoGrupoUi";
import {
  isGrupoOcultoSellerCatalogo as isGrupoOculto,
  isSementeSellerCatalogo as isSemente,
  strSellerCatalogo as str,
} from "@/components/seller/SellerCatalogoGrupoUi";
import {
  linhasGrupo,
  mapLinhasCatalogoV2,
  statusGeralGrupo,
  type GrupoCatalogoV2,
  type LinhaCatalogoV2,
} from "./aggregates";
import { CatalogoV2CorGrupoApiToggle, CatalogoV2VariacaoApiToggle } from "./CatalogoV2VariacaoRow";
import { catalogoV2UrlImagem } from "./catalogoV2Imagem";
import { CatalogoV2FotoPreview } from "./CatalogoV2FotoPreview";
import { sellerGrupoToProdutoResumoListaGrupoProps } from "./mapSellerGrupoToProdutoResumoLista";
import { linkFotosComoSrcMiniatura } from "@/lib/fornecedorProdutoImagemSrc";
import { agruparVariantesPorCor } from "@/lib/armazemAgruparCor";
import { AMBER_PREMIUM_SHELL, AMBER_PREMIUM_TEXT_PRIMARY } from "@/lib/amberPremium";
import { DANGER_PREMIUM_TEXT_PRIMARY, SUCCESS_PREMIUM_TEXT_PRIMARY } from "@/lib/semanticPremium";
import { ModalOverlay } from "@/components/ui/ModalOverlay";
import { MODAL_PANEL_BODY_CLASS } from "@/lib/modalOverlay";
import { cn } from "@/lib/utils";

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

const BULK_MENU_WIDTH_PX = 216;

function ModalMercadoLivreResultado({
  nome,
  publicando,
  resultado,
  onFechar,
}: {
  nome: string;
  publicando: boolean;
  resultado: {
    ok: boolean;
    erro?: string;
    publicadas: { sku: string; ml_permalink: string }[];
    ignoradas: { sku: string; motivo: string }[];
  } | null;
  onFechar: () => void;
}) {
  return (
    <ModalOverlay onBackdropClick={onFechar}>
      <div className="flex items-center justify-between gap-3 border-b border-[var(--card-border)] px-5 py-4">
        <h2 className="min-w-0 truncate text-sm font-semibold text-[var(--foreground)]">Publicar no Mercado Livre</h2>
        <button
          type="button"
          onClick={onFechar}
          aria-label="Fechar"
          className="shrink-0 rounded-md p-1 text-[var(--muted)] hover:bg-[var(--muted)]/10 hover:text-[var(--foreground)]"
        >
          ✕
        </button>
      </div>
      <div className={cn(MODAL_PANEL_BODY_CLASS, "px-5 py-4 text-sm")}>
        <p className="mb-3 truncate text-[var(--muted)]">{nome}</p>

        {publicando ? (
          <div className="flex items-center gap-2.5 py-3 text-[var(--foreground)]">
            <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-[var(--muted)]/30 border-t-emerald-600" aria-hidden />
            Publicando no Mercado Livre — pode levar alguns segundos (1 anúncio por variante)…
          </div>
        ) : resultado ? (
          <div className="space-y-4">
            {resultado.erro && <p className={cn(DANGER_PREMIUM_TEXT_PRIMARY, "text-sm")}>{resultado.erro}</p>}
            {resultado.publicadas.length > 0 && (
              <div>
                <p className={cn(SUCCESS_PREMIUM_TEXT_PRIMARY, "mb-1.5 text-[13px] font-semibold")}>
                  {resultado.publicadas.length} variante(s) publicada(s)
                </p>
                <ul className="space-y-1 text-[12px]">
                  {resultado.publicadas.map((p) => (
                    <li key={p.sku} className="flex items-center justify-between gap-2">
                      <span className="truncate font-mono text-[var(--muted)]">{p.sku}</span>
                      <a
                        href={p.ml_permalink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 font-medium text-emerald-700 underline underline-offset-2 dark:text-emerald-400"
                      >
                        Ver anúncio
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {resultado.ignoradas.length > 0 && (
              <div>
                <p className={cn(DANGER_PREMIUM_TEXT_PRIMARY, "mb-1.5 text-[13px] font-semibold")}>
                  {resultado.ignoradas.length} variante(s) ignorada(s)
                </p>
                <ul className="space-y-1.5 text-[12px] text-[var(--muted)]">
                  {resultado.ignoradas.map((i) => (
                    <li key={i.sku}>
                      <span className="font-mono text-[var(--foreground)]">{i.sku}</span> — {i.motivo}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {!resultado.erro && resultado.publicadas.length === 0 && resultado.ignoradas.length === 0 && (
              <p className="text-[var(--muted)]">Nenhuma variante processada.</p>
            )}
          </div>
        ) : null}
      </div>
      <div className="border-t border-[var(--card-border)] px-5 py-3">
        <button
          type="button"
          onClick={onFechar}
          className="w-full rounded-md border border-[var(--card-border)] bg-[var(--card)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--foreground)] hover:bg-[var(--muted)]/10 sm:w-auto"
        >
          Fechar
        </button>
      </div>
    </ModalOverlay>
  );
}

function ProdutoAcoesMenu({
  onPublicarMercadoLivre,
  publicandoMl = false,
}: {
  onPublicarMercadoLivre?: () => void;
  publicandoMl?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const anchorRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const updatePos = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const pad = 12;
    let left = r.left;
    if (left + BULK_MENU_WIDTH_PX > window.innerWidth - pad) {
      left = window.innerWidth - BULK_MENU_WIDTH_PX - pad;
    }
    if (left < pad) left = pad;
    setPos({ top: r.bottom + 6, left });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updatePos();
    window.addEventListener("resize", updatePos);
    window.addEventListener("scroll", updatePos, true);
    return () => {
      window.removeEventListener("resize", updatePos);
      window.removeEventListener("scroll", updatePos, true);
    };
  }, [open, updatePos]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node;
      if (anchorRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("touchstart", onPointer);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("touchstart", onPointer);
    };
  }, [open]);

  const menu =
    open && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={menuRef}
            role="menu"
            className="fixed z-[200] rounded-xl border border-[var(--card-border)] bg-[var(--card)] py-1 shadow-[0_12px_40px_-12px_rgba(15,23,42,0.35)] dark:shadow-[0_12px_40px_-12px_rgba(0,0,0,0.55)]"
            style={{ top: pos.top, left: pos.left, width: BULK_MENU_WIDTH_PX }}
            onClick={(e) => e.stopPropagation()}
          >
            {onPublicarMercadoLivre ? (
              <button
                type="button"
                role="menuitem"
                disabled={publicandoMl}
                onClick={() => {
                  onPublicarMercadoLivre();
                  setOpen(false);
                }}
                className="flex w-full whitespace-nowrap px-3.5 py-2.5 text-left text-[13px] text-[var(--foreground)] hover:bg-[var(--muted)]/12 disabled:opacity-50"
              >
                {publicandoMl ? "Publicando…" : "Publicar no Mercado Livre"}
              </button>
            ) : null}
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Mais ações do produto"
        title="Mais ações do produto"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => {
            const next = !v;
            if (next) queueMicrotask(updatePos);
            return next;
          });
        }}
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[var(--muted)] hover:bg-[var(--muted)]/10 hover:text-[var(--foreground)]"
      >
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden>
          <circle cx="12" cy="5" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="12" cy="19" r="1.8" />
        </svg>
      </button>
      {menu}
    </>
  );
}

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
    <ImagemMiniatura
      src={src}
      alt=""
      fill
      sizes="80px"
      loading="lazy"
      className="object-contain object-top"
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

type Props = {
  grupo: GrupoCatalogoV2;
  exp: boolean;
  onToggleExpand: () => void;
  modoListaVariantes: "agrupado-cor" | "sku";
  setModoListaVariantes: (m: "agrupado-cor" | "sku") => void;
  mostrarFotosVariantes: boolean;
  setMostrarFotosVariantes: (v: boolean | ((p: boolean) => boolean)) => void;
  fornecedorLigadoId?: string | null;
};

export function SellerListaGrupoArmazem({
  grupo,
  exp,
  onToggleExpand,
  modoListaVariantes,
  setModoListaVariantes,
  mostrarFotosVariantes,
  setMostrarFotosVariantes,
  fornecedorLigadoId = null,
}: Props) {
  const [modalMlAberto, setModalMlAberto] = useState(false);
  const [publicandoMl, setPublicandoMl] = useState(false);
  const [resultadoMl, setResultadoMl] = useState<{
    ok: boolean;
    erro?: string;
    publicadas: { sku: string; ml_permalink: string }[];
    ignoradas: { sku: string; motivo: string }[];
  } | null>(null);

  async function handlePublicarMl() {
    setModalMlAberto(true);
    setPublicandoMl(true);
    setResultadoMl(null);
    try {
      const {
        data: { session },
      } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) {
        setResultadoMl({ ok: false, erro: "Sessão expirada — atualize a página e tente de novo.", publicadas: [], ignoradas: [] });
        return;
      }
      const res = await fetch("/api/seller/mercadolivre/publicar-anuncio", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ sku: grupo.paiKey }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        error?: string;
        publicadas?: { sku: string; ml_permalink: string }[];
        ignoradas?: { sku: string; motivo: string }[];
      };
      if (!res.ok) {
        setResultadoMl({ ok: false, erro: j?.error ?? "Erro ao publicar no Mercado Livre.", publicadas: [], ignoradas: j.ignoradas ?? [] });
        return;
      }
      setResultadoMl({ ok: true, publicadas: j.publicadas ?? [], ignoradas: j.ignoradas ?? [] });
    } catch (e: unknown) {
      setResultadoMl({ ok: false, erro: e instanceof Error ? e.message : "Erro ao publicar no Mercado Livre.", publicadas: [], ignoradas: [] });
    } finally {
      setPublicandoMl(false);
    }
  }

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
      return sellerGrupoToProdutoResumoListaGrupoProps(grupo, fornecedorLigadoId);
    } catch {
      return null;
    }
  }, [grupo, fornecedorLigadoId]);

  const linhasToggle = useMemo(() => mapLinhasCatalogoV2(linhas), [linhas]);

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
            AMBER_PREMIUM_SHELL,
            AMBER_PREMIUM_TEXT_PRIMARY,
            "inline-flex max-w-full items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-medium",
          )}
        >
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden />
          Com pendência
        </span>
      );
    }
    if (sg === "sem_estoque") {
      return (
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md bg-neutral-100 px-2 py-1 text-[11px] font-medium text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden />
          Sem estoque
        </span>
      );
    }
    if (sg === "pausado") {
      return (
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md bg-neutral-100 px-2 py-1 text-[11px] font-medium text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden />
          Pausado
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md bg-emerald-100 px-2 py-1 text-[11px] font-medium text-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden />
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
    <div className="overflow-visible rounded-xl border border-[var(--card-border)] bg-[var(--card)] shadow-sm transition-colors hover:border-emerald-500/25 dark:shadow-none">
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
            <div className="relative flex h-[3.625rem] w-[3.625rem] shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[var(--card-border)] bg-[var(--muted)]/10 p-0.5 sm:h-20 sm:w-20">
              <MiniaturaListaGrupoSeller g={grupo} />
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-start justify-between gap-2">
              <div className="min-w-0 flex-1 space-y-1.5 sm:flex sm:items-center sm:gap-2 sm:space-y-0">
                <p className="min-w-0 text-[15px] font-semibold leading-snug text-[var(--foreground)] [overflow-wrap:anywhere] sm:truncate sm:text-lg">
                  {representante?.nome_produto ?? nome}
                </p>
                <div className="flex min-w-0 flex-wrap items-center gap-2 sm:shrink-0 sm:flex-nowrap">
                  {todosInativos ? (
                    <span
                      className={cn(
                        AMBER_PREMIUM_SHELL,
                        AMBER_PREMIUM_TEXT_PRIMARY,
                        "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-medium",
                      )}
                    >
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden />
                      Inativo
                    </span>
                  ) : null}
                  {badgeStatus}
                </div>
              </div>
              <span className="shrink-0" onClick={(e) => e.stopPropagation()}>
                <ProdutoAcoesMenu onPublicarMercadoLivre={handlePublicarMl} publicandoMl={publicandoMl} />
              </span>
            </div>
            {modalMlAberto && (
              <ModalMercadoLivreResultado
                nome={nome}
                publicando={publicandoMl}
                resultado={resultadoMl}
                onFechar={() => setModalMlAberto(false)}
              />
            )}
            <div className="mt-2 space-y-1 border-t border-[var(--card-border)]/60 pt-2 text-[12px] leading-snug text-[var(--muted)] sm:flex sm:flex-wrap sm:items-center sm:gap-x-2 sm:space-y-0 sm:text-[13px]">
              <p className="[overflow-wrap:anywhere] sm:shrink-0">
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
                <>
                  <span className="hidden sm:inline" aria-hidden>
                    ·
                  </span>
                  <p className="sm:shrink-0">
                    Custo{" "}
                    <span className="font-semibold tabular-nums text-[var(--foreground)]">{custoFaixaResumo}</span>
                    <span> / un.</span>
                  </p>
                </>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {exp && linhas.length > 0 && (
        <>
          {!mostrarFotosVariantes ? (
            <div className="border-t border-[var(--card-border)] bg-[var(--card)] px-3 py-4 text-sm text-[var(--muted)] sm:px-4">
              Variantes ocultas nesta visualização.
            </div>
          ) : null}

          {mostrarFotosVariantes && modoListaVariantes === "agrupado-cor" && (
            <div className="min-w-0 border-t border-[var(--card-border)] bg-[var(--card)] p-4">
              {/* Scroll lateral em vez de empilhar verticalmente — evita página gigante em
               * produto com muitas cores; cada card mostra ~1 cheio + uma tira do próximo. */}
              <div className="dropcore-scroll-x">
                <div className="flex gap-3 pb-1">
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
                      className="w-[88%] shrink-0 rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4 shadow-sm transition-colors hover:border-emerald-500/35 sm:w-[30rem]"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="min-w-0 space-y-2.5">
                        <div className="flex min-w-0 flex-nowrap items-center justify-between gap-x-2">
                          <div className="flex min-w-0 shrink items-center gap-2">
                            <p className="min-w-0 truncate text-sm font-bold tracking-tight text-[var(--foreground)]">{gc.corLabel}</p>
                            <span className="inline-flex shrink-0 rounded-full bg-[var(--muted)]/12 px-2 py-0.5 text-xs font-medium text-[var(--foreground)]">
                              {gc.itens.length} SKU(s)
                            </span>
                          </div>
                          <div
                            className="ml-auto flex shrink-0 flex-nowrap items-center justify-end gap-2"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <CatalogoV2CorGrupoApiToggle
                              linhas={
                                itensOrdenados
                                  .map((p) => linhaPorId.get(p.id))
                                  .filter((x): x is LinhaCatalogoV2 => x != null)
                              }
                            />
                            {lfCor ? (
                              <a
                                href={lfCor}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex shrink-0 items-center justify-center rounded-md border border-[var(--card-border)] bg-[var(--card)] px-2.5 py-1.5 text-[11px] font-semibold text-emerald-700 transition hover:bg-[var(--muted)]/10 dark:text-emerald-400"
                              >
                                Ver fotos
                              </a>
                            ) : null}
                          </div>
                        </div>
                        <div className="flex min-w-0 flex-row items-center justify-between gap-2 rounded-lg bg-[var(--muted)]/8 px-3 py-2 text-xs leading-snug sm:text-sm">
                          <span className="min-w-0 pr-1 text-[var(--foreground)]">
                            <span className="font-normal">Preço </span>
                            <span className="font-semibold tabular-nums">{custoTxt}</span>
                          </span>
                          <span className="h-3.5 w-px shrink-0 bg-[var(--card-border)] opacity-90 sm:h-4" aria-hidden />
                          <span className="shrink-0 whitespace-nowrap pl-1 text-right text-[var(--muted)]">
                            <span className="sm:hidden">Estoque </span>
                            <span className="hidden sm:inline">Total em estoque: </span>
                            <span className="font-semibold tabular-nums text-[var(--foreground)]">{estoqueTotal}</span>
                          </span>
                        </div>
                      </div>

                      {/* Mobile: foto em cima + tabela · md+: igual fornecedor — foto | tabela */}
                      <div className="mt-4 flex min-w-0 flex-col gap-4 md:grid md:grid-cols-[14rem_minmax(0,1fr)] md:items-stretch md:gap-x-4">
                        <div className="flex w-full min-w-0 max-w-full shrink-0 flex-col md:h-full md:min-h-0 md:max-w-[14rem]">
                          <div className="relative h-64 w-full overflow-hidden rounded-xl bg-[var(--muted)]/8 md:h-56 md:w-56 md:max-w-none md:shrink-0">
                            <CatalogoV2FotoPreview
                              variant="grade"
                              imagemUrl={rowCor.imagem_url}
                              fallbackUrl={fallbackCor}
                              linkFotosUrl={lfCor}
                            />
                          </div>
                        </div>
                        {/* Sem scroll horizontal próprio: já está dentro do carrossel de cores
                         * (dropcore-scroll-x acima) — ter dois scrolls horizontais aninhados faz
                         * o gesto de rolar ser capturado pela tabela em vez do carrossel, travando
                         * a navegação. Colunas estreitas o bastante pra quebrar linha em vez de
                         * precisar rolar (ver whitespace-normal no SKU abaixo). */}
                        <div className="flex min-w-0 w-full max-w-full flex-col overflow-x-visible rounded-xl bg-[var(--card)] max-md:overflow-hidden max-md:border-0 max-md:shadow-none md:h-full md:border md:border-[var(--card-border)] md:shadow-sm">
                          <div className="grid w-full min-w-0 shrink-0 grid-cols-[4.5rem_minmax(0,1fr)_3rem] rounded-t-xl border-b border-[var(--card-border)] bg-[var(--surface-subtle)] px-2.5 py-2 text-[11px] font-bold text-[var(--muted)] md:rounded-t-none">
                            <span>Numeração</span>
                            <span className="min-w-0">SKU</span>
                            <span className="text-right">Qtd.</span>
                          </div>
                          {/* md:flex-1 no corpo + em cada linha: linhas dividem igualmente a altura
                           * que sobrar até bater com a foto ao lado (h-56), em vez de deixar vão
                           * vazio embaixo da última linha quando há poucos tamanhos. */}
                          <div className="md:flex md:flex-1 md:flex-col">
                          {itensOrdenados.map((p) => (
                            <div
                              key={p.id}
                              className="grid w-full min-w-0 grid-cols-[4.5rem_minmax(0,1fr)_3rem] items-center border-b border-[var(--card-border)]/50 px-2.5 py-2 text-xs last:border-b-0 max-md:last:rounded-b-xl md:flex-1"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <span className="font-bold text-[var(--foreground)]">{(p.tamanho ?? "—").toUpperCase()}</span>
                              <span className="min-w-0 break-all font-mono text-[11px] font-normal leading-snug text-[var(--muted)]">
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
                    </div>
                  );
                })}
                </div>
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
                      <div className="mb-2 min-w-0 space-y-2">
                        <div className="flex min-w-0 items-start justify-between gap-2">
                          <p className="min-w-0 flex-1 text-sm font-semibold leading-snug text-[var(--foreground)]">
                            <CorCelulaProduto cor={row.cor} />
                            <span className="mx-1 text-[var(--muted)]">·</span>
                            <span className="font-normal text-[var(--muted)]">{row.tamanho || "—"}</span>
                          </p>
                          {ltMob ? <CatalogoV2VariacaoApiToggle linha={ltMob} /> : null}
                        </div>
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
                          <td className="px-1 py-1.5 align-top text-center lg:px-2" onClick={(e) => e.stopPropagation()}>
                            {ltDesk ? (
                              <div className="flex justify-center">
                                <CatalogoV2VariacaoApiToggle linha={ltDesk} />
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
