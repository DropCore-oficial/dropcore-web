"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";
import {
  DANGER_PREMIUM_SURFACE_TRANSPARENT,
  DANGER_PREMIUM_TEXT_BODY,
  SUCCESS_PREMIUM_SURFACE_TRANSPARENT,
  SUCCESS_PREMIUM_TEXT_BODY,
} from "@/lib/semanticPremium";
import { AMBER_PREMIUM_SURFACE_TRANSPARENT, AMBER_PREMIUM_TEXT_BODY } from "@/lib/amberPremium";

type FalhaResumo = {
  seller_id: string;
  seller_nome: string;
  fornecedor_id: string | null;
  fornecedor_nome: string | null;
  qtd_pendente: number;
  qtd_esgotado: number;
  ultimo_erro: string | null;
  ultima_tentativa: string;
};

type LogEntrada = {
  id: string;
  seller_id: string;
  seller_nome: string;
  fornecedor_id: string | null;
  fornecedor_nome: string | null;
  sku: string;
  ml_item_id: string | null;
  estoque_enviado: number | null;
  estoque_confirmado: number | null;
  sucesso: boolean;
  erro: string | null;
  criado_em: string;
};

const REFRESH_MS = 30_000;

function formatDateTimeBRT(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

function StatusBadge({ sucesso }: { sucesso: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex w-28 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-medium",
        sucesso
          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400"
          : "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300"
      )}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden />
      {sucesso ? "Sucesso" : "Falhou"}
    </span>
  );
}

function FalhaCard({ f }: { f: FalhaResumo }) {
  const grave = f.qtd_esgotado > 0;
  return (
    <article className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-semibold text-[var(--foreground)]">{f.seller_nome}</h3>
          {f.fornecedor_nome && <p className="text-sm text-[var(--muted)]">Fornecedor: {f.fornecedor_nome}</p>}
        </div>
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-medium",
            grave
              ? "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300"
              : "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
          )}
        >
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden />
          {f.qtd_pendente} tentando · {f.qtd_esgotado} desistiu
        </span>
      </div>
      <dl className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-[var(--muted)]">Último erro</dt>
          <dd className="font-medium text-[var(--foreground)]">{f.ultimo_erro ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-[var(--muted)]">Última tentativa</dt>
          <dd className="font-medium text-[var(--foreground)]">{formatDateTimeBRT(f.ultima_tentativa)}</dd>
        </div>
      </dl>
    </article>
  );
}

function LogCard({ l }: { l: LogEntrada }) {
  const divergente = l.sucesso === false && l.estoque_confirmado != null && l.estoque_enviado != null && l.estoque_confirmado !== l.estoque_enviado;
  return (
    <article className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-semibold text-[var(--foreground)]">{l.sku}</h3>
          <p className="text-sm text-[var(--muted)]">
            {l.seller_nome}
            {l.fornecedor_nome ? ` · ${l.fornecedor_nome}` : ""}
          </p>
        </div>
        <StatusBadge sucesso={l.sucesso} />
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-[var(--muted)]">Enviado</dt>
          <dd className="font-medium text-[var(--foreground)]">{l.estoque_enviado ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-[var(--muted)]">Confirmado pelo ML</dt>
          <dd className={cn("font-medium", divergente ? "text-red-600 dark:text-red-400" : "text-[var(--foreground)]")}>
            {l.estoque_confirmado ?? "—"}
          </dd>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <dt className="text-[var(--muted)]">Quando</dt>
          <dd className="font-medium text-[var(--foreground)]">{formatDateTimeBRT(l.criado_em)}</dd>
        </div>
        {l.erro && (
          <div className="col-span-2 sm:col-span-4">
            <dt className="text-[var(--muted)]">Erro</dt>
            <dd className="font-medium text-red-600 dark:text-red-400">{l.erro}</dd>
          </div>
        )}
      </dl>
    </article>
  );
}

export default function AdminMlSyncPage() {
  const [falhas, setFalhas] = useState<FalhaResumo[] | null>(null);
  const [log, setLog] = useState<LogEntrada[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [atualizandoEm, setAtualizandoEm] = useState<Date | null>(null);

  const carregar = useCallback(async () => {
    const {
      data: { session },
    } = await supabaseBrowser.auth.getSession();
    if (!session?.access_token) return;
    try {
      const res = await fetch("/api/org/ml-sync/status", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erro ao carregar sincronização com o ML.");
      setFalhas(json.falhas ?? []);
      setLog(json.log ?? []);
      setError(null);
      setAtualizandoEm(new Date());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro inesperado");
    }
  }, []);

  useEffect(() => {
    void carregar();
    const id = setInterval(() => void carregar(), REFRESH_MS);
    return () => clearInterval(id);
  }, [carregar]);

  const loading = falhas === null && log === null && !error;

  return (
    <div className="dropcore-shell-6xl py-4 sm:py-6 pb-5 md:pb-7">
      <AdminPageHeader
        eyebrow="Operação"
        title="Sincronização Mercado Livre"
        subtitle={
          <>
            Quem está falhando agora e os últimos envios de estoque pro ML —{" "}
            <span className="font-medium text-[var(--foreground)]">atualiza sozinho a cada 30s</span>, sem precisar
            abrir a conta do seller ou fornecedor.
          </>
        }
        right={
          atualizandoEm ? (
            <p className="text-xs text-[var(--muted)]">Atualizado às {atualizandoEm.toLocaleTimeString("pt-BR")}</p>
          ) : null
        }
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
      ) : (
        <div className="mt-5 space-y-6">
          <div className="space-y-2.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
              Falhas ativas {falhas && falhas.length > 0 ? `(${falhas.length})` : ""}
            </p>
            {!falhas || falhas.length === 0 ? (
              <div className={cn("rounded-2xl p-4 text-sm", SUCCESS_PREMIUM_SURFACE_TRANSPARENT, SUCCESS_PREMIUM_TEXT_BODY)}>
                Nenhum seller ou fornecedor com falha de sync pendente agora.
              </div>
            ) : (
              <div className="space-y-2.5">
                {falhas.map((f) => (
                  <FalhaCard key={`${f.seller_id}:${f.fornecedor_id ?? "sem-fornecedor"}`} f={f} />
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
              Histórico recente {log ? `(${log.length})` : ""}
            </p>
            {!log || log.length === 0 ? (
              <div className={cn("rounded-2xl p-4 text-sm", AMBER_PREMIUM_SURFACE_TRANSPARENT, AMBER_PREMIUM_TEXT_BODY)}>
                Nenhum envio registrado ainda.
              </div>
            ) : (
              <div className="space-y-2.5">
                {log.map((l) => (
                  <LogCard key={l.id} l={l} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
