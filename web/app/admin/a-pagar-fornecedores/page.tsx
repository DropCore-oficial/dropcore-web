"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { ModalOverlay } from "@/components/ui/ModalOverlay";
import { MODAL_PANEL_BODY_CLASS } from "@/lib/modalOverlay";
import {
  SUCCESS_PREMIUM_SURFACE,
  SUCCESS_PREMIUM_TEXT_PRIMARY,
  DANGER_PREMIUM_SURFACE,
  DANGER_PREMIUM_TEXT_PRIMARY,
} from "@/lib/semanticPremium";
import { AMBER_PREMIUM_TEXT_SOFT } from "@/lib/amberPremium";
import { cn } from "@/lib/utils";

type Item = {
  id: string;
  fornecedor_nome: string;
  ciclo_repasse: string;
  valor_total: number;
  status: string;
};

type CicloResumo = {
  ciclo_repasse: string;
  total_dropcore: number;
  total_fornecedores: number;
};

const btnPrimary: CSSProperties = { padding: "8px 16px", background: "#16a34a", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 14 };
const btnSecondary: CSSProperties = { padding: "8px 16px", border: "1px solid var(--card-border)", borderRadius: 6, background: "var(--card)", color: "var(--foreground)", cursor: "pointer", fontSize: 14 };

function formatMoney(n: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
}

function formatDate(s: string) {
  if (!s) return "—";
  const d = new Date(s + "T12:00:00");
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default function APagarFornecedoresPage() {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const [totalAPagar, setTotalAPagar] = useState(0);
  const [ciclos, setCiclos] = useState<CicloResumo[]>([]);
  const [totalDropcore, setTotalDropcore] = useState(0);
  const [truncado, setTruncado] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [confirmacao, setConfirmacao] = useState<{ titulo: string; mensagem: string; onConfirmar: () => void } | null>(
    null
  );

  async function chamarAcaoRepasse(id: string, acao: "marcar-pago" | "desfazer-pago", mensagemSucesso: string) {
    setConfirmacao(null);
    setUpdatingId(id);
    setMessage(null);
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch(`/api/org/financial/repasse-fornecedor/${id}/${acao}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json();
      if (res.ok) {
        setMessage({ type: "ok", text: json.mensagem || mensagemSucesso });
        load();
      } else {
        setMessage({ type: "err", text: json?.error || "Erro ao atualizar." });
      }
    } catch (e) {
      setMessage({ type: "err", text: e instanceof Error ? e.message : "Erro" });
    } finally {
      setUpdatingId(null);
    }
  }

  function confirmarMarcarComoPago(r: Item) {
    setConfirmacao({
      titulo: "Marcar repasse como pago?",
      mensagem: `${r.fornecedor_nome} — ${formatMoney(r.valor_total)}, ciclo ${formatDate(r.ciclo_repasse)}. O fornecedor recebe notificação de que foi pago.`,
      onConfirmar: () => void chamarAcaoRepasse(r.id, "marcar-pago", "Repasse marcado como pago."),
    });
  }

  function confirmarDesfazerPago(r: Item) {
    setConfirmacao({
      titulo: "Desfazer pagamento?",
      mensagem: `${r.fornecedor_nome} — ${formatMoney(r.valor_total)} volta pra pendente. Use só se marcou como pago por engano.`,
      onConfirmar: () => void chamarAcaoRepasse(r.id, "desfazer-pago", "Pagamento desfeito."),
    });
  }

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) {
        router.replace("/login");
        return;
      }
      const res = await fetch("/api/org/financial/repasse-fornecedor-list", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || "Erro ao carregar.");
        setItems([]);
        setTotalAPagar(0);
        setCiclos([]);
        setTotalDropcore(0);
        return;
      }
      setItems(data.items ?? []);
      setTotalAPagar(data.total_a_pagar ?? 0);
      setCiclos(data.ciclos ?? []);
      setTotalDropcore(data.total_dropcore ?? 0);
      setTruncado(Boolean(data.truncado));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
      setItems([]);
      setTotalAPagar(0);
      setCiclos([]);
      setTotalDropcore(0);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [router]);

  return (
    <div className="dropcore-shell-6xl space-y-5 pt-6 pb-5 md:pb-7">
      <AdminPageHeader
        eyebrow="Financeiro"
        title="A pagar aos fornecedores"
        subtitle={
          <>
            Valores que você deve repassar a cada fornecedor (gerados ao fechar o repasse em &quot;Repasse ao
            fornecedor&quot;). Pague fora do sistema e depois marque como pago, se quiser.
          </>
        }
        right={
          <div className="flex gap-2">
            <button type="button" onClick={() => load()} disabled={loading} style={btnSecondary}>
              {loading ? "Carregando..." : "Atualizar"}
            </button>
            <button type="button" onClick={() => router.push("/admin/repasse-fornecedor")} style={btnSecondary}>
              Repasse ao fornecedor
            </button>
          </div>
        }
      />

      {message && (
        <div
          className={cn(
            message.type === "ok" ? SUCCESS_PREMIUM_SURFACE : DANGER_PREMIUM_SURFACE,
            message.type === "ok" ? SUCCESS_PREMIUM_TEXT_PRIMARY : DANGER_PREMIUM_TEXT_PRIMARY,
            "rounded-xl px-4 py-3 text-sm mb-4"
          )}
        >
          {message.text}
        </div>
      )}
      {error && (
        <div className={cn(DANGER_PREMIUM_SURFACE, DANGER_PREMIUM_TEXT_PRIMARY, "rounded-xl px-4 py-3 text-sm mb-4")}>
          {error}
        </div>
      )}

      {loading && items.length === 0 ? (
        <p style={{ color: "var(--muted)" }}>Carregando...</p>
      ) : items.length === 0 ? (
        <p style={{ color: "var(--muted)" }}>Nenhum repasse pendente ou liberado. Feche um ciclo em &quot;Repasse ao fornecedor&quot; para gerar valores aqui.</p>
      ) : (
        <>
          <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:gap-6">
            <p style={{ fontSize: 15, fontWeight: 600 }}>
              Total a pagar (pendente/liberado): {formatMoney(totalAPagar)}
            </p>
            <p style={{ fontSize: 15, fontWeight: 600, color: "#16a34a" }}>
              Receita DropCore nestes ciclos: {formatMoney(totalDropcore)}
            </p>
          </div>

          {truncado && (
            <p className={cn(AMBER_PREMIUM_TEXT_SOFT, "mb-4 text-[13px]")}>
              Mostrando só os 200 repasses mais recentes — tem mais fora da tela, mas o &quot;Total a
              pagar&quot; acima já soma todos, não só o que aparece na lista.
            </p>
          )}

          {ciclos.length > 0 && (
            <div style={{ marginBottom: 20, border: "1px solid var(--card-border)", borderRadius: 8, overflow: "hidden" }}>
              <div style={{ padding: "8px 12px", fontSize: 12, fontWeight: 600, color: "var(--muted)", borderBottom: "1px solid var(--card-border)" }}>
                Por ciclo (fornecedores × receita DropCore — informativo, DropCore não é um valor a pagar)
              </div>
              {ciclos
                .slice()
                .sort((a, b) => (a.ciclo_repasse < b.ciclo_repasse ? 1 : -1))
                .map((c) => (
                  <div
                    key={c.ciclo_repasse}
                    className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
                    style={{ padding: "8px 12px", fontSize: 13, borderTop: "1px solid var(--card-border)" }}
                  >
                    <span className="font-medium">{formatDate(c.ciclo_repasse)}</span>
                    <span>
                      Fornecedores {formatMoney(c.total_fornecedores)} · <span style={{ color: "#16a34a" }}>DropCore {formatMoney(c.total_dropcore)}</span>
                    </span>
                  </div>
                ))}
            </div>
          )}

          {/* Desktop/tablet: tabela */}
          <div className="hidden sm:block dropcore-scroll-x">
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ borderBottom: "2px solid var(--card-border)", textAlign: "left" }}>
                  <th style={{ padding: "10px 8px" }}>Fornecedor</th>
                  <th style={{ padding: "10px 8px" }}>Ciclo</th>
                  <th style={{ padding: "10px 8px", textAlign: "right" }}>Valor</th>
                  <th style={{ padding: "10px 8px" }}>Status</th>
                  <th style={{ padding: "10px 8px" }}>Ação</th>
                </tr>
              </thead>
              <tbody>
                {items.map((r) => (
                  <tr key={r.id} style={{ borderBottom: "1px solid var(--card-border)" }}>
                    <td style={{ padding: "10px 8px" }}>{r.fornecedor_nome}</td>
                    <td style={{ padding: "10px 8px" }}>{formatDate(r.ciclo_repasse)}</td>
                    <td style={{ padding: "10px 8px", textAlign: "right" }}>{formatMoney(r.valor_total)}</td>
                    <td style={{ padding: "10px 8px" }}>{r.status}</td>
                    <td style={{ padding: "10px 8px" }}>
                      {(r.status === "pendente" || r.status === "liberado") && (
                        <button
                          type="button"
                          onClick={() => confirmarMarcarComoPago(r)}
                          disabled={updatingId !== null}
                          style={{ ...btnPrimary, opacity: updatingId !== null ? 0.7 : 1, fontSize: 13 }}
                        >
                          {updatingId === r.id ? "..." : "Marcar como pago"}
                        </button>
                      )}
                      {r.status === "pago" && (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                          <span style={{ color: "var(--muted)" }}>Pago</span>
                          <button
                            type="button"
                            onClick={() => confirmarDesfazerPago(r)}
                            disabled={updatingId !== null}
                            style={{ ...btnSecondary, opacity: updatingId !== null ? 0.7 : 1, fontSize: 12, padding: "4px 10px" }}
                          >
                            Desfazer
                          </button>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: cards empilhados (tabela larga não cabe em ~390px) */}
          <div className="sm:hidden space-y-3">
            {items.map((r) => (
              <div
                key={r.id}
                className="rounded-xl px-3 py-3"
                style={{ border: "1px solid var(--card-border)" }}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-semibold text-[var(--foreground)]">{r.fornecedor_nome}</span>
                  <span className="text-sm font-semibold tabular-nums text-[var(--foreground)]">{formatMoney(r.valor_total)}</span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-2 text-xs" style={{ color: "var(--muted)" }}>
                  <span>Ciclo {formatDate(r.ciclo_repasse)}</span>
                  <span>{r.status === "pago" ? "Pago" : r.status}</span>
                </div>
                {(r.status === "pendente" || r.status === "liberado") && (
                  <button
                    type="button"
                    onClick={() => confirmarMarcarComoPago(r)}
                    disabled={updatingId !== null}
                    style={{ ...btnPrimary, opacity: updatingId !== null ? 0.7 : 1, fontSize: 13, width: "100%", marginTop: 10 }}
                  >
                    {updatingId === r.id ? "..." : "Marcar como pago"}
                  </button>
                )}
                {r.status === "pago" && (
                  <button
                    type="button"
                    onClick={() => confirmarDesfazerPago(r)}
                    disabled={updatingId !== null}
                    style={{ ...btnSecondary, opacity: updatingId !== null ? 0.7 : 1, fontSize: 13, width: "100%", marginTop: 10 }}
                  >
                    Desfazer
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      )}
      {confirmacao ? (
        <ModalOverlay onBackdropClick={() => setConfirmacao(null)}>
          <div className={MODAL_PANEL_BODY_CLASS + " p-5"}>
            <p className="font-semibold text-[var(--foreground)]">{confirmacao.titulo}</p>
            <p className="mt-1.5 text-sm text-[var(--muted)]">{confirmacao.mensagem}</p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setConfirmacao(null)} style={btnSecondary}>
                Cancelar
              </button>
              <button type="button" onClick={confirmacao.onConfirmar} style={btnPrimary}>
                Confirmar
              </button>
            </div>
          </div>
        </ModalOverlay>
      ) : null}
    </div>
  );
}
