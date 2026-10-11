"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { SellerNav } from "../SellerNav";
import { Skeleton } from "@/components/ui/Skeleton";
import type { AtividadeAoVivo } from "@/components/seller/SellerGestoresIaEscritorio3D";
import { GestorAvulsoOrcamentoBar, type UsoTokensHoje } from "@/components/seller/GestorAvulsoOrcamentoBar";
import { buildSellerSupportWhatsAppHref } from "@/lib/sellerSupportWhatsAppPrefill";

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

// Substituído em 2026-10-10 pelo grid de cards abaixo (`GestorCardAvulso`) — a barra de
// pílulas flutuava solta, sem card/cabeçalho, entre a barra de uso de IA e a sala 3D, e
// duplicava a função da própria barra de navegação que já existe embaixo da sala 3D
// (Diogo/Andrey/Amanda/Ulisses/Tiago Silva/Você). Mesmo padrão do hub `/seller/gestores-ia`
// (`GestorCard` em `web/app/seller/gestores-ia/page.tsx`), reaproveitando os `resumoStatusX`
// que esta página já calculava.
function GestorCardAvulso({
  href,
  icon,
  nome,
  funcao,
  descricao,
  bloqueado,
}: {
  href: string;
  icon: ReactNode;
  nome: string;
  funcao: string;
  descricao: string;
  bloqueado?: boolean;
}) {
  return (
    <Link
      href={href}
      className="group block rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4 text-left transition-all hover:border-emerald-300 hover:shadow-md dark:hover:border-emerald-700"
    >
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400">
          {icon}
        </span>
        <div className="min-w-0">
          <p className="font-semibold text-[var(--foreground)]">{nome}</p>
          <p className="text-xs text-[var(--muted)]">{funcao}</p>
        </div>
      </div>
      <p className="mt-3 text-sm text-[var(--muted)]">{descricao}</p>
      {bloqueado ? (
        <p className="mt-1.5 text-xs text-[var(--muted)]">Orçamento de hoje esgotado — volta à meia-noite.</p>
      ) : null}
    </Link>
  );
}

function IconAndrey() {
  return (
    <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m3 11 18-5v12L3 14v-3z" />
      <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
    </svg>
  );
}
function IconAmanda() {
  return (
    <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}
function IconUlisses() {
  return (
    <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <line x1="12" x2="12" y1="2" y2="22" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  );
}
function IconTiago() {
  return (
    <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

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

/** Prioriza o status real (urgência já calculada) sobre a descrição estática do card —
 * só cai na descrição fixa quando o gestor realmente ainda não rodou nenhuma vez. */
function descricaoOuStatus(status: string, descricaoEstatica: string): string {
  return status === "Ainda não rodou" ? descricaoEstatica : status;
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
                Sua assinatura atual é só da Calculadora. Fale com o suporte pra adicionar o pacote de Gestores de IA.
              </p>
              <a
                href={buildSellerSupportWhatsAppHref(
                  "Olá! Quero adicionar o pacote de Gestores de IA na minha assinatura da Calculadora."
                )}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700"
              >
                Falar com o suporte
              </a>
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

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <GestorCardAvulso
            href="/seller/gestores-ia-avulso/andrey"
            icon={<IconAndrey />}
            nome="Anúncio"
            funcao="Anúncios & SEO"
            descricao={descricaoOuStatus(
              resumoStatusAndrey(andreyRun),
              "Analisa seus anúncios e aponta o que pode estar travando visitas e vendas."
            )}
            bloqueado={bloqueadoHoje}
          />
          <GestorCardAvulso
            href="/seller/gestores-ia-avulso/amanda"
            icon={<IconAmanda />}
            nome="SAC"
            funcao="Reputação & Atendimento"
            descricao={descricaoOuStatus(
              resumoStatusAmanda(amandaRun),
              "Acompanha perguntas e reclamações, sugere resposta pronta pra você enviar."
            )}
            bloqueado={bloqueadoHoje}
          />
          <GestorCardAvulso
            href="/seller/gestores-ia-avulso/ulisses"
            icon={<IconUlisses />}
            nome="ADS"
            funcao="Ads & Preço"
            descricao={descricaoOuStatus(
              resumoStatusUlisses(ulissesRun),
              "Confere margem e preço de cada SKU, sinaliza o que tá fora do saudável."
            )}
            bloqueado={bloqueadoHoje}
          />
          <GestorCardAvulso
            href="/seller/gestores-ia-avulso/tiago"
            icon={<IconTiago />}
            nome="Gestor"
            funcao="Gestor Mestre, chat"
            descricao="Converse sobre o que a equipe já analisou."
            bloqueado={bloqueadoHoje}
          />
        </div>
      </div>
      <SellerNav active="gestores_ia" calcOnly temGestoresIa />
    </div>
  );
}
