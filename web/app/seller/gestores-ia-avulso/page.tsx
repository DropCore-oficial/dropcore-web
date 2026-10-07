"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { SellerNav } from "../SellerNav";
import { Skeleton } from "@/components/ui/Skeleton";
import type { AtividadeAoVivo } from "@/components/seller/SellerGestoresIaEscritorio3D";

const SellerGestoresIaEscritorio3D = dynamic(
  () => import("@/components/seller/SellerGestoresIaEscritorio3D").then((m) => m.SellerGestoresIaEscritorio3D),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-64 items-center justify-center rounded-2xl border border-[var(--card-border)] bg-[var(--card)] text-sm text-[var(--muted)] shadow-sm">
        Carregando escritório…
      </div>
    ),
  }
);

type Access = "loading" | "liberado" | "sem_pacote" | "denied";

type AndreyAnuncio = { chave: string; diagnostico: string; observacao: string; item_id_representante: string };
type AndreyRun = {
  status: "pendente" | "ok" | "erro";
  resultado: { anuncios: AndreyAnuncio[]; destaque_prioridade: string[] } | null;
  executado_em: string;
} | null;

function resumoStatusAndrey(run: AndreyRun): string {
  if (!run || run.status !== "ok" || !run.resultado) return "Ainda não rodou";
  const comProblema = run.resultado.anuncios.filter((a) => a.diagnostico !== "sem_problema_aparente").length;
  if (comProblema === 0) return "Nenhum problema encontrado";
  return `${comProblema} grupo${comProblema > 1 ? "s" : ""} sinalizado${comProblema > 1 ? "s" : ""}`;
}

function montarAtividades(run: AndreyRun): AtividadeAoVivo[] {
  if (!run || run.status !== "ok" || !run.resultado) return [];
  const destaqueChave = run.resultado.destaque_prioridade?.[0];
  const grupo = run.resultado.anuncios.find((a) => a.chave === destaqueChave);
  if (!grupo) return [];
  return [
    {
      texto: `${grupo.item_id_representante}: ${grupo.observacao}`,
      gestor: "anuncios_seo",
      tom: "atencao",
      quando: run.executado_em,
    },
  ];
}

/**
 * Portal do pacote avulso "Calculadora + Gestores de IA" (fora do hub — sem org, sem
 * fornecedor, sem seller completo). Mesma conta/login da Calculadora
 * (`calculadora_assinantes`), só libera essa aba quando `inclui_gestores_ia = true`.
 * Conexão com o Mercado Livre fica em /seller/gestores-ia-avulso/integracoes — essa tela é
 * só a lista de gestores.
 */
export default function GestoresIaAvulsoPage() {
  const router = useRouter();
  const [access, setAccess] = useState<Access>("loading");
  const [andreyRun, setAndreyRun] = useState<AndreyRun>(null);

  const refresh = useCallback(async () => {
    const { data } = await supabaseBrowser.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      router.replace("/gestores-ia/login");
      return;
    }
    const res = await fetch(`/api/calculadora/me?t=${Date.now()}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setAccess("denied");
      return;
    }
    if (j.access === "calc_only" && j.inclui_gestores_ia === true) {
      setAccess("liberado");
      const andreyRes = await fetch("/api/gestores-ia-avulso/andrey", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const andreyJson = await andreyRes.json().catch(() => ({}));
      if (andreyRes.ok) setAndreyRun(andreyJson.run ?? null);
    } else if (j.access === "calc_only") {
      setAccess("sem_pacote");
    } else {
      // "seller" (hub completo) ou "calc_only_locked" (assinatura vencida) não usam esta
      // tela — o seller do hub tem /seller/gestores-ia próprio; locked volta pra calculadora,
      // que já sabe mostrar o bloqueio de assinatura.
      router.replace("/seller/calculadora");
    }
  }, [router]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (access === "denied") {
    return (
      <div className="bg-[var(--background)] text-[var(--foreground)] app-bg pt-[calc(3.5rem+env(safe-area-inset-top,0px))] md:pt-14 pb-5">
        <div className="dropcore-shell-6xl py-10 text-center text-sm text-[var(--muted)]">
          Não foi possível validar seu acesso.
        </div>
      </div>
    );
  }

  if (access === "loading") {
    return (
      <div className="bg-[var(--background)] text-[var(--foreground)] app-bg pt-[calc(3.5rem+env(safe-area-inset-top,0px))] md:pt-14 pb-5">
        <div className="dropcore-shell-6xl space-y-5 py-5 md:space-y-6 md:py-7">
          <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4 shadow-sm sm:p-5">
            <div className="flex items-center gap-2 sm:gap-3">
              <Skeleton className="h-8 w-40 sm:h-9 sm:w-48" />
              <Skeleton className="h-1 w-14 shrink-0 rounded-full sm:w-20" />
            </div>
            <Skeleton className="mt-2 h-4 w-full max-w-md" />
          </div>
          <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-6 shadow-sm">
            <Skeleton className="mx-auto h-4 w-3/4 max-w-sm" />
          </div>
        </div>
      </div>
    );
  }

  if (access === "sem_pacote") {
    return (
      <div className="bg-[var(--background)] text-[var(--foreground)] app-bg pt-[calc(3.5rem+env(safe-area-inset-top,0px))] md:pt-14 pb-5">
        <div className="dropcore-shell-6xl space-y-5 py-5 md:space-y-6 md:py-7">
          <header className="overflow-visible rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4 shadow-sm sm:p-5">
            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-2 sm:gap-3">
                <h1 className="min-w-0 truncate text-2xl font-bold tracking-tight text-[var(--foreground)] sm:text-3xl">
                  Gestor de IA
                </h1>
                <span
                  className="h-1 w-14 shrink-0 self-center rounded-full bg-gradient-to-r from-emerald-500 via-emerald-400 to-emerald-300/70 sm:w-20"
                  aria-hidden
                />
              </div>
              <p className="text-sm leading-snug text-[var(--muted)]">
                Sua assinatura atual é só da Calculadora. Fale com o suporte pra adicionar o pacote de Gestores de IA.
              </p>
            </div>
          </header>
        </div>
        <SellerNav active="calculadora" calcOnly temGestoresIa={false} />
      </div>
    );
  }

  return (
    <div className="bg-[var(--background)] text-[var(--foreground)] app-bg pt-[calc(3.5rem+env(safe-area-inset-top,0px))] md:pt-14 pb-5">
      <div className="dropcore-shell-6xl space-y-5 py-5 md:space-y-6 md:py-7">
        <header className="overflow-visible rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4 shadow-sm sm:p-5">
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2 sm:gap-3">
              <h1 className="min-w-0 truncate text-2xl font-bold tracking-tight text-[var(--foreground)] sm:text-3xl">
                Gestor de IA
              </h1>
              <span
                className="h-1 w-14 shrink-0 self-center rounded-full bg-gradient-to-r from-emerald-500 via-emerald-400 to-emerald-300/70 sm:w-20"
                aria-hidden
              />
            </div>
            <p className="text-sm leading-snug text-[var(--muted)]">
              Andrey (Anúncios &amp; SEO) já está liberado. Amanda (Reputação &amp; Atendimento), Ulisses (Ads) e o
              Tiago Silva analisando sua conta do Mercado Livre direto —{" "}
              <span className="font-medium text-[var(--foreground)]">em construção, chegando em breve</span>.
            </p>
          </div>
        </header>

        <SellerGestoresIaEscritorio3D
          statusDiogo="Em breve"
          statusAndrey={resumoStatusAndrey(andreyRun)}
          statusAmanda="Em breve"
          statusUlisses="Em breve"
          atividades={montarAtividades(andreyRun)}
          nomeResponsavel={null}
        />

        <Link
          href="/seller/gestores-ia-avulso/andrey"
          className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4 text-left transition-all hover:border-emerald-300 dark:hover:border-emerald-700 hover:shadow-md"
        >
          <div className="min-w-0">
            <p className="font-medium text-[var(--foreground)]">Andrey — Anúncios &amp; SEO</p>
            <p className="mt-0.5 text-xs text-[var(--muted)]">
              Diagnóstico de título, descrição e ficha técnica dos seus anúncios no Mercado Livre.
            </p>
          </div>
          <span className="shrink-0 text-sm font-semibold text-emerald-700 dark:text-emerald-400">Abrir →</span>
        </Link>
      </div>
      <SellerNav active="gestores_ia" calcOnly temGestoresIa />
    </div>
  );
}
