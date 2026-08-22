"use client";

import { useCallback, useEffect, useState } from "react";
import { SellerNav } from "../SellerNav";
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

type RunsResponse = {
  pro: boolean;
  runs: Record<string, SellerAiRun<unknown>>;
  error?: string;
};

async function getAccessToken(): Promise<string | null> {
  const {
    data: { session },
  } = await supabaseBrowser.auth.getSession();
  return session?.access_token ?? null;
}

export default function SellerGestoresIaPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pro, setPro] = useState(true);
  const [runs, setRuns] = useState<Record<string, SellerAiRun<unknown>>>({});

  const carregar = useCallback(async () => {
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
      setError(json.error ?? "Erro ao carregar gestores de IA.");
      setLoading(false);
      return;
    }
    setPro(json.pro);
    setRuns(json.runs ?? {});
    setLoading(false);
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const dispararRodada = useCallback(
    async (gestor: string): Promise<string | null> => {
      const token = await getAccessToken();
      if (!token) return "Sessão expirada, faça login de novo.";
      const res = await fetch("/api/seller/gestores-ia/rodar", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ gestor }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) return json.error ?? "Erro ao rodar o gestor.";
      await carregar();
      return null;
    },
    [carregar]
  );

  return (
    <div className="bg-[var(--background)] text-[var(--foreground)] app-bg pt-[calc(3.5rem+env(safe-area-inset-top,0px))] md:pt-14 pb-5">
      <SellerNav active="gestores_ia" wide />
      <div className="dropcore-shell-6xl space-y-5 pt-5 md:space-y-6 md:pt-7 pb-5 md:pb-7">
        <SellerPageHeader
          surface="hero"
          title="Gestores de IA"
          subtitle={
            <>
              Agentes de IA que analisam sua loja e recomendam ações que{" "}
              <span className="font-medium text-[var(--foreground)]">você mesmo executa</span>, sem
              precisar controlar estoque ou repasse com o fornecedor.
            </>
          }
        />

        {loading ? (
          <section className="space-y-4 rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-5 shadow-sm sm:p-6">
            <Skeleton className="h-6 w-56" />
            <Skeleton className="h-24 w-full" />
          </section>
        ) : error ? (
          <div className={cn("rounded-2xl p-4 text-sm", DANGER_PREMIUM_SURFACE_TRANSPARENT, DANGER_PREMIUM_TEXT_BODY)}>
            {error}
          </div>
        ) : (
          <div className="space-y-5">
            <SellerGestorEstoqueFulfillmentPanel
              pro={pro}
              run={(runs["estoque_fulfillment"] as SellerAiRun<RupturaFulfillmentResultado> | undefined) ?? null}
              onRodarAgora={() => dispararRodada("estoque_fulfillment")}
            />
            <SellerGestorAnunciosSeoPanel
              pro={pro}
              run={(runs["anuncios_seo"] as SellerAiRun<AnunciosSeoResultado> | undefined) ?? null}
              onRodarAgora={() => dispararRodada("anuncios_seo")}
            />
          </div>
        )}
      </div>
    </div>
  );
}
