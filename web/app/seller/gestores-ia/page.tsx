"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { SellerNav } from "../SellerNav";
import { SellerPageHeader } from "@/components/seller/SellerPageHeader";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { cn } from "@/lib/utils";
import { DANGER_PREMIUM_SURFACE_TRANSPARENT, DANGER_PREMIUM_TEXT_BODY } from "@/lib/semanticPremium";
import { Skeleton } from "@/components/ui/Skeleton";
import type { SellerAiRun } from "@/components/seller/SellerGestorRunShell";
import type { RupturaFulfillmentResultado } from "@/components/seller/SellerGestorEstoqueFulfillmentPanel";
import type { AnunciosSeoResultado } from "@/components/seller/SellerGestorAnunciosSeoPanel";
import type { ReputacaoAtendimentoResultado } from "@/components/seller/SellerGestorReputacaoAtendimentoPanel";
import type { AtividadeAoVivo } from "@/components/seller/SellerGestoresIaEscritorio3D";
import { GESTORES_PERFIS } from "@/lib/ai/gestorPerfis";

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

type AcaoRow = {
  gestor: string;
  alvo_id: string;
  acao: string;
  status: "confirmado" | "executado" | "erro";
  detalhes: Record<string, unknown> | null;
  criado_em: string;
};

type RunsResponse = {
  pro: boolean;
  saldo_suficiente?: boolean;
  runs: Record<string, SellerAiRun<unknown>>;
  sku_ml_map?: Record<string, string>;
  acoes?: AcaoRow[];
  error?: string;
};

const ACAO_LABEL: Record<string, { sucesso: string; erro: string }> = {
  aplicar_titulo: { sucesso: "Título aplicado em {id}", erro: "Aplicar título bloqueado em {id}" },
  aplicar_descricao: { sucesso: "Descrição aplicada em {id}", erro: "Falha ao aplicar descrição em {id}" },
  aplicar_caracteristicas: {
    sucesso: "Ficha técnica preenchida em {id}",
    erro: "Falha ao preencher ficha técnica em {id}",
  },
  pausar_anuncio: { sucesso: "Anúncio pausado — {id}", erro: "Falha ao pausar anúncio {id}" },
  reativar_anuncio: { sucesso: "Anúncio reativado — {id}", erro: "Falha ao reativar anúncio {id}" },
  aplicar_resposta_pergunta: {
    sucesso: "Respondeu uma pergunta de comprador",
    erro: "Falha ao responder pergunta",
  },
};

const GESTOR_POR_VALOR: Record<string, AtividadeAoVivo["gestor"]> = {
  estoque_fulfillment: "estoque_fulfillment",
  anuncios_seo: "anuncios_seo",
  reputacao: "reputacao",
};

function acaoParaAtividade(row: AcaoRow): AtividadeAoVivo | null {
  if (row.status === "confirmado") return null;
  const label = ACAO_LABEL[row.acao];
  const sku = typeof row.detalhes?.sku === "string" ? row.detalhes.sku : row.alvo_id;
  const texto = (row.status === "executado" ? label?.sucesso : label?.erro)?.replace("{id}", sku) ?? row.acao;
  return {
    texto,
    gestor: GESTOR_POR_VALOR[row.gestor] ?? "anuncios_seo",
    tom: row.status === "executado" ? "sucesso" : "erro",
    quando: row.criado_em,
  };
}

function montarAtividades(
  runDiogo: SellerAiRun<RupturaFulfillmentResultado> | undefined,
  runAndrey: SellerAiRun<AnunciosSeoResultado> | undefined,
  runAmanda: SellerAiRun<ReputacaoAtendimentoResultado> | undefined,
  acoes: AcaoRow[]
): AtividadeAoVivo[] {
  const atividades: AtividadeAoVivo[] = [];

  for (const row of acoes) {
    const a = acaoParaAtividade(row);
    if (a) atividades.push(a);
  }

  if (runDiogo?.status === "ok" && runDiogo.resultado) {
    const destaqueSku = runDiogo.resultado.destaque_risco_alto?.[0];
    const sku = runDiogo.resultado.skus.find((s) => s.sku === destaqueSku);
    if (sku) {
      atividades.push({
        texto: `${sku.sku}: ${sku.acao_recomendada}`,
        gestor: "estoque_fulfillment",
        tom: "atencao",
        quando: runDiogo.executado_em,
      });
    }
  }

  if (runAndrey?.status === "ok" && runAndrey.resultado) {
    const destaqueChave = runAndrey.resultado.destaque_prioridade?.[0];
    const grupo = runAndrey.resultado.anuncios.find((a) => a.chave === destaqueChave);
    if (grupo) {
      atividades.push({
        texto: `${grupo.item_id_representante}: ${grupo.observacao}`,
        gestor: "anuncios_seo",
        tom: "atencao",
        quando: runAndrey.executado_em,
      });
    }
  }

  if (runAmanda?.status === "ok" && runAmanda.resultado) {
    const perguntaUrgente = runAmanda.resultado.perguntas.find((p) => p.urgencia === "alta");
    if (perguntaUrgente) {
      atividades.push({
        texto: `${perguntaUrgente.titulo_anuncio}: pergunta urgente sem resposta`,
        gestor: "reputacao",
        tom: "atencao",
        quando: runAmanda.executado_em,
      });
    } else if (runAmanda.resultado.diagnostico !== "saudavel") {
      atividades.push({
        texto: runAmanda.resultado.observacao,
        gestor: "reputacao",
        tom: "atencao",
        quando: runAmanda.executado_em,
      });
    }
  }

  return atividades.sort((a, b) => new Date(b.quando).getTime() - new Date(a.quando).getTime()).slice(0, 5);
}

function resumoStatusDiogo(run: SellerAiRun<RupturaFulfillmentResultado> | undefined): string {
  if (!run || run.status !== "ok" || !run.resultado) return "Ainda não rodou";
  const alto = run.resultado.skus.filter((s) => s.risco === "alto").length;
  if (alto === 0) return "Nenhum SKU em risco alto";
  return `${alto} SKU${alto > 1 ? "s" : ""} em risco alto agora`;
}

function resumoStatusAndrey(run: SellerAiRun<AnunciosSeoResultado> | undefined): string {
  if (!run || run.status !== "ok" || !run.resultado) return "Ainda não rodou";
  const comProblema = run.resultado.anuncios.filter((a) => a.diagnostico !== "sem_problema_aparente").length;
  if (comProblema === 0) return "Nenhum problema encontrado";
  return `${comProblema} grupo${comProblema > 1 ? "s" : ""} sinalizado${comProblema > 1 ? "s" : ""}`;
}

const DIAGNOSTICO_REPUTACAO_LABEL: Record<string, string> = {
  saudavel: "Reputação saudável",
  atencao: "Reputação em atenção",
  critica: "Reputação crítica",
};

function resumoStatusAmanda(run: SellerAiRun<ReputacaoAtendimentoResultado> | undefined): string {
  if (!run || run.status !== "ok" || !run.resultado) return "Ainda não rodou";
  const label = DIAGNOSTICO_REPUTACAO_LABEL[run.resultado.diagnostico] ?? run.resultado.diagnostico;
  const perguntas = run.resultado.perguntas.length;
  if (perguntas === 0) return label;
  return `${label} · ${perguntas} pergunta${perguntas > 1 ? "s" : ""} sem resposta`;
}

async function getAccessToken(): Promise<string | null> {
  const {
    data: { session },
  } = await supabaseBrowser.auth.getSession();
  return session?.access_token ?? null;
}

function resumoParaCard(
  slug: string,
  runs: Record<string, SellerAiRun<unknown>>
): string {
  if (slug === "diogo") {
    return resumoStatusDiogo(runs["estoque_fulfillment"] as SellerAiRun<RupturaFulfillmentResultado> | undefined);
  }
  if (slug === "andrey") {
    return resumoStatusAndrey(runs["anuncios_seo"] as SellerAiRun<AnunciosSeoResultado> | undefined);
  }
  if (slug === "amanda") {
    return resumoStatusAmanda(runs["reputacao"] as SellerAiRun<ReputacaoAtendimentoResultado> | undefined);
  }
  return "Em breve";
}

function GestorCard({ slug, nome, funcao, ativo, resumo }: { slug: string; nome: string; funcao: string; ativo: boolean; resumo: string }) {
  return (
    <Link
      href={`/seller/gestores-ia/${slug}`}
      className="group block rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4 text-left transition-all hover:border-emerald-300 hover:shadow-md dark:hover:border-emerald-700"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-[var(--foreground)]">{nome}</p>
          <p className="text-xs text-[var(--muted)]">{funcao}</p>
        </div>
        {!ativo ? (
          <span className="inline-flex shrink-0 items-center whitespace-nowrap rounded-md bg-[var(--muted)]/15 px-2 py-1 text-[11px] font-medium text-[var(--muted)]">
            Em breve
          </span>
        ) : null}
      </div>
      <p className="mt-3 text-sm text-[var(--foreground)]">{resumo}</p>
    </Link>
  );
}

export default function SellerGestoresIaPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pro, setPro] = useState(true);
  const [saldoSuficiente, setSaldoSuficiente] = useState(true);
  const [runs, setRuns] = useState<Record<string, SellerAiRun<unknown>>>({});
  const [acoes, setAcoes] = useState<AcaoRow[]>([]);

  useEffect(() => {
    async function carregar() {
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
      setSaldoSuficiente(json.saldo_suficiente ?? true);
      setRuns(json.runs ?? {});
      setAcoes(json.acoes ?? []);
      setLoading(false);
    }
    void carregar();
  }, []);

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
        ) : (
          <div className="space-y-5">
            <SellerGestoresIaEscritorio3D
              statusDiogo={resumoStatusDiogo(runs["estoque_fulfillment"] as SellerAiRun<RupturaFulfillmentResultado> | undefined)}
              statusAndrey={resumoStatusAndrey(runs["anuncios_seo"] as SellerAiRun<AnunciosSeoResultado> | undefined)}
              statusAmanda={resumoStatusAmanda(runs["reputacao"] as SellerAiRun<ReputacaoAtendimentoResultado> | undefined)}
              atividades={montarAtividades(
                runs["estoque_fulfillment"] as SellerAiRun<RupturaFulfillmentResultado> | undefined,
                runs["anuncios_seo"] as SellerAiRun<AnunciosSeoResultado> | undefined,
                runs["reputacao"] as SellerAiRun<ReputacaoAtendimentoResultado> | undefined,
                acoes
              )}
            />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {GESTORES_PERFIS.map((g) => (
                <GestorCard
                  key={g.slug}
                  slug={g.slug}
                  nome={g.nome}
                  funcao={g.funcao}
                  ativo={g.ativo}
                  resumo={resumoParaCard(g.slug, runs)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
