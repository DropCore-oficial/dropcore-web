"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { SellerNav } from "../SellerNav";
import { SellerPageHeader } from "@/components/seller/SellerPageHeader";
import { normalizarFornecedoresSellerApi, type FornecedorSellerListaRow } from "@/lib/mapFornecedorSellerPublico";
import {
  agruparPaiFilhosSeller as agruparPaiFilhos,
  normalizarItemsSellerCatalogo as normalizarItems,
  strSellerCatalogo as str,
  isSementeSellerCatalogo as isSemente,
  isGrupoOcultoSellerCatalogo as isGrupoOculto,
  type SellerCatalogoItem,
} from "@/components/seller/SellerCatalogoGrupoUi";
import { paiKeySkuHabilitacao, skuContaLimiteHabilitacaoSeller } from "@/lib/sellerSkuHabilitado";
import { agruparVariantesPorCor } from "@/lib/armazemAgruparCor";
import { corGrupoTemEstoqueParaHabilitar, skuProntoParaVender } from "@/lib/sellerSkuReadiness";
import { toTitleCase } from "@/lib/formatText";
import { CatalogoV2ResumoTopo } from "@/components/seller/catalogo/v2/CatalogoV2ResumoTopo";
import { SellerListaGrupoArmazem } from "@/components/seller/catalogo/v2/SellerListaGrupoArmazem";
import { SellerOlistEstoqueGradeCallout } from "@/components/seller/SellerOlistEstoqueGradeCallout";
import { linhasGrupo, type GrupoCatalogoV2 } from "@/components/seller/catalogo/v2/aggregates";
import {
  AMBER_PREMIUM_SHELL,
  AMBER_PREMIUM_SURFACE_TRANSPARENT,
  AMBER_PREMIUM_TEXT_PRIMARY,
} from "@/lib/amberPremium";
import { AmberPremiumCallout } from "@/components/ui/AmberPremiumCallout";
import {
  SUCCESS_PREMIUM_SHELL,
  SUCCESS_PREMIUM_TEXT_PRIMARY,
  DANGER_PREMIUM_SHELL,
  DANGER_PREMIUM_TEXT_PRIMARY,
} from "@/lib/semanticPremium";
import { MODAL_OVERLAY_CLASS, MODAL_PANEL_CLASS, MODAL_PANEL_BODY_CLASS } from "@/lib/modalOverlay";
import { cn } from "@/lib/utils";

function isAtivoItem(item: SellerCatalogoItem): boolean {
  return str(item.status).toLowerCase() === "ativo";
}

export default function SellerProdutosPage() {
  const router = useRouter();

  const [q, setQ] = useState("");
  const [items, setItems] = useState<SellerCatalogoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandido, setExpandido] = useState<Set<string>>(new Set());
  const [modoListaVariantes, setModoListaVariantes] = useState<"agrupado-cor" | "sku">("agrupado-cor");
  const [mostrarFotosVariantes, setMostrarFotosVariantes] = useState(true);
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
  /** Habilitação em lote por cor (agrupado por cor): `${paiKey}:${corKey}` */
  const [bulkCorKey, setBulkCorKey] = useState<string | null>(null);
  const [bulkPaiKey, setBulkPaiKey] = useState<string | null>(null);
  const [fornecedorLigadoId, setFornecedorLigadoId] = useState<string | null>(null);
  const [fornecedoresLista, setFornecedoresLista] = useState<FornecedorSellerListaRow[] | null>(null);
  const [modalErpSkuAberto, setModalErpSkuAberto] = useState(false);

  const nomeArmazemLigado = useMemo(() => {
    const id = fornecedorLigadoId?.trim();
    if (!id || !fornecedoresLista) return null;
    const row = fornecedoresLista.find((f) => f.id === id);
    if (!row) return null;
    return row.local_resumido ? `${row.nome_publico} · ${row.local_resumido}` : row.nome_publico;
  }, [fornecedorLigadoId, fornecedoresLista]);

  const planoSellerPro = useMemo(() => String(catalogMeta.plano ?? "").trim().toLowerCase() === "pro", [catalogMeta.plano]);

  const habilitarVendaApiBloqueioLigar = useMemo(() => {
    if (!fornecedorLigadoId?.trim() || catalogMeta.sem_armazem_ligado) {
      return "Vincule um fornecedor em «Fornecedores» antes de ligar SKUs na API.";
    }
    if (!catalogMeta.tabela_ok) {
      return "Cadastro de habilitações indisponível no servidor (tabela seller_skus_habilitados). Fale com o suporte DropCore.";
    }
    return null;
  }, [fornecedorLigadoId, catalogMeta.tabela_ok, catalogMeta.sem_armazem_ligado]);

  function toggleExpandido(key: string) {
    setExpandido((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

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
      if (ativar) {
        const pai = paiKeySkuHabilitacao(item.sku);
        const corK = (item.cor ?? "").trim().toLowerCase();
        const mesmaCor = items.filter(
          (it) =>
            isAtivoItem(it) &&
            paiKeySkuHabilitacao(it.sku) === pai &&
            (it.cor ?? "").trim().toLowerCase() === corK
        );
        if (!corGrupoTemEstoqueParaHabilitar(mesmaCor)) return;
      }
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
    [router, postHabilitar, deleteHabilitar, items],
  );

  const toggleHabilitacaoPorCor = useCallback(
    async (paiKey: string, corKey: string, items: SellerCatalogoItem[]) => {
      const loadingKey = `${paiKey}:${corKey}`;
      setBulkCorKey(loadingKey);
      setError(null);
      try {
        const {
          data: { session },
        } = await supabaseBrowser.auth.getSession();
        if (!session?.access_token) {
          router.replace("/seller/login");
          return;
        }
        const elegiveis = items.filter((it) => skuContaLimiteHabilitacaoSeller(it.sku) && isAtivoItem(it));
        const todosHabilitadosNaCor =
          elegiveis.length > 0 && elegiveis.every((it) => it.habilitado_venda === true);

        if (todosHabilitadosNaCor) {
          const targets = items.filter((it) => it.habilitado_venda === true);
          for (const it of targets) {
            if (!it.id) continue;
            const r = await deleteHabilitar(session.access_token, it.id);
            if (!r.ok) throw new Error(r.error || "Erro ao desabilitar na API");
            setItems((prev) => prev.map((row) => (row.id === it.id ? { ...row, habilitado_venda: false } : row)));
            if (typeof r.habilitados_count === "number") {
              setCatalogMeta((m) => ({ ...m, habilitados_count: r.habilitados_count! }));
            }
          }
        } else {
          if (!corGrupoTemEstoqueParaHabilitar(elegiveis)) return;
          const targets = elegiveis.filter((it) => !it.habilitado_venda);
          if (targets.length === 0) {
            setError("Nenhum SKU ativo desta cor para ligar na API. Confira se o armazém está gravado.");
            return;
          }
          for (const it of targets) {
            if (!it.id) continue;
            const r = await postHabilitar(session.access_token, it.id);
            if (!r.ok) throw new Error(r.error || "Erro ao habilitar na API");
            setItems((prev) => prev.map((row) => (row.id === it.id ? { ...row, habilitado_venda: true } : row)));
            if (typeof r.habilitados_count === "number") {
              setCatalogMeta((m) => ({ ...m, habilitados_count: r.habilitados_count! }));
            }
          }
        }
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Erro ao atualizar habilitação");
      } finally {
        setBulkCorKey(null);
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
        const linhas = linhasGrupo(grupo.pai, grupo.filhos);
        const targets: SellerCatalogoItem[] = [];
        for (const g of agruparVariantesPorCor(linhas.filter(isAtivoItem))) {
          if (!corGrupoTemEstoqueParaHabilitar(g.itens)) continue;
          for (const it of g.itens) {
            if (skuContaLimiteHabilitacaoSeller(it.sku) && !it.habilitado_venda) {
              targets.push(it);
            }
          }
        }
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
    [router, postHabilitar, items],
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
      try {
        const {
          data: { session },
        } = await supabaseBrowser.auth.getSession();
        if (!session?.access_token) {
          router.replace("/seller/login");
          return;
        }
        const authH = { Authorization: `Bearer ${session.access_token}` };
        const resCat = await fetch(`/api/seller/catalogo?include_fornecedores=1`, { headers: authH, cache: "no-store" });
        const jsonCat = await resCat.json().catch(() => ({}));
        if (cancelled) return;
        if (!resCat.ok) throw new Error(jsonCat.error || "Erro ao buscar catálogo");
        setItems(normalizarItems(jsonCat.items));
        const fid = jsonCat.fornecedor_id;
        const fidNorm = typeof fid === "string" && fid.trim() ? fid.trim() : null;
        setFornecedorLigadoId(fidNorm);
        setCatalogMeta({
          plano: jsonCat.seller_plano ?? null,
          habilitados_count: typeof jsonCat.habilitados_count === "number" ? jsonCat.habilitados_count : 0,
          habilitados_max: jsonCat.habilitados_max === null || jsonCat.habilitados_max === undefined ? null : Number(jsonCat.habilitados_max),
          tabela_ok: jsonCat.habilitados_tabela_ok !== false,
          sem_armazem_ligado: typeof jsonCat.sem_armazem_ligado === "boolean" ? jsonCat.sem_armazem_ligado : !fidNorm,
        });
        if (jsonCat.fornecedores) {
          setFornecedoresLista(normalizarFornecedoresSellerApi(jsonCat.fornecedores));
        } else {
          setFornecedoresLista([]);
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

  const [exportandoOlistGrupo, setExportandoOlistGrupo] = useState<string | null>(null);
  const [olistExportInfo, setOlistExportInfo] = useState<string | null>(null);

  const baixarCsvOlistGrupo = useCallback(
    async (grupoKey: string) => {
      const grupo = grupoKey.trim().toUpperCase();
      if (!grupo) return;
      setExportandoOlistGrupo(grupo);
      setError(null);
      try {
        const {
          data: { session },
        } = await supabaseBrowser.auth.getSession();
        if (!session?.access_token) {
          router.replace("/seller/login");
          return;
        }
        const res = await fetch(
          `/api/seller/catalogo/export-olist?grupo=${encodeURIComponent(grupo)}&scope=todos`,
          {
            headers: { Authorization: `Bearer ${session.access_token}` },
            cache: "no-store",
          },
        );
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error(typeof json?.error === "string" ? json.error : "Erro ao exportar planilha para a Olist.");
        }
        const blob = await res.blob();
        const disp = res.headers.get("Content-Disposition") ?? "";
        const match = /filename="([^"]+)"/.exec(disp);
        const filename = match?.[1] ?? `dropcore-olist-${grupo}.csv`;
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Erro ao exportar planilha para a Olist.");
      } finally {
        setExportandoOlistGrupo(null);
      }
    },
    [router],
  );

  const OLIST_PRECO_AUTO_KEY = "dropcore-olist-precos-auto-v1";
  const OLIST_PRECO_AUTO_MS = 5 * 60 * 1000;

  useEffect(() => {
    if (loading || !fornecedorLigadoId || gruposResumo.length === 0) return;

    let cancelled = false;
    (async () => {
      try {
        const lastRaw = sessionStorage.getItem(OLIST_PRECO_AUTO_KEY);
        const last = lastRaw ? Number.parseInt(lastRaw, 10) : 0;
        if (Number.isFinite(last) && Date.now() - last < OLIST_PRECO_AUTO_MS) return;

        const {
          data: { session },
        } = await supabaseBrowser.auth.getSession();
        if (!session?.access_token || cancelled) return;

        const res = await fetch("/api/seller/catalogo/sync-olist-custos?grupo=all&scope=todos", {
          method: "POST",
          headers: { Authorization: `Bearer ${session.access_token}` },
          cache: "no-store",
        });

        if (cancelled) return;

        if (res.status === 400) {
          const j = await res.json().catch(() => ({}));
          if (j?.code === "olist_not_connected") return;
        }
        if (!res.ok) return;

        const sync = (await res.json()) as { ok?: number; falhas?: Array<{ sku?: string; erro?: string }> };
        const ok = typeof sync.ok === "number" ? sync.ok : 0;
        const falhasBrutas = Array.isArray(sync.falhas) ? sync.falhas : [];
        const falhas = falhasBrutas.filter((f) => {
          const m = String(f.erro ?? "").toLowerCase();
          if (m.includes("produto não localizado") || m.includes("produto nao localizado")) return false;
          if (m.includes("não localizado") || m.includes("nao localizado")) return false;
          return true;
        });
        if (ok > 0) {
          sessionStorage.setItem(OLIST_PRECO_AUTO_KEY, String(Date.now()));
          setError(null);
          setOlistExportInfo(
            `Preços sincronizados com a Olist (${ok} SKU${ok === 1 ? "" : "s"}).${falhas.length ? ` ${falhas.length} grupo(s) ignorado(s) (ainda não estão na Olist).` : ""}`,
          );
        } else if (falhas.length > 0) {
          setError(`Sync Olist (${falhas[0]?.sku ?? "?"}): ${falhas[0]?.erro ?? "não foi possível atualizar preços."}`);
        }
      } catch {
        /* sync silencioso em background */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loading, fornecedorLigadoId, gruposResumo.length]);

  return (
    <div className="bg-[var(--background)] text-[var(--foreground)] app-bg pt-[calc(3.5rem+env(safe-area-inset-top,0px))] md:pt-14 pb-8">
      <div className="dropcore-shell-6xl py-4 sm:py-6 lg:py-8">
          <SellerPageHeader
            surface="hero"
            className="mb-0 sm:mb-0"
            title="Produtos"
            subtitle={
              <>
                O fornecedor mantém o cadastro no armazém;{" "}
                <span className="font-medium text-[var(--foreground)]">aqui você escolhe o que pode vender com a Olist/Tiny ligada</span>.
              </>
            }
            right={
              <button
                type="button"
                onClick={() => setModalErpSkuAberto(true)}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-[var(--card-border)] bg-[var(--card)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--foreground)] transition hover:bg-[var(--muted)]/10"
              >
                <svg className="h-3.5 w-3.5 opacity-70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
                ERP e SKU
              </button>
            }
          />
          <div className="mt-3.5 flex flex-nowrap gap-2 sm:mt-5">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onBlur={() => setQ(toTitleCase(q))}
              placeholder="Buscar por nome, SKU, cor ou tamanho…"
              className="min-h-[44px] min-w-0 flex-1 rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-3.5 py-2 text-[15px] text-[var(--foreground)] placeholder:text-[var(--muted)] shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)] transition focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/25 sm:min-h-10 sm:text-sm dark:focus:ring-emerald-400/30"
            />
            <div className="flex shrink-0 gap-2">
              {q ? (
                <button
                  type="button"
                  onClick={() => setQ("")}
                  className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md border border-[var(--card-border)] bg-[var(--card)] text-[var(--foreground)] hover:bg-[var(--muted)]/10 sm:min-h-0 sm:min-w-0 sm:px-2.5 sm:py-1.5 sm:text-[11px] sm:font-semibold"
                >
                  <svg className="h-5 w-5 sm:hidden" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  <span className="sr-only sm:hidden">Limpar busca</span>
                  <span className="hidden sm:inline">Limpar</span>
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setPainelFiltros((p) => !p)}
                aria-expanded={painelFiltros}
                className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 rounded-md border transition sm:min-h-0 sm:px-2.5 sm:py-1.5 sm:text-[11px] sm:font-semibold ${
                  painelFiltros
                    ? "border-emerald-600 bg-emerald-50 text-emerald-900 dark:border-emerald-500 dark:bg-emerald-900/35 dark:text-emerald-300"
                    : "border-[var(--card-border)] bg-[var(--card)] text-[var(--foreground)] hover:bg-[var(--muted)]/10"
                }`}
              >
                <svg className="h-5 w-5 shrink-0 sm:hidden" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z"
                  />
                </svg>
                <span className="sr-only sm:hidden">{painelFiltros ? "Fechar filtros" : "Abrir filtros"}</span>
                <span className="hidden sm:inline">Filtros</span>
              </button>
            </div>
          </div>
          {!loading && !error && (
            <div className="mt-3 md:mt-3.5">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)] md:hidden">Visão rápida</p>
              <CatalogoV2ResumoTopo
                variant="strip"
                totalProdutos={resumoTopo.totalProdutos}
                skusDisponiveis={resumoTopo.skusDisponiveis}
                skusHabilitados={catalogMeta.habilitados_count}
                skusComPendencia={resumoTopo.skusComPendencia}
                habilitadosMax={catalogMeta.habilitados_max}
              />
            </div>
          )}

        {painelFiltros && (
          <div className="mt-3 rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4 shadow-sm dark:shadow-none">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">Filtros rápidos</p>
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
                  className={cn(
                    "rounded-full px-3.5 py-1.5 text-[11px] font-medium whitespace-nowrap transition-colors",
                    filtroStatus === f.key
                      ? f.key === "pendencias"
                        ? cn(AMBER_PREMIUM_SURFACE_TRANSPARENT, AMBER_PREMIUM_TEXT_PRIMARY)
                        : "bg-emerald-600 text-white shadow-sm"
                      : "bg-[var(--surface-subtle)] text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]",
                    "disabled:cursor-not-allowed disabled:opacity-45"
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <details className="mt-3 text-xs text-[var(--muted)] [&_summary]:cursor-pointer">
              <summary className="font-medium text-[var(--foreground)]">Venda na API e pendências</summary>
              <p className="mt-2 max-w-2xl text-[13px] leading-relaxed">
                Você pode ligar <strong>Venda na API</strong> aqui mesmo com badge “Com pendência”. Enquanto o{" "}
                <strong>fornecedor</strong> não completar nome, fotos, custo, estoque, medidas, NCM e descrição (mín. 20 caracteres)
                no cadastro do armazém, o aviso continua — o seller não edita isso nesta tela. No plano Start: até{" "}
                <strong>15 cores</strong> (produto + cor) com venda na API; numerações da mesma cor não gastam o limite.
              </p>
            </details>
          </div>
        )}

        <div className="mt-2.5 flex items-start gap-3 rounded-xl border border-[var(--card-border)] bg-[var(--card)] px-3 py-3 shadow-sm sm:mt-3 sm:px-4 sm:py-3.5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 9h18v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9Z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 9V7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2" />
            </svg>
          </span>
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">Armazém</span>
              {fornecedorLigadoId?.trim() ? (
                <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md bg-emerald-100 px-2 py-1 text-[11px] font-medium text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-300">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden />
                  API ligada
                </span>
              ) : (
                <span
                  className={cn(
                    AMBER_PREMIUM_SHELL,
                    AMBER_PREMIUM_TEXT_PRIMARY,
                    "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-medium"
                  )}
                >
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden />
                  Pendente
                </span>
              )}
            </div>
            <p className="text-[14px] font-medium leading-snug text-[var(--foreground)]">
              {fornecedorLigadoId?.trim() && nomeArmazemLigado ? (
                <Link
                  href={`/seller/catalogo#fornecedor-${encodeURIComponent(fornecedorLigadoId)}`}
                  className="underline decoration-[var(--card-border)] underline-offset-2 hover:text-emerald-700 hover:decoration-emerald-600 dark:hover:text-emerald-400"
                >
                  {nomeArmazemLigado}
                </Link>
              ) : (
                (nomeArmazemLigado ?? (fornecedorLigadoId ? "—" : "Nenhum armazém vinculado"))
              )}
            </p>
            {!planoSellerPro && catalogMeta.tabela_ok && (
              <p className="text-[12px] text-[var(--muted)]">
                Plano Start: até {catalogMeta.habilitados_max ?? 15} cores na API ·{" "}
                <span className="tabular-nums font-medium text-[var(--foreground)]">{catalogMeta.habilitados_count}</span> no limite
              </p>
            )}
          </div>
        </div>

        {!loading &&
          !error &&
          catalogMeta.sem_armazem_ligado &&
          fornecedoresLista !== null &&
          fornecedoresLista.length > 0 && (
            <section className="mt-2.5 overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--card)] shadow-sm">
              <div className="h-1 w-full bg-[var(--accent)]" aria-hidden />
              <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:px-6">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[var(--card-border)] bg-[var(--card)] text-[var(--muted)]">
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 9h18v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9Z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 9V7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-sm font-semibold text-[var(--foreground)]">Escolha um fornecedor</p>
                  <p className="text-sm leading-relaxed text-[var(--muted)]">
                    Sem fornecedor vinculado, <span className="font-medium text-[var(--foreground)]">não listamos SKUs</span> da organização aqui.
                    Vá em «Fornecedores» para conhecer o catálogo e vincular um armazém.
                  </p>
                </div>
                <Link
                  href="/seller/catalogo"
                  className="inline-flex shrink-0 items-center justify-center rounded-md bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-emerald-700"
                >
                  Ver fornecedores
                </Link>
              </div>
            </section>
          )}

        {!loading && !catalogMeta.tabela_ok && (
          <div className={cn(AMBER_PREMIUM_SURFACE_TRANSPARENT, AMBER_PREMIUM_TEXT_PRIMARY, "mt-6 rounded-2xl px-5 py-4 text-sm md:px-6")}>
            A lista de SKUs habilitados para venda ainda não está disponível na base (migração pendente). Execute o script{" "}
            <code className="rounded border border-[var(--card-border)] bg-[var(--card)] px-1.5 py-0.5 font-mono text-xs">web/scripts/create-seller-skus-habilitados.sql</code> no
            Supabase para ativar o limite de 15 no Start e a integração ERP alinhada ao catálogo.
          </div>
        )}

        <div className="mt-4 min-w-0 overflow-visible rounded-2xl border border-[var(--card-border)] bg-[var(--card)] shadow-sm">
          <div className="border-b border-[var(--card-border)] bg-[var(--card)] px-4 py-4 sm:px-5 sm:py-4">
            <h2 className="text-[15px] font-semibold tracking-tight text-[var(--foreground)] sm:text-sm">Produtos do armazém</h2>
            <p className="mt-1.5 max-w-prose text-[13px] leading-relaxed text-[var(--muted)] sm:text-sm">
              Cadastro do fornecedor é só leitura; expanda um item para ver SKUs e habilitações na API.
            </p>
          </div>
          <div className="min-w-0 space-y-2.5 px-3 py-3 sm:space-y-3 sm:px-4 sm:py-4">
            {loading && (
              <div className="px-4 py-12 text-center">
                <span className="mx-auto mb-4 inline-flex h-11 w-11 animate-spin rounded-full border-2 border-[var(--card-border)] border-t-emerald-600 dark:border-t-emerald-400" />
                <div className="mx-auto mb-3 h-2 max-w-[180px] animate-pulse rounded-full bg-[var(--surface-subtle)]" />
                <p className="text-sm font-medium text-[var(--foreground)]">Carregando catálogo</p>
                <p className="mt-1 text-[13px] text-[var(--muted)]">Buscando produtos do armazém…</p>
              </div>
            )}
            {error && (
              <div className={cn("border-t p-4 text-sm font-medium", DANGER_PREMIUM_SHELL, DANGER_PREMIUM_TEXT_PRIMARY)}>
                {error}
              </div>
            )}
            {olistExportInfo && !error && (
              <div className={cn("border-t p-4 text-sm font-medium", SUCCESS_PREMIUM_SHELL, SUCCESS_PREMIUM_TEXT_PRIMARY)}>
                {olistExportInfo}
              </div>
            )}
            {!loading && !error && grupos.length === 0 && (
              <div className="px-4 py-12 text-center">
                <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--surface-subtle)] shadow-sm ring-1 ring-[var(--card-border)]">
                  <svg className="h-7 w-7 text-[var(--muted)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 01-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 011-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 011.52 0C14.51 3.81 17 5 19 5a1 1 0 011 1v7z" />
                  </svg>
                </span>
                <p className="text-[15px] font-semibold text-[var(--foreground)]">Nada para mostrar aqui</p>
                <p className="mx-auto mt-2 max-w-sm text-[13px] leading-relaxed text-[var(--muted)]">
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
              grupos.map((grupo) => (
                <SellerListaGrupoArmazem
                  key={grupo.paiKey}
                  grupo={grupo}
                  exp={expandido.has(grupo.paiKey)}
                  onToggleExpand={() => toggleExpandido(grupo.paiKey)}
                  nomeArmazem={nomeArmazemLigado}
                  modoListaVariantes={modoListaVariantes}
                  setModoListaVariantes={setModoListaVariantes}
                  mostrarFotosVariantes={mostrarFotosVariantes}
                  setMostrarFotosVariantes={setMostrarFotosVariantes}
                  bulkLoading={bulkPaiKey === grupo.paiKey}
                  onBulkEnableValidas={() => void bulkEnableValidas(grupo)}
                  onBulkDisableAll={() => void bulkDisableAll(grupo)}
                  toggleLoadingId={toggleLoadingId}
                  onToggleOne={(item, ativar) => void setSkuHabilitado(item, ativar)}
                  bulkCorLoadingKey={bulkCorKey}
                  onToggleCorGrupo={(paiKey, corKey, items) => void toggleHabilitacaoPorCor(paiKey, corKey, items)}
                  habilitarVendaApiBloqueioLigar={habilitarVendaApiBloqueioLigar}
                  exportandoOlist={exportandoOlistGrupo === grupo.paiKey}
                  onExportOlist={() => void baixarCsvOlistGrupo(grupo.paiKey)}
                  exportOlistDisabled={catalogMeta.sem_armazem_ligado}
                  fornecedorLigadoId={fornecedorLigadoId}
                />
              ))}
          </div>
        </div>
      </div>

      {modalErpSkuAberto && (
        <div className={MODAL_OVERLAY_CLASS} onClick={() => setModalErpSkuAberto(false)}>
          <div className={cn(MODAL_PANEL_CLASS, "max-w-lg")} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-[var(--card-border)] px-5 py-4">
              <h3 className="font-semibold text-[var(--foreground)]">ERP e SKU</h3>
              <button
                type="button"
                onClick={() => setModalErpSkuAberto(false)}
                className="flex h-10 w-10 items-center justify-center rounded-lg text-xl leading-none text-[var(--muted)] hover:bg-[var(--muted)]/10"
              >
                ×
              </button>
            </div>
            <div className={cn(MODAL_PANEL_BODY_CLASS, "p-4 space-y-3")}>
              <AmberPremiumCallout title="Olist/Tiny e código no catálogo (SKU)" className="rounded-2xl px-4 py-3.5 sm:px-5">
                <p className="text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
                  No cadastro de produtos da <strong className="text-[var(--foreground)]">Olist/Tiny</strong>, use o mesmo código que
                  aparece como <strong className="text-[var(--foreground)]">SKU</strong> aqui no DropCore. Em cada produto da lista,
                  expanda e use <strong className="text-[var(--foreground)]">Exportar para Olist</strong> para baixar a planilha daquele
                  grupo (pai + variações). O <strong className="text-[var(--foreground)]">token API</strong> fica em{" "}
                  <Link
                    href="/seller/integracoes-erp"
                    className="font-semibold text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-400"
                  >
                    Mais → ERP
                  </Link>
                  .
                </p>
                <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">
                  Na Olist: Cadastros → Produtos → Mais ações → Importar planilha (reconhecimento por SKU). SKU do produto na Olist deve
                  estar em <strong className="text-[var(--foreground)]">Manual</strong> (Configurações → Cadastros → Código SKU).
                </p>
              </AmberPremiumCallout>
              <SellerOlistEstoqueGradeCallout className="rounded-2xl px-4 py-3.5 sm:px-5" compact />
            </div>
          </div>
        </div>
      )}

      <SellerNav active="produtos" wide />
    </div>
  );
}
