"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { SellerNav } from "../../SellerNav";
import { Skeleton } from "@/components/ui/Skeleton";
import { DANGER_PREMIUM_SURFACE_TRANSPARENT, DANGER_PREMIUM_TEXT_BODY } from "@/lib/semanticPremium";
import { MODAL_OVERLAY_CLASS, MODAL_PANEL_CLASS, MODAL_PANEL_BODY_CLASS } from "@/lib/modalOverlay";
import { SellerGestorRunShell, type SellerAiRun, type DispararRodada } from "@/components/seller/SellerGestorRunShell";
import { GestorAvulsoOrcamentoBar, type UsoTokensHoje } from "@/components/seller/GestorAvulsoOrcamentoBar";
import {
  type Anuncio,
  type AndreyResultado,
  DiagnosticoBadge,
  AnuncioDiagnosticoDetalhe,
} from "@/components/seller/SellerAndreyAvulsoShared";

type Acesso = "loading" | "liberado" | "negado";

/** Linha resumo (não mais accordion — achado 2026-10-10: com 11+ grupos sinalizados, a
 * lista com cada card já aberto/expansível ficava enorme e "rasa" pra revisar um produto de
 * verdade). Clica e abre um modal com o diagnóstico completo (ver `AnuncioDiagnosticoDetalhe`
 * em SellerAndreyAvulsoShared.tsx) — página própria por produto foi testada antes e trocada
 * por modal a pedido do Sr Stark (mesmo padrão `MODAL_OVERLAY_CLASS`/`MODAL_PANEL_CLASS` do
 * resto do sistema, sempre centralizado). */
function AnuncioLinha({
  anuncio,
  destaque,
  onAbrir,
}: {
  anuncio: Anuncio;
  destaque: boolean;
  onAbrir: (anuncio: Anuncio, destaque: boolean) => void;
}) {
  const titulo = anuncio.familia_nome ?? anuncio.membros[0]?.titulo_completo ?? anuncio.chave;
  return (
    <button
      type="button"
      onClick={() => onAbrir(anuncio, destaque)}
      className="flex w-full items-center gap-2 rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4 text-left transition-all hover:border-emerald-300 hover:shadow-md dark:hover:border-emerald-700"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-[var(--foreground)]">{titulo}</p>
        {destaque ? (
          <p className="mt-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
            Prioridade pra revisar primeiro
          </p>
        ) : null}
        {anuncio.observacao ? (
          <p className="mt-0.5 truncate text-xs text-[var(--muted)]">{anuncio.observacao}</p>
        ) : null}
      </div>
      <DiagnosticoBadge diagnostico={anuncio.diagnostico} />
      <svg
        className="h-4 w-4 shrink-0 text-[var(--muted)]"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="m9 18 6-6-6-6" />
      </svg>
    </button>
  );
}

export default function AndreyAvulsoPage() {
  const router = useRouter();
  const [acesso, setAcesso] = useState<Acesso>("loading");
  const [mlConectado, setMlConectado] = useState(true);
  const [run, setRun] = useState<SellerAiRun<AndreyResultado> | null>(null);
  const [usoTokensHoje, setUsoTokensHoje] = useState<UsoTokensHoje | null>(null);
  const [bloqueadoHoje, setBloqueadoHoje] = useState(false);
  const [anuncioAberto, setAnuncioAberto] = useState<{ anuncio: Anuncio; destaque: boolean } | null>(null);

  const carregar = useCallback(async () => {
    const { data } = await supabaseBrowser.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      router.replace("/gestores-ia/login");
      return;
    }
    const res = await fetch("/api/gestores-ia-avulso/andrey", {
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
    const res = await fetch("/api/gestores-ia-avulso/andrey/rodar", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return json.error ?? "Erro ao rodar o Anúncio.";
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
                Anúncio — Anúncios &amp; SEO
              </h1>
              <span
                className="h-1 w-14 shrink-0 self-center rounded-full bg-gradient-to-r from-emerald-500 via-emerald-400 to-emerald-300/70 sm:w-20"
                aria-hidden
              />
            </div>
            <p className="text-sm leading-snug text-[var(--muted)]">
              Analisa os anúncios mais fracos da sua conta do Mercado Livre e sugere título, descrição e características
              pra melhorar visita e conversão — você decide se aplica direto ou copia pra ajustar manualmente.
            </p>
          </div>
        </header>

        {acesso === "loading" ? (
          <section className="space-y-4 rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-5 shadow-sm sm:p-6">
            <Skeleton className="h-6 w-56" />
            <Skeleton className="h-24 w-full" />
          </section>
        ) : acesso === "negado" ? (
          <div className={cn("rounded-2xl p-4 text-sm", DANGER_PREMIUM_SURFACE_TRANSPARENT, DANGER_PREMIUM_TEXT_BODY)}>
            Não foi possível validar seu acesso.
          </div>
        ) : !mlConectado ? (
          <section className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-6 text-center shadow-sm sm:p-8">
            <p className="font-medium text-[var(--foreground)]">Conecte sua conta do Mercado Livre primeiro</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-[var(--muted)]">
              O Anúncio precisa ler seus anúncios ativos pra analisar — conecte sua conta pra liberar essa rodada.
            </p>
            <Link
              href="/seller/gestores-ia-avulso/integracoes"
              className="mt-4 inline-flex rounded-md bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-emerald-700"
            >
              Conectar Mercado Livre
            </Link>
          </section>
        ) : (
          <>
            <GestorAvulsoOrcamentoBar usoTokensHoje={usoTokensHoje} bloqueadoHoje={bloqueadoHoje} />

            <Link
              href="/seller/gestores-ia-avulso/andrey/novo-anuncio"
              className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4 text-left transition-all hover:border-emerald-300 dark:hover:border-emerald-700 hover:shadow-md"
            >
              <div className="min-w-0">
                <p className="font-medium text-[var(--foreground)]">Ideias pra anúncio novo</p>
                <p className="mt-0.5 text-xs text-[var(--muted)]">
                  Conte sobre um produto sem anúncio ainda e receba título, descrição e ficha técnica sugeridos.
                </p>
              </div>
              <span className="shrink-0 text-sm font-semibold text-emerald-700 dark:text-emerald-400">Abrir →</span>
            </Link>

            <SellerGestorRunShell<AndreyResultado>
              pro
              run={run}
              titulo="Diagnóstico de anúncios"
              ajuda={
                <p>
                  Analisamos uma amostra dos anúncios com pior venda entre os que já estão 30+ dias no ar, comparando
                  título, descrição e ficha técnica. São sugestões — você escolhe aplicar direto no Mercado Livre
                  (com confirmação antes) ou só copiar e ajustar manualmente.
                </p>
              }
              onRodarAgora={dispararRodada}
            >
              {(resultado) => {
                const destaques = new Set(resultado.destaque_prioridade);
                const ordenados = [...resultado.anuncios].sort((a, b) => {
                  const da = destaques.has(a.chave) ? 0 : 1;
                  const db = destaques.has(b.chave) ? 0 : 1;
                  return da - db;
                });
                return (
                  <div className="space-y-3">
                    {ordenados.map((a) => (
                      <AnuncioLinha
                        key={a.chave}
                        anuncio={a}
                        destaque={destaques.has(a.chave)}
                        onAbrir={(anuncio, destaque) => setAnuncioAberto({ anuncio, destaque })}
                      />
                    ))}
                  </div>
                );
              }}
            </SellerGestorRunShell>
          </>
        )}
      </div>

      {anuncioAberto ? (
        <div
          className={cn(MODAL_OVERLAY_CLASS, "animate-fade-in-up")}
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-anuncio-titulo"
          onClick={() => setAnuncioAberto(null)}
        >
          <div
            className={cn(MODAL_PANEL_CLASS, "max-w-2xl animate-fade-in-up animate-fade-in-up-delay-1")}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--card-border)] px-5 pb-4 pt-5">
              <div className="min-w-0 flex-1">
                <h2 id="modal-anuncio-titulo" className="min-w-0 truncate text-base font-semibold text-[var(--foreground)]">
                  {anuncioAberto.anuncio.familia_nome ??
                    anuncioAberto.anuncio.membros[0]?.titulo_completo ??
                    anuncioAberto.anuncio.chave}
                </h2>
                {anuncioAberto.destaque ? (
                  <p className="mt-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                    Prioridade pra revisar primeiro
                  </p>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <DiagnosticoBadge diagnostico={anuncioAberto.anuncio.diagnostico} />
                <button
                  type="button"
                  onClick={() => setAnuncioAberto(null)}
                  aria-label="Fechar"
                  className="-m-1 rounded p-1 text-xl leading-none text-neutral-400 transition-colors hover:text-neutral-900 dark:hover:text-neutral-200"
                >
                  ×
                </button>
              </div>
            </div>
            <div className={cn(MODAL_PANEL_BODY_CLASS, "px-5 pb-5 pt-4")}>
              <AnuncioDiagnosticoDetalhe anuncio={anuncioAberto.anuncio} />
            </div>
          </div>
        </div>
      ) : null}

      <SellerNav active="gestores_ia" calcOnly temGestoresIa />
    </div>
  );
}
