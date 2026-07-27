"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { SellerNav } from "@/app/seller/SellerNav";
import { SellerPageHeader } from "@/components/seller/SellerPageHeader";
import { normalizarFornecedoresSellerApi, type FornecedorSellerListaRow } from "@/lib/mapFornecedorSellerPublico";
import type { SellerFornecedoresList } from "@/lib/sellerFornecedoresList";
import {
  normalizarItemsSellerCatalogo as normalizarItems,
  type SellerCatalogoItem,
} from "@/components/seller/SellerCatalogoGrupoUi";
import { SellerCatalogoProdutoLinha } from "@/components/seller/SellerCatalogoProdutoLinha";
import { DANGER_PREMIUM_SHELL, DANGER_PREMIUM_TEXT_PRIMARY } from "@/lib/semanticPremium";
import { AMBER_PREMIUM_SHELL, AMBER_PREMIUM_TEXT_PRIMARY } from "@/lib/amberPremium";
import { cn } from "@/lib/utils";

type FornecedorState = {
  items: SellerCatalogoItem[];
  loading: boolean;
  error: string | null;
};

type VinculoMeta = SellerFornecedoresList["vinculo"];

/** Vitrine única com o catálogo de todos os fornecedores da organização, cada um já
 * expandido — sem precisar escolher um fornecedor antes pra ver os produtos. */
export function SellerCatalogoVitrineClient() {
  const router = useRouter();
  const [fornecedores, setFornecedores] = useState<FornecedorSellerListaRow[] | null>(null);
  const [fornecedorLigadoId, setFornecedorLigadoId] = useState<string | null>(null);
  const [loadingFornecedores, setLoadingFornecedores] = useState(true);
  const [errorFornecedores, setErrorFornecedores] = useState<string | null>(null);
  const [porFornecedor, setPorFornecedor] = useState<Record<string, FornecedorState>>({});
  const [vinculo, setVinculo] = useState<VinculoMeta | null>(null);
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null);
  const [aceiteUso, setAceiteUso] = useState(false);
  const [vinculando, setVinculando] = useState<string | null>(null);
  const [vinculoErro, setVinculoErro] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingFornecedores(true);
      setErrorFornecedores(null);
      try {
        const {
          data: { session },
        } = await supabaseBrowser.auth.getSession();
        if (!session?.access_token) {
          router.replace("/seller/login");
          return;
        }
        const authH = { Authorization: `Bearer ${session.access_token}` };
        const res = await fetch("/api/seller/catalogo?include_fornecedores=1", {
          headers: authH,
          cache: "no-store",
        });
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) throw new Error(json.error || "Erro ao carregar fornecedores");
        const lista = normalizarFornecedoresSellerApi(json.fornecedores);
        setFornecedores(lista);
        const fid = typeof json.fornecedor_id === "string" && json.fornecedor_id.trim() ? json.fornecedor_id.trim() : null;
        setFornecedorLigadoId(fid);
        setVinculo((json.vinculo ?? null) as VinculoMeta | null);

        for (const f of lista) {
          setPorFornecedor((prev) => ({ ...prev, [f.id]: { items: [], loading: true, error: null } }));
          fetch(`/api/seller/catalogo-preview?fornecedor_id=${encodeURIComponent(f.id)}`, { headers: authH })
            .then(async (r) => {
              const j = await r.json().catch(() => ({}));
              if (cancelled) return;
              if (!r.ok) throw new Error(j.error || "Erro ao carregar catálogo");
              setPorFornecedor((prev) => ({
                ...prev,
                [f.id]: { items: normalizarItems(j.items), loading: false, error: null },
              }));
            })
            .catch((e: unknown) => {
              if (cancelled) return;
              setPorFornecedor((prev) => ({
                ...prev,
                [f.id]: { items: [], loading: false, error: e instanceof Error ? e.message : "Erro inesperado" },
              }));
            });
        }
      } catch (e: unknown) {
        if (!cancelled) {
          setErrorFornecedores(e instanceof Error ? e.message : "Erro inesperado");
          setFornecedores([]);
        }
      } finally {
        if (!cancelled) setLoadingFornecedores(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function vincularFornecedor(fornecedorId: string) {
    setVinculando(fornecedorId);
    setVinculoErro(null);
    try {
      const {
        data: { session },
      } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) {
        router.replace("/seller/login");
        return;
      }
      const res = await fetch("/api/seller/fornecedor-vinculo", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ fornecedor_id: fornecedorId, aceite_uso_operacional: true }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Erro ao vincular fornecedor");
      const newId = typeof json.fornecedor_id === "string" && json.fornecedor_id ? json.fornecedor_id : null;
      setFornecedorLigadoId(newId);
      setConfirmandoId(null);
      setAceiteUso(false);
      const r2 = await fetch("/api/seller/fornecedores", { headers: { Authorization: `Bearer ${session.access_token}` } });
      const j2 = await r2.json().catch(() => ({}));
      if (r2.ok && j2.ok) setVinculo((j2.vinculo ?? null) as VinculoMeta | null);
    } catch (e: unknown) {
      setVinculoErro(e instanceof Error ? e.message : "Erro inesperado");
    } finally {
      setVinculando(null);
    }
  }

  const fornecedorAtualNome = useMemo(
    () => fornecedores?.find((x) => x.id === fornecedorLigadoId)?.nome_publico ?? null,
    [fornecedores, fornecedorLigadoId]
  );

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] app-bg pt-[calc(3rem+env(safe-area-inset-top,0px))] md:pt-14 pb-5">
      <div className="dropcore-shell-6xl pt-6 lg:pt-8 pb-5 md:pb-7 space-y-6">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Link href="/seller/produtos" className="font-medium text-emerald-700 dark:text-emerald-400 hover:underline">
            ← Produtos
          </Link>
        </div>

        <SellerPageHeader
          surface="hero"
          title="Vitrine dos fornecedores"
          subtitle="Conheça o catálogo de cada fornecedor da sua organização — fotos, preço e variantes, tudo aqui."
        />

        {fornecedores && fornecedores.length > 1 && (
          <div className="flex flex-wrap gap-2">
            {fornecedores.map((f) => (
              <a
                key={f.id}
                href={`#fornecedor-${f.id}`}
                className="rounded-full border border-[var(--card-border)] bg-[var(--card)] px-3.5 py-1.5 text-[11px] font-medium text-[var(--foreground)] hover:border-emerald-300"
              >
                {f.nome_publico}
              </a>
            ))}
          </div>
        )}

        {loadingFornecedores && (
          <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] shadow-sm p-12 text-center text-sm text-[var(--muted)]">
            A carregar fornecedores...
          </div>
        )}
        {errorFornecedores && (
          <div className={cn(DANGER_PREMIUM_SHELL, DANGER_PREMIUM_TEXT_PRIMARY, "rounded-xl p-4 text-sm")}>
            {errorFornecedores}
          </div>
        )}
        {!loadingFornecedores && !errorFornecedores && fornecedores?.length === 0 && (
          <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-12 text-center text-sm text-[var(--muted)]">
            Não há fornecedores na organização.
          </div>
        )}

        {fornecedores?.map((f) => {
          const estado = porFornecedor[f.id];
          const escolhido = f.id === fornecedorLigadoId;
          return (
            <section
              key={f.id}
              id={`fornecedor-${f.id}`}
              className={cn(
                "rounded-2xl border p-4 shadow-sm sm:p-5",
                escolhido
                  ? "border-emerald-300 bg-emerald-50/60 dark:border-emerald-700/50 dark:bg-emerald-950/20"
                  : "border-[var(--card-border)] bg-[var(--card)]"
              )}
            >
              <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <div className="min-w-0">
                  {escolhido && (
                    <span className="mb-1.5 inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2.5 py-0.5 text-[10px] font-bold text-white">
                      <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                      FORNECEDOR VINCULADO
                    </span>
                  )}
                  <div className="flex flex-col gap-0.5 sm:flex-row sm:flex-wrap sm:items-baseline sm:gap-x-2 sm:gap-y-0">
                    <h2 className="text-lg font-bold tracking-tight text-[var(--foreground)] sm:text-xl">{f.nome_publico}</h2>
                    {f.local_resumido && (
                      <p className="text-sm text-[var(--muted)] sm:text-base">
                        <span className="hidden sm:inline">· </span>
                        {f.local_resumido}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  {!escolhido && confirmandoId !== f.id && !(vinculo && !vinculo.pode_trocar_agora) && (
                    <button
                      type="button"
                      disabled={vinculo === null}
                      onClick={() => {
                        setConfirmandoId(f.id);
                        setAceiteUso(false);
                        setVinculoErro(null);
                      }}
                      className={cn(
                        "hidden shrink-0 rounded-md px-2.5 py-1.5 text-[11px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 sm:inline-flex",
                        fornecedorLigadoId
                          ? "border border-[var(--card-border)] bg-[var(--card)] text-[var(--foreground)] hover:bg-[var(--muted)]/10"
                          : "bg-emerald-600 text-white shadow-sm hover:bg-emerald-700"
                      )}
                    >
                      {fornecedorLigadoId ? "Trocar para este fornecedor" : "Vincular a este fornecedor"}
                    </button>
                  )}
                  <Link
                    href={`/seller/catalogo/fornecedor/${encodeURIComponent(f.id)}?n=${encodeURIComponent(f.nome_publico)}`}
                    className="shrink-0 text-[12px] font-semibold text-emerald-700 hover:underline dark:text-emerald-400"
                  >
                    Todos os produtos →
                  </Link>
                </div>
              </div>

              {!escolhido && (confirmandoId === f.id || (vinculo && !vinculo.pode_trocar_agora)) && (
                <div className="mb-3 space-y-2">
                  {confirmandoId === f.id ? (
                    <div className="space-y-3 rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-3">
                      {fornecedorLigadoId && (
                        <div className={cn(AMBER_PREMIUM_SHELL, AMBER_PREMIUM_TEXT_PRIMARY, "rounded-lg p-3 text-[13px] leading-relaxed")}>
                          Você já tem <strong>{fornecedorAtualNome ?? "outro fornecedor"}</strong> vinculado. Trocar para{" "}
                          <strong>{f.nome_publico}</strong> substitui esse vínculo agora, e a próxima troca só é liberada depois do prazo mínimo.
                        </div>
                      )}
                      <label className="flex cursor-pointer items-start gap-2 text-sm text-[var(--foreground)]">
                        <input
                          type="checkbox"
                          checked={aceiteUso}
                          onChange={(e) => setAceiteUso(e.target.checked)}
                          className="mt-1 h-4 w-4 accent-[var(--accent)]"
                        />
                        <span>
                          {fornecedorLigadoId
                            ? "Confirmo que quero trocar de fornecedor e usar os dados deste fornecedor para operação na DropCore."
                            : "Confirmo o uso operacional deste fornecedor ao vincular."}
                        </span>
                      </label>
                      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                        <button
                          type="button"
                          disabled={!aceiteUso || vinculando === f.id}
                          onClick={() => void vincularFornecedor(f.id)}
                          className="w-full rounded-md bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                        >
                          {vinculando === f.id ? "Vinculando..." : fornecedorLigadoId ? "Confirmar troca" : "Confirmar vínculo"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setConfirmandoId(null);
                            setAceiteUso(false);
                            setVinculoErro(null);
                          }}
                          className="w-full rounded-md border border-[var(--card-border)] bg-[var(--card)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--foreground)] hover:bg-[var(--muted)]/10 sm:w-auto"
                        >
                          Cancelar
                        </button>
                      </div>
                      {vinculoErro && (
                        <p className={cn(DANGER_PREMIUM_TEXT_PRIMARY, "text-[12px]")}>{vinculoErro}</p>
                      )}
                    </div>
                  ) : (
                    <p className="text-[12px] text-[var(--muted)]">
                      Troca de fornecedor liberada a partir de{" "}
                      {vinculo?.pode_trocar_fornecedor_a_partir_de
                        ? new Date(vinculo.pode_trocar_fornecedor_a_partir_de).toLocaleDateString("pt-BR")
                        : "—"}{" "}
                      (mín. {vinculo?.meses_minimos} meses), salvo liberação da organização.
                    </p>
                  )}
                </div>
              )}

              {!escolhido && confirmandoId !== f.id && !(vinculo && !vinculo.pode_trocar_agora) && (
                <div className="mb-3 sm:hidden">
                  <button
                    type="button"
                    disabled={vinculo === null}
                    onClick={() => {
                      setConfirmandoId(f.id);
                      setAceiteUso(false);
                      setVinculoErro(null);
                    }}
                    className={cn(
                      "w-full rounded-md px-2.5 py-1.5 text-[11px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
                      fornecedorLigadoId
                        ? "border border-[var(--card-border)] bg-[var(--card)] text-[var(--foreground)] hover:bg-[var(--muted)]/10"
                        : "bg-emerald-600 text-white shadow-sm hover:bg-emerald-700"
                    )}
                  >
                    {fornecedorLigadoId ? "Trocar para este fornecedor" : "Vincular a este fornecedor"}
                  </button>
                </div>
              )}

              {!estado || estado.loading ? (
                <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] shadow-sm p-10 text-center text-sm text-[var(--muted)]">
                  A carregar produtos...
                </div>
              ) : estado.error ? (
                <div className={cn(DANGER_PREMIUM_SHELL, DANGER_PREMIUM_TEXT_PRIMARY, "rounded-xl p-4 text-sm")}>
                  {estado.error}
                </div>
              ) : (
                <SellerCatalogoProdutoLinha fornecedorId={f.id} items={estado.items} />
              )}
            </section>
          );
        })}
      </div>

      <SellerNav active="fornecedores" wide />
    </div>
  );
}
