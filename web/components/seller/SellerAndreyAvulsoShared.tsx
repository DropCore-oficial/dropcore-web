"use client";

/**
 * Tipos, badge e botões de aplicar (título/descrição/características) do Andrey avulso —
 * compartilhado entre a lista (web/app/seller/gestores-ia-avulso/anuncio/page.tsx) e a
 * página de detalhe por produto (web/app/seller/gestores-ia-avulso/anuncio/[chave]/page.tsx).
 * Extraído em 2026-10-10 quando o diagnóstico de cada anúncio virou página própria (em vez
 * de accordion na lista) — ver achado no histórico da conversa: lista ficava "rasa" demais
 * pra revisar um produto de verdade dentro de um `<details>` espremido.
 */
import { useState } from "react";
import { cn } from "@/lib/utils";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { DANGER_PREMIUM_TEXT_PRIMARY } from "@/lib/semanticPremium";
import { CopiarSugestaoBotao } from "@/components/seller/SellerGestorCopiarBotao";
import { mlItemPermalink } from "@/lib/mercadoLivreApiClient";

export type Diagnostico = "problema_titulo" | "problema_descricao" | "caracteristicas_incompletas" | "sem_problema_aparente";

export type Membro = {
  item_id: string;
  titulo_completo: string;
  vendas_totais: number;
  visitas_30d: number;
  dias_no_ar: number;
  fotos_insuficientes: boolean;
  foto_baixa_resolucao: boolean;
};

export type CaracteristicaSugerida = { atributo_id: string; atributo_nome: string; valor: string; valorValido: boolean };

export type Duplicidade = {
  titulo_anuncio_forte: string;
  vendas_anuncio_forte: number;
  vendas_anuncio_atual: number;
  pode_pausar: boolean;
  motivo_bloqueio: string | null;
};

export type Anuncio = {
  chave: string;
  item_id_representante: string;
  familia_nome: string | null;
  diagnostico: Diagnostico;
  titulo_sugerido: string;
  descricao_sugerida: string;
  observacao: string;
  atributos_principais_faltando: string[];
  atributos_secundarios_faltando: string[];
  caracteristicas_sugeridas: CaracteristicaSugerida[];
  membros: Membro[];
  categoria_provavelmente_errada: boolean;
  categoria_sugerida_nome: string | null;
  duplicidade: Duplicidade | null;
  atributos_sem_reforco_texto: { id: string; name: string; valor: string }[];
  /** Ficha técnica tem um valor pra esse atributo que não aparece no texto, mas outro valor
   * válido do MESMO atributo já aparece — ficha e texto discordam (ex.: ficha diz "Gola:
   * Mao", título já diz "Gola Padre"). Diferente de ausência: aqui já existe resposta, só
   * que diferente — não é pra sugerir trocar, é pra avisar a divergência. */
  atributos_conflitantes: { id: string; name: string; valor: string; valorNoTexto: string }[];
};

export type AndreyResultado = { anuncios: Anuncio[]; destaque_prioridade: string[] };

export const DIAGNOSTICO_BADGE: Record<Diagnostico, string> = {
  problema_titulo: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300",
  problema_descricao: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  caracteristicas_incompletas: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  sem_problema_aparente: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400",
};

export const DIAGNOSTICO_LABEL: Record<Diagnostico, string> = {
  problema_titulo: "Título fraco",
  problema_descricao: "Descrição fraca",
  caracteristicas_incompletas: "Ficha técnica incompleta",
  sem_problema_aparente: "Sem problema aparente",
};

export function DiagnosticoBadge({ diagnostico }: { diagnostico: Diagnostico }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-medium",
        DIAGNOSTICO_BADGE[diagnostico]
      )}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden />
      {DIAGNOSTICO_LABEL[diagnostico]}
    </span>
  );
}

type AplicarEstado = "idle" | "confirmando" | "aplicando" | "aplicado" | "bloqueado" | "erro";

export async function getAccessTokenAvulso(): Promise<string | null> {
  const {
    data: { session },
  } = await supabaseBrowser.auth.getSession();
  return session?.access_token ?? null;
}

export function AplicarTituloBotao({ itemId, tituloSugerido }: { itemId: string; tituloSugerido: string }) {
  const [estado, setEstado] = useState<AplicarEstado>("idle");
  const [mensagem, setMensagem] = useState<string | null>(null);

  async function aplicar() {
    setEstado("aplicando");
    const token = await getAccessTokenAvulso();
    if (!token) {
      setMensagem("Sessão expirada, faça login de novo.");
      setEstado("erro");
      return;
    }
    const res = await fetch("/api/gestores-ia-avulso/anuncio/aplicar-titulo", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ item_id: itemId, titulo_novo: tituloSugerido }),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; bloqueado?: boolean };
    if (res.status === 409 || json.bloqueado) {
      setMensagem(json.error ?? "O Mercado Livre não permite editar o título desse anúncio.");
      setEstado("bloqueado");
      return;
    }
    if (!res.ok || !json.ok) {
      setMensagem(json.error ?? "Erro ao aplicar o título.");
      setEstado("erro");
      return;
    }
    setMensagem(null);
    setEstado("aplicado");
  }

  if (estado === "aplicado") {
    return <p className="mt-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400">Título aplicado no Mercado Livre ✓</p>;
  }
  if (estado === "bloqueado" || estado === "erro") {
    return (
      <div className="mt-2 space-y-1.5">
        <p className={cn("text-xs", DANGER_PREMIUM_TEXT_PRIMARY)}>{mensagem}</p>
        <CopiarSugestaoBotao texto={tituloSugerido} />
      </div>
    );
  }
  if (estado === "confirmando") {
    return (
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <p className="text-xs text-[var(--muted)]">Aplicar esse título no anúncio agora?</p>
        <button
          type="button"
          onClick={() => void aplicar()}
          className="rounded-md bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-emerald-700"
        >
          Sim, aplicar
        </button>
        <button
          type="button"
          onClick={() => setEstado("idle")}
          className="rounded-md border border-[var(--card-border)] bg-[var(--card)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--foreground)] hover:bg-[var(--muted)]/10"
        >
          Cancelar
        </button>
      </div>
    );
  }
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => setEstado("confirmando")}
        disabled={estado === "aplicando"}
        className="rounded-md bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
      >
        {estado === "aplicando" ? "Aplicando…" : "Aplicar título sugerido"}
      </button>
      <CopiarSugestaoBotao texto={tituloSugerido} />
    </div>
  );
}

export function AplicarDescricaoBotao({ itemIds, descricaoSugerida }: { itemIds: string[]; descricaoSugerida: string }) {
  const [estado, setEstado] = useState<AplicarEstado>("idle");
  const [mensagem, setMensagem] = useState<string | null>(null);
  const plural = itemIds.length > 1;

  async function aplicar() {
    setEstado("aplicando");
    const token = await getAccessTokenAvulso();
    if (!token) {
      setMensagem("Sessão expirada, faça login de novo.");
      setEstado("erro");
      return;
    }
    const res = await fetch("/api/gestores-ia-avulso/anuncio/aplicar-descricao", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ item_ids: itemIds, descricao_nova: descricaoSugerida }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      sucesso?: number;
      total?: number;
      error?: string;
      resultados?: { item_id: string; ok: boolean; erro?: string }[];
    };
    const sucesso = json.sucesso ?? 0;
    const total = json.total ?? itemIds.length;
    if (!res.ok && sucesso === 0) {
      setMensagem(json.error ?? json.resultados?.[0]?.erro ?? "Erro ao aplicar a descrição.");
      setEstado("erro");
      return;
    }
    if (sucesso === total) {
      setMensagem(null);
      setEstado("aplicado");
      return;
    }
    setMensagem(`Aplicada em ${sucesso} de ${total} anúncios — revise o resto manualmente.`);
    setEstado("erro");
  }

  if (estado === "aplicado") {
    return (
      <p className="mt-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
        Descrição aplicada {plural ? `nas ${itemIds.length} variações` : "nesse anúncio"} ✓
      </p>
    );
  }
  if (estado === "erro") {
    return (
      <div className="mt-2 space-y-1.5">
        <p className={cn("text-xs", DANGER_PREMIUM_TEXT_PRIMARY)}>{mensagem}</p>
        <CopiarSugestaoBotao texto={descricaoSugerida} rotulo="Copiar descrição" />
      </div>
    );
  }
  if (estado === "confirmando") {
    return (
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <p className="text-xs text-[var(--muted)]">
          Aplicar essa descrição {plural ? `nas ${itemIds.length} variações` : "nesse anúncio"} agora?
        </p>
        <button
          type="button"
          onClick={() => void aplicar()}
          className="rounded-md bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-emerald-700"
        >
          Sim, aplicar
        </button>
        <button
          type="button"
          onClick={() => setEstado("idle")}
          className="rounded-md border border-[var(--card-border)] bg-[var(--card)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--foreground)] hover:bg-[var(--muted)]/10"
        >
          Cancelar
        </button>
      </div>
    );
  }
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => setEstado("confirmando")}
        disabled={estado === "aplicando"}
        className="rounded-md bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
      >
        {estado === "aplicando" ? "Aplicando…" : plural ? `Aplicar em todas as ${itemIds.length} variações` : "Aplicar descrição sugerida"}
      </button>
      <CopiarSugestaoBotao texto={descricaoSugerida} rotulo="Copiar descrição" />
    </div>
  );
}

export function AplicarCaracteristicasBotao({
  itemIds,
  caracteristicas,
}: {
  itemIds: string[];
  caracteristicas: CaracteristicaSugerida[];
}) {
  const [estado, setEstado] = useState<AplicarEstado>("idle");
  const [mensagem, setMensagem] = useState<string | null>(null);
  const validas = caracteristicas.filter((c) => c.valorValido);
  const plural = itemIds.length > 1;

  if (validas.length === 0) return null;

  async function aplicar() {
    setEstado("aplicando");
    const token = await getAccessTokenAvulso();
    if (!token) {
      setMensagem("Sessão expirada, faça login de novo.");
      setEstado("erro");
      return;
    }
    const res = await fetch("/api/gestores-ia-avulso/anuncio/aplicar-caracteristicas", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        item_ids: itemIds,
        caracteristicas: validas.map((c) => ({ atributo_id: c.atributo_id, valor: c.valor })),
      }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      sucesso?: number;
      total?: number;
      error?: string;
      resultados?: { item_id: string; ok: boolean; erro?: string }[];
    };
    const sucesso = json.sucesso ?? 0;
    const total = json.total ?? itemIds.length;
    if (!res.ok && sucesso === 0) {
      setMensagem(json.error ?? json.resultados?.[0]?.erro ?? "Erro ao aplicar as características.");
      setEstado("erro");
      return;
    }
    if (sucesso === total) {
      setMensagem(null);
      setEstado("aplicado");
      return;
    }
    setMensagem(`Aplicada em ${sucesso} de ${total} anúncios — revise o resto manualmente.`);
    setEstado("erro");
  }

  const textoCopia = validas.map((c) => `${c.atributo_nome}: ${c.valor}`).join("\n");

  if (estado === "aplicado") {
    return (
      <p className="mt-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
        Características aplicadas {plural ? `nas ${itemIds.length} variações` : "nesse anúncio"} ✓
      </p>
    );
  }
  if (estado === "erro") {
    return (
      <div className="mt-2 space-y-1.5">
        <p className={cn("text-xs", DANGER_PREMIUM_TEXT_PRIMARY)}>{mensagem}</p>
        <CopiarSugestaoBotao texto={textoCopia} rotulo="Copiar características" />
      </div>
    );
  }
  if (estado === "confirmando") {
    return (
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <p className="text-xs text-[var(--muted)]">
          Preencher {validas.length} característica(s) {plural ? `nas ${itemIds.length} variações` : "nesse anúncio"} agora?
        </p>
        <button
          type="button"
          onClick={() => void aplicar()}
          className="rounded-md bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-emerald-700"
        >
          Sim, aplicar
        </button>
        <button
          type="button"
          onClick={() => setEstado("idle")}
          className="rounded-md border border-[var(--card-border)] bg-[var(--card)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--foreground)] hover:bg-[var(--muted)]/10"
        >
          Cancelar
        </button>
      </div>
    );
  }
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => setEstado("confirmando")}
        disabled={estado === "aplicando"}
        className="rounded-md bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
      >
        {estado === "aplicando" ? "Aplicando…" : plural ? `Preencher em todas as ${itemIds.length} variações` : "Preencher ficha técnica"}
      </button>
      <CopiarSugestaoBotao texto={textoCopia} rotulo="Copiar características" />
    </div>
  );
}

/** Corpo completo do diagnóstico de 1 anúncio — avisos, sugestão de título/descrição/ficha
 * técnica e a lista de variantes. Usado no modal de diagnóstico (antes vivia dentro de um
 * `<details>` na lista, depois virou página própria — ver achado 2026-10-10 no histórico).
 *
 * Ordem por hierarquia de leitura, não pela ordem em que os campos chegam da API:
 * 1. Produto (o quê) — identifica o anúncio/variantes antes de qualquer diagnóstico.
 * 2. Diagnóstico (por quê) — a `observacao`, em destaque, é a frase mais importante do card.
 * 3. Avisos secundários (detalhe) — categoria/duplicidade/ficha técnica, linhas compactas.
 * 4. Sugestão (o que fazer) — por último, é a ação final.
 *
 * Caixa de diagnóstico abaixo é sempre neutra (sem borda colorida): o `DiagnosticoBadge` no
 * cabeçalho do modal já é o único sinal de cor pra esse `diagnostico` — repetir a cor aqui
 * seria o mesmo veredito duas vezes (achado 2026-10-11, regra da skill dropcore-gestores-ia).
 */
function SecaoEyebrow({ children }: { children: string }) {
  return <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">{children}</p>;
}

export function AnuncioDiagnosticoDetalhe({ anuncio }: { anuncio: Anuncio }) {
  const temSugestao =
    (anuncio.diagnostico === "problema_titulo" && Boolean(anuncio.titulo_sugerido)) ||
    (anuncio.diagnostico === "problema_descricao" && Boolean(anuncio.descricao_sugerida)) ||
    anuncio.diagnostico === "caracteristicas_incompletas";

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <SecaoEyebrow>{anuncio.membros.length > 1 ? `${anuncio.membros.length} variantes` : "Anúncio"}</SecaoEyebrow>
        <div className="space-y-1.5">
          {anuncio.membros.map((m) => (
            <div
              key={m.item_id}
              className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg bg-[var(--muted)]/8 px-3 py-2 text-xs"
            >
              <a
                href={mlItemPermalink(m.item_id)}
                target="_blank"
                rel="noopener noreferrer"
                className="min-w-0 flex-1 truncate font-medium text-[var(--foreground)] underline decoration-dotted"
              >
                {m.titulo_completo}
              </a>
              <div className="flex shrink-0 flex-wrap items-center gap-x-2.5 text-[var(--muted)]">
                <span>{m.vendas_totais} vendas</span>
                <span>{m.visitas_30d} visitas 30d</span>
                <span>{m.dias_no_ar}d no ar</span>
                {m.visitas_30d === 0 ? <span className="font-semibold text-[var(--danger)]">zero visitas</span> : null}
                {m.fotos_insuficientes ? <span>poucas fotos</span> : null}
                {m.foto_baixa_resolucao ? <span>foto ruim</span> : null}
              </div>
            </div>
          ))}
        </div>
      </div>

      {anuncio.observacao ? (
        <div className="rounded-lg bg-[var(--muted)]/8 px-3 py-2.5">
          <SecaoEyebrow>Diagnóstico</SecaoEyebrow>
          <p className="mt-0.5 text-sm text-[var(--foreground)]">{anuncio.observacao}</p>
        </div>
      ) : null}

      {anuncio.categoria_provavelmente_errada ||
      anuncio.duplicidade ||
      (anuncio.atributos_conflitantes ?? []).length > 0 ? (
        <div className="space-y-2">
          <SecaoEyebrow>Outros pontos</SecaoEyebrow>

          {anuncio.categoria_provavelmente_errada ? (
            <p className="flex items-start gap-1.5 text-xs text-[var(--danger)]">
              <span aria-hidden>⚠</span>
              <span>
                Categoria pode estar errada
                {anuncio.categoria_sugerida_nome ? ` — o título combina mais com "${anuncio.categoria_sugerida_nome}"` : ""}.
                Anúncio em categoria errada pode ficar invisível na busca, mesmo com título e descrição bons.
              </span>
            </p>
          ) : null}

          {anuncio.duplicidade ? (
            <div className="space-y-1">
              <p className="flex items-start gap-1.5 text-xs text-[var(--danger)]">
                <span aria-hidden>⚠</span>
                <span>
                  Parece duplicado de outro anúncio seu (&quot;{anuncio.duplicidade.titulo_anuncio_forte}&quot;,{" "}
                  {anuncio.duplicidade.vendas_anuncio_forte} vendas) — este aqui tem só{" "}
                  {anuncio.duplicidade.vendas_anuncio_atual} vendas.{" "}
                  {anuncio.duplicidade.pode_pausar
                    ? "Considere mesclar ou pausar este manualmente no app do Mercado Livre."
                    : "Considere mesclar."}
                </span>
              </p>
              {anuncio.duplicidade.motivo_bloqueio ? (
                <p className="flex items-start gap-1.5 text-xs text-[var(--muted)]">
                  <span aria-hidden>ℹ</span>
                  <span>{anuncio.duplicidade.motivo_bloqueio}</span>
                </p>
              ) : null}
            </div>
          ) : null}

          {(anuncio.atributos_conflitantes ?? []).length > 0 ? (
            <div className="space-y-1">
              {anuncio.atributos_conflitantes.map((a) => (
                <p key={a.id} className="flex items-start gap-1.5 text-xs text-[var(--danger)]">
                  <span aria-hidden>⚠</span>
                  <span>
                    Ficha técnica diz <strong>{a.name}: {a.valor}</strong>, mas o título/descrição já diz{" "}
                    <strong>{a.valorNoTexto}</strong> — confira qual dos dois está certo antes de aplicar
                    qualquer sugestão (não é &quot;falta reforçar&quot;, é uma divergência real).
                  </span>
                </p>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {temSugestao ? (
        <div className="space-y-2">
          <SecaoEyebrow>O que fazer</SecaoEyebrow>

          {anuncio.diagnostico === "problema_titulo" && anuncio.titulo_sugerido ? (
            <div className="rounded-lg border border-[var(--card-border)] p-3">
              <p className="text-xs font-semibold text-[var(--muted)]">Título sugerido</p>
              <p className="mt-1 text-sm text-[var(--foreground)]">{anuncio.titulo_sugerido}</p>
              <AplicarTituloBotao itemId={anuncio.item_id_representante} tituloSugerido={anuncio.titulo_sugerido} />
            </div>
          ) : null}

          {anuncio.diagnostico === "problema_descricao" && anuncio.descricao_sugerida ? (
            <div className="rounded-lg border border-[var(--card-border)] p-3">
              <p className="text-xs font-semibold text-[var(--muted)]">Descrição sugerida</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--foreground)]">{anuncio.descricao_sugerida}</p>
              <AplicarDescricaoBotao
                itemIds={anuncio.membros.map((m) => m.item_id)}
                descricaoSugerida={anuncio.descricao_sugerida}
              />
            </div>
          ) : null}

          {anuncio.diagnostico === "caracteristicas_incompletas" ? (
            <div className="rounded-lg border border-[var(--card-border)] p-3 space-y-1.5">
              {anuncio.caracteristicas_sugeridas.length > 0 ? (
                <>
                  <ul className="space-y-1 text-sm text-[var(--foreground)]">
                    {anuncio.caracteristicas_sugeridas.map((c) => (
                      <li key={c.atributo_id} className="flex flex-wrap items-baseline gap-1">
                        <span className="font-medium">{c.atributo_nome}:</span>
                        <span>{c.valor}</span>
                        {!c.valorValido ? (
                          <span className="text-[10px] font-semibold text-[var(--danger)]">(confira — fora da lista permitida)</span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                  <AplicarCaracteristicasBotao
                    itemIds={anuncio.membros.map((m) => m.item_id)}
                    caracteristicas={anuncio.caracteristicas_sugeridas}
                  />
                </>
              ) : null}
              {[...anuncio.atributos_principais_faltando, ...anuncio.atributos_secundarios_faltando]
                .filter((nome) => !anuncio.caracteristicas_sugeridas.some((c) => c.atributo_nome === nome))
                .map((nome) => (
                  <p key={nome} className="text-xs text-[var(--muted)]">
                    {nome}: sem sugestão segura — preencher manualmente.
                  </p>
                ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
