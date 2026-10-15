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
import { cn } from "@/lib/utils";
import { SUCCESS_PREMIUM_TEXT_SOFT, DANGER_PREMIUM_TEXT_SOFT } from "@/lib/semanticPremium";
import { AMBER_PREMIUM_TEXT_SOFT } from "@/lib/amberPremium";
import { IconAndrey, IconAmanda, IconUlisses, IconTiago } from "@/components/seller/GestorAvulsoIcons";

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
type Severidade = "sucesso" | "atencao" | "critica" | "neutro";

const SEVERIDADE_TEXT_CLASS: Record<Severidade, string> = {
  sucesso: SUCCESS_PREMIUM_TEXT_SOFT,
  atencao: AMBER_PREMIUM_TEXT_SOFT,
  critica: DANGER_PREMIUM_TEXT_SOFT,
  neutro: "text-[var(--muted)]",
};

/** Ícone do gestor fica neutro (mesmo tom pros 4) — nunca carrega identidade por cor nem
 * estado. Referência pedida pelo Sr Stark: admin de verdade do Shopify, onde o ícone de
 * categoria é monocromático e a diferenciação vive só no texto/badge, não num avatar
 * colorido (decisão 2026-10-14, revertendo a tentativa anterior de 1 cor por gestor). */
const GESTOR_ICON_CHIP_CLASS =
  "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--card-border)] bg-[var(--surface-subtle)] text-[var(--foreground)]";

function GestorCardAvulso({
  href,
  icon,
  nome,
  funcao,
  descricao,
  severidade = "neutro",
  bloqueado,
}: {
  href: string;
  icon: ReactNode;
  nome: string;
  funcao: string;
  descricao: string;
  severidade?: Severidade;
  bloqueado?: boolean;
}) {
  return (
    <Link
      href={href}
      className="group block rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4 text-left transition-all hover:border-emerald-300 hover:shadow-md dark:hover:border-emerald-700"
    >
      <div className="flex items-center gap-2.5">
        <span className={GESTOR_ICON_CHIP_CLASS}>{icon}</span>
        <div className="min-w-0">
          <p className="font-semibold text-[var(--foreground)]">{nome}</p>
          <p className="text-xs text-[var(--muted)]">{funcao}</p>
        </div>
      </div>
      <p
        className={cn(
          "mt-3 text-sm",
          severidade === "neutro" ? "text-[var(--muted)]" : cn("font-medium", SEVERIDADE_TEXT_CLASS[severidade])
        )}
      >
        {descricao}
      </p>
      {bloqueado ? (
        <p className="mt-1.5 text-xs text-[var(--muted)]">Orçamento de hoje esgotado — volta à meia-noite.</p>
      ) : null}
    </Link>
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

/** Severidade da última rodada — o único acento de cor secundário liberado no card (ver
 * skill dropcore-gestores-ia: 1 sinal forte por card continua sendo o badge de veredito
 * nos painéis internos; aqui, antes de abrir o painel, é essa linha de resumo que faz esse
 * papel, então ela também ganha o mesmo tratamento semântico — nunca vira caixa própria,
 * continua sendo texto simples, só o tom muda). */
function severidadeAndrey(run: AndreyRun): Severidade {
  if (!run || run.status !== "ok" || !run.resultado) return "neutro";
  const comProblema = run.resultado.anuncios.filter((a) => a.diagnostico !== "sem_problema_aparente").length;
  return comProblema > 0 ? "atencao" : "sucesso";
}

function severidadeAmanda(run: AmandaRun): Severidade {
  if (!run || run.status !== "ok" || !run.resultado) return "neutro";
  if (run.resultado.diagnostico === "critica") return "critica";
  if (run.resultado.diagnostico === "atencao") return "atencao";
  return run.resultado.perguntas.length > 0 ? "atencao" : "sucesso";
}

function severidadeUlisses(run: UlissesRun): Severidade {
  if (!run || run.status !== "ok" || !run.resultado) return "neutro";
  const abaixoMin = run.resultado.skus.filter((s) => s.diagnostico === "margem_abaixo_minima").length;
  if (abaixoMin > 0) return "critica";
  const semCusto = run.resultado.skus.filter((s) => s.diagnostico === "sem_custo").length;
  return semCusto > 0 ? "atencao" : "sucesso";
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
            severidade={severidadeAndrey(andreyRun)}
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
            severidade={severidadeAmanda(amandaRun)}
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
            severidade={severidadeUlisses(ulissesRun)}
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
