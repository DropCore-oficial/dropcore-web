"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { SellerNav } from "../../SellerNav";
import { Skeleton } from "@/components/ui/Skeleton";
import { DANGER_PREMIUM_SURFACE_TRANSPARENT, DANGER_PREMIUM_TEXT_BODY } from "@/lib/semanticPremium";
import { type SellerAiRun, type DispararRodada } from "@/components/seller/SellerGestorRunShell";
import { SellerGestorEstoquePanelAvulso, type EstoqueAvulsoResultado } from "@/components/seller/SellerGestorEstoquePanelAvulso";
import { GestorAvulsoOrcamentoBar, type UsoTokensHoje } from "@/components/seller/GestorAvulsoOrcamentoBar";
import { GestorAvulsoConectarMlEmptyState } from "@/components/seller/GestorAvulsoConectarMlEmptyState";
import { IconEstoque } from "@/components/seller/GestorAvulsoIcons";

type Acesso = "loading" | "liberado" | "negado";

export default function EstoqueAvulsoPage() {
  const router = useRouter();
  const [acesso, setAcesso] = useState<Acesso>("loading");
  const [mlConectado, setMlConectado] = useState(true);
  const [run, setRun] = useState<SellerAiRun<EstoqueAvulsoResultado> | null>(null);
  const [usoTokensHoje, setUsoTokensHoje] = useState<UsoTokensHoje | null>(null);
  const [bloqueadoHoje, setBloqueadoHoje] = useState(false);

  const carregar = useCallback(async () => {
    const { data } = await supabaseBrowser.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      router.replace("/gestores-ia/login");
      return;
    }
    const res = await fetch("/api/gestores-ia-avulso/estoque", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (res.status === 403) {
      setAcesso("negado");
      return;
    }
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setAcesso("negado");
      return;
    }
    setMlConectado(Boolean(json.ml_conectado));
    setRun(json.run ?? null);
    setUsoTokensHoje(json.uso_tokens_hoje ?? null);
    setBloqueadoHoje(json.bloqueado_hoje === true);
    setAcesso("liberado");
  }, [router]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const dispararRodada: DispararRodada = async () => {
    const { data } = await supabaseBrowser.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return "Sessão expirada, faça login de novo.";
    const res = await fetch("/api/gestores-ia-avulso/estoque/rodar", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return json.error ?? "Erro ao rodar o Estoque.";
    await carregar();
    return null;
  };

  return (
    <div className="bg-[var(--background)] text-[var(--foreground)] app-bg pt-[calc(3.5rem+env(safe-area-inset-top,0px))] md:pt-14 pb-5">
      <div className="dropcore-shell-6xl space-y-5 py-5 md:space-y-6 md:py-7">
        <header className="overflow-visible rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4 shadow-sm sm:p-5">
          <Link href="/seller/gestores-ia-avulso" className="text-xs font-medium text-[var(--muted)] hover:underline">
            ← Gestor de IA
          </Link>
          <div className="mt-1 min-w-0 space-y-1">
            <div className="flex items-center gap-2 sm:gap-3">
              <h1 className="min-w-0 truncate text-2xl font-bold tracking-tight text-[var(--foreground)] sm:text-3xl">
                Estoque
              </h1>
              <span
                className="h-1 w-14 shrink-0 self-center rounded-full bg-gradient-to-r from-emerald-500 via-emerald-400 to-emerald-300/70 sm:w-20"
                aria-hidden
              />
            </div>
            <p className="text-sm leading-snug text-[var(--muted)]">
              Cruza o estoque disponível de cada anúncio com a venda dos últimos 30 dias e avisa quando algo está
              perto de esgotar.
            </p>
          </div>
        </header>

        {acesso === "loading" ? (
          <section className="space-y-4 rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-5 shadow-sm sm:p-6">
            <Skeleton className="h-6 w-56" />
            <Skeleton className="h-24 w-full" />
          </section>
        ) : acesso === "negado" ? (
          <div
            className={cn(
              "flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4 text-sm",
              DANGER_PREMIUM_SURFACE_TRANSPARENT,
              DANGER_PREMIUM_TEXT_BODY
            )}
          >
            <span>Não foi possível validar seu acesso.</span>
            <button
              type="button"
              onClick={() => void carregar()}
              className="rounded-md border border-[var(--card-border)] bg-[var(--card)] px-3 py-1.5 text-xs font-semibold text-[var(--foreground)] hover:bg-[var(--muted)]/10"
            >
              Tentar de novo
            </button>
          </div>
        ) : !mlConectado ? (
          <GestorAvulsoConectarMlEmptyState
            icon={<IconEstoque className="h-6 w-6 shrink-0" />}
            titulo="Conecte sua conta do Mercado Livre primeiro"
            descricao="O Estoque precisa ler o estoque e as vendas dos seus anúncios pra analisar — conecte sua conta pra liberar essa rodada."
          />
        ) : (
          <>
            <GestorAvulsoOrcamentoBar usoTokensHoje={usoTokensHoje} bloqueadoHoje={bloqueadoHoje} />

            <SellerGestorEstoquePanelAvulso pro run={run} onRodarAgora={dispararRodada} />
          </>
        )}
      </div>
      <SellerNav active="gestores_ia" calcOnly produto="gestores_ia_avulso" />
    </div>
  );
}
