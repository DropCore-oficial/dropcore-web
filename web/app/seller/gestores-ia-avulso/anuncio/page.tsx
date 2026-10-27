"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
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
        {anuncio.funil_alerta ? (
          <p className="mt-0.5 line-clamp-2 text-xs text-[var(--danger)] sm:truncate">
            Teve visita e não vendeu — {anuncio.funil_causa_detalhe}
          </p>
        ) : anuncio.visitas_baixas_alerta ? (
          <p className="mt-0.5 line-clamp-2 text-xs text-[var(--danger)] sm:truncate">
            {anuncio.visitas_baixas_causa_detalhe ?? "Visita caiu nos últimos 30 dias, sem causa identificada."}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center justify-between gap-2 sm:justify-end">
        {/* "Sem problema aparente" ficaria contraditório (badge verde) ao lado do aviso de
            funil quebrado (texto vermelho acima) — nesse caso o sinal forte do card passa a
            ser o funil, não o diagnóstico de texto. */}
        {anuncio.diagnostico === "sem_problema_aparente" && (anuncio.funil_alerta || anuncio.visitas_baixas_alerta) ? null : (
          <DiagnosticoBadge diagnostico={anuncio.diagnostico} />
        )}
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
function IconFunilToggle() {
  return (
    <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3Z" />
    </svg>
  );
}
function IconAlertaFunil() {
  return (
    <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
      <path d="M12 9v4M12 17h.01" />
    </svg>
  );
}

/** Causa unificada (2026-10-22): junta diagnóstico de texto (problema_titulo/descricao/
 * caracteristicas_incompletas, calculado pela própria IA do Andrey) com causa de funil
 * (verificada por código, inclui a foto da Laura) numa ÚNICA lista de filtro, na mesma
 * ordem em que o backend realmente cascateia (`gestorAnunciosSeoDadosAvulso.ts`): tráfego é
 * checado antes de tudo (sinal próprio, `visitas_baixas_alerta`), depois reclamação →
 * reputação → sem promoção → preço subiu → variação sem estoque → texto (o motivo de ser 3
 * valores aqui, não 1 "texto_fraco" genérico — o backend resolve texto fraco em 3 causas
 * diferentes e é essa granularidade que o Sr Stark pediu pra manter) → foto ruim → sem causa
 * identificada. Antes tentamos separar texto/funil em 2 modos com toggle — ficou "pesado"
 * de alternar; voltar a 1 lista só, mas com a ordem certa, resolve sem reintroduzir a
 * confusão original de 2026-10-20 (lá não tinha explicação nenhuma de causa de funil, só
 * misturava sem filtro — aqui cada causa tem sua aba). */
type CausaUnificada =
  | "trafego"
  | "reclamacao"
  | "reputacao_baixa"
  | "sem_promocao"
  | "preco_subiu"
  | "variacao_sem_estoque"
  | "problema_titulo"
  | "problema_descricao"
  | "caracteristicas_incompletas"
  | "foto_ruim"
  | "sem_causa_identificada";

const CAUSA_UNIFICADA_LABEL: Record<CausaUnificada, string> = {
  trafego: "Pouca visita",
  reclamacao: "Reclamação",
  reputacao_baixa: "Reputação",
  sem_promocao: "Sem promoção",
  preco_subiu: "Preço subiu",
  variacao_sem_estoque: "Variação sem estoque",
  problema_titulo: DIAGNOSTICO_LABEL.problema_titulo,
  problema_descricao: DIAGNOSTICO_LABEL.problema_descricao,
  caracteristicas_incompletas: DIAGNOSTICO_LABEL.caracteristicas_incompletas,
  foto_ruim: "Foto ruim",
  sem_causa_identificada: "Sem causa identificada",
};

const CAUSA_UNIFICADA_ICON: Record<CausaUnificada, ReactNode> = {
  trafego: <IconFunilToggle />,
  reclamacao: <IconAlertaFunil />,
  reputacao_baixa: <IconAlertaFunil />,
  sem_promocao: <IconAlertaFunil />,
  preco_subiu: <IconAlertaFunil />,
  variacao_sem_estoque: <IconAlertaFunil />,
  problema_titulo: <IconTitulo />,
  problema_descricao: <IconDescricao />,
  caracteristicas_incompletas: <IconFicha />,
  foto_ruim: <IconAlertaFunil />,
  sem_causa_identificada: <IconAlertaFunil />,
};

/** `null` quando o anúncio não tem nenhuma causa (nem texto, nem funil) — prioriza tráfego
 * sobre o resto (não adianta resolver conversão se quase ninguém vê o anúncio ainda), depois
 * segue a autoridade do backend (`funil_causa_provavel`) quando ele já rodou a cascata
 * completa; só cai pro `diagnostico` cru quando o item nem chegou a ter `funil_alerta`
 * (ex.: já vendeu normal, mas o título ainda está fraco). */
function causaUnificadaDoAnuncio(a: Anuncio): CausaUnificada | null {
  if (a.visitas_baixas_alerta) return "trafego";
  if (a.funil_alerta && a.funil_causa_provavel) {
    if (a.funil_causa_provavel === "texto_fraco") {
      if (a.diagnostico === "sem_problema_aparente") return "sem_causa_identificada";
      return a.diagnostico;
    }
    return a.funil_causa_provavel;
  }
  if (a.diagnostico !== "sem_problema_aparente") return a.diagnostico;
  return null;
}

function AndreyResultadoAbas({ resultado }: { resultado: AndreyResultado }) {
  const [aba, setAba] = useState<"todos" | CausaUnificada>("todos");
  const [chaveAberta, setChaveAberta] = useState<string | null>(null);
  const destaques = new Set(resultado.destaque_prioridade);

  // Achado 2026-10-15: a amostra manda até 20 grupos pra IA avaliar, mas quando o catálogo
  // elegível tem menos que isso, os que já estão bem ("sem_problema_aparente") entravam
  // igual na lista/modal — obrigando revisar card por card só pra achar os poucos com
  // problema de verdade. A lista agora só mostra quem tem causa real (texto OU funil).
  const anunciosComCausa = resultado.anuncios.filter((a) => causaUnificadaDoAnuncio(a) !== null);
  const porCausa = anunciosComCausa.reduce((acc, a) => {
    const causa = causaUnificadaDoAnuncio(a);
    if (causa) acc[causa] = (acc[causa] ?? 0) + 1;
    return acc;
  }, {} as Partial<Record<CausaUnificada, number>>);

  const filtrados = (
    aba === "todos" ? anunciosComCausa : anunciosComCausa.filter((a) => causaUnificadaDoAnuncio(a) === aba)
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
      {/* Lista unificada (2026-10-22): antes tentamos 2 modos com toggle (texto/funil) —
       * ficou pesado de alternar entre um sinal com poucos itens e outro com muitos. Agora é
       * 1 fileira só, na ordem real da cascata do backend — ver comentário de
       * `CausaUnificada` acima. Achado mesmo dia: com a maioria das causas zeradas na
       * amostra real (ex. 8 de 11 em 0), mostrar todas as abas sempre virava poluição visual
       * sem informação nova — só aparece aba de causa com pelo menos 1 anúncio de verdade. */}
      <div className="flex gap-1 overflow-x-auto rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-1 sm:flex-wrap">
        <AbaPilula ativo={aba === "todos"} onClick={() => setAba("todos")} icon={<IconTodos />}>
          {`Todos (${anunciosComCausa.length})`}
        </AbaPilula>
        {(Object.keys(CAUSA_UNIFICADA_LABEL) as CausaUnificada[])
          .filter((causa) => (porCausa[causa] ?? 0) > 0)
          .map((causa) => (
            <AbaPilula key={causa} ativo={aba === causa} onClick={() => setAba(causa)} icon={CAUSA_UNIFICADA_ICON[causa]}>
              {`${CAUSA_UNIFICADA_LABEL[causa]} (${porCausa[causa]})`}
            </AbaPilula>
          ))}
      </div>

      {filtrados.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">
          {aba === "todos"
            ? "Nenhum anúncio com problema agora — amostra inteira revisada sem achado relevante."
            : "Nenhum anúncio com essa causa agora."}
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
                {anuncioAberto.diagnostico === "sem_problema_aparente" &&
                (anuncioAberto.funil_alerta || anuncioAberto.visitas_baixas_alerta) ? null : (
                  <DiagnosticoBadge diagnostico={anuncioAberto.diagnostico} />
                )}
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

      <SellerNav active="gestores_ia" calcOnly produto="gestores_ia_avulso" />
    </div>
  );
}
