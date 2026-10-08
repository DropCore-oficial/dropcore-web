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

type AmandaResultado = {
  diagnostico: "saudavel" | "atencao" | "critica";
  observacao: string;
  perguntas: { pergunta_id: number; dias_pendente: number }[];
};
type AmandaRun = { status: "pendente" | "ok" | "erro"; resultado: AmandaResultado | null; executado_em: string } | null;

type UlissesDiagnostico = "sem_custo" | "margem_abaixo_minima" | "margem_saudavel" | "margem_acima_maxima";
type UlissesSku = { chave: string; nome_produto: string; diagnostico: UlissesDiagnostico };
type UlissesResultado = { skus: UlissesSku[]; destaque_atencao: string[] };
type UlissesRun = { status: "pendente" | "ok" | "erro"; resultado: UlissesResultado | null; executado_em: string } | null;

function resumoStatusAndrey(run: AndreyRun): string {
  if (!run || run.status !== "ok" || !run.resultado) return "Ainda não rodou";
  const comProblema = run.resultado.anuncios.filter((a) => a.diagnostico !== "sem_problema_aparente").length;
  if (comProblema === 0) return "Nenhum problema encontrado";
  return `${comProblema} grupo${comProblema > 1 ? "s" : ""} sinalizado${comProblema > 1 ? "s" : ""}`;
}

function resumoStatusAmanda(run: AmandaRun): string {
  if (!run || run.status !== "ok" || !run.resultado) return "Ainda não rodou";
  const qtdPerguntas = run.resultado.perguntas.length;
  if (run.resultado.diagnostico !== "saudavel") {
    return run.resultado.diagnostico === "critica" ? "Reputação crítica" : "Reputação em atenção";
  }
  if (qtdPerguntas > 0) return `${qtdPerguntas} pergunta${qtdPerguntas > 1 ? "s" : ""} pendente${qtdPerguntas > 1 ? "s" : ""}`;
  return "Tudo em dia";
}

function resumoStatusUlisses(run: UlissesRun): string {
  if (!run || run.status !== "ok" || !run.resultado) return "Ainda não rodou";
  const abaixoMin = run.resultado.skus.filter((s) => s.diagnostico === "margem_abaixo_minima").length;
  const semCusto = run.resultado.skus.filter((s) => s.diagnostico === "sem_custo").length;
  if (abaixoMin > 0) return `${abaixoMin} com margem baixa`;
  if (semCusto > 0) return `${semCusto} sem custo cadastrado`;
  return "Margens saudáveis";
}

function montarAtividades(andreyRun: AndreyRun, amandaRun: AmandaRun, ulissesRun: UlissesRun): AtividadeAoVivo[] {
  const atividades: AtividadeAoVivo[] = [];
  if (andreyRun && andreyRun.status === "ok" && andreyRun.resultado) {
    const destaqueChave = andreyRun.resultado.destaque_prioridade?.[0];
    const grupo = andreyRun.resultado.anuncios.find((a) => a.chave === destaqueChave);
    if (grupo) {
      atividades.push({
        texto: `${grupo.item_id_representante}: ${grupo.observacao}`,
        gestor: "anuncios_seo",
        tom: "atencao",
        quando: andreyRun.executado_em,
      });
    }
  }
  if (amandaRun && amandaRun.status === "ok" && amandaRun.resultado && amandaRun.resultado.diagnostico !== "saudavel") {
    atividades.push({
      texto: amandaRun.resultado.observacao,
      gestor: "reputacao",
      tom: amandaRun.resultado.diagnostico === "critica" ? "erro" : "atencao",
      quando: amandaRun.executado_em,
    });
  }
  if (ulissesRun && ulissesRun.status === "ok" && ulissesRun.resultado) {
    const pior = ulissesRun.resultado.skus.find((s) => s.diagnostico === "margem_abaixo_minima");
    if (pior) {
      atividades.push({
        texto: `${pior.nome_produto}: margem abaixo do mínimo configurado`,
        gestor: "ads",
        tom: "atencao",
        quando: ulissesRun.executado_em,
      });
    }
  }
  return atividades;
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
  const [amandaRun, setAmandaRun] = useState<AmandaRun>(null);
  const [ulissesRun, setUlissesRun] = useState<UlissesRun>(null);

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
      const [andreyRes, amandaRes, ulissesRes] = await Promise.all([
        fetch("/api/gestores-ia-avulso/andrey", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }),
        fetch("/api/gestores-ia-avulso/amanda", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }),
        fetch("/api/gestores-ia-avulso/ulisses", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }),
      ]);
      const andreyJson = await andreyRes.json().catch(() => ({}));
      if (andreyRes.ok) setAndreyRun(andreyJson.run ?? null);
      const amandaJson = await amandaRes.json().catch(() => ({}));
      if (amandaRes.ok) setAmandaRun(amandaJson.run ?? null);
      const ulissesJson = await ulissesRes.json().catch(() => ({}));
      if (ulissesRes.ok) setUlissesRun(ulissesJson.run ?? null);
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
              Andrey (Anúncios &amp; SEO), Amanda (Reputação &amp; Atendimento), Ulisses (Ads &amp; Preço) e o Tiago
              Silva (Gestor Mestre, chat) já estão liberados —{" "}
              <span className="font-medium text-[var(--foreground)]">os 4 gestores da equipe completos.</span>
            </p>
          </div>
        </header>

        <SellerGestoresIaEscritorio3D
          statusDiogo="Em breve"
          statusAndrey={resumoStatusAndrey(andreyRun)}
          statusAmanda={resumoStatusAmanda(amandaRun)}
          statusUlisses={resumoStatusUlisses(ulissesRun)}
          atividades={montarAtividades(andreyRun, amandaRun, ulissesRun)}
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

        <Link
          href="/seller/gestores-ia-avulso/amanda"
          className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4 text-left transition-all hover:border-emerald-300 dark:hover:border-emerald-700 hover:shadow-md"
        >
          <div className="min-w-0">
            <p className="font-medium text-[var(--foreground)]">Amanda — Reputação &amp; Atendimento</p>
            <p className="mt-0.5 text-xs text-[var(--muted)]">
              Reputação da sua conta no Mercado Livre e perguntas de comprador sem resposta, com sugestão pronta.
            </p>
          </div>
          <span className="shrink-0 text-sm font-semibold text-emerald-700 dark:text-emerald-400">Abrir →</span>
        </Link>

        <Link
          href="/seller/gestores-ia-avulso/ulisses"
          className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4 text-left transition-all hover:border-emerald-300 dark:hover:border-emerald-700 hover:shadow-md"
        >
          <div className="min-w-0">
            <p className="font-medium text-[var(--foreground)]">Ulisses — Ads &amp; Preço</p>
            <p className="mt-0.5 text-xs text-[var(--muted)]">
              Margem de cada anúncio a partir do custo que você digitou, preço real e comissão do Mercado Livre.
            </p>
          </div>
          <span className="shrink-0 text-sm font-semibold text-emerald-700 dark:text-emerald-400">Abrir →</span>
        </Link>

        <Link
          href="/seller/gestores-ia-avulso/tiago"
          className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4 text-left transition-all hover:border-emerald-300 dark:hover:border-emerald-700 hover:shadow-md"
        >
          <div className="min-w-0">
            <p className="font-medium text-[var(--foreground)]">Tiago Silva — Gestor Mestre</p>
            <p className="mt-0.5 text-xs text-[var(--muted)]">
              Converse com o Tiago — ele consulta a equipe inteira (Andrey, Amanda, Ulisses) pra responder sua
              pergunta com dado real.
            </p>
          </div>
          <span className="shrink-0 text-sm font-semibold text-emerald-700 dark:text-emerald-400">Abrir →</span>
        </Link>
      </div>
      <SellerNav active="gestores_ia" calcOnly temGestoresIa />
    </div>
  );
}
