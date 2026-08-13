"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { SellerNav } from "@/app/seller/SellerNav";
import { SellerPageHeader } from "@/components/seller/SellerPageHeader";
import { toTitleCase } from "@/lib/formatText";
import type { SellerCatalogoItem } from "@/components/seller/SellerCatalogoGrupoUi";
import {
  agruparPaiFilhosSeller as agruparPaiFilhos,
  normalizarItemsSellerCatalogo as normalizarItems,
  strSellerCatalogo as str,
  isSementeSellerCatalogo as isSemente,
  isGrupoOcultoSellerCatalogo as isGrupoOculto,
} from "@/components/seller/SellerCatalogoGrupoUi";
import { SellerCatalogoProdutoGrid } from "@/components/seller/SellerCatalogoProdutoGrid";
import { DANGER_PREMIUM_SHELL, DANGER_PREMIUM_TEXT_PRIMARY } from "@/lib/semanticPremium";
import { ProdutoGridSkeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";

type Props = { fornecedorId: string; nomeArmazem?: string };

export function SellerCatalogoFornecedorPreviewClient({ fornecedorId, nomeArmazem }: Props) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [items, setItems] = useState<SellerCatalogoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const totalSkus = itemsFiltrados.filter((i) => !isSemente(i) && !isGrupoOculto(i.sku)).length;

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] app-bg pt-[calc(3rem+env(safe-area-inset-top,0px))] md:pt-14 pb-5">
      <div className="dropcore-shell-6xl pt-6 lg:pt-8 pb-5 md:pb-7 space-y-5">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Link href="/seller/catalogo" className="font-medium text-emerald-700 dark:text-emerald-400 hover:underline">
            ← Vitrine dos fornecedores
          </Link>
        </div>

        <SellerPageHeader
          surface="hero"
          title={nomeArmazem ? `Vitrine · ${nomeArmazem}` : "Vitrine do armazém"}
          subtitle={
            <>
              Conheça o catálogo deste fornecedor antes de vincular — fotos, preço (já com repasse
              DropCore quando aplicável) e variantes. Toque num produto pra ver cores, tamanhos e detalhes.
            </>
          }
        />

        <div className="flex flex-col min-[420px]:flex-row gap-2 min-w-0">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onBlur={() => setQ(toTitleCase(q))}
            placeholder="Nome, SKU, cor ou tamanho..."
            className="min-w-0 w-full min-[420px]:flex-1 rounded-2xl bg-[var(--card)] border border-[var(--card-border)] px-4 py-3.5 text-[var(--foreground)] text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/25 focus:border-emerald-500/50 shadow-sm"
          />
          {q && (
            <button
              type="button"
              onClick={() => setQ("")}
              className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] px-4 py-3 text-sm text-[var(--muted)] hover:bg-[var(--muted)]/10 font-medium touch-manipulation shrink-0"
            >
              Limpar
            </button>
          )}
        </div>

        {loading && <ProdutoGridSkeleton />}
        {error && (
          <div className={cn(DANGER_PREMIUM_SHELL, DANGER_PREMIUM_TEXT_PRIMARY, "rounded-xl p-4 text-sm")}>
            {error}
          </div>
        )}
        {!loading && !error && items.length > 0 && (
          <p className="text-sm text-[var(--muted)]">
            {totalSkus} SKU{totalSkus !== 1 ? "s" : ""} · {grupos.length} produto{grupos.length !== 1 ? "s" : ""}
          </p>
        )}

        {!loading && !error && (
          <SellerCatalogoProdutoGrid
            fornecedorId={fornecedorId}
            items={itemsFiltrados}
            vazioMensagem={q ? "Nenhum resultado para essa busca." : "Sem SKUs ativos para este armazém."}
          />
        )}
      </div>

      <SellerNav active="fornecedores" wide />
    </div>
  );
}
