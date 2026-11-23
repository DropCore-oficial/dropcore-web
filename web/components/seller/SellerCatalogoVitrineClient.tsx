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
import { DANGER_PREMIUM_SHELL, DANGER_PREMIUM_TEXT_PRIMARY, INFO_PREMIUM_SHELL, INFO_PREMIUM_TEXT_PRIMARY } from "@/lib/semanticPremium";
import { AMBER_PREMIUM_SHELL, AMBER_PREMIUM_TEXT_PRIMARY } from "@/lib/amberPremium";
import { PRIMARY_ACTION_BLUE_BADGE_SOLID } from "@/lib/primaryActionBlueUi";
import { MODAL_OVERLAY_CLASS, MODAL_PANEL_CLASS, MODAL_PANEL_BODY_CLASS } from "@/lib/modalOverlay";
import { cn } from "@/lib/utils";
import { ProdutoLinhaSkeleton, Skeleton } from "@/components/ui/Skeleton";
import { HelpBubble } from "@/components/HelpBubble";

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
  const [vinculoErroCode, setVinculoErroCode] = useState<string | null>(null);
  const [vinculosCdIds, setVinculosCdIds] = useState<Set<string>>(new Set());
  const [helpCdKey, setHelpCdKey] = useState<string | null>(null);

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
        const [res, resVinculos] = await Promise.all([
          fetch("/api/seller/catalogo?include_fornecedores=1", { headers: authH, cache: "no-store" }),
          fetch("/api/seller/fornecedor-vinculo", { headers: authH, cache: "no-store" }),
        ]);
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) throw new Error(json.error || "Erro ao carregar fornecedores");
        const lista = normalizarFornecedoresSellerApi(json.fornecedores);
        setFornecedores(lista);
        const fid = typeof json.fornecedor_id === "string" && json.fornecedor_id.trim() ? json.fornecedor_id.trim() : null;
        setFornecedorLigadoId(fid);
        setVinculo((json.vinculo ?? null) as VinculoMeta | null);

        const jsonVinculos = await resVinculos.json().catch(() => ({}));
        if (!cancelled && resVinculos.ok && jsonVinculos.ok) {
          const ids = new Set<string>(
            ((jsonVinculos.vinculos ?? []) as { fornecedor_id: string }[]).map((v) => v.fornecedor_id)
          );
          setVinculosCdIds(ids);
        }

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

  /** Vincula (ou troca, se for fornecedor fora do CD) — mesma rota e mesma regra de
   * admissão pro backend, seja fornecedor do CD (aditivo) ou avulso (1:1, substitui). */
  async function vincularFornecedor(fornecedorId: string, operaNoCd: boolean) {
    setVinculando(fornecedorId);
    setVinculoErro(null);
    setVinculoErroCode(null);
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
      if (!res.ok) {
        setVinculoErro(json.error || "Erro ao vincular fornecedor");
        setVinculoErroCode(typeof json.code === "string" ? json.code : null);
        return;
      }
      if (operaNoCd) {
        setVinculosCdIds((prev) => new Set(prev).add(fornecedorId));
      } else {
        const newId = typeof json.fornecedor_id === "string" && json.fornecedor_id ? json.fornecedor_id : null;
        setFornecedorLigadoId(newId);
        const r2 = await fetch("/api/seller/fornecedores", { headers: { Authorization: `Bearer ${session.access_token}` } });
        const j2 = await r2.json().catch(() => ({}));
        if (r2.ok && j2.ok) setVinculo((j2.vinculo ?? null) as VinculoMeta | null);
      }
      setConfirmandoId(null);
      setAceiteUso(false);
    } catch (e: unknown) {
      setVinculoErro(e instanceof Error ? e.message : "Erro inesperado");
      setVinculoErroCode(null);
    } finally {
      setVinculando(null);
    }
  }

  const fornecedorAtualNome = useMemo(
    () => fornecedores?.find((x) => x.id === fornecedorLigadoId)?.nome_publico ?? null,
    [fornecedores, fornecedorLigadoId]
  );

  /** Fornecedor vinculado sempre primeiro na vitrine. */
  const fornecedoresOrdenados = useMemo(() => {
    if (!fornecedores || !fornecedorLigadoId) return fornecedores;
    const idx = fornecedores.findIndex((f) => f.id === fornecedorLigadoId);
    if (idx <= 0) return fornecedores;
    const copy = [...fornecedores];
    const [vinculado] = copy.splice(idx, 1);
    copy.unshift(vinculado);
    return copy;
  }, [fornecedores, fornecedorLigadoId]);

  /** Só mostra fornecedor com produto cadastrado — enquanto o catálogo dele ainda não
   * carregou (ou deu erro), mantém na tela; assim que resolve vazio, some da vitrine. */
  const fornecedoresVisiveis = useMemo(
    () =>
      fornecedoresOrdenados?.filter((f) => {
        const estado = porFornecedor[f.id];
        return !estado || estado.loading || estado.error || estado.items.length > 0;
      }),
    [fornecedoresOrdenados, porFornecedor]
  );

  const todosResolvidos = useMemo(
    () => (fornecedores ?? []).every((f) => porFornecedor[f.id] && !porFornecedor[f.id].loading),
    [fornecedores, porFornecedor]
  );
  const nenhumFornecedorComProdutos =
    !loadingFornecedores &&
    !errorFornecedores &&
    (fornecedores?.length ?? 0) > 0 &&
    todosResolvidos &&
    (fornecedoresVisiveis?.length ?? 0) === 0;

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

        {loadingFornecedores &&
          Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="space-y-3 rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4 shadow-sm sm:p-5">
              <Skeleton className="h-5 w-40" />
              <ProdutoLinhaSkeleton />
            </div>
          ))}
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
        {nenhumFornecedorComProdutos && (
          <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-12 text-center text-sm text-[var(--muted)]">
            Nenhum fornecedor com produtos cadastrados ainda.
          </div>
        )}

        {fornecedoresVisiveis?.map((f) => {
          const estado = porFornecedor[f.id];
          const escolhido = f.id === fornecedorLigadoId || vinculosCdIds.has(f.id);
          const temProdutos = Boolean(estado && !estado.loading && !estado.error && estado.items.length > 0);
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
                    {f.opera_no_cd && (
                      <HelpBubble
                        open={helpCdKey === f.id}
                        onOpen={() => setHelpCdKey(f.id)}
                        onClose={() => setHelpCdKey((k) => (k === f.id ? null : k))}
                        ariaLabel="Sobre o Centro de Distribuição"
                        trigger={(props) => (
                          <span
                            {...props}
                            className={cn(
                              PRIMARY_ACTION_BLUE_BADGE_SOLID,
                              "inline-flex shrink-0 cursor-help items-center rounded-full px-2.5 py-1 text-xs font-medium"
                            )}
                          >
                            CD
                          </span>
                        )}
                      >
                        <p>
                          Esse fornecedor está no{" "}
                          <strong className="text-[var(--foreground)]">Centro de Distribuição DropCore</strong> —
                          o estoque fica guardado e conferido lá, e o despacho sai numa etiqueta só por pedido.
                        </p>
                        <p className="mt-2">
                          Você pode vincular a <strong className="text-[var(--foreground)]">vários fornecedores do CD ao mesmo tempo</strong>,
                          sem precisar trocar de um pro outro.
                        </p>
                      </HelpBubble>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  {!escolhido && temProdutos && confirmandoId !== f.id && (f.opera_no_cd || !(vinculo && !vinculo.pode_trocar_agora)) && (
                    <button
                      type="button"
                      disabled={vinculo === null}
                      onClick={() => {
                        setConfirmandoId(f.id);
                        setAceiteUso(false);
                        setVinculoErro(null);
                        setVinculoErroCode(null);
                      }}
                      className={cn(
                        "hidden shrink-0 rounded-md px-2.5 py-1.5 text-[11px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 sm:inline-flex",
                        f.opera_no_cd || !fornecedorLigadoId
                          ? "bg-emerald-600 text-white shadow-sm hover:bg-emerald-700"
                          : "border border-[var(--card-border)] bg-[var(--card)] text-[var(--foreground)] hover:bg-[var(--muted)]/10"
                      )}
                    >
                      {f.opera_no_cd
                        ? "Vincular este fornecedor do CD"
                        : fornecedorLigadoId
                          ? "Trocar para este fornecedor"
                          : "Vincular a este fornecedor"}
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

              {!escolhido && temProdutos && (confirmandoId === f.id || (!f.opera_no_cd && vinculo && !vinculo.pode_trocar_agora)) && (
                <div className="mb-3 space-y-2">
                  {confirmandoId === f.id ? (
                    <div className="space-y-3 rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-3">
                      {f.opera_no_cd ? (
                        <div className={cn(INFO_PREMIUM_SHELL, INFO_PREMIUM_TEXT_PRIMARY, "rounded-lg p-3 text-[13px] leading-relaxed")}>
                          Esse vínculo é adicional — você continua conectado aos outros fornecedores do Centro de
                          Distribuição que já tiver. Pedidos com produtos de fornecedores diferentes do CD saem numa
                          etiqueta só.
                        </div>
                      ) : (
                        fornecedorLigadoId && (
                          <div className={cn(AMBER_PREMIUM_SHELL, AMBER_PREMIUM_TEXT_PRIMARY, "rounded-lg p-3 text-[13px] leading-relaxed")}>
                            Você já tem <strong>{fornecedorAtualNome ?? "outro fornecedor"}</strong> vinculado. Trocar para{" "}
                            <strong>{f.nome_publico}</strong> substitui esse vínculo agora, e a próxima troca só é liberada depois do prazo mínimo.
                          </div>
                        )
                      )}
                      <label className="flex cursor-pointer items-start gap-2 text-sm text-[var(--foreground)]">
                        <input
                          type="checkbox"
                          checked={aceiteUso}
                          onChange={(e) => setAceiteUso(e.target.checked)}
                          className="mt-1 h-4 w-4 accent-[var(--accent)]"
                        />
                        <span>
                          {f.opera_no_cd
                            ? "Confirmo que quero vincular este fornecedor do Centro de Distribuição e usar os dados dele para operação na DropCore."
                            : fornecedorLigadoId
                              ? "Confirmo que quero trocar de fornecedor e usar os dados deste fornecedor para operação na DropCore."
                              : "Confirmo o uso operacional deste fornecedor ao vincular."}
                        </span>
                      </label>
                      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                        <button
                          type="button"
                          disabled={!aceiteUso || vinculando === f.id}
                          onClick={() => void vincularFornecedor(f.id, f.opera_no_cd)}
                          className="w-full rounded-md bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                        >
                          {vinculando === f.id
                            ? "Vinculando..."
                            : f.opera_no_cd
                              ? "Confirmar vínculo"
                              : fornecedorLigadoId
                                ? "Confirmar troca"
                                : "Confirmar vínculo"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setConfirmandoId(null);
                            setAceiteUso(false);
                            setVinculoErro(null);
                            setVinculoErroCode(null);
                          }}
                          className="w-full rounded-md border border-[var(--card-border)] bg-[var(--card)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--foreground)] hover:bg-[var(--muted)]/10 sm:w-auto"
                        >
                          Cancelar
                        </button>
                      </div>
                      {vinculoErro && vinculoErroCode !== "deposito_required" && (
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

              {!escolhido && temProdutos && confirmandoId !== f.id && (f.opera_no_cd || !(vinculo && !vinculo.pode_trocar_agora)) && (
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
                      f.opera_no_cd || !fornecedorLigadoId
                        ? "bg-emerald-600 text-white shadow-sm hover:bg-emerald-700"
                        : "border border-[var(--card-border)] bg-[var(--card)] text-[var(--foreground)] hover:bg-[var(--muted)]/10"
                    )}
                  >
                    {f.opera_no_cd
                      ? "Vincular este fornecedor do CD"
                      : fornecedorLigadoId
                        ? "Trocar para este fornecedor"
                        : "Vincular a este fornecedor"}
                  </button>
                </div>
              )}

              {!estado || estado.loading ? (
                <ProdutoLinhaSkeleton />
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

      {vinculoErro && vinculoErroCode === "deposito_required" && (
        <div className={MODAL_OVERLAY_CLASS}>
          <div className={MODAL_PANEL_CLASS}>
            <div className={cn(MODAL_PANEL_BODY_CLASS, "p-5 space-y-4 text-center")}>
              <h2 className="text-lg font-bold text-[var(--foreground)]">Recarregue para continuar</h2>
              <p className="text-sm text-[var(--muted)] leading-relaxed">
                Você precisa fazer sua primeira recarga PIX aprovada antes de vincular um fornecedor.
              </p>
              <button
                type="button"
                onClick={() => router.push("/seller/dashboard?recarregar=1")}
                className="w-full rounded-md bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-emerald-700"
              >
                Recarregar agora
              </button>
              <button
                type="button"
                onClick={() => {
                  setVinculoErro(null);
                  setVinculoErroCode(null);
                }}
                className="w-full rounded-md border border-[var(--card-border)] bg-[var(--card)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--foreground)] hover:bg-[var(--muted)]/10"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
