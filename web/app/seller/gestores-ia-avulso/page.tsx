"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { SellerNav } from "../SellerNav";
import { Skeleton } from "@/components/ui/Skeleton";
import type { AtividadeAoVivo } from "@/components/seller/SellerGestoresIaEscritorio3D";
import { GestorAvulsoOrcamentoBar, type UsoTokensHoje } from "@/components/seller/GestorAvulsoOrcamentoBar";
import { buildSellerSupportWhatsAppHref } from "@/lib/sellerSupportWhatsAppPrefill";
import { IconAndrey, IconAmanda, IconUlisses, IconTiago } from "@/components/seller/GestorAvulsoIcons";
import { GestorAvulsoPendenciasLista, type GestorPendenciaItem } from "@/components/seller/GestorAvulsoPendenciasLista";
import {
  type AndreyRun,
  type AmandaRun,
  type UlissesRun,
  resumoStatusAndrey,
  resumoStatusAmanda,
  resumoStatusUlisses,
  descricaoOuStatus,
  severidadeAndrey,
  severidadeAmanda,
  severidadeUlisses,
} from "@/lib/ai/gestorAvulsoStatusResumo";

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

// Grid de cards grandes (`GestorCardAvulso`) substituído em 2026-10-15 pela lista compacta
// `GestorAvulsoPendenciasLista` (mesmo componente usado no Dashboard avulso), ordenada por
// urgência — crítico/atenção sobe pro topo em vez de ordem fixa. Tipos/funções de status
// vivem em `lib/ai/gestorAvulsoStatusResumo.ts` (2026-10-15), compartilhados entre esta
// página e o Dashboard.

type Access = "loading" | "liberado" | "sem_pacote" | "denied";

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
  const [usoTokensHoje, setUsoTokensHoje] = useState<UsoTokensHoje | null>(null);
  const [bloqueadoHoje, setBloqueadoHoje] = useState(false);

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
      // Orçamento diário é da conta inteira (não por gestor) — qualquer uma das 3 respostas
      // já traz o mesmo valor; usa a do Andrey (primeira chamada) como fonte.
      setUsoTokensHoje(andreyJson.uso_tokens_hoje ?? null);
      setBloqueadoHoje(andreyJson.bloqueado_hoje === true);
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
        <div className="dropcore-shell-6xl space-y-3 py-10 text-center text-sm text-[var(--muted)]">
          <p>Não foi possível validar seu acesso.</p>
          <button
            type="button"
            onClick={() => void refresh()}
            className="rounded-md border border-[var(--card-border)] bg-[var(--card)] px-3 py-1.5 text-xs font-semibold text-[var(--foreground)] hover:bg-[var(--muted)]/10"
          >
            Tentar de novo
          </button>
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
                Sua assinatura atual é só da Calculadora. Assine o pacote de Gestores de IA (mensal ou anual) pra
                liberar Anúncio, SAC, ADS e Gestor.
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => router.push("/seller/gestores-ia-avulso/planos")}
                  className="inline-flex rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700"
                >
                  Ver planos
                </button>
                <a
                  href={buildSellerSupportWhatsAppHref(
                    "Olá! Quero adicionar o pacote de Gestores de IA na minha assinatura da Calculadora."
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex rounded-md border border-[var(--card-border)] bg-[var(--card)] px-3 py-1.5 text-xs font-semibold text-[var(--foreground)] hover:bg-[var(--muted)]/10"
                >
                  Falar com o suporte
                </a>
              </div>
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
              <span className="font-medium text-[var(--foreground)]">A equipe com os 4 gestores está completa.</span>
            </p>
          </div>
        </header>

        <GestorAvulsoOrcamentoBar usoTokensHoje={usoTokensHoje} bloqueadoHoje={bloqueadoHoje} />

        <SellerGestoresIaEscritorio3D
          statusDiogo="Em breve"
          statusAndrey={resumoStatusAndrey(andreyRun)}
          statusAmanda={resumoStatusAmanda(amandaRun)}
          statusUlisses={resumoStatusUlisses(ulissesRun)}
          atividades={montarAtividades(andreyRun, amandaRun, ulissesRun)}
          nomeResponsavel={null}
        />

        <GestorAvulsoPendenciasLista
          itens={[
            {
              href: "/seller/gestores-ia-avulso/andrey",
              icon: <IconAndrey />,
              nome: "Anúncio",
              funcao: "Anúncios & SEO",
              status: descricaoOuStatus(
                resumoStatusAndrey(andreyRun),
                "Analisa seus anúncios e aponta o que pode estar travando visitas e vendas."
              ),
              severidade: severidadeAndrey(andreyRun),
              bloqueado: bloqueadoHoje,
            },
            {
              href: "/seller/gestores-ia-avulso/amanda",
              icon: <IconAmanda />,
              nome: "SAC",
              funcao: "Reputação & Atendimento",
              status: descricaoOuStatus(
                resumoStatusAmanda(amandaRun),
                "Acompanha perguntas e reclamações, sugere resposta pronta pra você enviar."
              ),
              severidade: severidadeAmanda(amandaRun),
              bloqueado: bloqueadoHoje,
            },
            {
              href: "/seller/gestores-ia-avulso/ulisses",
              icon: <IconUlisses />,
              nome: "ADS",
              funcao: "Ads & Preço",
              status: descricaoOuStatus(
                resumoStatusUlisses(ulissesRun),
                "Confere margem e preço de cada SKU, sinaliza o que tá fora do saudável."
              ),
              severidade: severidadeUlisses(ulissesRun),
              bloqueado: bloqueadoHoje,
            },
            {
              href: "/seller/gestores-ia-avulso/tiago",
              icon: <IconTiago />,
              nome: "Gestor",
              funcao: "Gestor Mestre, chat",
              status: "Converse sobre o que a equipe já analisou.",
              severidade: "neutro",
              bloqueado: bloqueadoHoje,
            },
          ] satisfies GestorPendenciaItem[]}
        />
      </div>
      <SellerNav active="gestores_ia" calcOnly temGestoresIa />
    </div>
  );
}
