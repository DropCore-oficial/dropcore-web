"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { SellerNav } from "../../SellerNav";
import { SellerPageHeader } from "@/components/seller/SellerPageHeader";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { cn } from "@/lib/utils";
import { DANGER_PREMIUM_SURFACE_TRANSPARENT, DANGER_PREMIUM_TEXT_BODY } from "@/lib/semanticPremium";
import { Skeleton } from "@/components/ui/Skeleton";
import type { SellerAiRun } from "@/components/seller/SellerGestorRunShell";
import {
  SellerGestorEstoqueFulfillmentPanel,
  type RupturaFulfillmentResultado,
} from "@/components/seller/SellerGestorEstoqueFulfillmentPanel";
import {
  SellerGestorAnunciosSeoPanel,
  type AnunciosSeoResultado,
} from "@/components/seller/SellerGestorAnunciosSeoPanel";
import {
  SellerGestorReputacaoAtendimentoPanel,
  type ReputacaoAtendimentoResultado,
} from "@/components/seller/SellerGestorReputacaoAtendimentoPanel";
import { SellerGestorAdsPricingPanel, type AdsPricingResultado } from "@/components/seller/SellerGestorAdsPricingPanel";
import { SellerGestorUlissesWizard, type UlissesPreferenciasForm } from "@/components/seller/SellerGestorUlissesWizard";
import { buscarGestorPerfil } from "@/lib/ai/gestorPerfis";

type RunsResponse = {
  pro: boolean;
  saldo_suficiente?: boolean;
  runs: Record<string, SellerAiRun<unknown>>;
  sku_ml_map?: Record<string, string>;
  error?: string;
};

async function getAccessToken(): Promise<string | null> {
  const {
    data: { session },
  } = await supabaseBrowser.auth.getSession();
  return session?.access_token ?? null;
}

export default function SellerGestorDetalhePage() {
  const { gestor: slug } = useParams<{ gestor: string }>();
  const perfil = buscarGestorPerfil(slug);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pro, setPro] = useState(true);
  const [saldoSuficiente, setSaldoSuficiente] = useState(true);
  const [runs, setRuns] = useState<Record<string, SellerAiRun<unknown>>>({});
  const [skuMlMap, setSkuMlMap] = useState<Record<string, string>>({});
  /** undefined = ainda não checou; null = checou e não tem preferência salva (mostra wizard). */
  const [ulissesPreferencias, setUlissesPreferencias] = useState<UlissesPreferenciasForm | null | undefined>(undefined);
  /** true = seller clicou "Editar preferências" — reabre o wizard mesmo já tendo preferência salva. */
  const [editandoPreferenciasUlisses, setEditandoPreferenciasUlisses] = useState(false);

  const carregar = async () => {
    const token = await getAccessToken();
    if (!token) {
      setError("Sessão expirada, faça login de novo.");
      setLoading(false);
      return;
    }
    const res = await fetch("/api/seller/gestores-ia", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as RunsResponse;
    if (!res.ok) {
      setError(json.error ?? "Erro ao carregar o gestor.");
      setLoading(false);
      return;
    }
    setPro(json.pro);
    setSaldoSuficiente(json.saldo_suficiente ?? true);
    setRuns(json.runs ?? {});
    setSkuMlMap(json.sku_ml_map ?? {});

    if (slug === "ulisses") {
      const prefRes = await fetch("/api/seller/gestores-ia/ulisses-preferencias", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const prefJson = (await prefRes.json().catch(() => ({}))) as { preferencias?: UlissesPreferenciasForm | null };
      setUlissesPreferencias(prefJson.preferencias ?? null);
    }

    setLoading(false);
  };

  useEffect(() => {
    void carregar();
  }, [slug]);

  async function dispararRodada(gestorId: string): Promise<string | null> {
    const token = await getAccessToken();
    if (!token) return "Sessão expirada, faça login de novo.";
    const res = await fetch("/api/seller/gestores-ia/rodar", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ gestor: gestorId }),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) return json.error ?? "Erro ao rodar o gestor.";
    await carregar();
    return null;
  }

  return (
    <div className="bg-[var(--background)] text-[var(--foreground)] app-bg pt-[calc(3.5rem+env(safe-area-inset-top,0px))] md:pt-14 pb-5">
      <SellerNav active="gestores_ia" wide />
      <div className="dropcore-shell-6xl space-y-5 pt-5 md:space-y-6 md:pt-7 pb-5 md:pb-7">
        {!perfil ? (
          <>
            <SellerPageHeader surface="hero" showBack backHref="/seller/gestores-ia" title="Gestor não encontrado" />
            <div className={cn("rounded-2xl p-4 text-sm", DANGER_PREMIUM_SURFACE_TRANSPARENT, DANGER_PREMIUM_TEXT_BODY)}>
              Esse gestor não existe.{" "}
              <Link href="/seller/gestores-ia" className="font-semibold underline">
                Voltar pra Gestores de IA
              </Link>
              .
            </div>
          </>
        ) : (
          <>
            <SellerPageHeader surface="hero" showBack backHref="/seller/gestores-ia" title={perfil.nome} subtitle={perfil.funcao} />

            {loading ? (
              <section className="space-y-4 rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-5 shadow-sm sm:p-6">
                <Skeleton className="h-6 w-56" />
                <Skeleton className="h-24 w-full" />
              </section>
            ) : error ? (
              <div className={cn("rounded-2xl p-4 text-sm", DANGER_PREMIUM_SURFACE_TRANSPARENT, DANGER_PREMIUM_TEXT_BODY)}>
                {error}
              </div>
            ) : pro && !saldoSuficiente ? (
              <section className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-6 text-center shadow-sm sm:p-8">
                <p className="font-medium text-[var(--foreground)]">Recarregue seu saldo pra usar os Gestores de IA</p>
                <p className="mx-auto mt-1 max-w-md text-sm text-[var(--muted)]">
                  Os gestores rodam sobre uma API paga — com o saldo zerado, as rodadas ficam pausadas até você
                  recarregar.
                </p>
                <Link
                  href="/seller/dashboard?recarregar=1"
                  className="mt-4 inline-flex rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700"
                >
                  Recarregar saldo
                </Link>
              </section>
            ) : !perfil.ativo ? (
              <section className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-6 text-center shadow-sm sm:p-8">
                <p className="font-medium text-[var(--foreground)]">{perfil.nome} ainda está em construção</p>
                <p className="mx-auto mt-1 max-w-md text-sm text-[var(--muted)]">
                  Esse gestor ({perfil.funcao}) ainda não está disponível. Assim que estiver pronto, aparece aqui.
                </p>
              </section>
            ) : perfil.slug === "diogo" ? (
              <SellerGestorEstoqueFulfillmentPanel
                pro={pro}
                run={(runs["estoque_fulfillment"] as SellerAiRun<RupturaFulfillmentResultado> | undefined) ?? null}
                onRodarAgora={() => dispararRodada("estoque_fulfillment")}
                skuMlMap={skuMlMap}
              />
            ) : perfil.slug === "andrey" ? (
              <SellerGestorAnunciosSeoPanel
                pro={pro}
                run={(runs["anuncios_seo"] as SellerAiRun<AnunciosSeoResultado> | undefined) ?? null}
                onRodarAgora={() => dispararRodada("anuncios_seo")}
              />
            ) : perfil.slug === "amanda" ? (
              <SellerGestorReputacaoAtendimentoPanel
                pro={pro}
                run={(runs["reputacao"] as SellerAiRun<ReputacaoAtendimentoResultado> | undefined) ?? null}
                onRodarAgora={() => dispararRodada("reputacao")}
              />
            ) : perfil.slug === "ulisses" ? (
              ulissesPreferencias === undefined ? (
                <Skeleton className="h-40 w-full rounded-2xl" />
              ) : ulissesPreferencias === null || editandoPreferenciasUlisses ? (
                <SellerGestorUlissesWizard
                  inicial={ulissesPreferencias}
                  onSalvo={(prefs) => {
                    setUlissesPreferencias(prefs);
                    setEditandoPreferenciasUlisses(false);
                  }}
                />
              ) : (
                <div className="space-y-3">
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => setEditandoPreferenciasUlisses(true)}
                      className="rounded-md border border-[var(--card-border)] bg-[var(--card)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--foreground)] hover:bg-[var(--muted)]/10"
                    >
                      Editar preferências
                    </button>
                  </div>
                  <SellerGestorAdsPricingPanel
                    pro={pro}
                    run={(runs["ads"] as SellerAiRun<AdsPricingResultado> | undefined) ?? null}
                    onRodarAgora={() => dispararRodada("ads")}
                  />
                </div>
              )
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
