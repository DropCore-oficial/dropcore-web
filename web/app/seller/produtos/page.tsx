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
import { skuContaLimiteHabilitacaoSeller } from "@/lib/sellerSkuHabilitado";
import { skuProntoParaVender } from "@/lib/sellerSkuReadiness";
import { toTitleCase } from "@/lib/formatText";
import { getColunasTabelaMedidas, type TipoProduto } from "@/lib/tipoProduto";
import { CatalogoV2ResumoTopo } from "@/components/seller/catalogo/v2/CatalogoV2ResumoTopo";
import { SellerListaGrupoArmazem } from "@/components/seller/catalogo/v2/SellerListaGrupoArmazem";
import { linhasGrupo, type GrupoCatalogoV2 } from "@/components/seller/catalogo/v2/aggregates";
import {
  AMBER_PREMIUM_SURFACE_TRANSPARENT,
  AMBER_PREMIUM_TEXT_PRIMARY,
  AMBER_PREMIUM_TEXT_SOFT,
} from "@/lib/amberPremium";
import { AmberPremiumCallout } from "@/components/ui/AmberPremiumCallout";
import { cn } from "@/lib/utils";

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

  const habilitarVendaApiBloqueioLigar = useMemo(() => {
    if (!fornecedorLigadoId?.trim() || catalogMeta.sem_armazem_ligado) {
      return "Grave um armazém em «Configurar armazém e vínculo» antes de ligar SKUs na API.";
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
        const elegiveis = items.filter(
          (it) =>
            skuContaLimiteHabilitacaoSeller(it.sku) &&
            isAtivoItem(it) &&
            skuProntoParaVender(it),
        );
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
          const targets = items.filter(
            (it) =>
              skuContaLimiteHabilitacaoSeller(it.sku) &&
              isAtivoItem(it) &&
              skuProntoParaVender(it) &&
              !it.habilitado_venda,
          );
          if (targets.length === 0) {
            setError(
              "Nenhum SKU desta cor pôde ser ligado na API. Confira se o cadastro está completo, o estoque e se você já gravou o armazém.",
            );
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
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] app-bg pt-[calc(3.5rem+env(safe-area-inset-top,0px))] md:pt-14 pb-[calc(6.25rem+env(safe-area-inset-bottom,0px))] md:pb-8">
      <div className="dropcore-shell-4xl py-4 sm:py-6 lg:py-8">
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
              <Link
                href="#erp-catalogo-sku"
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-3 py-2 text-[13px] font-medium text-[var(--foreground)] no-underline transition hover:border-emerald-300 hover:bg-[var(--surface-hover)] dark:hover:border-emerald-700"
              >
                <svg className="h-4 w-4 opacity-70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
                ERP e SKU
              </Link>
            }
          />
          <div id="erp-catalogo-sku" className="mt-4 scroll-mt-28">
            <AmberPremiumCallout title="Olist/Tiny e código no catálogo (SKU)" className="rounded-2xl px-4 py-3.5 sm:px-5">
              <p className="text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
                No cadastro de produtos da <strong className="text-[var(--foreground)]">Olist/Tiny</strong>, use o mesmo código que
                aparece como <strong className="text-[var(--foreground)]">SKU</strong> aqui no DropCore. Assim, quando o ERP
                enviar pedidos, o sistema reconhece o item certo. O <strong className="text-[var(--foreground)]">token API</strong>{" "}
                fica em{" "}
                <Link
                  href="/seller/integracoes-erp"
                  className="font-semibold text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-400"
                >
                  Mais → ERP
                </Link>
                ; este é só o lugar do catálogo onde você confere os códigos.
              </p>
            </AmberPremiumCallout>
          </div>
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
                  className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-[var(--card-border)] bg-[var(--card)] text-[var(--foreground)] hover:bg-[var(--surface-hover)] sm:min-h-10 sm:min-w-0 sm:px-3.5 sm:text-sm sm:font-medium"
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
                className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-2 rounded-lg border px-3.5 text-sm font-medium transition sm:min-h-10 sm:min-w-[6.5rem] ${
                  painelFiltros
                    ? "border-emerald-600 bg-emerald-50 text-emerald-900 dark:border-emerald-500 dark:bg-emerald-900/35 dark:text-emerald-300"
                    : "border-[var(--card-border)] bg-[var(--card)] text-[var(--foreground)] hover:bg-[var(--surface-hover)]"
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
                  className={`min-h-[40px] rounded-full border px-4 py-2 text-sm font-medium transition ${
                    filtroStatus === f.key
                      ? f.key === "pendencias"
                        ? cn(AMBER_PREMIUM_SURFACE_TRANSPARENT, AMBER_PREMIUM_TEXT_PRIMARY)
                        : "border-emerald-600 bg-emerald-100 text-emerald-900 dark:border-emerald-500 dark:bg-emerald-900/35 dark:text-emerald-300"
                      : "border-[var(--card-border)] bg-[var(--surface-subtle)] text-[var(--muted)] hover:bg-[var(--surface-hover)] dark:bg-[var(--card)]"
                  } disabled:cursor-not-allowed disabled:opacity-45`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <details className="mt-3 text-xs text-[var(--muted)] [&_summary]:cursor-pointer">
              <summary className="font-medium text-[var(--foreground)]">O que é “pronto para vender”?</summary>
              <p className="mt-2 max-w-2xl text-[13px] leading-relaxed">
                São os dados que o <strong>fornecedor</strong> cadastrou no produto no armazém: nome, foto ou link de fotos, custo,
                estoque &gt; 0, medidas do pacote, NCM (8 dígitos), descrição com pelo menos 20 caracteres. O seller{" "}
                <strong>não edita</strong> isso nesta tela — se algo aparecer em pendência, o ajuste é feito pelo fornecedor.
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
                <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-300">
                  API ligada
                </span>
              ) : (
                <span
                  className={cn(
                    AMBER_PREMIUM_SURFACE_TRANSPARENT,
                    AMBER_PREMIUM_TEXT_PRIMARY,
                    "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold"
                  )}
                >
                  Pendente
                </span>
              )}
            </div>
            <p className="text-[14px] font-medium leading-snug text-[var(--foreground)]">
              {nomeArmazemLigado ?? (fornecedorLigadoId ? "—" : "Nenhum armazém vinculado")}
            </p>
            {!planoSellerPro && catalogMeta.tabela_ok && (
              <p className="text-[12px] text-[var(--muted)]">
                Plano Start: até {catalogMeta.habilitados_max ?? 15} SKUs na API ·{" "}
                <span className="tabular-nums font-medium text-[var(--foreground)]">{catalogMeta.habilitados_count}</span> habilitados
              </p>
            )}
          </div>
        </div>

        <details className="group mt-2.5 overflow-hidden rounded-xl border border-[var(--card-border)] bg-[var(--card)] shadow-sm transition open:shadow-md">
          <summary className="cursor-pointer list-none px-3 py-3 text-sm font-medium text-[var(--foreground)] marker:content-none hover:bg-[var(--surface-hover)] sm:px-3.5 [&::-webkit-details-marker]:hidden">
            Configurar armazém e vínculo
          </summary>
          <div className="space-y-4 border-t border-[var(--card-border)] px-3 pb-4 pt-3 sm:px-3.5">
          {fornecedoresLoadErr && <p className={cn("text-sm", AMBER_PREMIUM_TEXT_SOFT)}>{fornecedoresLoadErr}</p>}
          {fornecedoresLista?.length === 0 ? (
            <p className="text-sm text-muted">Não há fornecedores na organização.</p>
          ) : (
            <>
              <label className="block space-y-2">
                <span className="text-sm text-muted">Ligar catálogo da API a</span>
                <select
                  value={vinculoSelectId}
                  onChange={(e) => setVinculoSelectId(e.target.value)}
                  className="h-10 w-full rounded-md border border-[var(--card-border)] bg-[var(--card)] px-3 text-sm text-[var(--foreground)] shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)] focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:focus:ring-emerald-400/25"
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
                  className="h-10 w-full rounded-md bg-emerald-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 active:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
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
          <div className={cn(AMBER_PREMIUM_SURFACE_TRANSPARENT, AMBER_PREMIUM_TEXT_PRIMARY, "mt-6 rounded-2xl px-5 py-4 text-sm md:px-6")}>
            A lista de SKUs habilitados para venda ainda não está disponível na base (migração pendente). Execute o script{" "}
            <code className="rounded border border-card-border bg-card px-1.5 py-0.5 font-mono text-xs">web/scripts/create-seller-skus-habilitados.sql</code> no
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
              <div className="border-t border-red-200/90 bg-red-100 p-4 text-sm font-medium text-red-900 dark:border-red-900/45 dark:bg-red-950/45 dark:text-red-200">
                {error}
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
                  onOpenMedidas={() => void abrirTabelaMedidas(grupo.paiKey)}
                  bulkLoading={bulkPaiKey === grupo.paiKey}
                  onBulkEnableValidas={() => void bulkEnableValidas(grupo)}
                  onBulkDisableAll={() => void bulkDisableAll(grupo)}
                  toggleLoadingId={toggleLoadingId}
                  onToggleOne={(item, ativar) => void setSkuHabilitado(item, ativar)}
                  bulkCorLoadingKey={bulkCorKey}
                  onToggleCorGrupo={(paiKey, corKey, items) => void toggleHabilitacaoPorCor(paiKey, corKey, items)}
                  habilitarVendaApiBloqueioLigar={habilitarVendaApiBloqueioLigar}
                />
              ))}
          </div>
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
