"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

function str(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return "";
}

type Props = {
  fornecedorId: string | null;
  onClose: () => void;
};

export function FornecedorArmazemDetalheModal({ fornecedorId, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [payload, setPayload] = useState<{ aviso_uso: string; fornecedor: Record<string, unknown> } | null>(null);

  useEffect(() => {
    if (!fornecedorId?.trim()) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);
      setPayload(null);
      try {
        const { data: { session } } = await supabaseBrowser.auth.getSession();
        if (!session?.access_token) {
          setErr("Sessão expirada.");
          return;
        }
        const res = await fetch(`/api/seller/fornecedores/${encodeURIComponent(fornecedorId.trim())}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const j = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) throw new Error(typeof j.error === "string" ? j.error : "Erro ao carregar detalhes");
        setPayload({
          aviso_uso: typeof j.aviso_uso === "string" ? j.aviso_uso : "",
          fornecedor: (j.fornecedor && typeof j.fornecedor === "object" ? j.fornecedor : {}) as Record<string, unknown>,
        });
      } catch (e: unknown) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Erro ao carregar");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fornecedorId]);

  if (!fornecedorId?.trim()) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white dark:bg-[var(--card)] rounded-2xl border border-neutral-200 dark:border-[var(--card-border)] shadow-2xl max-w-lg w-full max-h-[85vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200 dark:border-[var(--card-border)] bg-neutral-50/80 dark:bg-neutral-800/50">
          <h3 className="font-semibold text-neutral-900 dark:text-neutral-100 text-sm sm:text-base">Dados cadastrais do armazém</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 text-xl leading-none w-8 h-8 rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-700 flex items-center justify-center"
          >
            ×
          </button>
        </div>
        <div className="p-4 sm:p-5 overflow-auto flex-1 space-y-3">
          {loading && (
            <p className="text-sm text-neutral-500 flex items-center gap-2 py-4">
              <span className="inline-block w-5 h-5 border-2 border-neutral-300 border-t-emerald-500 rounded-full animate-spin shrink-0" />
              A carregar…
            </p>
          )}
          {err && <p className="text-sm text-red-600 dark:text-red-400">{err}</p>}
          {!loading && payload && (
            <>
              {payload.aviso_uso ? (
                <p className="text-[11px] sm:text-xs text-amber-900 dark:text-amber-100/95 leading-relaxed rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/90 dark:bg-amber-950/40 px-3 py-2">
                  {payload.aviso_uso}
                </p>
              ) : null}
              <dl className="text-sm space-y-2.5 text-neutral-800 dark:text-neutral-200">
                <div>
                  <dt className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400">Nome no catálogo</dt>
                  <dd className="mt-0.5">{str(payload.fornecedor.nome_publico)}</dd>
                </div>
                <div>
                  <dt className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400">Razão social</dt>
                  <dd className="mt-0.5 break-words">{str(payload.fornecedor.nome_razao_social)}</dd>
                </div>
                <div>
                  <dt className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400">CNPJ</dt>
                  <dd className="mt-0.5 font-mono text-xs">{str(payload.fornecedor.cnpj) || "—"}</dd>
                </div>
                <div>
                  <dt className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400">Contacto</dt>
                  <dd className="mt-0.5 break-all text-xs">
                    {[str(payload.fornecedor.telefone), str(payload.fornecedor.email_comercial)].filter(Boolean).join(" · ") || "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400">Local</dt>
                  <dd className="mt-0.5">
                    {[str(payload.fornecedor.endereco_cidade), str(payload.fornecedor.endereco_uf)].filter(Boolean).join(" / ") || "—"}
                  </dd>
                </div>
              </dl>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
