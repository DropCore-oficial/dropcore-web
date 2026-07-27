"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { SellerNav } from "@/app/seller/SellerNav";
import { SellerPageHeader } from "@/components/seller/SellerPageHeader";
import { ProdutoResumoListaGrupo } from "@/components/fornecedor/ProdutoResumoListaGrupo";
import type { SellerCatalogoItem } from "@/components/seller/SellerCatalogoGrupoUi";
import {
  agruparPaiFilhosSeller as agruparPaiFilhos,
  normalizarItemsSellerCatalogo as normalizarItems,
  strSellerCatalogo as str,
} from "@/components/seller/SellerCatalogoGrupoUi";
import { agruparVariantesPorCor } from "@/lib/armazemAgruparCor";
import { ordenarTamanhosLista } from "@/lib/fornecedorVariantesUi";
import { catalogoV2UrlImagem } from "@/components/seller/catalogo/v2/catalogoV2Imagem";
import { sellerGrupoToProdutoResumoListaGrupoProps } from "@/components/seller/catalogo/v2/mapSellerGrupoToProdutoResumoLista";
import { DANGER_PREMIUM_SHELL, DANGER_PREMIUM_TEXT_PRIMARY } from "@/lib/semanticPremium";
import { cn } from "@/lib/utils";

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

type Props = { fornecedorId: string; paiKey: string };

function fmtCusto(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v) || v <= 0) return "—";
  return BRL.format(v);
}

export function SellerCatalogoProdutoDetalheClient({ fornecedorId, paiKey }: Props) {
  const router = useRouter();
  const [items, setItems] = useState<SellerCatalogoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [corSelecionada, setCorSelecionada] = useState<string | null>(null);
  const [tamanhoSelecionado, setTamanhoSelecionado] = useState<string | null>(null);

  const voltarHref = `/seller/catalogo#fornecedor-${encodeURIComponent(fornecedorId)}`;

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
        const res = await fetch(`/api/seller/catalogo-preview?fornecedor_id=${encodeURIComponent(fornecedorId)}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) throw new Error(json.error || "Erro ao carregar produto");
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

  const grupo = useMemo(() => agruparPaiFilhos(items).find((g) => g.paiKey === paiKey) ?? null, [items, paiKey]);

  const itensGrupo = useMemo(() => {
    if (!grupo) return [];
    return grupo.pai ? [grupo.pai, ...grupo.filhos] : grupo.filhos;
  }, [grupo]);

  const gruposPorCor = useMemo(() => agruparVariantesPorCor(itensGrupo), [itensGrupo]);

  useEffect(() => {
    if (gruposPorCor.length === 0) {
      setCorSelecionada(null);
      return;
    }
    setCorSelecionada((prev) => (prev && gruposPorCor.some((g) => g.key === prev) ? prev : gruposPorCor[0].key));
  }, [gruposPorCor]);

  const itensCor = useMemo(
    () => gruposPorCor.find((g) => g.key === corSelecionada)?.itens ?? [],
    [gruposPorCor, corSelecionada]
  );

  const tamanhosDisponiveis = useMemo(
    () => ordenarTamanhosLista([...new Set(itensCor.map((i) => str(i.tamanho).trim()).filter(Boolean))]),
    [itensCor]
  );

  useEffect(() => {
    if (tamanhosDisponiveis.length === 0) {
      setTamanhoSelecionado(null);
      return;
    }
    setTamanhoSelecionado((prev) => (prev && tamanhosDisponiveis.includes(prev) ? prev : tamanhosDisponiveis[0]));
  }, [tamanhosDisponiveis]);

  const itemSelecionado = useMemo(
    () => itensCor.find((i) => str(i.tamanho).trim() === tamanhoSelecionado) ?? itensCor[0] ?? null,
    [itensCor, tamanhoSelecionado]
  );

  const fotoSrc = useMemo(() => {
    const url = itemSelecionado?.imagem_url?.trim() || itensCor.find((i) => i.imagem_url?.trim())?.imagem_url || null;
    return url ? catalogoV2UrlImagem(url) : null;
  }, [itemSelecionado, itensCor]);

  const nomeProduto = itensGrupo[0] ? str(itensGrupo[0].nome_produto) || paiKey : paiKey;

  const resumoProps = useMemo(() => {
    if (!grupo) return null;
    try {
      return sellerGrupoToProdutoResumoListaGrupoProps(grupo, fornecedorId);
    } catch {
      return null;
    }
  }, [grupo, fornecedorId]);

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] app-bg pt-[calc(3rem+env(safe-area-inset-top,0px))] md:pt-14 pb-5">
      <div className="dropcore-shell-6xl pt-6 lg:pt-8 pb-5 md:pb-7 space-y-5">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Link href={voltarHref} className="font-medium text-emerald-700 dark:text-emerald-400 hover:underline">
            ← Catálogo do fornecedor
          </Link>
        </div>

        {loading && (
          <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] shadow-sm p-12 text-center text-sm text-[var(--muted)]">
            A carregar produto...
          </div>
        )}
        {error && (
          <div className={cn(DANGER_PREMIUM_SHELL, DANGER_PREMIUM_TEXT_PRIMARY, "rounded-xl p-4 text-sm")}>
            {error}
          </div>
        )}
        {!loading && !error && !grupo && (
          <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-12 text-center text-sm text-[var(--muted)]">
            Produto não encontrado neste catálogo.
          </div>
        )}

        {!loading && !error && grupo && (
          <>
            <SellerPageHeader surface="hero" title={nomeProduto} backHref={voltarHref} />

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 lg:gap-8">
              <div className="aspect-square w-full max-w-xl overflow-hidden rounded-2xl border border-[var(--card-border)] bg-[var(--muted)]/10 mx-auto lg:mx-0">
                {fotoSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={fotoSrc} alt={nomeProduto} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-sm text-[var(--muted)]">
                    Sem foto
                  </div>
                )}
              </div>

              <div className="min-w-0 space-y-5">
                <p className="text-2xl font-bold tabular-nums text-[var(--foreground)]">
                  {fmtCusto(itemSelecionado?.custo_total)}
                </p>

                {gruposPorCor.length > 1 && (
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                      Cor: <span className="normal-case text-[var(--foreground)]">{corSelecionada ? gruposPorCor.find((g) => g.key === corSelecionada)?.corLabel : ""}</span>
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {gruposPorCor.map((g) => {
                        const fotoCor = g.itens.find((i) => i.imagem_url?.trim())?.imagem_url ?? null;
                        const srcCor = fotoCor ? catalogoV2UrlImagem(fotoCor) : null;
                        const ativo = g.key === corSelecionada;
                        return (
                          <button
                            key={g.key}
                            type="button"
                            onClick={() => setCorSelecionada(g.key)}
                            title={g.corLabel}
                            className={cn(
                              "h-14 w-14 shrink-0 overflow-hidden rounded-xl border-2 bg-[var(--muted)]/10 transition",
                              ativo
                                ? "border-emerald-600 ring-2 ring-emerald-600/25"
                                : "border-[var(--card-border)] hover:border-emerald-300"
                            )}
                          >
                            {srcCor ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={srcCor} alt={g.corLabel} className="h-full w-full object-cover" />
                            ) : (
                              <span className="flex h-full w-full items-center justify-center text-[10px] text-[var(--muted)]">
                                {g.corLabel.slice(0, 3)}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {tamanhosDisponiveis.length > 0 && (
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">Tamanho</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {tamanhosDisponiveis.map((tam) => {
                        const ativo = tam === tamanhoSelecionado;
                        return (
                          <button
                            key={tam}
                            type="button"
                            onClick={() => setTamanhoSelecionado(tam)}
                            className={cn(
                              "rounded-full border px-3.5 py-1.5 text-[11px] font-medium transition",
                              ativo
                                ? "border-emerald-600 bg-emerald-600 text-white"
                                : "border-[var(--card-border)] bg-[var(--card)] text-[var(--foreground)] hover:border-emerald-300"
                            )}
                          >
                            {tam}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <p className="text-sm text-[var(--muted)]">
                  {itemSelecionado?.estoque_atual != null && itemSelecionado.estoque_atual > 0
                    ? `${itemSelecionado.estoque_atual} em estoque no armazém`
                    : "Sem estoque nessa combinação no momento"}
                  {itemSelecionado?.sku ? (
                    <span className="ml-1.5 font-mono text-[11px] text-[var(--muted)]/80">· {itemSelecionado.sku}</span>
                  ) : null}
                </p>
              </div>
            </div>

            {resumoProps && (
              <ProdutoResumoListaGrupo
                {...resumoProps}
                somenteLeitura
              />
            )}
          </>
        )}
      </div>

      <SellerNav active="fornecedores" wide />
    </div>
  );
}
