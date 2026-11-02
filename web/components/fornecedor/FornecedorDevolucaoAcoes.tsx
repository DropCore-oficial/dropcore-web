"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { cn } from "@/lib/utils";

async function getToken(): Promise<string | null> {
  const {
    data: { session },
  } = await supabaseBrowser.auth.getSession();
  return session?.access_token ?? null;
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

/** Ações de devolução embutidas no card do pedido — extraído da antiga tela própria
 * `/fornecedor/devolucoes` (consolidada em `/fornecedor/pedidos`, aba "Devolução"), pra não
 * precisar de uma página separada que o fornecedor não achava fácil. */
export function FornecedorDevolucaoAcoes({
  ledgerId,
  contestado,
  contestacaoTexto,
  prazoFinal,
  onAtualizar,
  pedirConfirmacao,
}: {
  ledgerId: string;
  contestado: boolean;
  contestacaoTexto: string | null;
  prazoFinal: string | null;
  onAtualizar: () => void;
  pedirConfirmacao: (ledgerId: string) => void;
}) {
  const [contestando, setContestando] = useState(false);
  const [texto, setTexto] = useState("");
  const [foto, setFoto] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function enviarContestacao() {
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

    const res = await fetch(`/api/fornecedor/devolucoes/${ledgerId}/contestar`, {
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
    onAtualizar();
  }

  return (
    <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50/60 p-3 dark:border-rose-900/60 dark:bg-rose-950/20">
      {!contestado ? (
        <p className="text-xs font-medium text-rose-800 dark:text-rose-300">
          Confirme o recebimento ou conteste em até 48h — prazo: {formatPrazo(prazoFinal)}. Sem resposta, o valor é
          liberado automaticamente pro seller.
        </p>
      ) : (
        <p className="text-xs font-medium text-rose-800 dark:text-rose-300">Aguardando decisão do admin.</p>
      )}

      {contestado ? (
        <div className="mt-2 rounded-lg border border-[var(--card-border)] bg-[var(--card)] p-2.5 text-xs">
          <p className="font-semibold text-[var(--foreground)]">Sua contestação:</p>
          <p className="mt-0.5 text-[var(--muted)]">{contestacaoTexto}</p>
        </div>
      ) : contestando ? (
        <div className="mt-2 space-y-2 rounded-lg border border-[var(--card-border)] bg-[var(--card)] p-2.5">
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
            className="block w-full text-xs text-[var(--muted)] file:mr-2 file:rounded-md file:border-0 file:bg-[var(--background)] file:px-2.5 file:py-1.5 file:text-xs file:font-medium file:text-[var(--foreground)]"
          />
          {erro ? <p className="text-xs text-[var(--danger)]">{erro}</p> : null}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void enviarContestacao()}
              disabled={!texto.trim() || enviando}
              className="rounded-md bg-[var(--danger)] px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:opacity-90 disabled:opacity-60"
            >
              {enviando ? "Enviando…" : "Enviar contestação"}
            </button>
            <button
              type="button"
              onClick={() => setContestando(false)}
              className="rounded-md border border-[var(--card-border)] bg-[var(--card)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--foreground)] hover:bg-[var(--muted)]/10"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => pedirConfirmacao(ledgerId)}
            className="rounded-md bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-emerald-700"
          >
            Chegou tudo certo
          </button>
          <button
            type="button"
            onClick={() => setContestando(true)}
            className={cn(
              "rounded-md border border-[var(--card-border)] bg-[var(--card)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--foreground)] hover:bg-[var(--muted)]/10"
            )}
          >
            Chegou com defeito / outra coisa
          </button>
        </div>
      )}
    </div>
  );
}
