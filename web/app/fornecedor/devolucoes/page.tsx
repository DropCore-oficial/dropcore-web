"use client";

import { useEffect, useState } from "react";
import { FornecedorNav } from "../FornecedorNav";
import { SellerPageHeader } from "@/components/seller/SellerPageHeader";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { cn } from "@/lib/utils";
import { DANGER_PREMIUM_SURFACE_TRANSPARENT, DANGER_PREMIUM_TEXT_BODY } from "@/lib/semanticPremium";
import { Skeleton } from "@/components/ui/Skeleton";
import { ModalOverlay } from "@/components/ui/ModalOverlay";
import { MODAL_PANEL_BODY_CLASS } from "@/lib/modalOverlay";
import { IconDevolucao } from "@/components/seller/Icons";

type Devolucao = {
  id: string;
  valor_total: number;
  data_evento: string;
  prazo_final: string | null;
  contestado: boolean;
  fornecedor_contestacao_texto: string | null;
};

function formatMoney(n: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
}

function formatPrazo(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function getToken(): Promise<string | null> {
  const {
    data: { session },
  } = await supabaseBrowser.auth.getSession();
  return session?.access_token ?? null;
}

function ContestarBloco({ devolucaoId, onFeito }: { devolucaoId: string; onFeito: () => void }) {
  const [texto, setTexto] = useState("");
  const [foto, setFoto] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function enviar() {
    if (!texto.trim()) return;
    setEnviando(true);
    setErro(null);
    const token = await getToken();
    if (!token) {
      setErro("Sessão expirada, faça login de novo.");
      setEnviando(false);
      return;
    }
    const formData = new FormData();
    formData.append("texto", texto.trim());
    if (foto) formData.append("foto", foto);

    const res = await fetch(`/api/fornecedor/devolucoes/${devolucaoId}/contestar`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setErro(json.error ?? "Erro ao enviar contestação.");
      setEnviando(false);
      return;
    }
    onFeito();
  }

  return (
    <div className="mt-2 space-y-2 rounded-lg border border-[var(--card-border)] bg-[var(--surface-subtle)] p-2.5">
      <textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="Explique o que veio errado (defeito, produto diferente, não recebeu nada)…"
        rows={3}
        className="w-full rounded-md border border-[var(--card-border)] bg-[var(--card)] px-2.5 py-1.5 text-sm text-[var(--foreground)]"
      />
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={(e) => setFoto(e.target.files?.[0] ?? null)}
        className="block w-full text-xs text-[var(--muted)] file:mr-2 file:rounded-md file:border-0 file:bg-[var(--card)] file:px-2.5 file:py-1.5 file:text-xs file:font-medium file:text-[var(--foreground)]"
      />
      {erro ? <p className="text-xs text-[var(--danger)]">{erro}</p> : null}
      <button
        type="button"
        onClick={() => void enviar()}
        disabled={!texto.trim() || enviando}
        className="rounded-md bg-[var(--danger)] px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:opacity-90 disabled:opacity-60"
      >
        {enviando ? "Enviando…" : "Enviar contestação"}
      </button>
    </div>
  );
}

function DevolucaoCard({
  devolucao,
  onAtualizar,
  pedirConfirmacao,
}: {
  devolucao: Devolucao;
  onAtualizar: () => void;
  pedirConfirmacao: (devolucaoId: string) => void;
}) {
  const [contestando, setContestando] = useState(false);

  return (
    <article className="rounded-xl border border-[var(--card-border)] p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-[var(--foreground)]">{formatMoney(devolucao.valor_total)}</p>
        {!devolucao.contestado ? (
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md bg-amber-100 px-2 py-1 text-[11px] font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden />
            Prazo: {formatPrazo(devolucao.prazo_final)}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md bg-[var(--muted)]/15 px-2 py-1 text-[11px] font-medium text-[var(--muted)]">
            Aguardando decisão do admin
          </span>
        )}
      </div>
      <p className="mt-0.5 text-xs text-[var(--muted)]">
        Confirme o recebimento ou conteste em até 48h — sem resposta, o valor é liberado automaticamente pro seller.
      </p>

      {devolucao.contestado ? (
        <div className="mt-2 rounded-lg border border-[var(--card-border)] bg-[var(--surface-subtle)] p-2.5 text-xs">
          <p className="font-semibold text-[var(--foreground)]">Sua contestação:</p>
          <p className="mt-0.5 text-[var(--muted)]">{devolucao.fornecedor_contestacao_texto}</p>
        </div>
      ) : contestando ? (
        <ContestarBloco devolucaoId={devolucao.id} onFeito={onAtualizar} />
      ) : (
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => pedirConfirmacao(devolucao.id)}
            className="rounded-md bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-emerald-700"
          >
            Chegou tudo certo
          </button>
          <button
            type="button"
            onClick={() => setContestando(true)}
            className="rounded-md border border-[var(--card-border)] bg-[var(--card)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--foreground)] hover:bg-[var(--muted)]/10"
          >
            Chegou com defeito / outra coisa
          </button>
        </div>
      )}
    </article>
  );
}

export default function FornecedorDevolucoesPage() {
  const [devolucoes, setDevolucoes] = useState<Devolucao[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);

  async function carregar() {
    setLoading(true);
    const token = await getToken();
    if (!token) {
      setError("Sessão expirada, faça login de novo.");
      setLoading(false);
      return;
    }
    const res = await fetch("/api/fornecedor/devolucoes", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as { devolucoes?: Devolucao[]; error?: string };
    if (!res.ok) {
      setError(json.error ?? "Erro ao carregar.");
      setLoading(false);
      return;
    }
    setDevolucoes(json.devolucoes ?? []);
    setError(null);
    setLoading(false);
  }

  useEffect(() => {
    void carregar();
  }, []);

  async function confirmar(devolucaoId: string) {
    setConfirmando(null);
    const token = await getToken();
    if (!token) return;
    const res = await fetch(`/api/fornecedor/devolucoes/${devolucaoId}/confirmar`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = (await res.json().catch(() => ({}))) as { mensagem?: string; error?: string };
    setMensagem(res.ok ? (json.mensagem ?? "Confirmado.") : (json.error ?? "Erro ao confirmar."));
    void carregar();
  }

  return (
    <div className="bg-[var(--background)] text-[var(--foreground)] app-bg pt-[calc(3.5rem+env(safe-area-inset-top,0px))] md:pt-14 pb-5">
      <FornecedorNav wide />
      <div className="dropcore-shell-6xl space-y-5 pt-5 md:space-y-6 md:pt-7 pb-5 md:pb-7">
        <SellerPageHeader
          surface="hero"
          title="Devoluções"
          subtitle="Pedidos voltando pra você. Confirme o recebimento ou conteste em até 48h — sem resposta, o valor é liberado automaticamente pro seller."
        />

        {mensagem ? (
          <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
            {mensagem}
          </div>
        ) : null}

        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full" />
          </div>
        ) : error ? (
          <div className={cn("rounded-2xl p-4 text-sm", DANGER_PREMIUM_SURFACE_TRANSPARENT, DANGER_PREMIUM_TEXT_BODY)}>
            {error}
          </div>
        ) : devolucoes.length === 0 ? (
          <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] py-16 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-neutral-100 text-neutral-400 dark:bg-neutral-800 dark:text-neutral-500">
              <IconDevolucao className="h-7 w-7" />
            </div>
            <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Nenhuma devolução no momento</p>
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-500">
              Pedidos voltando pra você aparecem aqui pra você confirmar ou contestar.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {devolucoes.map((d) => (
              <DevolucaoCard key={d.id} devolucao={d} onAtualizar={carregar} pedirConfirmacao={setConfirmando} />
            ))}
          </div>
        )}
      </div>

      {confirmando ? (
        <ModalOverlay onBackdropClick={() => setConfirmando(null)}>
          <div className={MODAL_PANEL_BODY_CLASS + " p-5"}>
            <p className="font-semibold text-[var(--foreground)]">Confirmar recebimento?</p>
            <p className="mt-1.5 text-sm text-[var(--muted)]">
              Isso libera o valor pro saldo do seller na hora. Só confirme depois de ter recebido a mercadoria de
              volta e conferido que está tudo certo.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmando(null)}
                className="rounded-md border border-[var(--card-border)] bg-[var(--card)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--foreground)] hover:bg-[var(--muted)]/10"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void confirmar(confirmando)}
                className="rounded-md bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-emerald-700"
              >
                Confirmar
              </button>
            </div>
          </div>
        </ModalOverlay>
      ) : null}
    </div>
  );
}
