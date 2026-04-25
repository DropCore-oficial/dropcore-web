"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { normalizarFornecedoresSellerApi, type FornecedorSellerListaRow } from "@/lib/mapFornecedorSellerPublico";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { SellerNav } from "../SellerNav";
import { SellerPageHeader } from "@/components/seller/SellerPageHeader";
import { toTitleCase } from "@/lib/formatText";
import { getColunasTabelaMedidas, type TipoProduto } from "@/lib/tipoProduto";
import { skuProntoParaVender } from "@/lib/sellerSkuReadiness";
import { skuContaLimiteHabilitacaoSeller } from "@/lib/sellerSkuHabilitado";

import { formatPesoCatalogo } from "@/lib/formatPesoCatalogo";
import type { SellerCatalogoItem } from "@/components/seller/SellerCatalogoGrupoUi";
import {
  agruparPaiFilhosSeller as agruparPaiFilhos,
  normalizarItemsSellerCatalogo as normalizarItems,
  infoDoGrupo,
  SellerCatalogoProductInfoBlock as ProductInfoBlock,
  SellerCatalogoItemCard as ItemCard,
  strSellerCatalogo as str,
  isSementeSellerCatalogo as isSemente,
  isGrupoOcultoSellerCatalogo as isGrupoOculto,
  paiKey,
} from "@/components/seller/SellerCatalogoGrupoUi";

type ItemSKU = SellerCatalogoItem;

type VinculoFornecedorMeta = {
  fornecedor_id: string | null;
  vinculado_em: string | null;
  pode_trocar_agora: boolean;
  pode_trocar_fornecedor_a_partir_de: string | null;
  meses_minimos: number;
  liberado_antecipado: boolean;
};

export default function SellerProdutosPage() {
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
  const [filtroReadiness, setFiltroReadiness] = useState<"todos" | "pendentes">("todos");
  const [catalogMeta, setCatalogMeta] = useState<{
    plano: string | null;
    habilitados_count: number;
    habilitados_max: number | null;
    tabela_ok: boolean;
    sem_armazem_ligado: boolean;
  }>({ plano: null, habilitados_count: 0, habilitados_max: null, tabela_ok: true, sem_armazem_ligado: false });
  const [toggleLoadingId, setToggleLoadingId] = useState<string | null>(null);
  const [fornecedorLigadoId, setFornecedorLigadoId] = useState<string | null>(null);
  const [fornecedoresLista, setFornecedoresLista] = useState<FornecedorSellerListaRow[] | null>(null);
  const [vinculoSelectId, setVinculoSelectId] = useState("");
  const [vinculoSaving, setVinculoSaving] = useState(false);
  const [vinculoAceiteUso, setVinculoAceiteUso] = useState(false);
  const [fornecedoresLoadErr, setFornecedoresLoadErr] = useState<string | null>(null);
  const [vinculoMeta, setVinculoMeta] = useState<VinculoFornecedorMeta | null>(null);

  const precisaAceiteVinculo = useMemo(() => {
    const novo = vinculoSelectId.trim() || null;
    const cur = fornecedorLigadoId?.trim() || null;
    return Boolean(novo) && novo !== cur;
  }, [vinculoSelectId, fornecedorLigadoId]);

  useEffect(() => {
    setVinculoAceiteUso(false);
  }, [vinculoSelectId]);

  const planoSellerPro = String(catalogMeta.plano ?? "").toLowerCase() === "pro";
  const starterComLimiteHabilitados = !planoSellerPro && catalogMeta.tabela_ok;

  const setSkuHabilitado = useCallback(async (item: ItemSKU, ativar: boolean) => {
    if (!item.id) return;
    setToggleLoadingId(item.id);
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) {
        router.replace("/seller/login");
        return;
      }
      const base = "/api/seller/catalogo/habilitados";
      const res = ativar
        ? await fetch(base, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${session.access_token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ sku_id: item.id }),
          })
        : await fetch(`${base}?sku_id=${encodeURIComponent(item.id)}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${session.access_token}` },
          });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Erro ao atualizar habilitação");
      setItems((prev) =>
        prev.map((row) => (row.id === item.id ? { ...row, habilitado_venda: ativar } : row))
      );
      if (typeof json.habilitados_count === "number") {
        setCatalogMeta((m) => ({ ...m, habilitados_count: json.habilitados_count }));
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao atualizar habilitação");
    } finally {
      setToggleLoadingId(null);
    }
  }, [router]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      setFornecedoresLoadErr(null);
      try {
        const { data: { session } } = await supabaseBrowser.auth.getSession();
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
          sem_armazem_ligado:
            typeof jsonCat.sem_armazem_ligado === "boolean" ? jsonCat.sem_armazem_ligado : !fidNorm,
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
      const { data: { session } } = await supabaseBrowser.auth.getSession();
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
          sem_armazem_ligado:
            typeof jCat.sem_armazem_ligado === "boolean" ? jCat.sem_armazem_ligado : !jCat.fornecedor_id,
          plano: jCat.seller_plano ?? m.plano,
          habilitados_count: typeof jCat.habilitados_count === "number" ? jCat.habilitados_count : m.habilitados_count,
          habilitados_max:
            jCat.habilitados_max === null || jCat.habilitados_max === undefined ? null : Number(jCat.habilitados_max),
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

  const statsReadiness = useMemo(() => {
    let prontos = 0;
    let pendentes = 0;
    for (const i of itemsFiltrados) {
      if (isSemente(i) || isGrupoOculto(i.sku)) continue;
      if (skuProntoParaVender(i)) prontos += 1;
      else pendentes += 1;
    }
    return { prontos, pendentes, total: prontos + pendentes };
  }, [itemsFiltrados]);

  const gruposBase = useMemo(() => agruparPaiFilhos(itemsFiltrados), [itemsFiltrados]);

  const grupos = useMemo(() => {
    if (filtroReadiness !== "pendentes") return gruposBase;
    return gruposBase.filter((grupo) => {
      const list = [grupo.pai, ...grupo.filhos].filter(Boolean) as ItemSKU[];
      return list.some((it) => !skuProntoParaVender(it));
    });
  }, [gruposBase, filtroReadiness]);

  useEffect(() => {
    if (q.trim()) setGruposExpandidos(new Set(grupos.map((g) => g.paiKey)));
  }, [q, grupos]); // eslint-disable-line react-hooks/exhaustive-deps

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
          title="Produtos"
          subtitle={
            <>
              Vincule o armazém da organização, veja os preços (o que você paga, com 15% DropCore quando aplicável) e escolha quais SKUs a API ERP pode vender.
              <span className="block mt-2 text-sm">
                <Link href="/seller/catalogo" className="font-semibold text-emerald-700 dark:text-emerald-400 hover:underline">
                  Explorar catálogos (vitrine)
                </Link>{" "}
                sem compromisso — depois volte aqui para ligar o armazém e habilitar os SKUs.
              </span>
            </>
          }
        />

        <p className="text-xs text-neutral-500 dark:text-neutral-400 -mt-2 mb-1">
          <Link href="/seller/integracoes-erp/mapeamento" className="font-medium text-emerald-600 dark:text-emerald-400 hover:underline">
            Guia: mapeamento SKU
          </Link>{" "}
          (como ligar anúncio no marketplace ao cadastro do ERP e ao DropCore).
        </p>

        {!loading && !error && fornecedoresLista !== null && (
          <section className="rounded-2xl border border-neutral-200/85 dark:border-neutral-700/60 bg-white/95 dark:bg-neutral-900/75 px-4 py-4 sm:px-5 sm:py-4 shadow-sm space-y-3">
            <h2 className="text-sm font-bold text-neutral-900 dark:text-neutral-100">Armazém (fornecedor)</h2>
            {fornecedoresLoadErr && (
              <p className="text-xs text-amber-800 dark:text-amber-200">{fornecedoresLoadErr}</p>
            )}
            {fornecedoresLista.length === 0 ? (
              <p className="text-sm text-neutral-600 dark:text-neutral-400">Não há fornecedores na organização.</p>
            ) : (
              <>
                <label className="block space-y-1">
                  <span className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">Ligar catálogo da API a</span>
                  <select
                    value={vinculoSelectId}
                    onChange={(e) => setVinculoSelectId(e.target.value)}
                    className="w-full rounded-xl border border-neutral-200 dark:border-neutral-600 bg-neutral-50/80 dark:bg-neutral-950/50 px-3 py-2.5 text-sm text-neutral-900 dark:text-neutral-100"
                  >
                    <option value="">— Nenhum (só se a org autorizar) —</option>
                    {fornecedoresLista.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.nome_publico}
                        {f.local_resumido ? ` · ${f.local_resumido}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
                {vinculoMeta && !vinculoMeta.pode_trocar_agora && vinculoMeta.pode_trocar_fornecedor_a_partir_de && (
                  <p className="text-[11px] text-neutral-600 dark:text-neutral-400">
                    Troca de armazém liberada a partir de{" "}
                    {new Date(vinculoMeta.pode_trocar_fornecedor_a_partir_de).toLocaleDateString("pt-BR")} (mín. {vinculoMeta.meses_minimos} meses), salvo liberação da organização.
                  </p>
                )}
                {precisaAceiteVinculo && (
                  <label className="flex items-start gap-2 text-xs text-neutral-700 dark:text-neutral-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={vinculoAceiteUso}
                      onChange={(e) => setVinculoAceiteUso(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-neutral-300 text-emerald-600"
                    />
                    <span>Confirmo o uso operacional deste armazém (SKU, prazos e políticas da org) ao vincular.</span>
                  </label>
                )}
                <button
                  type="button"
                  disabled={
                    vinculoSaving ||
                    (vinculoMeta != null && !vinculoMeta.pode_trocar_agora && (vinculoSelectId.trim() || "") !== (fornecedorLigadoId ?? "")) ||
                    (precisaAceiteVinculo && !vinculoAceiteUso)
                  }
                  onClick={() => void gravarVinculoFornecedor()}
                  className="w-full sm:w-auto rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold px-5 py-3 touch-manipulation"
                >
                  {vinculoSaving ? "Salvando..." : "Salvar armazém"}
                </button>
              </>
            )}
          </section>
        )}

        {!loading &&
          !error &&
          catalogMeta.sem_armazem_ligado &&
          fornecedoresLista !== null &&
          fornecedoresLista.length > 0 && (
            <div
              className="rounded-2xl border border-neutral-200/90 dark:border-neutral-700/70 bg-white dark:bg-neutral-900/70 shadow-sm overflow-hidden"
              role="status"
            >
              <div className="h-1 w-full bg-gradient-to-r from-emerald-500 to-teal-600" aria-hidden />
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3.5 sm:px-5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-200/80 dark:ring-emerald-800/50">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 9h18v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9Z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 9V7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Catálogo da API — escolha um armazém</p>
                  <p className="text-xs sm:text-[13px] text-neutral-600 dark:text-neutral-400 leading-relaxed">
                    Com «Nenhum» no seletor, <strong className="text-neutral-800 dark:text-neutral-200">não listamos SKUs</strong> da org aqui. Vincule o armazém para preços e habilitação ERP. Vitrines só de consulta:{" "}
                    <Link href="/seller/catalogo" className="font-semibold text-emerald-700 dark:text-emerald-400 underline-offset-2 hover:underline">
                      Catálogos
                    </Link>
                    .
                  </p>
                </div>
              </div>
            </div>
          )}

        {!loading && !catalogMeta.tabela_ok && (
          <div className="rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/35 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
            A lista de SKUs habilitados para venda ainda não está disponível na base (migração pendente). Execute o script{" "}
            <code className="text-xs bg-amber-100/80 dark:bg-amber-900/50 px-1 rounded">web/scripts/create-seller-skus-habilitados.sql</code>{" "}
            no Supabase para ativar o limite de 15 no Starter e a integração ERP alinhada ao catálogo.
          </div>
        )}

        {!loading && catalogMeta.tabela_ok && !planoSellerPro && (
          <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50/90 dark:bg-neutral-800/40 px-4 py-3 text-sm text-neutral-800 dark:text-neutral-200">
            <strong>Plano Starter:</strong> escolha até 15 SKUs para habilitar para venda (API ERP e pedidos). SKUs com prefixo de sistema não contam nesse limite.
            {catalogMeta.habilitados_max != null && (
              <span className="block mt-1 text-neutral-600 dark:text-neutral-400">
                Habilitados agora:{" "}
                <strong className="text-neutral-900 dark:text-neutral-100">
                  {catalogMeta.habilitados_count}/{catalogMeta.habilitados_max}
                </strong>
                . Marque os SKUs que quiser vender; a API ERP recusa itens fora desta lista. Para limites maiores, faça upgrade para o plano Pro.
              </span>
            )}
          </div>
        )}

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
          <div className="space-y-3">
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              {q ? `${totalSkus} SKU${totalSkus !== 1 ? "s" : ""} encontrado${totalSkus !== 1 ? "s" : ""}` : `${totalSkus} SKU${totalSkus !== 1 ? "s" : ""} no catálogo`}
              {" · "}
              {filtroReadiness === "pendentes" ? grupos.length : gruposBase.length} grupo
              {(filtroReadiness === "pendentes" ? grupos.length : gruposBase.length) !== 1 ? "s" : ""}
              {filtroReadiness === "pendentes" && statsReadiness.pendentes > 0 && (
                <span className="text-neutral-400 dark:text-neutral-500"> (filtrado)</span>
              )}
              {statsReadiness.total > 0 && (
                <>
                  {" · "}
                  <span className="text-emerald-600 dark:text-emerald-400 font-medium">{statsReadiness.prontos} pronto{statsReadiness.prontos !== 1 ? "s" : ""}</span>
                  {statsReadiness.pendentes > 0 && (
                    <>
                      {" · "}
                      <span className="text-amber-600 dark:text-amber-400 font-medium">{statsReadiness.pendentes} com pendência{statsReadiness.pendentes !== 1 ? "s" : ""}</span>
                    </>
                  )}
                </>
              )}
            </p>
            <div className="flex flex-col min-[480px]:flex-row min-[480px]:items-start gap-2 min-[480px]:gap-4">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setFiltroReadiness("todos")}
                  className={`rounded-full px-3.5 py-1.5 text-xs font-semibold border transition touch-manipulation ${
                    filtroReadiness === "todos"
                      ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200"
                      : "border-neutral-200 dark:border-neutral-600 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
                  }`}
                >
                  Todos os grupos
                </button>
                <button
                  type="button"
                  onClick={() => setFiltroReadiness("pendentes")}
                  disabled={statsReadiness.pendentes === 0}
                  className={`rounded-full px-3.5 py-1.5 text-xs font-semibold border transition touch-manipulation disabled:opacity-45 disabled:cursor-not-allowed ${
                    filtroReadiness === "pendentes"
                      ? "border-amber-500 bg-amber-50 dark:bg-amber-950/35 text-amber-900 dark:text-amber-200"
                      : "border-neutral-200 dark:border-neutral-600 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
                  }`}
                >
                  Só grupos com pendência
                </button>
              </div>
              <details className="text-xs text-neutral-500 dark:text-neutral-400 min-[480px]:max-w-md [&_summary]:cursor-pointer [&_summary]:select-none">
                <summary className="font-medium text-neutral-600 dark:text-neutral-300">O que significa “Pronto p/ vender”?</summary>
                <p className="mt-1.5 leading-relaxed pl-0.5">
                  É um checklist local no painel: nome, foto ou link de fotos, custo, estoque acima de zero, medidas do pacote, NCM com 8 dígitos e descrição com pelo menos 20 caracteres.
                  Use como guia antes de publicar anúncios e de mandar o mesmo SKU pelo ERP — o fornecedor precisa completar o que faltar no cadastro.
                </p>
              </details>
            </div>
          </div>
        )}

        {/* Estados */}
        {loading && (
          <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/60 shadow-sm p-16 text-center">
            <span className="inline-block w-10 h-10 border-2 border-neutral-200 dark:border-neutral-700 border-t-emerald-500 rounded-full animate-spin mb-4" />
            <p className="text-sm text-neutral-600 dark:text-neutral-400">Carregando catálogo...</p>
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
            <p className="text-neutral-500 dark:text-neutral-400 text-sm font-medium">
              {filtroReadiness === "pendentes" && itemsFiltrados.some((i) => !isSemente(i) && !isGrupoOculto(i.sku))
                ? "Nenhum grupo com pendência neste recorte — os SKUs visíveis passam no checklist (ou a busca não inclui itens pendentes)."
                : q
                  ? "Nenhum SKU encontrado para essa busca."
                  : catalogMeta.sem_armazem_ligado
                    ? "Vincule um armazém na seção acima para carregar os SKUs deste seller."
                    : "Catálogo vazio."}
            </p>
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
                  formatPesoCatalogo(rep.peso_kg),
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
                        onOpenMedidas={() => void abrirTabelaMedidas(grupo.paiKey)}
                        omitHeading
                      />
                    )}
                    <div className="grid grid-cols-2 gap-2 sm:gap-4 xl:grid-cols-3">
                      {grupo.pai && (
                        <ItemCard
                          item={grupo.pai}
                          sóVariante
                          habilitarRow={
                            starterComLimiteHabilitados
                              ? {
                                  starterComLimite: true,
                                  isento: !skuContaLimiteHabilitacaoSeller(grupo.pai.sku),
                                  habilitado: grupo.pai.habilitado_venda === true,
                                  loading: toggleLoadingId === grupo.pai.id,
                                  onToggle: () => setSkuHabilitado(grupo.pai!, !(grupo.pai!.habilitado_venda === true)),
                                }
                              : undefined
                          }
                        />
                      )}
                      {grupo.filhos.map((item) => (
                        <ItemCard
                          key={item.id}
                          item={item}
                          sóVariante
                          habilitarRow={
                            starterComLimiteHabilitados
                              ? {
                                  starterComLimite: true,
                                  isento: !skuContaLimiteHabilitacaoSeller(item.sku),
                                  habilitado: item.habilitado_venda === true,
                                  loading: toggleLoadingId === item.id,
                                  onToggle: () => setSkuHabilitado(item, !(item.habilitado_venda === true)),
                                }
                              : undefined
                          }
                        />
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
              {loadingTabela && <div className="flex items-center gap-2 text-sm text-neutral-500 py-6"><span className="inline-block w-5 h-5 border-2 border-neutral-300 border-t-blue-500 rounded-full animate-spin" /> Carregando...</div>}
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

      <SellerNav active="produtos" />
    </div>
  );
}
