"use client";

import { useEffect, useState } from "react";
import { FornecedorNav } from "../FornecedorNav";
import { SellerPageHeader } from "@/components/seller/SellerPageHeader";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { cn } from "@/lib/utils";
import { DANGER_PREMIUM_SURFACE_TRANSPARENT, DANGER_PREMIUM_TEXT_BODY } from "@/lib/semanticPremium";
import { Skeleton } from "@/components/ui/Skeleton";
import { mlItemPermalink } from "@/lib/mercadoLivreApiClient";

type Caso = {
  id: string;
  ml_order_id: string | null;
  ml_item_id: string | null;
  pode_responder: boolean;
  fornecedor_resposta: string | null;
  fornecedor_respondeu_em: string | null;
  resumo_status: string;
  criado_em: string;
};

function formatDateBRT(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

function ResponderBloco({ caso, onRespondido }: { caso: Caso; onRespondido: () => void }) {
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function enviar() {
    if (!texto.trim()) return;
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
    const res = await fetch(`/api/fornecedor/disputas/${caso.id}/responder`, {
      method: "POST",
      headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ resposta: texto.trim() }),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setErro(json.error ?? "Erro ao enviar resposta.");
      setEnviando(false);
      return;
    }
    onRespondido();
  }

  return (
    <div className="mt-2 space-y-2">
      <textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="Explique o que aconteceu com esse pedido…"
        rows={3}
        className="w-full rounded-md border border-[var(--card-border)] bg-[var(--card)] px-2.5 py-1.5 text-sm text-[var(--foreground)]"
      />
      {erro ? <p className="text-xs text-[var(--danger)]">{erro}</p> : null}
      <button
        type="button"
        onClick={() => void enviar()}
        disabled={!texto.trim() || enviando}
        className="rounded-md bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
      >
        {enviando ? "Enviando…" : "Enviar resposta"}
      </button>
    </div>
  );
}

function CasoCard({ caso, onRespondido }: { caso: Caso; onRespondido: () => void }) {
  return (
    <article className="rounded-xl border border-[var(--card-border)] p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="text-sm font-medium text-[var(--foreground)]">Pedido do Mercado Livre {caso.ml_order_id ?? "—"}</p>
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
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md bg-[var(--muted)]/15 px-2 py-1 text-[11px] font-medium text-[var(--muted)]">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden />
          {caso.resumo_status}
        </span>
      </div>
      <p className="mt-0.5 text-xs text-[var(--muted)]">
        O comprador abriu uma reclamação sobre esse pedido em {formatDateBRT(caso.criado_em)}.
      </p>

      {caso.fornecedor_resposta ? (
        <div className="mt-2 rounded-lg border border-[var(--card-border)] bg-[var(--surface-subtle)] p-2.5 text-xs">
          <p className="font-semibold text-[var(--foreground)]">Sua resposta:</p>
          <p className="mt-0.5 text-[var(--muted)]">{caso.fornecedor_resposta}</p>
        </div>
      ) : caso.pode_responder ? (
        <ResponderBloco caso={caso} onRespondido={onRespondido} />
      ) : null}
    </article>
  );
}

export default function FornecedorDisputasPage() {
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
    const res = await fetch("/api/fornecedor/disputas", {
      headers: { Authorization: `Bearer ${session.access_token}` },
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as { casos?: Caso[]; error?: string };
    if (!res.ok) {
      setError(json.error ?? "Erro ao carregar.");
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

  return (
    <div className="bg-[var(--background)] text-[var(--foreground)] app-bg pt-[calc(3.5rem+env(safe-area-inset-top,0px))] md:pt-14 pb-5">
      <FornecedorNav wide />
      <div className="dropcore-shell-6xl space-y-5 pt-5 md:space-y-6 md:pt-7 pb-5 md:pb-7">
        <SellerPageHeader
          surface="hero"
          title="Disputas"
          subtitle="Pedidos onde o comprador abriu reclamação com foto — sua resposta ajuda a decidir o caso antes de qualquer valor ser mexido."
        />

        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full" />
          </div>
        ) : error ? (
          <div className={cn("rounded-2xl p-4 text-sm", DANGER_PREMIUM_SURFACE_TRANSPARENT, DANGER_PREMIUM_TEXT_BODY)}>
            {error}
          </div>
        ) : casos.length === 0 ? (
          <div className="rounded-xl border border-[var(--card-border)] bg-[var(--surface-subtle)] px-3 py-4 text-center text-sm text-[var(--muted)]">
            Nenhuma disputa no momento.
          </div>
        ) : (
          <div className="space-y-2.5">
            {casos.map((c) => (
              <CasoCard key={c.id} caso={c} onRespondido={carregar} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
