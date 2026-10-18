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
import { GestorAvulsoConectarMlEmptyState } from "@/components/seller/GestorAvulsoConectarMlEmptyState";
import { IconAndrey } from "@/components/seller/GestorAvulsoIcons";
import { HelpBubble } from "@/components/HelpBubble";
import {
  type Anuncio,
  type AndreyResultado,
  type Diagnostico,
  DIAGNOSTICO_LABEL,
  DiagnosticoBadge,
  AnuncioDiagnosticoDetalhe,
} from "@/components/seller/SellerAndreyAvulsoShared";
import { AbaPilula } from "@/components/seller/GestorAvulsoAbaPilula";

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
      className="flex w-full flex-col gap-2 rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4 text-left transition-all hover:border-emerald-300 hover:shadow-md dark:hover:border-emerald-700 sm:flex-row sm:items-center"
    >
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 font-medium text-[var(--foreground)] sm:truncate">{titulo}</p>
        {destaque ? (
          <p className="mt-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
            Prioridade pra revisar primeiro
          </p>
        ) : null}
        {anuncio.observacao ? (
          <p className="mt-0.5 line-clamp-2 text-xs text-[var(--muted)] sm:truncate">{anuncio.observacao}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center justify-between gap-2 sm:justify-end">
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
      </div>
    </button>
  );
}

function IconTodos() {
  return (
    <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}
function IconTitulo() {
  return (
    <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 7V4h16v3" />
      <path d="M9 20h6" />
      <path d="M12 4v16" />
    </svg>
  );
}
function IconDescricao() {
  return (
    <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 6h16M4 12h16M4 18h10" />
    </svg>
  );
}
function IconFicha() {
  return (
    <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 7h8M8 11h8M8 15h5" />
    </svg>
  );
}

/** Filtro por tipo de diagnóstico (mesma ideia da aba Margem/Ads/Promoções/Afiliados do
 * Ulisses) — achado 2026-10-14: com vários tipos misturados numa lista só, ficava "tudo
 * solto junto"; separar por aba deixa escanear um tipo de problema por vez. */
type AbaAndrey = "todos" | Diagnostico;

function AndreyResultadoAbas({ resultado }: { resultado: AndreyResultado }) {
  const [aba, setAba] = useState<AbaAndrey>("todos");
  const [chaveAberta, setChaveAberta] = useState<string | null>(null);
  const destaques = new Set(resultado.destaque_prioridade);

  // Achado 2026-10-15: a amostra manda até 20 grupos pra IA avaliar, mas quando o catálogo
  // elegível tem menos que isso, os que já estão bem ("sem_problema_aparente") entravam
  // igual na lista/modal — obrigando revisar card por card só pra achar os poucos com
  // problema de verdade. A lista agora só mostra quem tem diagnóstico real.
  const anunciosComProblema = resultado.anuncios.filter((a) => a.diagnostico !== "sem_problema_aparente");

  const porTipo = {
    problema_titulo: anunciosComProblema.filter((a) => a.diagnostico === "problema_titulo").length,
    problema_descricao: anunciosComProblema.filter((a) => a.diagnostico === "problema_descricao").length,
    caracteristicas_incompletas: anunciosComProblema.filter((a) => a.diagnostico === "caracteristicas_incompletas")
      .length,
  };

  const filtrados = (
    aba === "todos" ? anunciosComProblema : anunciosComProblema.filter((a) => a.diagnostico === aba)
  )
    .slice()
    .sort((a, b) => {
      const da = destaques.has(a.chave) ? 0 : 1;
      const db = destaques.has(b.chave) ? 0 : 1;
      return da - db;
    });

  const indiceAberto = chaveAberta ? filtrados.findIndex((a) => a.chave === chaveAberta) : -1;
  const anuncioAberto = indiceAberto >= 0 ? filtrados[indiceAberto] : null;

  return (
    <div className="space-y-4">
      <div className="flex gap-1 overflow-x-auto rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-1 sm:flex-wrap">
        <AbaPilula ativo={aba === "todos"} onClick={() => setAba("todos")} icon={<IconTodos />}>
          {`Todos (${anunciosComProblema.length})`}
        </AbaPilula>
        <AbaPilula ativo={aba === "problema_titulo"} onClick={() => setAba("problema_titulo")} icon={<IconTitulo />}>
          {`${DIAGNOSTICO_LABEL.problema_titulo} (${porTipo.problema_titulo})`}
        </AbaPilula>
        <AbaPilula
          ativo={aba === "problema_descricao"}
          onClick={() => setAba("problema_descricao")}
          icon={<IconDescricao />}
        >
          {`${DIAGNOSTICO_LABEL.problema_descricao} (${porTipo.problema_descricao})`}
        </AbaPilula>
        <AbaPilula
          ativo={aba === "caracteristicas_incompletas"}
          onClick={() => setAba("caracteristicas_incompletas")}
          icon={<IconFicha />}
        >
          {`${DIAGNOSTICO_LABEL.caracteristicas_incompletas} (${porTipo.caracteristicas_incompletas})`}
        </AbaPilula>
      </div>

      {filtrados.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">
          {aba === "todos"
            ? "Nenhum anúncio com problema agora — amostra inteira revisada sem achado relevante."
            : "Nenhum anúncio nesse tipo de diagnóstico agora."}
        </p>
      ) : (
        <div className="space-y-3">
          {filtrados.map((a) => (
            <AnuncioLinha
              key={a.chave}
              anuncio={a}
              destaque={destaques.has(a.chave)}
              onAbrir={(anuncio) => setChaveAberta(anuncio.chave)}
            />
          ))}
        </div>
      )}

      {anuncioAberto ? (
        <div
          className={cn(MODAL_OVERLAY_CLASS, "animate-fade-in-up")}
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-anuncio-titulo"
          onClick={() => setChaveAberta(null)}
        >
          <div
            className={cn(MODAL_PANEL_CLASS, "animate-fade-in-up animate-fade-in-up-delay-1")}
            // `MODAL_PANEL_CLASS` já embute `max-w-sm`; `cn()` só concatena (não é twMerge),
            // então um 2º `max-w-*` na className perde pra `.max-w-sm` na ordem do CSS
            // compilado, não pela ordem das classes no HTML — por isso `style` aqui, nunca
            // outra classe `max-w-*` (achado real 2026-10-14, o mesmo bug afeta outros
            // modais do sistema que fazem esse mesmo append, ver conversa).
            style={{ maxWidth: "48rem" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--card-border)] px-5 pb-4 pt-5">
              <div className="min-w-0 flex-1">
                <h2 id="modal-anuncio-titulo" className="min-w-0 text-base font-semibold text-[var(--foreground)]">
                  {anuncioAberto.familia_nome ?? anuncioAberto.membros[0]?.titulo_completo ?? anuncioAberto.chave}
                </h2>
                {destaques.has(anuncioAberto.chave) ? (
                  <p className="mt-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                    Prioridade pra revisar primeiro
                  </p>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <DiagnosticoBadge diagnostico={anuncioAberto.diagnostico} />
                <button
                  type="button"
                  onClick={() => setChaveAberta(null)}
                  aria-label="Fechar"
                  className="-m-1 rounded p-1 text-xl leading-none text-neutral-400 transition-colors hover:text-neutral-900 dark:hover:text-neutral-200"
                >
                  ×
                </button>
              </div>
            </div>
            <div className={cn(MODAL_PANEL_BODY_CLASS, "px-5 pb-5 pt-4")}>
              <AnuncioDiagnosticoDetalhe anuncio={anuncioAberto} />
            </div>
            <div className="flex shrink-0 items-center justify-between gap-3 border-t border-[var(--card-border)] px-5 py-3">
              <button
                type="button"
                onClick={() => setChaveAberta(filtrados[indiceAberto - 1].chave)}
                disabled={indiceAberto <= 0}
                className="rounded-md border border-[var(--card-border)] bg-[var(--card)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--foreground)] hover:bg-[var(--muted)]/10 disabled:cursor-not-allowed disabled:opacity-40"
              >
                ← Anterior
              </button>
              <span className="text-xs text-[var(--muted)]">
                {indiceAberto + 1} de {filtrados.length}
              </span>
              <button
                type="button"
                onClick={() => setChaveAberta(filtrados[indiceAberto + 1].chave)}
                disabled={indiceAberto >= filtrados.length - 1}
                className="rounded-md border border-[var(--card-border)] bg-[var(--card)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--foreground)] hover:bg-[var(--muted)]/10 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Próximo →
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function AndreyAvulsoPage() {
  const router = useRouter();
  const [acesso, setAcesso] = useState<Acesso>("loading");
  const [mlConectado, setMlConectado] = useState(true);
  const [run, setRun] = useState<SellerAiRun<AndreyResultado> | null>(null);
  const [usoTokensHoje, setUsoTokensHoje] = useState<UsoTokensHoje | null>(null);
  const [bloqueadoHoje, setBloqueadoHoje] = useState(false);
  const [novoAnuncioHelpOpen, setNovoAnuncioHelpOpen] = useState(false);

  const carregar = useCallback(async () => {
    const { data } = await supabaseBrowser.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      router.replace("/gestores-ia/login");
      return;
    }
    const res = await fetch("/api/gestores-ia-avulso/anuncio", {
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
    const res = await fetch("/api/gestores-ia-avulso/anuncio/rodar", {
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
                Anúncio
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
          <GestorAvulsoConectarMlEmptyState
            icon={<IconAndrey className="h-6 w-6 shrink-0" />}
            titulo="Conecte sua conta do Mercado Livre primeiro"
            descricao="O Anúncio precisa ler seus anúncios ativos pra analisar — conecte sua conta pra liberar essa rodada."
          />
        ) : (
          <>
            <GestorAvulsoOrcamentoBar usoTokensHoje={usoTokensHoje} bloqueadoHoje={bloqueadoHoje} />

            <div className="flex items-center gap-1.5">
              <Link
                href="/seller/gestores-ia-avulso/anuncio/novo-anuncio"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--muted)] hover:text-[var(--foreground)]"
              >
                <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M9 18h6" />
                  <path d="M10 22h4" />
                  <path d="M12 2a6 6 0 0 0-4 10.472V15h8v-2.528A6 6 0 0 0 12 2z" />
                </svg>
                Ideias pra anúncio novo
              </Link>
              <HelpBubble
                ariaLabel="O que é 'Ideias pra anúncio novo'"
                open={novoAnuncioHelpOpen}
                onOpen={() => setNovoAnuncioHelpOpen(true)}
                onClose={() => setNovoAnuncioHelpOpen(false)}
              >
                <p>Conte sobre um produto sem anúncio ainda e receba título, descrição e ficha técnica sugeridos.</p>
              </HelpBubble>
            </div>

            <SellerGestorRunShell<AndreyResultado>
              pro
              run={run}
              titulo="Diagnóstico de anúncios"
              tituloMobile="Diagnóstico"
              ajuda={
                <p>
                  Analisamos uma amostra dos anúncios com pior venda entre os que já estão 30+ dias no ar, comparando
                  título, descrição e ficha técnica. São sugestões — você escolhe aplicar direto no Mercado Livre
                  (com confirmação antes) ou só copiar e ajustar manualmente.
                </p>
              }
              onRodarAgora={dispararRodada}
            >
              {(resultado) => <AndreyResultadoAbas resultado={resultado} />}
            </SellerGestorRunShell>
          </>
        )}
      </div>

      <SellerNav active="gestores_ia" calcOnly temGestoresIa />
    </div>
  );
}
