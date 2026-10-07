"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { SellerNav } from "../../SellerNav";
import { Skeleton } from "@/components/ui/Skeleton";
import { DANGER_PREMIUM_SURFACE_TRANSPARENT, DANGER_PREMIUM_TEXT_BODY, DANGER_PREMIUM_TEXT_PRIMARY } from "@/lib/semanticPremium";
import { AMBER_PREMIUM_TEXT_PRIMARY } from "@/lib/amberPremium";
import { SellerGestorRunShell, type SellerAiRun, type DispararRodada } from "@/components/seller/SellerGestorRunShell";
import { CopiarSugestaoBotao } from "@/components/seller/SellerGestorCopiarBotao";
import { mlItemPermalink } from "@/lib/mercadoLivreApiClient";

type Diagnostico = "problema_titulo" | "problema_descricao" | "caracteristicas_incompletas" | "sem_problema_aparente";

type Membro = {
  item_id: string;
  titulo_completo: string;
  vendas_totais: number;
  visitas_30d: number;
  dias_no_ar: number;
  fotos_insuficientes: boolean;
  foto_baixa_resolucao: boolean;
};

type CaracteristicaSugerida = { atributo_id: string; atributo_nome: string; valor: string; valorValido: boolean };

type Duplicidade = {
  titulo_anuncio_forte: string;
  vendas_anuncio_forte: number;
  vendas_anuncio_atual: number;
  pode_pausar: boolean;
  motivo_bloqueio: string | null;
};

type Anuncio = {
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
};

type AndreyResultado = { anuncios: Anuncio[]; destaque_prioridade: string[] };

type Acesso = "loading" | "liberado" | "negado";

type UsoTokensHoje = { tokens: number; cota: number };
const TOKENS_FMT = new Intl.NumberFormat("pt-BR");

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

type AplicarEstado = "idle" | "confirmando" | "aplicando" | "aplicado" | "bloqueado" | "erro";

async function getAccessTokenAvulso(): Promise<string | null> {
  const {
    data: { session },
  } = await supabaseBrowser.auth.getSession();
  return session?.access_token ?? null;
}

function AplicarTituloBotao({ itemId, tituloSugerido }: { itemId: string; tituloSugerido: string }) {
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
    const res = await fetch("/api/gestores-ia-avulso/andrey/aplicar-titulo", {
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

function AplicarDescricaoBotao({ itemIds, descricaoSugerida }: { itemIds: string[]; descricaoSugerida: string }) {
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
    const res = await fetch("/api/gestores-ia-avulso/andrey/aplicar-descricao", {
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
    const token = await getAccessTokenAvulso();
    if (!token) {
      setMensagem("Sessão expirada, faça login de novo.");
      setEstado("erro");
      return;
    }
    const res = await fetch("/api/gestores-ia-avulso/andrey/aplicar-caracteristicas", {
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

function AnuncioCard({ anuncio, destaque }: { anuncio: Anuncio; destaque: boolean }) {
  const titulo = anuncio.familia_nome ?? anuncio.membros[0]?.titulo_completo ?? anuncio.chave;
  return (
    <article className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium text-[var(--foreground)]">{titulo}</p>
          {destaque ? (
            <p className="mt-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
              Prioridade pra revisar primeiro
            </p>
          ) : null}
        </div>
        <DiagnosticoBadge diagnostico={anuncio.diagnostico} />
      </div>

      {anuncio.categoria_provavelmente_errada ? (
        <p className={cn("mt-3 rounded-md p-2 text-xs", DANGER_PREMIUM_SURFACE_TRANSPARENT, DANGER_PREMIUM_TEXT_BODY)}>
          A busca do próprio Mercado Livre pelo título sugere a categoria &quot;{anuncio.categoria_sugerida_nome}&quot;,
          diferente da categoria atual — vale revisar isso antes do texto.
        </p>
      ) : null}

      {anuncio.duplicidade ? (
        <>
          <p className="mt-3 flex items-start gap-1.5 text-xs text-[var(--danger)]">
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
            <p className="mt-1 flex items-start gap-1.5 text-xs text-[var(--muted)]">
              <span aria-hidden>ℹ</span>
              <span>{anuncio.duplicidade.motivo_bloqueio}</span>
            </p>
          ) : null}
        </>
      ) : null}

      {(anuncio.atributos_sem_reforco_texto ?? []).length > 0 ? (
        <p className={cn("mt-3 flex items-start gap-1.5 text-xs", AMBER_PREMIUM_TEXT_PRIMARY)}>
          <span aria-hidden>🔑</span>
          <span>
            Ficha técnica tem{" "}
            {anuncio.atributos_sem_reforco_texto.map((a, i) => (
              <span key={a.id}>
                {i > 0 ? ", " : ""}
                <strong>
                  {a.name}: {a.valor}
                </strong>
              </span>
            ))}{" "}
            — mas essa palavra não aparece no título nem na descrição, perdendo força de busca.
          </span>
        </p>
      ) : null}

      {anuncio.observacao ? <p className="mt-3 text-sm text-[var(--foreground)]">{anuncio.observacao}</p> : null}

      {anuncio.diagnostico === "problema_titulo" && anuncio.titulo_sugerido ? (
        <div className="mt-3 rounded-md border border-[var(--card-border)] p-3">
          <p className="text-xs font-semibold text-[var(--muted)]">Título sugerido</p>
          <p className="mt-1 text-sm text-[var(--foreground)]">{anuncio.titulo_sugerido}</p>
          <AplicarTituloBotao itemId={anuncio.item_id_representante} tituloSugerido={anuncio.titulo_sugerido} />
        </div>
      ) : null}

      {anuncio.diagnostico === "problema_descricao" && anuncio.descricao_sugerida ? (
        <div className="mt-3 rounded-md border border-[var(--card-border)] p-3">
          <p className="text-xs font-semibold text-[var(--muted)]">Descrição sugerida</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--foreground)]">{anuncio.descricao_sugerida}</p>
          <AplicarDescricaoBotao
            itemIds={anuncio.membros.map((m) => m.item_id)}
            descricaoSugerida={anuncio.descricao_sugerida}
          />
        </div>
      ) : null}

      {anuncio.diagnostico === "caracteristicas_incompletas" ? (
        <div className="mt-3 space-y-1.5">
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

      <ul className="mt-3 space-y-1 border-t border-[var(--card-border)] pt-3 text-xs text-[var(--muted)]">
        {anuncio.membros.map((m) => (
          <li key={m.item_id} className="flex flex-wrap items-center gap-x-2">
            <a
              href={mlItemPermalink(m.item_id)}
              target="_blank"
              rel="noopener noreferrer"
              className="truncate underline decoration-dotted"
            >
              {m.titulo_completo}
            </a>
            <span>· {m.vendas_totais} vendas</span>
            <span>· {m.visitas_30d} visitas 30d</span>
            <span>· {m.dias_no_ar}d no ar</span>
            {m.visitas_30d === 0 ? <span className="font-semibold text-[var(--danger)]">zero visitas</span> : null}
            {m.fotos_insuficientes ? <span>· poucas fotos</span> : null}
            {m.foto_baixa_resolucao ? <span>· foto de baixa qualidade</span> : null}
          </li>
        ))}
      </ul>
    </article>
  );
}

export default function AndreyAvulsoPage() {
  const router = useRouter();
  const [acesso, setAcesso] = useState<Acesso>("loading");
  const [mlConectado, setMlConectado] = useState(true);
  const [run, setRun] = useState<SellerAiRun<AndreyResultado> | null>(null);
  const [usoTokensHoje, setUsoTokensHoje] = useState<UsoTokensHoje | null>(null);
  const [bloqueadoHoje, setBloqueadoHoje] = useState(false);

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
    if (!res.ok) return json.error ?? "Erro ao rodar o Andrey.";
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
                Andrey — Anúncios &amp; SEO
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
              O Andrey precisa ler seus anúncios ativos pra analisar — conecte sua conta pra liberar essa rodada.
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
            {usoTokensHoje
              ? (() => {
                  const pct = Math.min(100, Math.round((usoTokensHoje.tokens / usoTokensHoje.cota) * 100));
                  return (
                    <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4 shadow-sm">
                      <div className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="font-semibold text-[var(--foreground)]">Uso dos Gestores de IA hoje</span>
                        <span
                          className={cn(
                            "font-semibold",
                            bloqueadoHoje ? "text-[var(--danger)]" : "text-[var(--muted)]"
                          )}
                        >
                          {pct}% usado · {TOKENS_FMT.format(usoTokensHoje.tokens)} de {TOKENS_FMT.format(usoTokensHoje.cota)}{" "}
                          tokens
                        </span>
                      </div>
                      <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-neutral-200/80 ring-1 ring-inset ring-neutral-300/30 dark:bg-neutral-800 dark:ring-neutral-700/50">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all duration-700 ease-out",
                            bloqueadoHoje
                              ? "bg-gradient-to-r from-red-500 to-red-600"
                              : pct >= 80
                                ? "bg-gradient-to-r from-amber-500 to-amber-600"
                                : "bg-gradient-to-r from-emerald-500 to-emerald-600"
                          )}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <p className="mt-1.5 text-[11px] text-[var(--muted)]">Redefine às 00:00</p>
                    </div>
                  );
                })()
              : null}

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
                      <AnuncioCard key={a.chave} anuncio={a} destaque={destaques.has(a.chave)} />
                    ))}
                  </div>
                );
              }}
            </SellerGestorRunShell>
          </>
        )}
      </div>
      <SellerNav active="gestores_ia" calcOnly temGestoresIa />
    </div>
  );
}
