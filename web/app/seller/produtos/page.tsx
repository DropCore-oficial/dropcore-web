"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { SellerNav } from "../SellerNav";
import { normalizarFornecedoresSellerApi, type FornecedorSellerListaRow } from "@/lib/mapFornecedorSellerPublico";
import {
  agruparPaiFilhosSeller as agruparPaiFilhos,
  normalizarItemsSellerCatalogo as normalizarItems,
  strSellerCatalogo as str,
  isSementeSellerCatalogo as isSemente,
  isGrupoOcultoSellerCatalogo as isGrupoOculto,
  type SellerCatalogoItem,
} from "@/components/seller/SellerCatalogoGrupoUi";
import { skuContaLimiteHabilitacaoSeller } from "@/lib/sellerSkuHabilitado";
import { skuProntoParaVender } from "@/lib/sellerSkuReadiness";
import { toTitleCase } from "@/lib/formatText";
import { getColunasTabelaMedidas, type TipoProduto } from "@/lib/tipoProduto";
import { CatalogoV2ResumoTopo } from "@/components/seller/catalogo/v2/CatalogoV2ResumoTopo";
import { CatalogoV2ProdutoCard } from "@/components/seller/catalogo/v2/CatalogoV2ProdutoCard";
import { linhasGrupo, type GrupoCatalogoV2 } from "@/components/seller/catalogo/v2/aggregates";

type VinculoFornecedorMeta = {
  fornecedor_id: string | null;
  vinculado_em: string | null;
  pode_trocar_agora: boolean;
  pode_trocar_fornecedor_a_partir_de: string | null;
  meses_minimos: number;
  liberado_antecipado: boolean;
};

function isAtivoItem(item: SellerCatalogoItem): boolean {
  return str(item.status).toLowerCase() === "ativo";
}

export default function SellerProdutosPage() {
  const router = useRouter();

  const [q, setQ] = useState("");
  const [items, setItems] = useState<SellerCatalogoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [gestaoPaiKey, setGestaoPaiKey] = useState<string | null>(null);
  const [filtroStatus, setFiltroStatus] = useState<"todos" | "ativos" | "pendencias" | "sem_estoque" | "desligados">("todos");
  const [painelFiltros, setPainelFiltros] = useState(false);
  const [catalogMeta, setCatalogMeta] = useState<{
    plano: string | null;
    habilitados_count: number;
    habilitados_max: number | null;
    tabela_ok: boolean;
    sem_armazem_ligado: boolean;
  }>({ plano: null, habilitados_count: 0, habilitados_max: null, tabela_ok: true, sem_armazem_ligado: false });
  const [toggleLoadingId, setToggleLoadingId] = useState<string | null>(null);
  const [bulkPaiKey, setBulkPaiKey] = useState<string | null>(null);
  const [fornecedorLigadoId, setFornecedorLigadoId] = useState<string | null>(null);
  const [fornecedoresLista, setFornecedoresLista] = useState<FornecedorSellerListaRow[] | null>(null);
  const [vinculoSelectId, setVinculoSelectId] = useState("");
  const [vinculoSaving, setVinculoSaving] = useState(false);
  const [vinculoAceiteUso, setVinculoAceiteUso] = useState(false);
  const [fornecedoresLoadErr, setFornecedoresLoadErr] = useState<string | null>(null);
  const [vinculoMeta, setVinculoMeta] = useState<VinculoFornecedorMeta | null>(null);

  const [modalTabelaGrupoKey, setModalTabelaGrupoKey] = useState<string | null>(null);
  const [tabelaMedidasData, setTabelaMedidasData] = useState<{ tipo_produto: string; medidas: Record<string, Record<string, number>> } | null>(null);
  const [loadingTabela, setLoadingTabela] = useState(false);

  const precisaAceiteVinculo = useMemo(() => {
    const novo = vinculoSelectId.trim() || null;
    const cur = fornecedorLigadoId?.trim() || null;
    return Boolean(novo) && novo !== cur;
  }, [vinculoSelectId, fornecedorLigadoId]);

  const vinculoAlterado = useMemo(() => {
    const sel = vinculoSelectId.trim() || null;
    const lig = fornecedorLigadoId?.trim() || null;
    return sel !== lig;
  }, [vinculoSelectId, fornecedorLigadoId]);

  const nomeArmazemLigado = useMemo(() => {
    const id = fornecedorLigadoId?.trim();
    if (!id || !fornecedoresLista) return null;
    const row = fornecedoresLista.find((f) => f.id === id);
    if (!row) return null;
    return row.local_resumido ? `${row.nome_publico} · ${row.local_resumido}` : row.nome_publico;
  }, [fornecedorLigadoId, fornecedoresLista]);

  const planoSellerPro = useMemo(() => String(catalogMeta.plano ?? "").trim().toLowerCase() === "pro", [catalogMeta.plano]);

  useEffect(() => {
    setVinculoAceiteUso(false);
  }, [vinculoSelectId]);

  const postHabilitar = useCallback(
    async (accessToken: string, skuId: string): Promise<{ ok: boolean; habilitados_count?: number; error?: string }> => {
      const res = await fetch("/api/seller/catalogo/habilitados", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sku_id: skuId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, error: json.error || "Erro ao habilitar" };
      const cnt = typeof json.habilitados_count === "number" ? json.habilitados_count : undefined;
      return { ok: true, habilitados_count: cnt };
    },
    [],
  );

  const deleteHabilitar = useCallback(async (accessToken: string, skuId: string): Promise<{ ok: boolean; habilitados_count?: number; error?: string }> => {
    const res = await fetch(`/api/seller/catalogo/habilitados?sku_id=${encodeURIComponent(skuId)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: json.error || "Erro ao desabilitar" };
    const cnt = typeof json.habilitados_count === "number" ? json.habilitados_count : undefined;
    return { ok: true, habilitados_count: cnt };
  }, []);

  const setSkuHabilitado = useCallback(
    async (item: SellerCatalogoItem, ativar: boolean) => {
      if (!item.id) return;
      setToggleLoadingId(item.id);
      try {
        const {
          data: { session },
        } = await supabaseBrowser.auth.getSession();
        if (!session?.access_token) {
          router.replace("/seller/login");
          return;
        }
        const r = ativar ? await postHabilitar(session.access_token, item.id) : await deleteHabilitar(session.access_token, item.id);
        if (!r.ok) throw new Error(r.error || "Erro ao atualizar habilitação");
        setItems((prev) => prev.map((row) => (row.id === item.id ? { ...row, habilitado_venda: ativar } : row)));
        if (typeof r.habilitados_count === "number") {
          setCatalogMeta((m) => ({ ...m, habilitados_count: r.habilitados_count! }));
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Erro ao atualizar habilitação");
      } finally {
        setToggleLoadingId(null);
      }
    },
    [router, postHabilitar, deleteHabilitar],
  );

  const bulkEnableValidas = useCallback(
    async (grupo: GrupoCatalogoV2) => {
      setBulkPaiKey(grupo.paiKey);
      setError(null);
      try {
        const {
          data: { session },
        } = await supabaseBrowser.auth.getSession();
        if (!session?.access_token) {
          router.replace("/seller/login");
          return;
        }
        const targets = linhasGrupo(grupo.pai, grupo.filhos).filter(
          (it) =>
            skuContaLimiteHabilitacaoSeller(it.sku) && isAtivoItem(it) && skuProntoParaVender(it) && !it.habilitado_venda,
        );
        for (const it of targets) {
          const r = await postHabilitar(session.access_token, it.id);
          if (!r.ok) throw new Error(r.error || "Erro ao habilitar em lote");
          setItems((prev) => prev.map((row) => (row.id === it.id ? { ...row, habilitado_venda: true } : row)));
          if (typeof r.habilitados_count === "number") {
            setCatalogMeta((m) => ({ ...m, habilitados_count: r.habilitados_count! }));
          }
        }
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Erro ao habilitar em lote");
      } finally {
        setBulkPaiKey(null);
      }
    },
    [router, postHabilitar],
  );

  const bulkDisableAll = useCallback(
    async (grupo: GrupoCatalogoV2) => {
      setBulkPaiKey(grupo.paiKey);
      setError(null);
      try {
        const {
          data: { session },
        } = await supabaseBrowser.auth.getSession();
        if (!session?.access_token) {
          router.replace("/seller/login");
          return;
        }
        const targets = linhasGrupo(grupo.pai, grupo.filhos).filter(
          (it) => skuContaLimiteHabilitacaoSeller(it.sku) && it.habilitado_venda === true,
        );
        for (const it of targets) {
          const r = await deleteHabilitar(session.access_token, it.id);
          if (!r.ok) throw new Error(r.error || "Erro ao desabilitar em lote");
          setItems((prev) => prev.map((row) => (row.id === it.id ? { ...row, habilitado_venda: false } : row)));
          if (typeof r.habilitados_count === "number") {
            setCatalogMeta((m) => ({ ...m, habilitados_count: r.habilitados_count! }));
          }
        }
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Erro ao desabilitar em lote");
      } finally {
        setBulkPaiKey(null);
      }
    },
    [router, deleteHabilitar],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      setFornecedoresLoadErr(null);
      try {
        const {
          data: { session },
        } = await supabaseBrowser.auth.getSession();
        if (!session?.access_token) {
          router.replace("/seller/login");
          return;
        }
        const authH = { Authorization: `Bearer ${session.access_token}` };
        const [resCat, resForn] = await Promise.all([
          fetch(`/api/seller/catalogo`, { headers: authH, cache: "no-store" }),
          fetch(`/api/seller/fornecedores`, { headers: authH }),
        ]);
        const jsonCat = await resCat.json().catch(() => ({}));
        const jsonForn = await resForn.json().catch(() => ({}));
        if (cancelled) return;
        if (!resCat.ok) throw new Error(jsonCat.error || "Erro ao buscar catálogo");
        setItems(normalizarItems(jsonCat.items));
        const fid = jsonCat.fornecedor_id;
        const fidNorm = typeof fid === "string" && fid.trim() ? fid.trim() : null;
        setFornecedorLigadoId(fidNorm);
        setVinculoSelectId(fidNorm ?? "");
        setCatalogMeta({
          plano: jsonCat.seller_plano ?? null,
          habilitados_count: typeof jsonCat.habilitados_count === "number" ? jsonCat.habilitados_count : 0,
          habilitados_max: jsonCat.habilitados_max === null || jsonCat.habilitados_max === undefined ? null : Number(jsonCat.habilitados_max),
          tabela_ok: jsonCat.habilitados_tabela_ok !== false,
          sem_armazem_ligado: typeof jsonCat.sem_armazem_ligado === "boolean" ? jsonCat.sem_armazem_ligado : !fidNorm,
        });
        if (resForn.ok && jsonForn.ok) {
          setFornecedoresLista(normalizarFornecedoresSellerApi(jsonForn.fornecedores));
          setVinculoMeta((jsonForn.vinculo ?? null) as VinculoFornecedorMeta | null);
        } else {
          setFornecedoresLista([]);
          setVinculoMeta(null);
          setFornecedoresLoadErr(jsonForn.error || "Não foi possível carregar a lista de fornecedores.");
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Erro inesperado");
          setItems([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function gravarVinculoFornecedor() {
    setVinculoSaving(true);
    setError(null);
    try {
      const {
        data: { session },
      } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) {
        router.replace("/seller/login");
        return;
      }
      const novo = vinculoSelectId.trim() ? vinculoSelectId.trim() : null;
      const cur = fornecedorLigadoId?.trim() || null;
      const body: { fornecedor_id: string | null; aceite_uso_operacional?: boolean } = { fornecedor_id: novo };
      if (novo && novo !== cur) {
        if (!vinculoAceiteUso) throw new Error("Marque a confirmação de uso operacional para vincular este armazém.");
        body.aceite_uso_operacional = true;
      }
      const res = await fetch("/api/seller/fornecedor-vinculo", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Erro ao gravar vínculo");
      const newId = typeof json.fornecedor_id === "string" && json.fornecedor_id ? json.fornecedor_id : null;
      setFornecedorLigadoId(newId);
      setVinculoSelectId(newId ?? "");
      const r2 = await fetch("/api/seller/fornecedores", { headers: { Authorization: `Bearer ${session.access_token}` } });
      const j2 = await r2.json().catch(() => ({}));
      if (r2.ok && j2.ok) {
        setVinculoMeta((j2.vinculo ?? null) as VinculoFornecedorMeta | null);
        setFornecedoresLista(normalizarFornecedoresSellerApi(j2.fornecedores));
      }
      const resCat = await fetch(`/api/seller/catalogo`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });
      const jCat = await resCat.json().catch(() => ({}));
      if (resCat.ok) {
        setItems(normalizarItems(jCat.items));
        setCatalogMeta((m) => ({
          ...m,
          sem_armazem_ligado: typeof jCat.sem_armazem_ligado === "boolean" ? jCat.sem_armazem_ligado : !jCat.fornecedor_id,
          plano: jCat.seller_plano ?? m.plano,
          habilitados_count: typeof jCat.habilitados_count === "number" ? jCat.habilitados_count : m.habilitados_count,
          habilitados_max: jCat.habilitados_max === null || jCat.habilitados_max === undefined ? null : Number(jCat.habilitados_max),
          tabela_ok: jCat.habilitados_tabela_ok !== false,
        }));
      }
      setVinculoAceiteUso(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao gravar vínculo");
    } finally {
      setVinculoSaving(false);
    }
  }

  const itemsFiltradosBusca = useMemo(() => {
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

  const gruposBase = useMemo(() => agruparPaiFilhos(itemsFiltradosBusca), [itemsFiltradosBusca]);

  const grupos = useMemo(() => {
    if (filtroStatus === "todos") return gruposBase;
    return gruposBase.filter((g) => {
      const list = [g.pai, ...g.filhos].filter(Boolean) as SellerCatalogoItem[];
      if (filtroStatus === "ativos") {
        return list.some((it) => str(it.status).toLowerCase() === "ativo" && (it.estoque_atual ?? 0) > 0);
      }
      if (filtroStatus === "desligados") {
        return list.some((it) => str(it.status).toLowerCase() !== "ativo");
      }
      if (filtroStatus === "sem_estoque") {
        return list.some((it) => str(it.status).toLowerCase() === "ativo" && (it.estoque_atual ?? 0) <= 0);
      }
      return list.some((it) => !skuProntoParaVender(it));
    });
  }, [gruposBase, filtroStatus]);

  const gruposResumo = useMemo(() => agruparPaiFilhos(items), [items]);

  const skusVisiveis = useMemo(() => items.filter((i) => !isSemente(i) && !isGrupoOculto(i.sku)), [items]);

  const resumoTopo = useMemo(() => {
    const totalProdutos = gruposResumo.length;
    const skusDisponiveis = skusVisiveis.length;
    const skusComPendencia = skusVisiveis.filter((i) => !skuProntoParaVender(i)).length;
    return { totalProdutos, skusDisponiveis, skusComPendencia };
  }, [gruposResumo.length, skusVisiveis]);

  const abrirTabelaMedidas = useCallback(async (grupoKey: string) => {
    setModalTabelaGrupoKey(grupoKey);
    setTabelaMedidasData(null);
    setLoadingTabela(true);
    try {
      const {
        data: { session },
      } = await supabaseBrowser.auth.getSession();
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

  return (
    <div className="min-h-screen bg-[#f6f6f7] text-[#202223] dark:bg-[#0F1115] dark:text-[#e3e5e8] pt-[calc(3rem+env(safe-area-inset-top,0px))] md:pt-14 pb-[calc(6.25rem+env(safe-area-inset-bottom,0px))] md:pb-8">
      <div className="mx-auto w-full max-w-[1040px] px-3 py-3 dropcore-px-wide sm:px-4 md:py-4">
        <div className="overflow-hidden rounded-xl border border-[#dfe3e8] bg-white shadow-[0_1px_0_rgba(0,0,0,0.03)] dark:border-[#2e3240] dark:bg-[#1a1d24] dark:shadow-none sm:px-4 sm:py-4">
          <div className="px-3 py-3 sm:px-0 sm:pt-1">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#008060] dark:text-[#45b891]">Catálogo · Seller</p>
              <h1 className="mt-1 text-xl font-semibold tracking-tight text-[#202223] dark:text-white">Produtos</h1>
              <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-[#5c5f62] dark:text-[#9ca3a8]">
                O fornecedor mantém o cadastro no armazém;{" "}
                <span className="font-medium text-[#202223] dark:text-[#e3e5e8]">aqui você escolhe o que a API ERP pode vender</span>.
              </p>
            </div>
            <Link
              href="/seller/integracoes-erp/mapeamento"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[#d7dbe0] bg-white px-3 py-2 text-[13px] font-medium text-[#1f2933] no-underline transition hover:border-[#bfc5cc] hover:bg-[#fafbfb] dark:border-[#2e3240] dark:bg-[#14171c] dark:text-[#d2d8de] dark:hover:border-[#3a404d] dark:hover:bg-[#20242b]"
            >
              <svg className="h-4 w-4 opacity-70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
              Mapeamento SKU
            </Link>
          </div>
          <div className="mt-3.5 flex flex-col gap-2 sm:mt-5 sm:flex-row sm:flex-wrap sm:items-stretch">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onBlur={() => setQ(toTitleCase(q))}
              placeholder="Buscar por nome, SKU, cor ou tamanho…"
              className="min-h-[44px] min-w-0 flex-1 rounded-lg border border-[#c8cdd2] bg-white px-3.5 py-2 text-[15px] text-[#202223] placeholder:text-[#8c9196] shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)] transition focus:border-[#8f99a5] focus:outline-none focus:ring-2 focus:ring-[#5c6c7a]/14 dark:border-[#3d4450] dark:bg-[#14171c] dark:text-white dark:placeholder:text-[#6d7175] sm:min-h-10 sm:text-sm"
            />
            <div className="flex gap-2 sm:shrink-0">
              {q ? (
                <button
                  type="button"
                  onClick={() => setQ("")}
                  className="min-h-[44px] rounded-lg border border-[#c9cccf] bg-white px-3.5 text-sm font-medium text-[#202223] hover:bg-[#f6f6f7] dark:border-[#3d4450] dark:bg-[#1a1d24] dark:text-[#e3e5e8] dark:hover:bg-[#252a32] sm:min-h-10"
                >
                  Limpar
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setPainelFiltros((p) => !p)}
                aria-expanded={painelFiltros}
                className={`min-h-[44px] min-w-[6.5rem] rounded-lg border px-3.5 text-sm font-medium transition sm:min-h-10 ${
                  painelFiltros
                    ? "border-[#2f7f64] bg-[#e9f4ef] text-[#14513d] dark:border-[#2f7f64] dark:bg-[#008060]/20 dark:text-[#a3e5c1]"
                    : "border-[#c9cccf] bg-white text-[#202223] hover:bg-[#f6f6f7] dark:border-[#3d4450] dark:bg-[#1a1d24] dark:text-[#e3e5e8] dark:hover:bg-[#252a32]"
                }`}
              >
                Filtros
              </button>
            </div>
          </div>
          {!loading && !error && (
            <>
              <div className="mt-3 md:hidden">
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#6d7175] dark:text-[#8c9196]">Visão rápida</p>
                <div className="-mx-1 overflow-x-auto px-1 pb-0.5 [scrollbar-width:thin]">
                  <CatalogoV2ResumoTopo
                    variant="stripScroll"
                    totalProdutos={resumoTopo.totalProdutos}
                    skusDisponiveis={resumoTopo.skusDisponiveis}
                    skusHabilitados={catalogMeta.habilitados_count}
                    skusComPendencia={resumoTopo.skusComPendencia}
                    habilitadosMax={catalogMeta.habilitados_max}
                  />
                </div>
              </div>
              <div className="mt-3.5 hidden md:block">
                <CatalogoV2ResumoTopo
                  variant="strip"
                  totalProdutos={resumoTopo.totalProdutos}
                  skusDisponiveis={resumoTopo.skusDisponiveis}
                  skusHabilitados={catalogMeta.habilitados_count}
                  skusComPendencia={resumoTopo.skusComPendencia}
                  habilitadosMax={catalogMeta.habilitados_max}
                />
              </div>
            </>
          )}
          </div>
        </div>

        {painelFiltros && (
          <div className="mt-3 rounded-xl border border-[#dfe3e8] bg-white p-4 shadow-[0_1px_0_rgba(0,0,0,0.03)] dark:border-[#2e3240] dark:bg-[#1a1d24] dark:shadow-none">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-[#6d7175] dark:text-[#8c9196]">Filtros rápidos</p>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  { key: "todos" as const, label: "Todos" },
                  { key: "ativos" as const, label: "Ativos" },
                  { key: "pendencias" as const, label: "Com pendência" },
                  { key: "sem_estoque" as const, label: "Sem estoque" },
                  { key: "desligados" as const, label: "Desligados" },
                ] as const
              ).map((f) => (
                <button
                  key={f.key}
                  type="button"
                  disabled={f.key === "pendencias" && resumoTopo.skusComPendencia === 0}
                  onClick={() => {
                    setFiltroStatus(f.key);
                  }}
                  className={`min-h-[40px] rounded-full border px-4 py-2 text-sm font-medium transition ${
                    filtroStatus === f.key
                      ? f.key === "pendencias"
                        ? "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-100"
                        : "border-[#008060] bg-[#e3f1ed] text-[#0c3d2a] dark:border-[#008060] dark:bg-[#008060]/20 dark:text-[#a3e5c1]"
                      : "border-[#e3e5e8] bg-[#fafbfb] text-[#5c5f62] hover:bg-[#f6f6f7] dark:border-[#2e3240] dark:bg-[#14171c] dark:text-[#8c9196] dark:hover:bg-[#252a32]"
                  } disabled:cursor-not-allowed disabled:opacity-45`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <details className="mt-3 text-xs text-[#6d7175] dark:text-[#8c9196] [&_summary]:cursor-pointer">
              <summary className="font-medium text-[#202223] dark:text-[#e3e5e8]">O que é “pronto para vender”?</summary>
              <p className="mt-2 max-w-2xl text-[13px] leading-relaxed">
                São os dados que o <strong>fornecedor</strong> cadastrou no produto no armazém: nome, foto ou link de fotos, custo,
                estoque &gt; 0, medidas do pacote, NCM (8 dígitos), descrição com pelo menos 20 caracteres. O seller{" "}
                <strong>não edita</strong> isso nesta tela — se algo aparecer em pendência, o ajuste é feito pelo fornecedor.
              </p>
            </details>
          </div>
        )}

        <div className="mt-2.5 flex items-start gap-3 rounded-xl border border-[#dfe3e8] bg-white px-3 py-3 shadow-[0_1px_0_rgba(0,0,0,0.03)] dark:border-[#2e3240] dark:bg-[#1a1d24] dark:ring-white/[0.04] sm:mt-3 sm:px-4 sm:py-3.5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f0f9f4] text-[#008060] dark:bg-[#008060]/15 dark:text-[#6fd4b0]">
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 9h18v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9Z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 9V7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2" />
            </svg>
          </span>
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-[#6d7175] dark:text-[#8c9196]">Armazém</span>
              {fornecedorLigadoId?.trim() ? (
                <span className="inline-flex items-center rounded-full bg-[#e3f1ed] px-2 py-0.5 text-[11px] font-semibold text-[#0c3d2a] dark:bg-[#008060]/25 dark:text-[#a3e5c1]">
                  API ligada
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                  Pendente
                </span>
              )}
            </div>
            <p className="text-[14px] font-medium leading-snug text-[#202223] dark:text-[#e3e5e8]">
              {nomeArmazemLigado ?? (fornecedorLigadoId ? "—" : "Nenhum armazém vinculado")}
            </p>
            {!planoSellerPro && catalogMeta.tabela_ok && (
              <p className="text-[12px] text-[#6d7175] dark:text-[#8c9196]">
                Plano Starter: até {catalogMeta.habilitados_max ?? 15} SKUs na API ·{" "}
                <span className="tabular-nums font-medium text-[#202223] dark:text-[#c9d0d5]">{catalogMeta.habilitados_count}</span> habilitados
              </p>
            )}
          </div>
        </div>

        <details className="group mt-2.5 overflow-hidden rounded-xl border border-[#dfe3e8] bg-white shadow-[0_1px_0_rgba(0,0,0,0.03)] transition open:shadow-sm dark:border-[#2e3240] dark:bg-[#1a1d24] dark:ring-white/[0.04]">
          <summary className="cursor-pointer list-none px-3 py-3 text-sm font-medium text-[#202223] marker:content-none hover:bg-[#fafbfb] dark:text-[#e3e5e8] dark:hover:bg-[#20242b] sm:px-3.5 [&::-webkit-details-marker]:hidden">
            Configurar armazém e vínculo
          </summary>
          <div className="space-y-4 border-t border-[#e3e5e8] px-3 pb-4 pt-3 dark:border-[#2e3240] sm:px-3.5">
          {fornecedoresLoadErr && <p className="text-sm text-warning">{fornecedoresLoadErr}</p>}
          {fornecedoresLista?.length === 0 ? (
            <p className="text-sm text-muted">Não há fornecedores na organização.</p>
          ) : (
            <>
              <label className="block space-y-2">
                <span className="text-sm text-muted">Ligar catálogo da API a</span>
                <select
                  value={vinculoSelectId}
                  onChange={(e) => setVinculoSelectId(e.target.value)}
                  className="h-10 w-full rounded-md border border-[#c9cccf] bg-white px-3 text-sm text-[#202223] shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)] dark:border-[#3d4450] dark:bg-[#14171c] dark:text-[#e3e5e8]"
                >
                  <option value="">— Nenhum (só se a org autorizar) —</option>
                  {(fornecedoresLista ?? []).map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.nome_publico}
                      {f.local_resumido ? ` · ${f.local_resumido}` : ""}
                    </option>
                  ))}
                </select>
              </label>
              {vinculoMeta && !vinculoMeta.pode_trocar_agora && vinculoMeta.pode_trocar_fornecedor_a_partir_de && (
                <p className="text-sm text-muted">
                  Troca de armazém liberada a partir de{" "}
                  {new Date(vinculoMeta.pode_trocar_fornecedor_a_partir_de).toLocaleDateString("pt-BR")} (mín. {vinculoMeta.meses_minimos} meses), salvo liberação da organização.
                </p>
              )}
              {vinculoAlterado && precisaAceiteVinculo && (
                <label className="flex cursor-pointer items-start gap-2 text-sm text-foreground">
                  <input type="checkbox" checked={vinculoAceiteUso} onChange={(e) => setVinculoAceiteUso(e.target.checked)} className="mt-1 h-4 w-4 accent-[var(--accent)]" />
                  <span>Confirmo o uso operacional deste armazém ao vincular.</span>
                </label>
              )}
              {vinculoAlterado ? (
                <button
                  type="button"
                  disabled={
                    vinculoSaving || (vinculoMeta != null && !vinculoMeta.pode_trocar_agora && vinculoAlterado) || (precisaAceiteVinculo && !vinculoAceiteUso)
                  }
                  onClick={() => void gravarVinculoFornecedor()}
                  className="h-10 w-full rounded-md bg-[#008060] px-4 text-sm font-semibold text-white shadow-[inset_0_-1px_0_rgba(0,0,0,0.15)] hover:bg-[#006e52] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                >
                  {vinculoSaving ? "Salvando..." : "Gravar armazém"}
                </button>
              ) : fornecedorLigadoId?.trim() ? (
                <div
                  role="status"
                  className="flex w-full flex-col gap-3 rounded-xl border border-success/30 bg-success/10 px-4 py-3 sm:flex-row sm:items-center"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-success text-white shadow-sm">
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground">Armazém gravado</p>
                    <p className="mt-0.5 text-sm text-muted">
                      O catálogo da API está ligado a{" "}
                      <span className="font-medium text-foreground">{nomeArmazemLigado ?? "este armazém"}</span>.
                      {vinculoMeta?.vinculado_em ? (
                        <>
                          {" "}
                          Vinculado em{" "}
                          {new Date(vinculoMeta.vinculado_em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}.
                        </>
                      ) : null}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted">
                  Nenhum armazém ligado. Escolha um na lista acima e use «Gravar armazém» para carregar os SKUs.
                </p>
              )}
            </>
          )}
          </div>
        </details>

        {!loading &&
          !error &&
          catalogMeta.sem_armazem_ligado &&
          fornecedoresLista !== null &&
          fornecedoresLista.length > 0 && (
            <section className="mt-6 overflow-hidden rounded-2xl border border-border-subtle bg-card shadow-sm">
              <div className="h-1 w-full bg-accent" aria-hidden />
              <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:px-6">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-card-border bg-background text-muted">
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 9h18v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9Z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 9V7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-sm font-semibold text-foreground">Escolha um armazém</p>
                  <p className="text-sm leading-relaxed text-muted">
                    Com «Nenhum» no seletor, <span className="font-medium text-foreground">não listamos SKUs</span> da organização aqui.
                    Vincule o armazém acima para carregar preços, variações e habilitações para a API ERP.
                  </p>
                </div>
              </div>
            </section>
          )}

        {!loading && !catalogMeta.tabela_ok && (
          <div className="mt-6 rounded-2xl border border-warning/35 bg-warning/10 px-5 py-4 text-sm text-foreground md:px-6">
            A lista de SKUs habilitados para venda ainda não está disponível na base (migração pendente). Execute o script{" "}
            <code className="rounded border border-card-border bg-card px-1.5 py-0.5 font-mono text-xs">web/scripts/create-seller-skus-habilitados.sql</code> no
            Supabase para ativar o limite de 15 no Starter e a integração ERP alinhada ao catálogo.
          </div>
        )}

        <div className="mt-4 space-y-3 md:space-y-3.5">
          {loading && (
            <div className="rounded-2xl border border-[#e3e5e8] bg-white p-10 text-center shadow-[0_2px_16px_-8px_rgba(0,0,0,0.08)] dark:border-[#2e3240] dark:bg-[#1a1d24] dark:shadow-none">
              <span className="mx-auto mb-4 inline-flex h-11 w-11 animate-spin rounded-full border-2 border-[#e3e5e8] border-t-[#008060] dark:border-[#3d4450]" />
              <div className="mx-auto mb-3 h-2 max-w-[180px] animate-pulse rounded-full bg-[#e8eaed] dark:bg-[#2e3240]" />
              <p className="text-sm font-medium text-[#202223] dark:text-[#e3e5e8]">Carregando catálogo</p>
              <p className="mt-1 text-[13px] text-[#6d7175] dark:text-[#8c9196]">Buscando produtos do armazém…</p>
            </div>
          )}
          {error && (
            <div className="rounded-2xl border border-red-200/90 bg-red-50/95 p-4 text-sm font-medium text-red-900 shadow-sm dark:border-red-900/45 dark:bg-red-950/45 dark:text-red-200">
              {error}
            </div>
          )}
          {!loading && !error && grupos.length === 0 && (
            <div className="rounded-2xl border border-dashed border-[#d3d6d9] bg-[#fafbfb] px-6 py-12 text-center dark:border-[#3d4450] dark:bg-[#16191e]">
              <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-[#e3e5e8] dark:bg-[#1a1d24] dark:ring-[#2e3240]">
                <svg className="h-7 w-7 text-[#b0b5ba] dark:text-[#6d7175]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 01-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 011-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 011.52 0C14.51 3.81 17 5 19 5a1 1 0 011 1v7z" />
                </svg>
              </span>
              <p className="text-[15px] font-semibold text-[#202223] dark:text-[#e3e5e8]">Nada para mostrar aqui</p>
              <p className="mx-auto mt-2 max-w-sm text-[13px] leading-relaxed text-[#6d7175] dark:text-[#8c9196]">
                {q
                  ? "Nenhum produto encontrado para essa busca."
                  : filtroStatus === "pendencias"
                    ? "Nenhum SKU com pendência neste recorte."
                    : filtroStatus === "desligados"
                      ? "Nenhum grupo com SKU desligado neste recorte."
                      : "Nenhum produto disponível para este armazém."}
              </p>
            </div>
          )}

          {!loading &&
            !error &&
            grupos.map((grupo) => (
              <CatalogoV2ProdutoCard
                key={grupo.paiKey}
                grupo={grupo}
                fornecedorNome={nomeArmazemLigado}
                expandido={gestaoPaiKey === grupo.paiKey}
                onToggleExpand={() =>
                  setGestaoPaiKey((prev) => (prev === grupo.paiKey ? null : grupo.paiKey))
                }
                onOpenMedidas={() => void abrirTabelaMedidas(grupo.paiKey)}
                bulkLoading={bulkPaiKey === grupo.paiKey}
                onBulkEnableValidas={() => void bulkEnableValidas(grupo)}
                onBulkDisableAll={() => void bulkDisableAll(grupo)}
                toggleLoadingId={toggleLoadingId}
                onToggleOne={(item, ativar) => void setSkuHabilitado(item, ativar)}
              />
            ))}
        </div>
      </div>

      {modalTabelaGrupoKey != null && (
        <div
          className="fixed inset-0 z-[140] flex items-center justify-center bg-foreground/28 p-4 backdrop-blur-sm dark:bg-foreground/45"
          onClick={() => setModalTabelaGrupoKey(null)}
        >
          <div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-card-border bg-card shadow-[0_24px_72px_-24px_rgba(15,23,42,0.45)]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-card-border px-5 py-4">
              <h3 className="font-semibold text-foreground">
                Tabela de medidas · <span className="font-mono text-sm font-normal text-muted">{modalTabelaGrupoKey}</span>
              </h3>
              <button
                type="button"
                onClick={() => setModalTabelaGrupoKey(null)}
                className="flex h-10 w-10 items-center justify-center rounded-lg text-xl leading-none text-muted hover:bg-background"
              >
                ×
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              {loadingTabela && (
                <div className="flex items-center gap-2 py-6 text-sm text-muted">
                  <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-card-border border-t-success" /> Carregando…
                </div>
              )}
              {!loadingTabela && !tabelaMedidasData && <p className="text-sm text-muted">Nenhuma tabela de medidas cadastrada para este grupo.</p>}
              {!loadingTabela && tabelaMedidasData && (() => {
                const tipo = (tabelaMedidasData.tipo_produto ?? "generico") as TipoProduto;
                const colunas = getColunasTabelaMedidas(tipo);
                const medidas = tabelaMedidasData.medidas ?? {};
                const firstRow = Object.values(medidas)[0];
                const colKeys = firstRow ? Object.keys(firstRow) : colunas.map((c) => c.key);
                return (
                  <div className="dropcore-scroll-x rounded-lg border border-card-border">
                    <table className="w-full min-w-[280px] border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-card-border bg-background">
                          <th className="px-3 py-2 text-left font-medium text-muted">Tamanho</th>
                          {colKeys.map((col) => {
                            const label = colunas.find((c) => c.key === col)?.label ?? `${col.replace(/_/g, " ")} (cm)`;
                            return (
                              <th key={col} className="px-3 py-2 text-left font-medium text-muted">
                                {label}
                              </th>
                            );
                          })}
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(medidas).map(([tam, row]) => (
                          <tr key={tam} className="border-b border-card-border">
                            <td className="px-3 py-2 font-medium text-foreground">{tam}</td>
                            {colKeys.map((col) => (
                              <td key={col} className="px-3 py-2 text-muted">
                                {row && Number.isFinite(row[col]) ? row[col] : "—"}
                              </td>
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

      <SellerNav active="produtos" />
    </div>
  );
}
