"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { SellerNav } from "../SellerNav";
import { SellerPageHeader } from "@/components/seller/SellerPageHeader";
import { toTitleCase } from "@/lib/formatText";
import { getColunasTabelaMedidas, type TipoProduto } from "@/lib/tipoProduto";

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

type ItemSKU = {
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
};

function str(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return "";
}

function isSemente(item: ItemSKU): boolean {
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

function paiKey(sku: unknown): string {
  const s = str(sku);
  return s.length >= 3 ? s.slice(0, -3) + "000" : s;
}

const GRUPOS_OCULTOS = new Set<string>(["DJU999000"]);
function isGrupoOculto(sku: unknown): boolean {
  return GRUPOS_OCULTOS.has(paiKey(sku));
}

function normalizarItems(raw: unknown): ItemSKU[] {
  if (!Array.isArray(raw)) return [];
  return (raw as any[]).map((row) => {
    try {
      return {
        id: row?.id ?? "",
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
      } as ItemSKU;
    } catch { return null; }
  }).filter(Boolean) as ItemSKU[];
}

function agruparPaiFilhos(items: ItemSKU[]): { paiKey: string; pai: ItemSKU | null; filhos: ItemSKU[] }[] {
  const filtrados = items.filter((i) => !isSemente(i) && !isGrupoOculto(i.sku));
  const porPai = new Map<string, { pai: ItemSKU | null; filhos: ItemSKU[] }>();
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
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium border ${
      ativo
        ? "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300"
        : "bg-red-50 dark:bg-red-950/40 border-red-300 dark:border-red-900 text-red-700 dark:text-red-300"
    }`}>
      {ativo ? "Ativo" : "Inativo"}
    </span>
  );
}

function BadgeEstoque({ atual, minimo }: { atual: number | null; minimo: number | null }) {
  if (atual == null) return null;
  const baixo = minimo != null && atual <= minimo;
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium border ${
      baixo
        ? "bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300"
        : "bg-neutral-100 dark:bg-neutral-800/60 border-neutral-300 dark:border-neutral-600 text-neutral-600 dark:text-neutral-400"
    }`}>
      Estoque: {atual}{minimo != null ? ` / mín ${minimo}` : ""}
    </span>
  );
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
function urlImagem(imagemUrl: string | null): string | null {
  if (!imagemUrl || !imagemUrl.trim()) return null;
  const url = imagemUrl.trim();
  if (SUPABASE_URL && url.startsWith(SUPABASE_URL)) {
    return `/api/fornecedor/produtos/imagem-proxy?url=${encodeURIComponent(url)}`;
  }
  return url;
}

const CORES_HEX: Record<string, string> = {
  preto: "#1a1a1a", branco: "#f5f5f5", azul: "#2563eb", vermelho: "#dc2626", verde: "#16a34a",
  amarelo: "#eab308", rosa: "#ec4899", marrom: "#92400e", bege: "#d4b896", cinza: "#6b7280",
  laranja: "#ea580c", roxo: "#7c3aed", nude: "#e8d5c4", estampado: "linear-gradient(135deg,#6366f1 25%,#ec4899 50%,#eab308 75%)",
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

/** Dados do produto comuns a todo o grupo (nome, descrição, NCM, etc.) — exibidos uma vez por grupo */
function infoDoGrupo(grupo: { pai: ItemSKU | null; filhos: ItemSKU[] }): ItemSKU | null {
  if (grupo.pai) return grupo.pai;
  return grupo.filhos[0] ?? null;
}

function ProductInfoBlock({
  rep,
  nomeGrupo,
  dimensoesGrupo,
  descricaoExpandida,
  onToggleDescricao,
}: {
  rep: ItemSKU;
  nomeGrupo: string;
  dimensoesGrupo: string;
  descricaoExpandida: boolean;
  onToggleDescricao: () => void;
}) {
  const descricao = str(rep.descricao);
  const descricaoLonga = descricao.length > DESCRICAO_PREVIEW;
  const textoDescricao = descricaoExpandida || !descricaoLonga ? descricao : descricao.slice(0, DESCRICAO_PREVIEW) + (descricao.length > DESCRICAO_PREVIEW ? "…" : "");

  return (
    <div className="rounded-xl bg-gradient-to-br from-neutral-50/90 to-neutral-100/60 dark:from-neutral-800/50 dark:to-neutral-800/30 border border-neutral-200/80 dark:border-neutral-700/70 overflow-hidden">
      <div className="p-4 sm:p-5">
        <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100 leading-snug">{nomeGrupo}</h3>
        {str(rep.categoria) && (
          <span className="inline-block mt-1.5 rounded-full bg-neutral-200/80 dark:bg-neutral-600/50 text-neutral-700 dark:text-neutral-300 text-xs px-2.5 py-0.5 font-medium">
            {str(rep.categoria)}
          </span>
        )}
        {descricao && (
          <div className="mt-3">
            <p className="text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed whitespace-pre-line">{textoDescricao}</p>
            {descricaoLonga && (
              <button
                type="button"
                onClick={onToggleDescricao}
                className="mt-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
              >
                {descricaoExpandida ? "Ver menos" : "Ver mais"}
              </button>
            )}
          </div>
        )}
        <div className="mt-3 pt-3 border-t border-neutral-200/80 dark:border-neutral-600/50 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-600 dark:text-neutral-400">
          {str(rep.ncm) && (
            <span className="flex items-center gap-1">
              <span className="text-neutral-500 dark:text-neutral-500">NCM</span>
              <span className="font-mono text-neutral-800 dark:text-neutral-200">{str(rep.ncm)}</span>
            </span>
          )}
          {dimensoesGrupo && <span>📦 {dimensoesGrupo}</span>}
          {str(rep.link_fotos).trim() && (
            <a href={rep.link_fotos!} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline font-medium">
              Link das fotos →
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function ItemCard({ item, sóVariante = false }: { item: ItemSKU; sóVariante?: boolean }) {
  const custo = item.custo_total;
  const imgSrc = urlImagem(item.imagem_url);
  const dimensoes = [
    item.comprimento_cm != null && item.largura_cm != null && item.altura_cm != null
      ? `${item.comprimento_cm}×${item.largura_cm}×${item.altura_cm} cm`
      : str(item.dimensoes_pacote),
    item.peso_kg ? `${item.peso_kg} kg` : "",
  ].filter(Boolean).join(" · ");
  const temLinkFotos = str(item.link_fotos).trim().length > 0;
  const temDescricao = str(item.descricao).trim().length > 0;
  const [hover, setHover] = useState(false);

  return (
    <div className="rounded-xl border border-neutral-200/80 dark:border-neutral-700/60 bg-white dark:bg-[var(--card)] flex flex-wrap sm:flex-nowrap gap-0 shadow-sm hover:shadow-lg hover:border-emerald-200/80 dark:hover:border-emerald-700/50 transition-all duration-300">
      <div className="relative w-full sm:w-28 shrink-0 h-28 sm:h-auto sm:min-h-[110px]">
        <div
          className="w-full h-full bg-neutral-100 dark:bg-neutral-800/60 flex items-center justify-center rounded-l-xl sm:rounded-l-xl overflow-hidden"
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
        >
          {imgSrc ? (
            <img src={imgSrc} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-neutral-400 dark:text-neutral-500 text-xs p-2">
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
        {imgSrc && hover && (
          <div
            className="hidden sm:block absolute left-full top-0 z-[80] ml-2 rounded-lg overflow-hidden border border-neutral-200 dark:border-neutral-600 bg-white dark:bg-neutral-900 shadow-xl pointer-events-none"
            style={{ width: "220px" }}
          >
            <img
              src={imgSrc}
              alt=""
              className="w-full h-auto object-contain block"
              style={{ maxHeight: "280px" }}
            />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0 px-4 py-3 flex flex-wrap justify-between items-start gap-3">
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs font-semibold text-neutral-800 dark:text-neutral-200 bg-neutral-200/90 dark:bg-neutral-700/80 border border-neutral-300/60 dark:border-neutral-600 rounded-md px-1.5 py-0.5">{str(item.sku)}</span>
            {str(item.cor) && <CorSwatch cor={str(item.cor)} size="md" />}
            {str(item.tamanho) && (
              <span className="text-xs font-medium bg-neutral-600 dark:bg-neutral-500 text-white rounded-md px-2 py-0.5">{str(item.tamanho)}</span>
            )}
          </div>
          {!sóVariante && (
            <>
              <div className="text-sm text-neutral-900 dark:text-neutral-100 font-medium line-clamp-2">{str(item.nome_produto)}</div>
              {str(item.categoria) && <div className="text-xs text-neutral-500 dark:text-neutral-400">{str(item.categoria)}</div>}
              {temDescricao && <p className="text-xs text-neutral-600 dark:text-neutral-400 line-clamp-2">{str(item.descricao)}</p>}
              {temLinkFotos && (
                <a href={item.link_fotos!} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-0.5">Link das fotos →</a>
              )}
              {dimensoes && <div className="text-xs text-neutral-500 dark:text-neutral-400">📦 {dimensoes}</div>}
            </>
          )}
          {custo != null && custo > 0 && (
            <div className="text-xs text-neutral-600 dark:text-neutral-400 mt-1 flex items-center gap-1.5 flex-wrap">
              <span>Você paga:</span>
              <span className="text-base font-semibold text-neutral-900 dark:text-neutral-100">{BRL.format(custo)}</span>
              <span className="text-neutral-500 dark:text-neutral-500 text-[11px]">(inclui 15% DropCore)</span>
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <BadgeStatus status={str(item.status)} />
          <BadgeEstoque atual={item.estoque_atual} minimo={item.estoque_minimo} />
        </div>
      </div>
    </div>
  );
}

export default function SellerCatalogoPage() {
  const router = useRouter();

  const [q, setQ] = useState("");
  const [items, setItems] = useState<ItemSKU[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [gruposExpandidos, setGruposExpandidos] = useState<Set<string>>(new Set());
  const [modalTabelaGrupoKey, setModalTabelaGrupoKey] = useState<string | null>(null);
  const [tabelaMedidasData, setTabelaMedidasData] = useState<{ tipo_produto: string; medidas: Record<string, Record<string, number>> } | null>(null);
  const [loadingTabela, setLoadingTabela] = useState(false);
  const [descricaoExpandidaPorGrupo, setDescricaoExpandidaPorGrupo] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { data: { session } } = await supabaseBrowser.auth.getSession();
        if (!session?.access_token) { router.replace("/seller/login"); return; }
        const res = await fetch(`/api/seller/catalogo`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(json.error || "Erro ao buscar catálogo");
        setItems(normalizarItems(json.items));
      } catch (err: unknown) {
        if (!cancelled) { setError(err instanceof Error ? err.message : "Erro inesperado"); setItems([]); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [router]);

  const itemsFiltrados = useMemo(() => {
    const termo = q.trim().toLowerCase();
    if (!termo) return items;
    const pareceTamanho = termo.length <= 2 && /^[a-záàâãéêíóôõúç]+$/i.test(termo);
    return items.filter((i) => {
      if (pareceTamanho) return str(i.tamanho).toLowerCase() === termo;
      return (
        str(i.sku).toLowerCase().includes(termo) ||
        str(i.nome_produto).toLowerCase().includes(termo) ||
        str(i.cor).toLowerCase().includes(termo) ||
        str(i.tamanho).toLowerCase().includes(termo)
      );
    });
  }, [items, q]);

  const grupos = useMemo(() => agruparPaiFilhos(itemsFiltrados), [itemsFiltrados]);

  useEffect(() => {
    if (q.trim()) setGruposExpandidos(new Set(grupos.map((g) => g.paiKey)));
  }, [q, grupos.length]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggleGrupo(key: string) {
    setGruposExpandidos((prev) => {
      const novo = new Set(prev);
      if (novo.has(key)) novo.delete(key);
      else novo.add(key);
      return novo;
    });
  }

  function toggleDescricaoGrupo(key: string) {
    setDescricaoExpandidaPorGrupo((prev) => {
      const novo = new Set(prev);
      if (novo.has(key)) novo.delete(key);
      else novo.add(key);
      return novo;
    });
  }

  const abrirTabelaMedidas = useCallback(async (grupoKey: string) => {
    setModalTabelaGrupoKey(grupoKey);
    setTabelaMedidasData(null);
    setLoadingTabela(true);
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch(`/api/seller/catalogo/tabela-medidas?grupoKey=${encodeURIComponent(grupoKey)}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erro ao buscar tabela");
      setTabelaMedidasData(json.aprovada ?? null);
    } catch {
      setTabelaMedidasData(null);
    } finally {
      setLoadingTabela(false);
    }
  }, []);

  const totalSkus = itemsFiltrados.filter((i) => !isSemente(i) && !isGrupoOculto(i.sku)).length;

return (
      <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] app-bg pt-[calc(3rem+env(safe-area-inset-top,0px))] md:pt-14 pb-[calc(6.25rem+env(safe-area-inset-bottom,0px))] md:pb-8">
      <div className="w-full max-w-6xl mx-auto dropcore-px-wide py-6 lg:py-8 space-y-6">

        <SellerPageHeader
          title="Catálogo"
          subtitle="Produtos disponíveis para vender nos seus marketplaces"
        />

        {/* Busca */}
        <div className="flex flex-col min-[420px]:flex-row gap-2 min-w-0">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onBlur={() => setQ(toTitleCase(q))}
            placeholder="Buscar por nome, SKU, cor ou tamanho..."
            className="min-w-0 w-full min-[420px]:flex-1 rounded-2xl bg-white/95 dark:bg-neutral-900/80 border border-neutral-200/80 dark:border-neutral-700/50 px-4 py-3.5 text-neutral-900 dark:text-neutral-100 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/25 focus:border-emerald-500/50 placeholder-neutral-400 dark:placeholder-neutral-500 shadow-sm hover:shadow-md transition-all"
          />
          {q && (
            <button type="button" onClick={() => setQ("")} className="rounded-2xl border border-neutral-200 dark:border-neutral-700 px-4 py-3 min-h-[44px] min-[420px]:min-h-0 text-sm text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors font-medium touch-manipulation shrink-0">
              Limpar
            </button>
          )}
        </div>

        {/* Contagem */}
        {!loading && !error && items.length > 0 && (
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            {q ? `${totalSkus} SKU${totalSkus !== 1 ? "s" : ""} encontrado${totalSkus !== 1 ? "s" : ""}` : `${totalSkus} SKU${totalSkus !== 1 ? "s" : ""} no catálogo`}
            {" · "}{grupos.length} grupo{grupos.length !== 1 ? "s" : ""}
          </p>
        )}

        {/* Estados */}
        {loading && (
          <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/60 shadow-sm p-16 text-center">
            <span className="inline-block w-10 h-10 border-2 border-neutral-200 dark:border-neutral-700 border-t-emerald-500 rounded-full animate-spin mb-4" />
            <p className="text-sm text-neutral-600 dark:text-neutral-400">Carregando catálogo…</p>
          </div>
        )}
        {error && (
          <div className="rounded-xl border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/40 p-4 text-sm text-red-700 dark:text-red-200 font-medium">{error}</div>
        )}
        {!loading && !error && grupos.length === 0 && (
          <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/60 shadow-sm p-16 text-center">
            <div className="w-14 h-14 rounded-2xl bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-neutral-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M16.5 9.4 7.55 4.24" /><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /></svg>
            </div>
            <p className="text-neutral-500 dark:text-neutral-400 text-sm font-medium">{q ? "Nenhum SKU encontrado para essa busca." : "Catálogo vazio."}</p>
          </div>
        )}

        {/* Lista de grupos */}
        <div className="space-y-5">
          {grupos.map((grupo) => {
            const expandido = gruposExpandidos.has(grupo.paiKey);
            const total = (grupo.pai ? 1 : 0) + grupo.filhos.length;
            const rep = infoDoGrupo(grupo);
            const nomeGrupo = rep ? str(rep.nome_produto) : "";
            const dimensoesGrupo = rep
              ? [
                  rep.comprimento_cm != null && rep.largura_cm != null && rep.altura_cm != null
                    ? `${rep.comprimento_cm}×${rep.largura_cm}×${rep.altura_cm} cm`
                    : str(rep.dimensoes_pacote),
                  rep.peso_kg ? `${rep.peso_kg} kg` : "",
                ].filter(Boolean).join(" · ")
              : "";
            const descricaoExpandida = descricaoExpandidaPorGrupo.has(grupo.paiKey);
            return (
              <div key={grupo.paiKey} className="rounded-2xl border border-neutral-200/80 dark:border-neutral-700/50 bg-white dark:bg-neutral-900/90 shadow-md hover:shadow-lg hover:border-neutral-300/60 dark:hover:border-neutral-600/50 transition-all duration-300">
                <button
                  type="button"
                  onClick={() => toggleGrupo(grupo.paiKey)}
                  className="w-full flex items-center justify-between px-4 sm:px-5 py-3.5 text-left hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition border-l-4 border-l-transparent hover:border-l-blue-500 dark:hover:border-l-blue-500"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="font-mono text-xs font-bold text-white bg-neutral-600 dark:bg-neutral-500 rounded-lg px-2.5 py-1 shrink-0">{grupo.paiKey}</span>
                    {nomeGrupo && (
                      <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 truncate">
                        {nomeGrupo}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); abrirTabelaMedidas(grupo.paiKey); }}
                      className="text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:text-blue-600 dark:hover:text-blue-400 border border-neutral-300 dark:border-neutral-600 rounded-lg px-2.5 py-1.5 hover:border-blue-400 dark:hover:border-blue-500 transition"
                    >
                      Tabela de medidas
                    </button>
                    <span className="text-xs text-neutral-500 dark:text-neutral-400 tabular-nums">{total} {total === 1 ? "item" : "itens"}</span>
                    <span className="text-neutral-400 dark:text-neutral-500 text-sm font-medium">{expandido ? "▼" : "▶"}</span>
                  </div>
                </button>
                {expandido && (
                  <div className="px-3 sm:px-4 pb-4 border-t border-neutral-200/80 dark:border-[var(--card-border)]/80 space-y-4 pt-4">
                    {rep && (
                      <ProductInfoBlock
                        rep={rep}
                        nomeGrupo={nomeGrupo}
                        dimensoesGrupo={dimensoesGrupo}
                        descricaoExpandida={descricaoExpandida}
                        onToggleDescricao={() => toggleDescricaoGrupo(grupo.paiKey)}
                      />
                    )}
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                      {grupo.pai && <ItemCard item={grupo.pai} sóVariante />}
                      {grupo.filhos.map((item) => (
                        <ItemCard key={item.id} item={item} sóVariante />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Modal Tabela de medidas */}
      {modalTabelaGrupoKey != null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setModalTabelaGrupoKey(null)}>
          <div className="bg-white dark:bg-[var(--card)] rounded-2xl border border-neutral-200 dark:border-[var(--card-border)] shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200 dark:border-[var(--card-border)] bg-neutral-50/80 dark:bg-neutral-800/50">
              <h3 className="font-semibold text-neutral-900 dark:text-neutral-100">Tabela de medidas · <span className="font-mono text-neutral-600 dark:text-neutral-400">{modalTabelaGrupoKey}</span></h3>
              <button type="button" onClick={() => setModalTabelaGrupoKey(null)} className="text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 text-xl leading-none w-8 h-8 rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-700 flex items-center justify-center">×</button>
            </div>
            <div className="p-4 overflow-auto flex-1">
              {loadingTabela && <div className="flex items-center gap-2 text-sm text-neutral-500 py-6"><span className="inline-block w-5 h-5 border-2 border-neutral-300 border-t-blue-500 rounded-full animate-spin" /> Carregando…</div>}
              {!loadingTabela && !tabelaMedidasData && <p className="text-sm text-neutral-500">Nenhuma tabela de medidas cadastrada para este grupo.</p>}
              {!loadingTabela && tabelaMedidasData && (() => {
                const tipo = (tabelaMedidasData.tipo_produto ?? "generico") as TipoProduto;
                const colunas = getColunasTabelaMedidas(tipo);
                const medidas = tabelaMedidasData.medidas ?? {};
                const firstRow = Object.values(medidas)[0];
                const colKeys = firstRow ? Object.keys(firstRow) : colunas.map((c) => c.key);
                return (
                  <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-[var(--card-border)]">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="bg-neutral-100 dark:bg-neutral-800/60 border-b border-neutral-200 dark:border-[var(--card-border)]">
                          <th className="px-2 py-1.5 text-left font-medium text-neutral-600 dark:text-neutral-400">Tamanho</th>
                          {colKeys.map((col) => {
                            const label = colunas.find((c) => c.key === col)?.label ?? `${col.replace(/_/g, " ")} (cm)`;
                            return <th key={col} className="px-2 py-1.5 text-left font-medium text-neutral-600 dark:text-neutral-400">{label}</th>;
                          })}
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(medidas).map(([tam, row]) => (
                          <tr key={tam} className="border-b border-neutral-200/60 dark:border-[var(--card-border)]/60">
                            <td className="px-2 py-1.5 font-medium text-neutral-900 dark:text-neutral-100">{tam}</td>
                            {colKeys.map((col) => (
                              <td key={col} className="px-2 py-1.5 text-neutral-700 dark:text-neutral-300">{row && Number.isFinite(row[col]) ? row[col] : "—"}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      <SellerNav active="catalogo" />
    </div>
  );
}
