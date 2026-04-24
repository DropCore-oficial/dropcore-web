"use client";

import { useEffect, useState } from "react";
import { SkuInlineSeller } from "@/components/seller/SkuInlineSeller";
import { formatPesoCatalogo } from "@/lib/formatPesoCatalogo";
import { skuProntoParaVender, skuReadinessLabelsFalha } from "@/lib/sellerSkuReadiness";

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export type SellerCatalogoItem = {
  id: string;
  sku: string;
  nome_produto: string;
  cor: string;
  tamanho: string;
  status: string;
  categoria: string | null;
  dimensoes_pacote: string | null;
  comprimento_cm: number | null;
  largura_cm: number | null;
  altura_cm: number | null;
  peso_kg: number | null;
  estoque_atual: number | null;
  estoque_minimo: number | null;
  custo_total: number | null;
  imagem_url: string | null;
  link_fotos: string | null;
  descricao: string | null;
  ncm: string | null;
  habilitado_venda?: boolean;
};

function str(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return "";
}

function isSemente(item: SellerCatalogoItem): boolean {
  const sku = str(item.sku);
  const sufixo = sku.slice(-3);
  const nome = str(item.nome_produto).toLowerCase();
  const cor = str(item.cor).trim();
  const tam = str(item.tamanho).trim();
  if (sku === "DJU999000") return true;
  if (sufixo !== "000") return false;
  if (nome.includes("semente")) return true;
  if (!cor && !tam) return true;
  return false;
}

export function paiKey(sku: unknown): string {
  const s = str(sku);
  return s.length >= 3 ? s.slice(0, -3) + "000" : s;
}

const GRUPOS_OCULTOS = new Set<string>(["DJU999000"]);
function isGrupoOculto(sku: unknown): boolean {
  return GRUPOS_OCULTOS.has(paiKey(sku));
}

export function normalizarItemsSellerCatalogo(raw: unknown): SellerCatalogoItem[] {
  if (!Array.isArray(raw)) return [];
  return (raw as Record<string, unknown>[])
    .map((row) => {
      try {
        return {
          id: str(row?.id),
          sku: str(row?.sku),
          nome_produto: str(row?.nome_produto),
          cor: str(row?.cor),
          tamanho: str(row?.tamanho),
          status: str(row?.status),
          categoria: row?.categoria != null ? str(row.categoria) : null,
          dimensoes_pacote: row?.dimensoes_pacote != null ? str(row.dimensoes_pacote) : null,
          comprimento_cm: typeof row?.comprimento_cm === "number" ? row.comprimento_cm : null,
          largura_cm: typeof row?.largura_cm === "number" ? row.largura_cm : null,
          altura_cm: typeof row?.altura_cm === "number" ? row.altura_cm : null,
          peso_kg: typeof row?.peso_kg === "number" ? row.peso_kg : null,
          estoque_atual: typeof row?.estoque_atual === "number" ? row.estoque_atual : null,
          estoque_minimo: typeof row?.estoque_minimo === "number" ? row.estoque_minimo : null,
          custo_total: typeof row?.custo_total === "number" ? row.custo_total : null,
          imagem_url: row?.imagem_url != null ? str(row.imagem_url) : null,
          link_fotos: row?.link_fotos != null ? str(row.link_fotos) : null,
          descricao: row?.descricao != null ? str(row.descricao) : null,
          ncm: row?.ncm != null ? str(row.ncm) : null,
          habilitado_venda: row?.habilitado_venda === true,
        } as SellerCatalogoItem;
      } catch {
        return null;
      }
    })
    .filter(Boolean) as SellerCatalogoItem[];
}

export function agruparPaiFilhosSeller(items: SellerCatalogoItem[]): { paiKey: string; pai: SellerCatalogoItem | null; filhos: SellerCatalogoItem[] }[] {
  const filtrados = items.filter((i) => !isSemente(i) && !isGrupoOculto(i.sku));
  const porPai = new Map<string, { pai: SellerCatalogoItem | null; filhos: SellerCatalogoItem[] }>();
  for (const item of filtrados) {
    const key = paiKey(item.sku);
    if (!porPai.has(key)) porPai.set(key, { pai: null, filhos: [] });
    const g = porPai.get(key)!;
    if (str(item.sku).endsWith("000")) g.pai = item;
    else g.filhos.push(item);
  }
  return Array.from(porPai.entries())
    .map(([key, g]) => ({
      paiKey: key,
      pai: g.pai,
      filhos: g.filhos.sort((a, b) => str(a.sku).localeCompare(str(b.sku))),
    }))
    .sort((a, b) => a.paiKey.localeCompare(b.paiKey));
}

function BadgeStatus({ status }: { status: string }) {
  const ativo = status.toLowerCase() === "ativo";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium border ${
        ativo
          ? "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300"
          : "bg-red-50 dark:bg-red-950/40 border-red-300 dark:border-red-900 text-red-700 dark:text-red-300"
      }`}
    >
      {ativo ? "Ativo" : "Inativo"}
    </span>
  );
}

function BadgeEstoque({ atual, minimo }: { atual: number | null; minimo: number | null }) {
  if (atual == null) return null;
  const baixo = minimo != null && atual <= minimo;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium border ${
        baixo
          ? "bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300"
          : "bg-neutral-100 dark:bg-neutral-800/60 border-neutral-300 dark:border-neutral-600 text-neutral-600 dark:text-neutral-400"
      }`}
    >
      Estoque: {atual}
      {minimo != null ? ` / mín ${minimo}` : ""}
    </span>
  );
}

function BadgeReadiness({ item }: { item: SellerCatalogoItem }) {
  const ok = skuProntoParaVender(item);
  const falhas = ok ? [] : skuReadinessLabelsFalha(item);
  const title = ok
    ? "Checklist: nome, foto ou link, custo, estoque, medidas, NCM (8 dígitos) e descrição — tudo ok para anunciar e bater com o ERP."
    : `Ajustar no catálogo do fornecedor: ${falhas.join("; ")}`;
  return (
    <span
      title={title}
      className={`inline-flex max-w-full sm:max-w-[14rem] items-center rounded-full px-2 py-0.5 text-[11px] font-medium border cursor-help whitespace-normal text-left ${
        ok
          ? "bg-emerald-50 dark:bg-emerald-950/35 border-emerald-400/80 dark:border-emerald-700 text-emerald-800 dark:text-emerald-200"
          : "bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-200"
      }`}
    >
      {ok ? "Pronto p/ vender" : `${falhas.length} pendência${falhas.length !== 1 ? "s" : ""}`}
    </span>
  );
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
function urlImagem(imagemUrl: string | null): string | null {
  if (!imagemUrl || !imagemUrl.trim()) return null;
  const url = imagemUrl.trim();
  if (SUPABASE_URL && url.startsWith(SUPABASE_URL)) {
    return `/api/fornecedor/produtos/imagem-proxy?url=${encodeURIComponent(url)}&w=1536`;
  }
  return url;
}

const CORES_HEX: Record<string, string> = {
  preto: "#1a1a1a",
  branco: "#f5f5f5",
  azul: "#2563eb",
  vermelho: "#dc2626",
  verde: "#16a34a",
  amarelo: "#eab308",
  rosa: "#ec4899",
  marrom: "#92400e",
  bege: "#d4b896",
  cinza: "#6b7280",
  laranja: "#ea580c",
  roxo: "#7c3aed",
  nude: "#e8d5c4",
  estampado: "linear-gradient(135deg,#6366f1 25%,#ec4899 50%,#eab308 75%)",
};

const DESCRICAO_PREVIEW = 180;

function CorSwatch({ cor, size = "md" }: { cor: string; size?: "sm" | "md" }) {
  const nome = cor.trim().toLowerCase();
  const hex = CORES_HEX[nome] ?? (nome ? "#94a3b8" : undefined);
  const dotClass = size === "sm" ? "w-3.5 h-3.5" : "w-5 h-5";
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full pl-1 pr-2.5 py-0.5 text-xs font-medium border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 shadow-sm ring-1 ring-neutral-200/50 dark:ring-neutral-600/50">
      {hex && (
        <span
          className={`${dotClass} rounded-full shrink-0 border border-neutral-300 dark:border-neutral-600`}
          style={{ background: hex }}
          title={cor}
        />
      )}
      <span className="text-neutral-700 dark:text-neutral-300">{cor || "—"}</span>
    </span>
  );
}

export function infoDoGrupo(grupo: { pai: SellerCatalogoItem | null; filhos: SellerCatalogoItem[] }): SellerCatalogoItem | null {
  if (grupo.pai) return grupo.pai;
  return grupo.filhos[0] ?? null;
}

export function SellerCatalogoProductInfoBlock({
  rep,
  nomeGrupo,
  dimensoesGrupo,
  descricaoExpandida,
  onToggleDescricao,
  onOpenMedidas,
  omitHeading = false,
}: {
  rep: SellerCatalogoItem;
  nomeGrupo: string;
  dimensoesGrupo: string;
  descricaoExpandida: boolean;
  onToggleDescricao: () => void;
  onOpenMedidas?: () => void;
  omitHeading?: boolean;
}) {
  const descricao = str(rep.descricao);
  const descricaoLonga = descricao.length > DESCRICAO_PREVIEW;
  const textoDescricao =
    descricaoExpandida || !descricaoLonga ? descricao : descricao.slice(0, DESCRICAO_PREVIEW) + (descricao.length > DESCRICAO_PREVIEW ? "…" : "");

  return (
    <div className="rounded-2xl bg-gradient-to-br from-white via-neutral-50/95 to-emerald-50/[0.12] dark:from-neutral-900/95 dark:via-neutral-900/80 dark:to-emerald-950/[0.18] border border-neutral-200/90 dark:border-neutral-700/75 overflow-hidden shadow-sm ring-1 ring-black/[0.03] dark:ring-white/[0.05]">
      <div className="p-4 sm:p-5 md:p-6">
        {!omitHeading && nomeGrupo && (
          <h3 className="text-base sm:text-lg font-semibold text-neutral-900 dark:text-neutral-100 leading-snug tracking-tight">{nomeGrupo}</h3>
        )}
        {omitHeading && (
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-700/85 dark:text-emerald-400/90 mb-3">Descrição e envio</p>
        )}
        {str(rep.categoria) && (
          <span
            className={`inline-block rounded-full bg-neutral-900/[0.06] dark:bg-white/10 text-neutral-700 dark:text-neutral-200 text-xs px-2.5 py-1 font-medium border border-neutral-200/80 dark:border-neutral-600/60 ${
              omitHeading ? "mt-3" : "mt-2"
            }`}
          >
            {str(rep.categoria)}
          </span>
        )}
        {descricao && (
          <div className="mt-3 sm:mt-3.5">
            <p className="text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed whitespace-pre-line">{textoDescricao}</p>
            {descricaoLonga && (
              <button type="button" onClick={onToggleDescricao} className="mt-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline">
                {descricaoExpandida ? "Ver menos" : "Ver mais"}
              </button>
            )}
          </div>
        )}
        <div className="mt-4 pt-4 border-t border-neutral-200/90 dark:border-neutral-700/60 flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4 sm:gap-y-2 text-[11px] sm:text-xs text-neutral-600 dark:text-neutral-400">
          {onOpenMedidas && (
            <button
              type="button"
              onClick={onOpenMedidas}
              className="inline-flex items-center justify-center gap-2 font-semibold text-neutral-800 dark:text-neutral-100 border border-neutral-300/90 dark:border-neutral-600 rounded-xl px-4 py-2.5 sm:rounded-xl hover:border-emerald-400/80 dark:hover:border-emerald-600 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/25 transition touch-manipulation min-h-[44px] sm:min-h-0 w-full sm:w-auto shrink-0 bg-white/90 dark:bg-neutral-950/40 shadow-sm"
            >
              <svg className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <path d="M3 3v18h18" />
                <path d="M7 16h8" />
                <path d="M7 11h12" />
                <path d="M7 6h4" />
              </svg>
              Tabela de medidas
            </button>
          )}
          {str(rep.ncm) && (
            <span className="flex items-center gap-1.5 min-w-0 sm:max-w-[14rem] rounded-lg bg-neutral-100/80 dark:bg-neutral-800/60 px-2 py-1">
              <span className="text-neutral-500 dark:text-neutral-500 shrink-0 font-medium">NCM</span>
              <span className="font-mono text-neutral-800 dark:text-neutral-200 truncate text-[11px]">{str(rep.ncm)}</span>
            </span>
          )}
          {dimensoesGrupo && (
            <span className="inline-flex items-center gap-1.5 break-words text-neutral-700 dark:text-neutral-300 rounded-lg bg-neutral-100/60 dark:bg-neutral-800/50 px-2 py-1">
              <span aria-hidden>📦</span>
              {dimensoesGrupo}
            </span>
          )}
          {str(rep.link_fotos).trim() && (
            <a
              href={rep.link_fotos!}
              target="_blank"
              rel="noopener noreferrer"
              className="text-emerald-700 dark:text-emerald-400 hover:underline font-semibold min-h-[44px] sm:min-h-0 inline-flex items-center py-1"
            >
              Link das fotos →
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

export type HabilitarRowProps = {
  starterComLimite: boolean;
  isento: boolean;
  habilitado: boolean;
  loading: boolean;
  onToggle: () => void;
};

export function SellerCatalogoItemCard({
  item,
  sóVariante = false,
  habilitarRow,
  modoPreview = false,
}: {
  item: SellerCatalogoItem;
  sóVariante?: boolean;
  habilitarRow?: HabilitarRowProps;
  /** Só leitura: esconde pendências/Starter; útil em “explorar catálogo” antes do vínculo. */
  modoPreview?: boolean;
}) {
  const custo = item.custo_total;
  const imgSrc = urlImagem(item.imagem_url);
  const dimensoes = [
    item.comprimento_cm != null && item.largura_cm != null && item.altura_cm != null
      ? `${item.comprimento_cm}×${item.largura_cm}×${item.altura_cm} cm`
      : str(item.dimensoes_pacote),
    formatPesoCatalogo(item.peso_kg),
  ]
    .filter(Boolean)
    .join(" · ");
  const temLinkFotos = str(item.link_fotos).trim().length > 0;
  const temDescricao = str(item.descricao).trim().length > 0;
  /** Desktop: hover na área foto + preview lateral (mesmo wrapper para não perder o hover no “vão”). */
  const [imgHover, setImgHover] = useState(false);
  /** Mobile: toque na foto abre overlay ampliado. */
  const [fotoOverlay, setFotoOverlay] = useState(false);

  useEffect(() => {
    if (!fotoOverlay) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFotoOverlay(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fotoOverlay]);

  /** Sem overflow-hidden aqui: o preview desktop (absolute left-full) ficaria totalmente cortado. */
  const imgWrap =
    sóVariante
      ? "w-full sm:w-28 sm:min-h-[120px] shrink-0"
      : "h-32 max-h-36 sm:h-auto sm:min-h-[110px] sm:max-h-none";

  const preçoLinha =
    custo != null && custo > 0 ? (
      <div
        className={`text-neutral-600 dark:text-neutral-400 flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 ${
          sóVariante ? "text-[10px] sm:text-xs mt-0.5" : "text-xs mt-1"
        }`}
      >
        <span>Você paga</span>
        <span className={`font-semibold text-neutral-900 dark:text-neutral-100 ${sóVariante ? "text-xs sm:text-sm" : "text-base"}`}>{BRL.format(custo)}</span>
        <span
          className="text-neutral-500 dark:text-neutral-500 text-[10px] sm:text-[11px] cursor-help"
          title="Igual ao pedido via ERP: soma do custo do fornecedor e da taxa DropCore em R$. Se no cadastro só existir o custo do fornecedor, o total inclui 15% sobre esse valor."
        >
          (total por unidade)
        </span>
      </div>
    ) : (
      <p className={`text-amber-800 dark:text-amber-200/95 ${sóVariante ? "text-[10px] mt-0.5 leading-snug" : "text-xs mt-1 leading-snug"}`}>
        Preço ainda não informado — o fornecedor precisa cadastrar custo no produto.
      </p>
    );

  return (
    <div className="group rounded-2xl border border-neutral-200/75 dark:border-neutral-700/55 bg-white dark:bg-[var(--card)] flex flex-col sm:flex-row gap-0 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.06)] dark:shadow-[0_2px_12px_-2px_rgba(0,0,0,0.45)] hover:shadow-lg hover:border-emerald-300/55 dark:hover:border-emerald-700/45 transition-all duration-300 overflow-visible ring-1 ring-transparent hover:ring-emerald-500/[0.08]">
      <div
        className={`relative w-full shrink-0 ${imgWrap} sm:z-30`}
        onMouseEnter={() => setImgHover(true)}
        onMouseLeave={() => setImgHover(false)}
      >
        <div
          className={
            sóVariante
              ? "relative flex w-full aspect-[4/5] min-h-0 items-center justify-center overflow-hidden border-b border-neutral-200/80 bg-neutral-100 px-1 py-1 dark:border-neutral-700/60 dark:bg-neutral-900 sm:aspect-auto sm:absolute sm:inset-0 sm:min-h-[120px] sm:rounded-l-xl sm:border-b-0 sm:bg-neutral-100 sm:px-0 sm:py-0 sm:dark:bg-neutral-800/70"
              : "w-full h-full bg-neutral-100 dark:bg-neutral-800/60 flex items-center justify-center sm:rounded-l-xl overflow-hidden"
          }
          onClick={() => {
            if (imgSrc && typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches) {
              setFotoOverlay(true);
            }
          }}
          onKeyDown={(e) => {
            if (!imgSrc) return;
            if (e.key === "Enter" || e.key === " ") {
              if (typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches) {
                e.preventDefault();
                setFotoOverlay(true);
              }
            }
          }}
          role={imgSrc ? "button" : undefined}
          tabIndex={imgSrc ? 0 : undefined}
          aria-label={imgSrc ? "Ampliar foto do produto" : undefined}
        >
          {imgSrc ? (
            <img
              src={imgSrc}
              alt=""
              decoding="async"
              loading="lazy"
              sizes={sóVariante ? "(max-width: 640px) 46vw, 112px" : "(max-width: 640px) 100vw, 320px"}
              className={
                sóVariante
                  ? "relative z-0 mx-auto block h-full w-full max-h-full object-contain object-center sm:z-0 sm:h-full sm:w-full sm:max-h-[7.5rem] sm:max-w-none sm:object-contain sm:object-center sm:cursor-zoom-in"
                  : "h-full w-full min-h-0 object-contain sm:object-contain sm:cursor-zoom-in"
              }
            />
          ) : (
            <div className={`w-full flex flex-col items-center justify-center text-neutral-400 dark:text-neutral-500 text-xs p-2 ${sóVariante ? "min-h-[8rem] sm:min-h-0 sm:h-full" : "h-full"}`}>
              {temLinkFotos ? (
                <a href={item.link_fotos!} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">
                  Ver fotos
                </a>
              ) : (
                <span>Sem foto</span>
              )}
            </div>
          )}
        </div>
        {imgSrc && imgHover && (
          <div
            className="hidden sm:block absolute left-full top-0 z-[80] ml-2 rounded-lg overflow-hidden border border-neutral-200 dark:border-neutral-600 bg-white dark:bg-neutral-900 shadow-xl pointer-events-auto"
            style={{ width: "220px" }}
          >
            <img
              src={imgSrc}
              alt=""
              decoding="async"
              sizes="280px"
              className="w-full h-auto object-contain block contrast-[1.03]"
              style={{ maxHeight: "280px" }}
            />
          </div>
        )}
        {imgSrc && fotoOverlay && (
          <div
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/75 p-4 sm:hidden"
            role="presentation"
            onClick={() => setFotoOverlay(false)}
          >
            <img
              src={imgSrc}
              alt=""
              decoding="async"
              className="max-h-[88vh] max-w-full object-contain rounded-lg shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
            <button
              type="button"
              className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-white/95 text-lg font-semibold text-neutral-800 shadow-md dark:bg-neutral-900/95 dark:text-neutral-100"
              aria-label="Fechar"
              onClick={() => setFotoOverlay(false)}
            >
              ×
            </button>
          </div>
        )}
      </div>
      <div
        className={`flex-1 min-w-0 flex flex-col gap-2 sm:gap-3 sm:flex-row sm:flex-wrap sm:justify-between sm:items-start ${
          sóVariante ? "px-2 py-2 sm:px-4 sm:py-3.5" : "px-3 py-3 sm:px-4 sm:py-3.5"
        }`}
      >
        <div className="flex-1 min-w-0 space-y-1 sm:space-y-2">
          <div
            className={`flex min-w-0 gap-1 sm:gap-2 ${
              sóVariante ? "flex-col items-stretch sm:flex-row sm:items-center sm:flex-wrap" : "flex-row flex-wrap items-center"
            }`}
          >
            <SkuInlineSeller sku={str(item.sku)} />
            {sóVariante ? (
              <div className="flex flex-wrap items-center gap-1 min-w-0">
                {str(item.cor) && <CorSwatch cor={str(item.cor)} size="sm" />}
                {str(item.tamanho) && (
                  <span className="text-[10px] sm:text-xs font-medium bg-neutral-600 dark:bg-neutral-500 text-white rounded-md px-1.5 py-0.5 sm:px-2">{str(item.tamanho)}</span>
                )}
              </div>
            ) : (
              <>
                {str(item.cor) && <CorSwatch cor={str(item.cor)} size="md" />}
                {str(item.tamanho) && (
                  <span className="text-[11px] sm:text-xs font-medium bg-neutral-600 dark:bg-neutral-500 text-white rounded-md px-2 py-0.5">{str(item.tamanho)}</span>
                )}
              </>
            )}
          </div>
          {!sóVariante && (
            <>
              <div className="text-sm text-neutral-900 dark:text-neutral-100 font-medium line-clamp-2">{str(item.nome_produto)}</div>
              {str(item.categoria) && <div className="text-xs text-neutral-500 dark:text-neutral-400">{str(item.categoria)}</div>}
              {temDescricao && <p className="text-xs text-neutral-600 dark:text-neutral-400 line-clamp-2">{str(item.descricao)}</p>}
              {temLinkFotos && (
                <a
                  href={item.link_fotos!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-0.5"
                >
                  Link das fotos →
                </a>
              )}
              {dimensoes && <div className="text-xs text-neutral-500 dark:text-neutral-400">📦 {dimensoes}</div>}
            </>
          )}
          {preçoLinha}
        </div>
        {!modoPreview && (
          <div className="flex flex-col gap-2 shrink-0 w-full sm:w-auto sm:max-w-[12rem] border-t border-neutral-100 dark:border-neutral-800/80 pt-2.5 sm:border-0 sm:pt-0 sm:items-end">
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 sm:justify-end">
              <BadgeStatus status={str(item.status)} />
              <BadgeEstoque atual={item.estoque_atual} minimo={item.estoque_minimo} />
              <BadgeReadiness item={item} />
            </div>
            {habilitarRow?.starterComLimite && (
              <div className="w-full sm:max-w-[14rem] space-y-1">
                {habilitarRow.isento ? (
                  <p className="text-[10px] text-neutral-500 dark:text-neutral-400 leading-snug">SKU de sistema: dispensa lista de habilitados no Starter.</p>
                ) : (
                  <>
                    <label className="flex items-center justify-between gap-3 cursor-pointer select-none touch-manipulation rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50/95 dark:bg-neutral-800/55 px-3 py-2.5 sm:justify-end sm:gap-2 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0">
                      <span className="text-xs font-medium text-neutral-800 dark:text-neutral-200 pr-1 min-w-0">Vender (Starter)</span>
                      <input
                        type="checkbox"
                        checked={habilitarRow.habilitado}
                        disabled={habilitarRow.loading}
                        onChange={() => {
                          void habilitarRow.onToggle();
                        }}
                        className="h-5 w-5 sm:h-4 sm:w-4 shrink-0 rounded border-neutral-300 text-emerald-600 focus:ring-emerald-500 disabled:opacity-50"
                      />
                    </label>
                    {habilitarRow.loading && <span className="text-[10px] text-neutral-500 sm:text-right block">A gravar…</span>}
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export { str as strSellerCatalogo, isSemente as isSementeSellerCatalogo, isGrupoOculto as isGrupoOcultoSellerCatalogo };
