"use client";

import { useEffect, useState } from "react";
import { SkuInlineSeller } from "@/components/seller/SkuInlineSeller";
import { formatPesoCatalogo } from "@/lib/formatPesoCatalogo";
import { skuProntoParaVender, skuReadinessLabelsFalha } from "@/lib/sellerSkuReadiness";
import {
  AMBER_PREMIUM_SHELL,
  AMBER_PREMIUM_TEXT_BODY,
  AMBER_PREMIUM_TEXT_PRIMARY,
  AMBER_PREMIUM_TEXT_SOFT,
} from "@/lib/amberPremium";
import { cn } from "@/lib/utils";

const BADGE_AMBER_PREMIUM = cn(
  AMBER_PREMIUM_SHELL,
  AMBER_PREMIUM_TEXT_PRIMARY,
  "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium"
);
/** readiness não ok — mantém padding maior */
const BADGE_READINESS_PENDENTE = cn(
  AMBER_PREMIUM_SHELL,
  AMBER_PREMIUM_TEXT_PRIMARY,
  "inline-flex max-w-full items-center rounded-full px-2.5 py-1 text-[11px] font-semibold cursor-help whitespace-normal text-left"
);

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
          ? "bg-emerald-100 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300"
          : "bg-red-100 dark:bg-red-950/40 border-red-300 dark:border-red-900 text-red-700 dark:text-red-300"
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
      className={
        baixo
          ? BADGE_AMBER_PREMIUM
          : "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium border bg-neutral-100 dark:bg-neutral-800/60 border-neutral-300 dark:border-neutral-600 text-neutral-600 dark:text-neutral-400"
      }
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
      className={
        ok
          ? "inline-flex max-w-full items-center rounded-full px-2.5 py-1 text-[11px] font-semibold border cursor-help whitespace-normal text-left bg-emerald-100 dark:bg-emerald-950/35 border-emerald-400/80 dark:border-emerald-700 text-emerald-900 dark:text-emerald-300"
          : BADGE_READINESS_PENDENTE
      }
    >
      {ok ? "Pronto para vender" : `Faltam ${falhas.length} ${falhas.length === 1 ? "item" : "itens"}`}
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
  variant = "default",
}: {
  rep: SellerCatalogoItem;
  nomeGrupo: string;
  dimensoesGrupo: string;
  descricaoExpandida: boolean;
  onToggleDescricao: () => void;
  onOpenMedidas?: () => void;
  omitHeading?: boolean;
  /** Painel escuro SaaS (ex.: /seller/produtos). */
  variant?: "default" | "saas";
}) {
  const descricao = str(rep.descricao);
  const descricaoLonga = descricao.length > DESCRICAO_PREVIEW;
  const textoDescricao =
    descricaoExpandida || !descricaoLonga ? descricao : descricao.slice(0, DESCRICAO_PREVIEW) + (descricao.length > DESCRICAO_PREVIEW ? "..." : "");
  const saas = variant === "saas";

  return (
    <div
      className={
        saas
          ? "rounded-2xl border border-[#2A2F3A] bg-[#161A22] shadow-sm overflow-hidden"
          : "rounded-2xl bg-gradient-to-br from-white via-neutral-50/95 to-emerald-50/[0.12] dark:from-neutral-900/95 dark:via-neutral-900/80 dark:to-emerald-950/[0.18] border border-neutral-200/90 dark:border-neutral-700/75 overflow-hidden shadow-sm ring-1 ring-black/[0.03] dark:ring-white/[0.05]"
      }
    >
      <div className="p-4 sm:p-5 md:p-6">
        {!omitHeading && nomeGrupo && (
          <h3
            className={
              saas
                ? "text-base sm:text-lg font-semibold text-white leading-snug tracking-tight"
                : "text-base sm:text-lg font-semibold text-neutral-900 dark:text-neutral-100 leading-snug tracking-tight"
            }
          >
            {nomeGrupo}
          </h3>
        )}
        {omitHeading && (
          <p
            className={
              saas
                ? "text-xs font-semibold uppercase tracking-[0.12em] text-emerald-500/90 mb-3"
                : "text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-700/85 dark:text-emerald-400/90 mb-3"
            }
          >
            Descrição e envio
          </p>
        )}
        {str(rep.categoria) && (
          <span
            className={`inline-block rounded-full text-xs px-2.5 py-1 font-medium border ${
              saas
                ? `border-[#2A2F3A] bg-[#0F1115] text-zinc-300 ${omitHeading ? "mt-3" : "mt-2"}`
                : `bg-neutral-900/[0.06] dark:bg-white/10 text-neutral-700 dark:text-neutral-200 border-neutral-200/80 dark:border-neutral-600/60 ${
                    omitHeading ? "mt-3" : "mt-2"
                  }`
            }`}
          >
            {str(rep.categoria)}
          </span>
        )}
        {descricao && (
          <div className="mt-3 sm:mt-3.5">
            <p
              className={
                saas
                  ? "text-sm text-zinc-400 leading-relaxed whitespace-pre-line"
                  : "text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed whitespace-pre-line"
              }
            >
              {textoDescricao}
            </p>
            {descricaoLonga && (
              <button
                type="button"
                onClick={onToggleDescricao}
                className={
                  saas
                    ? "mt-2 text-xs font-semibold text-emerald-500 hover:underline"
                    : "mt-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline"
                }
              >
                {descricaoExpandida ? "Ver menos" : "Ver mais"}
              </button>
            )}
          </div>
        )}
        <div
          className={
            saas
              ? "mt-4 pt-4 border-t border-[#2A2F3A] flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4 sm:gap-y-2 text-xs text-zinc-400"
              : "mt-4 pt-4 border-t border-neutral-200/90 dark:border-neutral-700/60 flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4 sm:gap-y-2 text-[11px] sm:text-xs text-neutral-600 dark:text-neutral-400"
          }
        >
          {onOpenMedidas && (
            <button
              type="button"
              onClick={onOpenMedidas}
              className={
                saas
                  ? "inline-flex h-10 w-full sm:w-auto items-center justify-center gap-2 rounded-lg border border-[#2A2F3A] bg-[#0F1115] px-4 text-sm font-medium text-white hover:border-emerald-500/50 transition touch-manipulation shrink-0"
                  : "inline-flex items-center justify-center gap-2 font-semibold text-neutral-800 dark:text-neutral-100 border border-neutral-300/90 dark:border-neutral-600 rounded-xl px-4 py-2.5 sm:rounded-xl hover:border-emerald-400/80 dark:hover:border-emerald-600 hover:bg-emerald-100 dark:hover:bg-emerald-950/25 transition touch-manipulation min-h-[44px] sm:min-h-0 w-full sm:w-auto shrink-0 bg-white/90 dark:bg-neutral-950/40 shadow-sm"
              }
            >
              <svg
                className={saas ? "w-4 h-4 text-emerald-500 shrink-0" : "w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0"}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden
              >
                <path d="M3 3v18h18" />
                <path d="M7 16h8" />
                <path d="M7 11h12" />
                <path d="M7 6h4" />
              </svg>
              Tabela de medidas
            </button>
          )}
          {str(rep.ncm) && (
            <span
              className={
                saas
                  ? "flex items-center gap-1.5 min-w-0 sm:max-w-[14rem] rounded-lg border border-[#2A2F3A] bg-[#0F1115] px-2 py-1"
                  : "flex items-center gap-1.5 min-w-0 sm:max-w-[14rem] rounded-lg bg-neutral-100/80 dark:bg-neutral-800/60 px-2 py-1"
              }
            >
              <span className={saas ? "text-zinc-500 shrink-0 font-medium text-xs" : "text-neutral-500 dark:text-neutral-500 shrink-0 font-medium"}>
                NCM
              </span>
              <span
                className={
                  saas
                    ? "font-mono text-zinc-200 truncate text-xs"
                    : "font-mono text-neutral-800 dark:text-neutral-200 truncate text-[11px]"
                }
              >
                {str(rep.ncm)}
              </span>
            </span>
          )}
          {dimensoesGrupo && (
            <span
              className={
                saas
                  ? "inline-flex items-center gap-1.5 break-words text-zinc-300 rounded-lg border border-[#2A2F3A] bg-[#0F1115] px-2 py-1 text-xs"
                  : "inline-flex items-center gap-1.5 break-words text-neutral-700 dark:text-neutral-300 rounded-lg bg-neutral-100/60 dark:bg-neutral-800/50 px-2 py-1"
              }
            >
              <span aria-hidden>📦</span>
              {dimensoesGrupo}
            </span>
          )}
          {str(rep.link_fotos).trim() && (
            <a
              href={rep.link_fotos!}
              target="_blank"
              rel="noopener noreferrer"
              className={
                saas
                  ? "text-sm font-medium text-emerald-500 hover:underline min-h-[44px] sm:min-h-0 inline-flex items-center py-1"
                  : "text-emerald-700 dark:text-emerald-400 hover:underline font-semibold min-h-[44px] sm:min-h-0 inline-flex items-center py-1"
              }
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
  appearance = "default",
}: {
  item: SellerCatalogoItem;
  sóVariante?: boolean;
  habilitarRow?: HabilitarRowProps;
  /** Só leitura: esconde pendências/plano Start; útil em “explorar catálogo” antes do vínculo. */
  modoPreview?: boolean;
  /** Layout compacto escuro (ex.: /seller/produtos). */
  appearance?: "default" | "saas";
}) {
  const custo = item.custo_total;
  const pendencias = skuReadinessLabelsFalha(item);
  const pronto = pendencias.length === 0;
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

  if (appearance === "saas" && sóVariante) {
    const ativo = str(item.status).toLowerCase() === "ativo";
    const preçoSaaS =
      custo != null && custo > 0 ? (
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-sm text-zinc-400">Você paga</span>
          <span className="text-base font-medium text-white">{BRL.format(custo)}</span>
          <span
            className="text-xs text-zinc-500 cursor-help"
            title="Igual ao pedido via ERP: soma do custo do fornecedor e da taxa DropCore em R$. Se no cadastro só existir o custo do fornecedor, o total inclui 15% sobre esse valor."
          >
            (total por unidade)
          </span>
        </div>
      ) : (
        <p className={cn("text-sm leading-snug", AMBER_PREMIUM_TEXT_PRIMARY)}>Preço ainda não informado — o fornecedor precisa cadastrar custo no produto.</p>
      );

    return (
      <div className="rounded-2xl border border-[#2A2F3A] bg-[#161A22] shadow-sm p-4 sm:p-5 flex flex-col gap-4 sm:flex-row sm:items-stretch sm:gap-5">
        <div className="flex justify-center sm:justify-start shrink-0">
          <div
            className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[#2A2F3A] bg-[#0F1115]"
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
                sizes="64px"
                className="h-full w-full object-cover object-center sm:cursor-zoom-in"
              />
            ) : (
              <div className="flex flex-col items-center justify-center px-1 text-center text-[11px] text-zinc-500">
                {temLinkFotos ? (
                  <a href={item.link_fotos!} target="_blank" rel="noopener noreferrer" className="text-emerald-500 hover:underline">
                    Fotos
                  </a>
                ) : (
                  <span>Sem foto</span>
                )}
              </div>
            )}
          </div>
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
                className="max-h-[88vh] max-w-full rounded-lg object-contain shadow-2xl"
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

        <div className="min-w-0 flex-1 flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <SkuInlineSeller sku={str(item.sku)} />
            {str(item.cor) && (
              <span className="rounded-md border border-[#2A2F3A] bg-[#0F1115] px-2 py-0.5 text-xs text-zinc-300">{str(item.cor)}</span>
            )}
            {str(item.tamanho) && (
              <span className="rounded-md border border-[#2A2F3A] bg-[#0F1115] px-2 py-0.5 text-xs font-medium text-white">{str(item.tamanho)}</span>
            )}
          </div>
          {str(item.nome_produto) && <p className="text-base font-medium leading-snug text-white line-clamp-2">{str(item.nome_produto)}</p>}
          {preçoSaaS}
        </div>

        {!modoPreview && (
          <div className="flex w-full shrink-0 flex-col gap-4 border-t border-[#2A2F3A] pt-4 sm:w-auto sm:min-w-[200px] sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0">
            <div className="flex flex-wrap items-center gap-2 sm:flex-col sm:items-stretch">
              <span
                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${
                  ativo
                    ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-500"
                    : "border-red-500/35 bg-red-500/10 text-red-300"
                }`}
              >
                {ativo ? "Ativo" : "Inativo"}
              </span>
              {item.estoque_atual != null && (
                <span
                  className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${
                    item.estoque_minimo != null && item.estoque_atual <= item.estoque_minimo
                      ? cn(AMBER_PREMIUM_SHELL, AMBER_PREMIUM_TEXT_PRIMARY)
                      : "border-[#2A2F3A] bg-[#0F1115] text-zinc-400"
                  }`}
                >
                  Estoque: {item.estoque_atual}
                  {item.estoque_minimo != null ? ` / mín ${item.estoque_minimo}` : ""}
                </span>
              )}
            </div>
            <div className="min-w-0">
              <BadgeReadiness item={item} />
              {!pronto && (
                <details className={cn("mt-2 text-xs", AMBER_PREMIUM_TEXT_PRIMARY)}>
                  <summary className="cursor-pointer select-none font-medium">Ver pendências</summary>
                  <p className="mt-1 leading-snug" title={`Pendências: ${pendencias.join("; ")}`}>
                    {pendencias.slice(0, 2).join(" · ")}
                    {pendencias.length > 2 ? ` +${pendencias.length - 2}` : ""}
                  </p>
                </details>
              )}
            </div>
            {habilitarRow?.starterComLimite && (
              <div className="w-full space-y-2">
                {habilitarRow.isento ? (
                  <p className="text-xs leading-snug text-zinc-500">SKU de sistema: dispensa lista de habilitados no Start.</p>
                ) : (
                  <>
                    <label className="flex h-10 w-full cursor-pointer select-none items-center justify-between gap-3 rounded-lg border border-[#2A2F3A] bg-[#0F1115] px-4 touch-manipulation">
                      <span className="text-sm font-medium text-zinc-200">Habilitar venda</span>
                      <input
                        type="checkbox"
                        checked={habilitarRow.habilitado}
                        disabled={habilitarRow.loading}
                        onChange={() => {
                          void habilitarRow.onToggle();
                        }}
                        className="h-5 w-5 shrink-0 rounded border-[#2A2F3A] text-emerald-500 focus:ring-emerald-500/40 focus:ring-offset-0 disabled:opacity-50"
                      />
                    </label>
                    {habilitarRow.loading && <span className="block text-xs text-zinc-500">Salvando...</span>}
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  const imgWrap =
    sóVariante
      ? "w-[7.25rem] min-h-[9.5rem] sm:w-28 sm:min-h-[120px] shrink-0"
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
      <p className={cn(AMBER_PREMIUM_TEXT_BODY, sóVariante ? "text-[10px] mt-0.5 leading-snug" : "text-xs mt-1 leading-snug")}>
        Preço ainda não informado — o fornecedor precisa cadastrar custo no produto.
      </p>
    );

  return (
    <div
      className={`group rounded-2xl border border-neutral-200/80 dark:border-neutral-700/55 bg-white dark:bg-[var(--card)] gap-0 shadow-[0_2px_8px_-3px_rgba(0,0,0,0.06)] dark:shadow-[0_3px_12px_-4px_rgba(0,0,0,0.45)] hover:border-neutral-300 dark:hover:border-neutral-600 transition-all duration-200 overflow-hidden ${
        sóVariante ? "flex flex-row" : "flex flex-col sm:flex-row"
      }`}
    >
      <div className={`relative shrink-0 ${imgWrap} sm:z-30 ${sóVariante ? "" : "w-full"}`}>
        <div
          className={
            sóVariante
              ? "absolute inset-0 flex items-center justify-center overflow-hidden border-r border-neutral-200/80 bg-neutral-100 px-1 py-1 dark:border-neutral-700/60 dark:bg-neutral-800/70"
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
                  ? "relative z-0 mx-auto block h-full w-full max-h-full object-contain object-center cursor-zoom-in"
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
        className={`flex-1 min-w-0 flex flex-col gap-2.5 sm:gap-3 sm:flex-row sm:flex-wrap sm:justify-between sm:items-start ${
          sóVariante ? "px-3 py-3 sm:px-4 sm:py-3.5" : "px-3 py-3 sm:px-4 sm:py-3.5"
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
                  <span className="text-[10px] sm:text-xs font-medium bg-neutral-700/90 dark:bg-neutral-500 text-white rounded-md px-1.5 py-0.5 sm:px-2">{str(item.tamanho)}</span>
                )}
              </div>
            ) : (
              <>
                {str(item.cor) && <CorSwatch cor={str(item.cor)} size="md" />}
                {str(item.tamanho) && (
                  <span className="text-[11px] sm:text-xs font-medium bg-neutral-700/90 dark:bg-neutral-500 text-white rounded-md px-2 py-0.5">{str(item.tamanho)}</span>
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
          <div className="flex flex-col gap-2 shrink-0 w-full sm:w-auto sm:max-w-[14rem] border-t border-neutral-100 dark:border-neutral-800/80 pt-2.5 sm:border-0 sm:pt-0 sm:items-end">
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 sm:justify-end">
              <BadgeStatus status={str(item.status)} />
              <BadgeEstoque atual={item.estoque_atual} minimo={item.estoque_minimo} />
            </div>
            <div className="w-full sm:max-w-[14rem] sm:text-right">
              <BadgeReadiness item={item} />
              {!pronto && (
                <details className={cn("mt-1 text-[10px]", AMBER_PREMIUM_TEXT_SOFT)}>
                  <summary className="cursor-pointer select-none font-medium sm:text-right">Ver pendências</summary>
                  <p className="mt-1 leading-snug" title={`Pendências: ${pendencias.join("; ")}`}>
                    {pendencias.slice(0, 2).join(" · ")}
                    {pendencias.length > 2 ? ` +${pendencias.length - 2}` : ""}
                  </p>
                </details>
              )}
            </div>
            {habilitarRow?.starterComLimite && (
              <div className="w-full sm:max-w-[14rem] space-y-1">
                {habilitarRow.isento ? (
                  <p className="text-[10px] text-neutral-500 dark:text-neutral-400 leading-snug">SKU de sistema: dispensa lista de habilitados no Start.</p>
                ) : (
                  <>
                    <label className="flex items-center justify-between gap-3 cursor-pointer select-none touch-manipulation rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-800/55 px-3 py-2.5 sm:justify-end sm:gap-2 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0">
                      <span className="text-xs font-medium text-neutral-800 dark:text-neutral-200 pr-1 min-w-0">Habilitar venda</span>
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
                    {habilitarRow.loading && <span className="text-[10px] text-neutral-500 sm:text-right block">Salvando...</span>}
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
