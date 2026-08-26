"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { cn } from "@/lib/utils";
import { DANGER_PREMIUM_SURFACE_TRANSPARENT, DANGER_PREMIUM_TEXT_BODY } from "@/lib/semanticPremium";
import { Skeleton } from "@/components/ui/Skeleton";
import { mlItemPermalink } from "@/lib/mercadoLivreApiClient";

type Foto = { filename: string; originalFilename: string; type: string; dateCreated: string };

type Caso = {
  id: string;
  seller_nome: string;
  fornecedor_nome: string;
  ml_claim_id: string;
  ml_order_id: string | null;
  ml_item_id: string | null;
  evidencia: { fotos?: Foto[]; reason_id?: string; tipo_reclamacao?: string } | null;
  analise_ia: { comparacao?: string } | null;
  veredito_ia: "fornecedor_provavel" | "seller_provavel" | "indeterminado" | null;
  status: "aberto" | "aguardando_fornecedor" | "decidido";
  fornecedor_resposta: string | null;
  fornecedor_respondeu_em: string | null;
  decisao_admin: "reverter_repasse" | "manter_repasse" | "sem_acao" | null;
  decisao_detalhes: string | null;
  decidido_em: string | null;
  ledger_id: string | null;
  foto_url: string | null;
  criado_em: string;
};

const VEREDITO_LABEL: Record<NonNullable<Caso["veredito_ia"]>, string> = {
  fornecedor_provavel: "IA: parece erro do fornecedor",
  seller_provavel: "IA: produto bate com o anúncio",
  indeterminado: "IA: sem foto suficiente pra concluir",
};

const STATUS_LABEL: Record<Caso["status"], string> = {
  aberto: "Sem fornecedor vinculado",
  aguardando_fornecedor: "Aguardando fornecedor",
  decidido: "Decidido",
};

const STATUS_BADGE: Record<Caso["status"], string> = {
  aberto: "bg-[var(--muted)]/15 text-[var(--muted)]",
  aguardando_fornecedor: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  decidido: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400",
};

function StatusBadge({ status }: { status: Caso["status"] }) {
  return (
    <span
      className={cn(
        "inline-flex w-44 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-medium",
        STATUS_BADGE[status]
      )}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden />
      {STATUS_LABEL[status]}
    </span>
  );
}

function formatDateTimeBRT(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

function DecidirBloco({ caso, onDecidido }: { caso: Caso; onDecidido: () => void }) {
  const [decisao, setDecisao] = useState<"reverter_repasse" | "manter_repasse" | "sem_acao" | "">("");
  const [detalhes, setDetalhes] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function confirmar() {
    if (!decisao) return;
    setEnviando(true);
    setErro(null);
    const {
      data: { session },
    } = await supabaseBrowser.auth.getSession();
    if (!session?.access_token) {
      setErro("Sessão expirada, faça login de novo.");
      setEnviando(false);
      return;
    }
    const res = await fetch(`/api/org/gestores-ia/disputas/${caso.id}/decidir`, {
      method: "POST",
      headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ decisao_admin: decisao, decisao_detalhes: detalhes || undefined }),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setErro(json.error ?? "Erro ao registrar decisão.");
      setEnviando(false);
      return;
    }
    onDecidido();
  }

  return (
    <div className="mt-3 space-y-2 border-t border-[var(--card-border)] pt-3">
      <div className="flex flex-wrap gap-2">
        {(
          [
            { v: "reverter_repasse", label: "Reverter repasse (fornecedor errou)" },
            { v: "manter_repasse", label: "Manter repasse (sem culpa do fornecedor)" },
            { v: "sem_acao", label: "Sem ação" },
          ] as const
        ).map((opt) => (
          <button
            key={opt.v}
            type="button"
            onClick={() => setDecisao(opt.v)}
            className={cn(
              "rounded-md border px-2.5 py-1.5 text-[11px] font-semibold",
              decisao === opt.v
                ? "border-emerald-600 bg-emerald-600 text-white"
                : "border-[var(--card-border)] bg-[var(--card)] text-[var(--foreground)] hover:bg-[var(--muted)]/10"
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <textarea
        value={detalhes}
        onChange={(e) => setDetalhes(e.target.value)}
        placeholder="Detalhes da decisão (opcional)"
        rows={2}
        className="w-full rounded-md border border-[var(--card-border)] bg-[var(--card)] px-2.5 py-1.5 text-sm text-[var(--foreground)]"
      />
      {decisao === "reverter_repasse" ? (
        <p className="text-xs text-[var(--muted)]">
          Isso só registra a decisão. Pra executar de verdade, use{" "}
          <a href="/admin/devolucoes" className="font-semibold text-emerald-700 hover:underline dark:text-emerald-400">
            /admin/devolucoes
          </a>{" "}
          no registro do ledger correspondente a esse pedido.
        </p>
      ) : null}
      {erro ? <p className="text-xs text-[var(--danger)]">{erro}</p> : null}
      <button
        type="button"
        onClick={() => void confirmar()}
        disabled={!decisao || enviando}
        className="rounded-md bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
      >
        {enviando ? "Registrando…" : "Confirmar decisão"}
      </button>
    </div>
  );
}

function CasoCard({ caso, onDecidido }: { caso: Caso; onDecidido: () => void }) {
  const fotos = caso.evidencia?.fotos ?? [];
  return (
    <article className="rounded-xl border border-[var(--card-border)] p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="text-sm font-medium text-[var(--foreground)]">
              {caso.seller_nome} <span className="text-[var(--muted)]">×</span> {caso.fornecedor_nome}
            </p>
            {caso.ml_item_id ? (
              <a
                href={mlItemPermalink(caso.ml_item_id)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-semibold text-emerald-700 hover:underline dark:text-emerald-400"
              >
                Ver anúncio ↗
              </a>
            ) : null}
          </div>
          <p className="text-xs text-[var(--muted)]">
            Reclamação {caso.ml_claim_id} · Pedido ML {caso.ml_order_id ?? "—"} · {formatDateTimeBRT(caso.criado_em)}
          </p>
        </div>
        <StatusBadge status={caso.status} />
      </div>

      {caso.veredito_ia ? (
        <p className="mt-2 text-xs font-semibold text-[var(--foreground)]">{VEREDITO_LABEL[caso.veredito_ia]}</p>
      ) : null}
      <p className="mt-1 text-sm text-[var(--foreground)]">
        {caso.analise_ia?.comparacao ?? "Sem análise disponível."}
      </p>

      {caso.foto_url ? (
        <a
          href={caso.foto_url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex text-xs font-semibold text-emerald-700 hover:underline dark:text-emerald-400"
        >
          Ver foto enviada pelo seller ↗
        </a>
      ) : fotos.length > 0 ? (
        <p className="mt-1 text-xs text-[var(--muted)]">
          Comprador anexou {fotos.length} evidência(s) no ML, mas ainda sem foto enviada pelo seller — aguardando.
        </p>
      ) : null}

      {caso.fornecedor_resposta ? (
        <div className="mt-2 rounded-lg border border-[var(--card-border)] bg-[var(--surface-subtle)] p-2.5 text-xs">
          <p className="font-semibold text-[var(--foreground)]">Resposta do fornecedor:</p>
          <p className="mt-0.5 text-[var(--muted)]">{caso.fornecedor_resposta}</p>
        </div>
      ) : (
        <p className="mt-2 text-xs text-[var(--muted)]">Fornecedor ainda não respondeu.</p>
      )}

      {caso.status === "decidido" ? (
        <p className="mt-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
          Decidido: {caso.decisao_admin} {caso.decisao_detalhes ? `— ${caso.decisao_detalhes}` : ""}
        </p>
      ) : (
        <DecidirBloco caso={caso} onDecidido={onDecidido} />
      )}
    </article>
  );
}

export default function AdminDisputasFornecedorPage() {
  const [casos, setCasos] = useState<Caso[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function carregar() {
    setLoading(true);
    const {
      data: { session },
    } = await supabaseBrowser.auth.getSession();
    if (!session?.access_token) {
      setError("Sessão expirada, faça login de novo.");
      setLoading(false);
      return;
    }
    const res = await fetch("/api/org/gestores-ia/disputas", {
      headers: { Authorization: `Bearer ${session.access_token}` },
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as { casos?: Caso[]; error?: string };
    if (!res.ok) {
      setError(json.error ?? "Erro ao carregar disputas.");
      setLoading(false);
      return;
    }
    setCasos(json.casos ?? []);
    setError(null);
    setLoading(false);
  }

  useEffect(() => {
    void carregar();
  }, []);

  const pendentes = casos.filter((c) => c.status !== "decidido");
  const decididos = casos.filter((c) => c.status === "decidido");

  return (
    <div className="dropcore-shell-6xl py-4 sm:py-6 pb-5 md:pb-7">
      <AdminPageHeader
        eyebrow="Financeiro"
        title="Disputas com fornecedor"
        subtitle="Casos que a Amanda detectou (reclamação real do Mercado Livre com evidência anexada pelo comprador) — revise e decida quem arca com o custo."
      />

      {loading ? (
        <div className="mt-5 space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : error ? (
        <div className={cn("mt-5 rounded-2xl p-4 text-sm", DANGER_PREMIUM_SURFACE_TRANSPARENT, DANGER_PREMIUM_TEXT_BODY)}>
          {error}
        </div>
      ) : casos.length === 0 ? (
        <div className="mt-5 rounded-xl border border-[var(--card-border)] bg-[var(--surface-subtle)] px-3 py-4 text-center text-sm text-[var(--muted)]">
          Nenhum caso detectado ainda.
        </div>
      ) : (
        <div className="mt-5 space-y-6">
          {pendentes.length > 0 ? (
            <div className="space-y-2.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                Pendentes ({pendentes.length})
              </p>
              {pendentes.map((c) => (
                <CasoCard key={c.id} caso={c} onDecidido={carregar} />
              ))}
            </div>
          ) : null}
          {decididos.length > 0 ? (
            <div className="space-y-2.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                Decididos ({decididos.length})
              </p>
              {decididos.map((c) => (
                <CasoCard key={c.id} caso={c} onDecidido={carregar} />
              ))}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
