"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { SellerGestorRunShell, type SellerAiRun, type DispararRodada } from "./SellerGestorRunShell";
import { mlItemPermalink } from "@/lib/mercadoLivreApiClient";
import { CopiarSugestaoBotao } from "./SellerGestorCopiarBotao";

type Diagnostico = "problema_titulo" | "problema_descricao" | "caracteristicas_incompletas" | "sem_problema_aparente";

type MembroAnuncio = {
  item_id: string;
  titulo_completo: string;
  vendas_totais: number;
  visitas_30d: number;
  dias_no_ar: number;
  fotos_insuficientes: boolean;
  foto_baixa_resolucao: boolean;
};

type ResultadoAcaoAnterior = {
  acao: string;
  quando: string;
  visitas_antes: number;
  visitas_depois: number;
  vendas_antes: number;
  vendas_depois: number;
};

type CaracteristicaSugerida = {
  atributo_id: string;
  atributo_nome: string;
  valor: string;
  valorValido: boolean;
};

type AnuncioDiagnostico = {
  chave: string;
  item_id_representante: string;
  diagnostico: Diagnostico;
  titulo_sugerido: string;
  descricao_sugerida: string;
  observacao: string;
  familia_nome: string | null;
  sinalizado_rodada_anterior: boolean;
  atributos_principais_faltando: string[];
  atributos_secundarios_faltando: string[];
  caracteristicas_sugeridas: CaracteristicaSugerida[];
  membros: MembroAnuncio[];
  categoria_provavelmente_errada: boolean;
  categoria_sugerida_nome: string | null;
  resultado_acao_anterior: ResultadoAcaoAnterior | null;
};

export type AnunciosSeoResultado = { anuncios: AnuncioDiagnostico[]; destaque_prioridade: string[] };

const DIAGNOSTICO_BADGE: Record<Diagnostico, string> = {
  problema_titulo: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300",
  problema_descricao: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  caracteristicas_incompletas: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  sem_problema_aparente: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400",
};

const DIAGNOSTICO_LABEL: Record<Diagnostico, string> = {
  problema_titulo: "Título fraco",
  problema_descricao: "Descrição fraca",
  caracteristicas_incompletas: "Ficha técnica incompleta",
  sem_problema_aparente: "Sem problema aparente",
};

function DiagnosticoBadge({ diagnostico }: { diagnostico: Diagnostico }) {
  return (
    <span
      className={cn(
        "inline-flex w-[11.5rem] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-medium",
        DIAGNOSTICO_BADGE[diagnostico]
      )}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden />
      {DIAGNOSTICO_LABEL[diagnostico]}
    </span>
  );
}

const itemPermalink = mlItemPermalink;

function FotosInsuficientesBadge() {
  return (
    <span className="inline-flex items-center rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
      poucas fotos
    </span>
  );
}

function FotoBaixaResolucaoBadge() {
  return (
    <span className="inline-flex items-center rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
      foto de baixa qualidade
    </span>
  );
}

function ZeroVisitasBadge() {
  return (
    <span
      className="inline-flex items-center rounded-md bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-800 dark:bg-red-950/40 dark:text-red-300"
      title="Sem nenhuma visita em 30 dias — pode ser problema de categoria/indexação, não de texto."
    >
      zero visitas
    </span>
  );
}

const ACAO_ANTERIOR_LABEL: Record<string, string> = {
  aplicar_titulo: "título",
  aplicar_descricao: "descrição",
  aplicar_caracteristicas: "ficha técnica",
};

function tempoRelativoCurto(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const dias = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (dias < 1) return "hoje";
  if (dias === 1) return "há 1 dia";
  return `há ${dias} dias`;
}

function ResultadoAcaoAnteriorBloco({ resultado }: { resultado: ResultadoAcaoAnterior }) {
  const label = ACAO_ANTERIOR_LABEL[resultado.acao] ?? resultado.acao;
  const deltaVisitas = resultado.visitas_depois - resultado.visitas_antes;
  const melhorou = deltaVisitas > 0;
  const piorou = deltaVisitas < 0;
  return (
    <p className="mt-2 text-xs text-[var(--muted)]">
      Você aplicou {label} {tempoRelativoCurto(resultado.quando)}: visitas 30d {resultado.visitas_antes} →{" "}
      {resultado.visitas_depois}{" "}
      <span
        className={cn(
          "font-semibold",
          melhorou && "text-emerald-700 dark:text-emerald-400",
          piorou && "text-[var(--danger)]"
        )}
      >
        ({deltaVisitas >= 0 ? "+" : ""}
        {deltaVisitas})
      </span>{" "}
      · vendas {resultado.vendas_antes} → {resultado.vendas_depois}
    </p>
  );
}

function CategoriaErradaAviso({ categoriaSugeridaNome }: { categoriaSugeridaNome: string | null }) {
  return (
    <p className="mt-2 flex items-start gap-1.5 text-xs text-[var(--danger)]">
      <span aria-hidden>⚠</span>
      <span>
        Categoria pode estar errada
        {categoriaSugeridaNome ? ` — o título combina mais com "${categoriaSugeridaNome}"` : ""}. Anúncio em
        categoria errada pode ficar invisível na busca, mesmo com título e descrição bons.
      </span>
    </p>
  );
}

type AplicarEstado = "idle" | "confirmando" | "aplicando" | "aplicado" | "bloqueado" | "erro";

function AplicarTituloBotao({ itemId, tituloSugerido }: { itemId: string; tituloSugerido: string }) {
  const [estado, setEstado] = useState<AplicarEstado>("idle");
  const [mensagem, setMensagem] = useState<string | null>(null);

  async function aplicar() {
    setEstado("aplicando");
    const {
      data: { session },
    } = await supabaseBrowser.auth.getSession();
    if (!session?.access_token) {
      setMensagem("Sessão expirada, faça login de novo.");
      setEstado("erro");
      return;
    }
    const res = await fetch("/api/seller/gestores-ia/aplicar-titulo", {
      method: "POST",
      headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
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
    return (
      <p className="mt-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
        Título aplicado no Mercado Livre ✓
      </p>
    );
  }

  if (estado === "bloqueado" || estado === "erro") {
    return (
      <div className="mt-2 space-y-1.5">
        <p className="text-xs text-[var(--danger)]">{mensagem}</p>
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

function ChecklistCaracteristicas({ principais, secundarios }: { principais: string[]; secundarios: string[] }) {
  if (principais.length === 0 && secundarios.length === 0) return null;
  return (
    <div className="mt-2 space-y-1">
      {principais.length > 0 ? (
        <p className="text-xs text-[var(--foreground)]">
          <span className="font-semibold text-red-700 dark:text-red-400">Características principais vazias: </span>
          {principais.join(", ")}
        </p>
      ) : null}
      {secundarios.length > 0 ? (
        <p className="text-xs text-[var(--muted)]">
          <span className="font-medium text-[var(--foreground)]">Secundárias vazias: </span>
          {secundarios.join(", ")}
        </p>
      ) : null}
    </div>
  );
}

function AplicarCaracteristicasBotao({
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
    const {
      data: { session },
    } = await supabaseBrowser.auth.getSession();
    if (!session?.access_token) {
      setMensagem("Sessão expirada, faça login de novo.");
      setEstado("erro");
      return;
    }
    const res = await fetch("/api/seller/gestores-ia/aplicar-caracteristicas", {
      method: "POST",
      headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
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
        <p className="text-xs text-[var(--danger)]">{mensagem}</p>
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
    <div className="mt-2">
      <p className="text-xs text-[var(--foreground)]">
        <span className="text-[var(--muted)]">Valores sugeridos: </span>
        {validas.map((c) => `${c.atributo_nome}: ${c.valor}`).join(" · ")}
      </p>
      <div className="mt-1.5 flex flex-wrap gap-2">
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
    </div>
  );
}

function AplicarDescricaoBotao({ itemIds, descricaoSugerida }: { itemIds: string[]; descricaoSugerida: string }) {
  const [estado, setEstado] = useState<AplicarEstado>("idle");
  const [mensagem, setMensagem] = useState<string | null>(null);
  const plural = itemIds.length > 1;

  async function aplicar() {
    setEstado("aplicando");
    const {
      data: { session },
    } = await supabaseBrowser.auth.getSession();
    if (!session?.access_token) {
      setMensagem("Sessão expirada, faça login de novo.");
      setEstado("erro");
      return;
    }
    const res = await fetch("/api/seller/gestores-ia/aplicar-descricao", {
      method: "POST",
      headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
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
        <p className="text-xs text-[var(--danger)]">{mensagem}</p>
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

function GrupoCard({ g }: { g: AnuncioDiagnostico }) {
  const ehFamilia = g.membros.length > 1;
  const temTituloSugerido = g.diagnostico === "problema_titulo" && g.titulo_sugerido;
  const temDescricaoSugerida = g.diagnostico === "problema_descricao" && g.descricao_sugerida;
  const temChecklist = g.diagnostico === "caracteristicas_incompletas";
  const todosItemIds = g.membros.map((m) => m.item_id);

  return (
    <article className="rounded-xl border border-amber-200 p-3.5 dark:border-amber-900/50">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {ehFamilia ? (
            <p className="text-sm font-medium text-[var(--foreground)]">
              {g.familia_nome ?? "Família de variações"}
              <span className="ml-1.5 text-xs font-normal text-[var(--muted)]">({g.membros.length} variações)</span>
            </p>
          ) : (
            <span className="font-mono text-sm font-medium text-[var(--foreground)]">{g.item_id_representante}</span>
          )}
          <a
            href={itemPermalink(g.item_id_representante)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-semibold text-emerald-700 hover:underline dark:text-emerald-400"
          >
            Ver anúncio ↗
          </a>
          {g.sinalizado_rodada_anterior ? (
            <span className="inline-flex items-center rounded-md bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-800 dark:bg-red-950/40 dark:text-red-300">
              já sinalizado antes
            </span>
          ) : null}
        </div>
        <DiagnosticoBadge diagnostico={g.diagnostico} />
      </div>

      {g.categoria_provavelmente_errada ? (
        <CategoriaErradaAviso categoriaSugeridaNome={g.categoria_sugerida_nome} />
      ) : null}
      {g.resultado_acao_anterior ? <ResultadoAcaoAnteriorBloco resultado={g.resultado_acao_anterior} /> : null}

      {g.titulo_sugerido ? (
        <p className="mt-2 text-sm text-[var(--foreground)]">
          <span className="text-[var(--muted)]">{ehFamilia ? "Título base sugerido: " : "Título sugerido: "}</span>
          {g.titulo_sugerido}
        </p>
      ) : null}
      {temDescricaoSugerida ? (
        <p className="mt-2 text-sm text-[var(--foreground)]">
          <span className="text-[var(--muted)]">Descrição sugerida: </span>
          {g.descricao_sugerida}
        </p>
      ) : null}
      <p className="mt-1 text-sm text-[var(--muted)]">{g.observacao}</p>
      {temChecklist ? (
        <ChecklistCaracteristicas
          principais={g.atributos_principais_faltando}
          secundarios={g.atributos_secundarios_faltando}
        />
      ) : null}

      {ehFamilia ? (
        <div className="mt-2.5 divide-y divide-[var(--card-border)] rounded-lg border border-[var(--card-border)]">
          {g.membros.map((m) => (
            <div key={m.item_id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-2.5 py-2 text-xs">
              <a
                href={itemPermalink(m.item_id)}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-[var(--foreground)] hover:underline"
              >
                {m.item_id}
              </a>
              <span className="text-[var(--muted)]">
                {m.vendas_totais} vendas · {m.visitas_30d} visitas 30d
              </span>
              <span className="flex flex-wrap gap-1">
                {m.visitas_30d === 0 ? <ZeroVisitasBadge /> : null}
                {m.fotos_insuficientes ? <FotosInsuficientesBadge /> : null}
                {m.foto_baixa_resolucao ? <FotoBaixaResolucaoBadge /> : null}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {g.membros[0]?.visitas_30d === 0 ? <ZeroVisitasBadge /> : null}
          {g.membros[0]?.fotos_insuficientes ? <FotosInsuficientesBadge /> : null}
          {g.membros[0]?.foto_baixa_resolucao ? <FotoBaixaResolucaoBadge /> : null}
        </div>
      )}

      {temTituloSugerido ? (
        ehFamilia ? (
          <div className="mt-2">
            <p className="text-xs text-[var(--muted)]">
              O Mercado Livre não permite editar título de variação isolada — copie a base e complete
              cor/tamanho ao aplicar em cada anúncio da família.
            </p>
            <CopiarSugestaoBotao texto={g.titulo_sugerido} rotulo="Copiar título base" />
          </div>
        ) : (
          <AplicarTituloBotao itemId={g.item_id_representante} tituloSugerido={g.titulo_sugerido} />
        )
      ) : null}

      {temDescricaoSugerida ? (
        <AplicarDescricaoBotao itemIds={todosItemIds} descricaoSugerida={g.descricao_sugerida} />
      ) : null}

      {temChecklist ? (
        <AplicarCaracteristicasBotao itemIds={todosItemIds} caracteristicas={g.caracteristicas_sugeridas} />
      ) : null}
    </article>
  );
}

export function SellerGestorAnunciosSeoPanel({
  pro,
  run,
  onRodarAgora,
}: {
  pro: boolean;
  run: SellerAiRun<AnunciosSeoResultado> | null;
  onRodarAgora?: DispararRodada;
}) {
  const [verTodos, setVerTodos] = useState(false);

  return (
    <SellerGestorRunShell
      pro={pro}
      run={run}
      onRodarAgora={onRodarAgora}
      titulo="Anúncios & SEO"
      ajuda={
        <p>
          Analisa uma amostra dos seus anúncios com pior venda (com 30+ dias no ar, pra não julgar
          anúncio novo), agrupados por família de variação — título, descrição e ficha técnica são
          avaliados pro grupo inteiro (o Mercado Livre não permite editar título de uma variação
          isolada), só a contagem de fotos é conferida anúncio por anúncio. As sugestões são só
          recomendação — você decide se aplica.
        </p>
      }
    >
      {(resultado) => {
        const grupos = resultado.anuncios;
        const comProblema = grupos.filter((g) => g.diagnostico !== "sem_problema_aparente");
        const semProblema = grupos.filter((g) => g.diagnostico === "sem_problema_aparente");

        return (
          <>
            {comProblema.length === 0 ? (
              <div className="rounded-xl border border-[var(--card-border)] bg-[var(--surface-subtle)] px-3 py-4 text-center text-sm text-[var(--muted)]">
                Nenhum problema aparente nos anúncios analisados.
              </div>
            ) : (
              <div className="space-y-2.5">
                {comProblema.map((g) => (
                  <GrupoCard key={g.chave} g={g} />
                ))}
              </div>
            )}

            {semProblema.length > 0 ? (
              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => setVerTodos((v) => !v)}
                  className="rounded-md border border-[var(--card-border)] bg-[var(--card)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--foreground)] hover:bg-[var(--muted)]/10"
                >
                  {verTodos ? "Ocultar" : "Ver"} os outros {semProblema.length} grupos sem problema aparente
                </button>
                {verTodos ? (
                  <div className="mt-3 divide-y divide-[var(--card-border)] rounded-xl border border-[var(--card-border)]">
                    {semProblema.map((g) => (
                      <div key={g.chave} className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 text-sm">
                        <span className="font-mono text-[var(--foreground)]">
                          {g.item_id_representante}
                          {g.membros.length > 1 ? ` (+${g.membros.length - 1})` : ""}
                        </span>
                        <DiagnosticoBadge diagnostico={g.diagnostico} />
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </>
        );
      }}
    </SellerGestorRunShell>
  );
}
