"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { SellerNav } from "@/app/seller/SellerNav";
import { SellerPageHeader } from "@/components/seller/SellerPageHeader";
import { toTitleCase } from "@/lib/formatText";
import { getColunasTabelaMedidas, type TipoProduto } from "@/lib/tipoProduto";
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
} from "@/components/seller/SellerCatalogoGrupoUi";
import { formatPesoCatalogo } from "@/lib/formatPesoCatalogo";

type Props = { fornecedorId: string; nomeArmazem?: string };

export function SellerCatalogoFornecedorPreviewClient({ fornecedorId, nomeArmazem }: Props) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [items, setItems] = useState<SellerCatalogoItem[]>([]);
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
        if (!session?.access_token) {
          router.replace("/seller/login");
          return;
        }
        const res = await fetch(`/api/seller/catalogo-preview?fornecedor_id=${encodeURIComponent(fornecedorId)}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) throw new Error(json.error || "Erro ao carregar vitrine");
        setItems(normalizarItems(json.items));
      } catch (e: unknown) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Erro inesperado");
          setItems([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router, fornecedorId]);

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

  const abrirTabelaMedidas = useCallback(
    async (grupoKey: string) => {
      setModalTabelaGrupoKey(grupoKey);
      setTabelaMedidasData(null);
      setLoadingTabela(true);
      try {
        const { data: { session } } = await supabaseBrowser.auth.getSession();
        if (!session?.access_token) return;
        const u = new URLSearchParams({ grupoKey });
        u.set("fornecedor_id", fornecedorId);
        const res = await fetch(`/api/seller/catalogo/tabela-medidas?${u.toString()}`, {
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
    },
    [fornecedorId],
  );

  const totalSkus = itemsFiltrados.filter((i) => !isSemente(i) && !isGrupoOculto(i.sku)).length;

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] app-bg pt-[calc(3rem+env(safe-area-inset-top,0px))] md:pt-14 pb-[calc(6.25rem+env(safe-area-inset-bottom,0px))] md:pb-8">
      <div className="w-full max-w-6xl mx-auto dropcore-px-wide py-6 lg:py-8 space-y-5">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Link href="/seller/catalogo" className="font-medium text-emerald-700 dark:text-emerald-400 hover:underline">
            ← Catálogos
          </Link>
          <span className="text-neutral-300 dark:text-neutral-600">·</span>
          <Link href="/seller/produtos" className="font-medium text-neutral-600 dark:text-neutral-400 hover:underline">
            Meus produtos (vincular e habilitar SKUs)
          </Link>
        </div>

        <SellerPageHeader
          title={nomeArmazem ? `Vitrine · ${nomeArmazem}` : "Vitrine do armazém"}
          subtitle={
            <>
              Visualização dos produtos deste fornecedor na tua organização — com <strong>preço</strong> (o que pagas, já com 15% DropCore quando aplicável) e fotos.
              Para usar na API ERP, vincula o armazém em <Link href="/seller/produtos" className="text-emerald-700 dark:text-emerald-400 font-semibold hover:underline">Produtos</Link>.
            </>
          }
        />

        <div className="flex flex-col min-[420px]:flex-row gap-2 min-w-0">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onBlur={() => setQ(toTitleCase(q))}
            placeholder="Nome, SKU, cor ou tamanho…"
            className="min-w-0 w-full min-[420px]:flex-1 rounded-2xl bg-white/95 dark:bg-neutral-900/80 border border-neutral-200/80 dark:border-neutral-700/50 px-4 py-3.5 text-neutral-900 dark:text-neutral-100 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/25 focus:border-emerald-500/50 shadow-sm"
          />
          {q && (
            <button
              type="button"
              onClick={() => setQ("")}
              className="rounded-2xl border border-neutral-200 dark:border-neutral-700 px-4 py-3 text-sm text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 font-medium touch-manipulation shrink-0"
            >
              Limpar
            </button>
          )}
        </div>

        {loading && (
          <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/60 shadow-sm p-12 text-center text-sm text-neutral-500">
            A carregar vitrine…
          </div>
        )}
        {error && <div className="rounded-xl border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/40 p-4 text-sm text-red-700 dark:text-red-200">{error}</div>}
        {!loading && !error && items.length > 0 && (
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            {totalSkus} SKU{totalSkus !== 1 ? "s" : ""} · {grupos.length} grupo{grupos.length !== 1 ? "s" : ""}
          </p>
        )}

        {!loading && !error && grupos.length === 0 && (
          <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/60 p-12 text-center text-sm text-neutral-500">
            {q ? "Nenhum resultado para essa busca." : "Sem SKUs ativos para este armazém."}
          </div>
        )}

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
                ]
                  .filter(Boolean)
                  .join(" · ")
              : "";
            const descricaoExpandida = descricaoExpandidaPorGrupo.has(grupo.paiKey);
            return (
              <div
                key={grupo.paiKey}
                className="rounded-2xl border border-neutral-200/80 dark:border-neutral-700/50 bg-white dark:bg-neutral-900/90 shadow-md hover:shadow-lg transition-all duration-300"
              >
                <button
                  type="button"
                  onClick={() => toggleGrupo(grupo.paiKey)}
                  className="w-full flex items-center justify-between px-4 sm:px-5 py-3.5 text-left hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition border-l-4 border-l-transparent hover:border-l-emerald-500"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="font-mono text-xs font-bold text-white bg-neutral-600 dark:bg-neutral-500 rounded-lg px-2.5 py-1 shrink-0">{grupo.paiKey}</span>
                    {nomeGrupo && <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 truncate">{nomeGrupo}</span>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void abrirTabelaMedidas(grupo.paiKey);
                      }}
                      className="text-xs font-medium text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 rounded-lg px-2 py-1"
                    >
                      Medidas
                    </button>
                    <span className="text-xs text-neutral-500 tabular-nums">
                      {total} {total === 1 ? "item" : "itens"}
                    </span>
                    <span className="text-neutral-400 text-sm">{expandido ? "▼" : "▶"}</span>
                  </div>
                </button>
                {expandido && (
                  <div className="px-3 sm:px-4 pb-4 border-t border-neutral-200/80 dark:border-neutral-800/80 space-y-4 pt-4">
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
                      {grupo.pai && <ItemCard item={grupo.pai} sóVariante modoPreview />}
                      {grupo.filhos.map((item) => (
                        <ItemCard key={item.id} item={item} sóVariante modoPreview />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {modalTabelaGrupoKey != null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setModalTabelaGrupoKey(null)}>
          <div
            className="bg-white dark:bg-[var(--card)] rounded-2xl border border-neutral-200 dark:border-[var(--card-border)] shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200 dark:border-[var(--card-border)] bg-neutral-50/80 dark:bg-neutral-800/50">
              <h3 className="font-semibold text-neutral-900 dark:text-neutral-100">
                Tabela de medidas · <span className="font-mono text-neutral-600 dark:text-neutral-400">{modalTabelaGrupoKey}</span>
              </h3>
              <button
                type="button"
                onClick={() => setModalTabelaGrupoKey(null)}
                className="text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 text-xl leading-none w-8 h-8 rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-700 flex items-center justify-center"
              >
                ×
              </button>
            </div>
            <div className="p-4 overflow-auto flex-1">
              {loadingTabela && (
                <div className="flex items-center gap-2 text-sm text-neutral-500 py-6">
                  <span className="inline-block w-5 h-5 border-2 border-neutral-300 border-t-blue-500 rounded-full animate-spin" /> Carregando…
                </div>
              )}
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
                            return (
                              <th key={col} className="px-2 py-1.5 text-left font-medium text-neutral-600 dark:text-neutral-400">
                                {label}
                              </th>
                            );
                          })}
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(medidas).map(([tam, row]) => (
                          <tr key={tam} className="border-b border-neutral-200/60 dark:border-[var(--card-border)]/60">
                            <td className="px-2 py-1.5 font-medium text-neutral-900 dark:text-neutral-100">{tam}</td>
                            {colKeys.map((col) => (
                              <td key={col} className="px-2 py-1.5 text-neutral-700 dark:text-neutral-300">
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

      <SellerNav active="catalogo" />
    </div>
  );
}
