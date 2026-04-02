"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

type LedgerItem = {
  id: string;
  seller_id: string;
  seller_nome: string;
  fornecedor_nome: string;
  tipo: string;
  valor_total: number;
  status: string;
  data_evento: string;
  ciclo_repasse: string | null;
  pedido_id: string | null;
  debito_ja_registrado?: boolean;
};

const btnPrimary: React.CSSProperties = { padding: "8px 16px", background: "#16a34a", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 14 };
const btnSecondary: React.CSSProperties = { padding: "8px 16px", border: "1px solid #d1d5db", borderRadius: 6, background: "#fff", cursor: "pointer", fontSize: 14 };
const btnDanger: React.CSSProperties = { padding: "6px 12px", background: "#dc2626", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13 };

function formatMoney(n: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
}

function formatDate(s: string) {
  if (!s) return "—";
  const d = new Date(s);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function DevolucoesPage() {
  const router = useRouter();
  const [list, setList] = useState<LedgerItem[]>([]);
  const [listPago, setListPago] = useState<LedgerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [updatingDebitoId, setUpdatingDebitoId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) {
        router.replace("/login");
        return;
      }
      const token = session.access_token;
      const [res, resPago] = await Promise.all([
        fetch("/api/org/financial/ledger", { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/org/financial/ledger?statuses=PAGO", { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const data = await res.json();
      const dataPago = await resPago.json();
      if (!res.ok) {
        setError(data?.error || "Erro ao carregar.");
        setList([]);
      } else {
        setList(Array.isArray(data) ? data : []);
      }
      if (!resPago.ok) {
        setListPago([]);
      } else {
        setListPago(Array.isArray(dataPago) ? dataPago : []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
      setList([]);
      setListPago([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [router]);

  async function confirmarEnvio(ledgerId: string, pedidoId: string | null) {
    if (!pedidoId) {
      setMessage({ type: "err", text: "Pedido não encontrado para este registro." });
      return;
    }
    setUpdatingId(ledgerId);
    setMessage(null);
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch(`/api/org/pedidos/${pedidoId}/entregar`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json();
      if (res.ok) {
        setMessage({ type: "ok", text: json.mensagem || "Envio confirmado. Pedido movido para repasse." });
        load();
      } else {
        setMessage({ type: "err", text: json?.error || "Erro ao confirmar envio." });
      }
    } catch (e) {
      setMessage({ type: "err", text: e instanceof Error ? e.message : "Erro" });
    } finally {
      setUpdatingId(null);
    }
  }

  async function patchStatus(ledgerId: string, status: string) {
    setUpdatingId(ledgerId);
    setMessage(null);
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch(`/api/org/financial/ledger/${ledgerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ status }),
      });
      const json = await res.json();
      if (res.ok) {
        setMessage({ type: "ok", text: json.mensagem || `Status atualizado para ${status}.` });
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

  async function registrarDebitoPosRepasse(ledgerId: string) {
    setUpdatingDebitoId(ledgerId);
    setMessage(null);
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch("/api/org/financial/devolucao-pos-repasse", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ ledger_id: ledgerId }),
      });
      const json = await res.json();
      if (res.ok) {
        setMessage({ type: "ok", text: json.mensagem || "Débito registrado. Será descontado no próximo repasse." });
        load();
      } else {
        setMessage({ type: "err", text: json?.error || "Erro ao registrar." });
      }
    } catch (e) {
      setMessage({ type: "err", text: e instanceof Error ? e.message : "Erro" });
    } finally {
      setUpdatingDebitoId(null);
    }
  }

  if (loading && list.length === 0 && listPago.length === 0) {
    return (
      <div style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
        <p>Carregando bloqueios…</p>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, maxWidth: 960, margin: "0 auto" }}>
      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 8 }}>Bloqueios e devoluções</h1>
      <p style={{ color: "#6b7280", marginBottom: 24, fontSize: 14 }}>
        Lista de bloqueios ativos. Use &quot;Registrar devolução&quot; quando o item voltar; depois &quot;Fornecedor conferiu&quot; para liberar o valor de volta ao seller.
      </p>

      {message && (
        <div
          style={{
            marginBottom: 16,
            padding: 12,
            background: message.type === "ok" ? "#f0fdf4" : "#fef2f2",
            color: message.type === "ok" ? "#166534" : "#991b1b",
            borderRadius: 8,
          }}
        >
          {message.text}
        </div>
      )}
      {error && (
        <div style={{ marginBottom: 16, padding: 12, background: "#fef2f2", color: "#991b1b", borderRadius: 8 }}>
          {error}
        </div>
      )}

      <div style={{ marginBottom: 16 }}>
        <button type="button" onClick={() => load()} disabled={loading} style={btnSecondary}>
          Atualizar lista
        </button>
        <button type="button" onClick={() => router.push("/dashboard")} style={{ ...btnSecondary, marginLeft: 8 }}>
          Voltar
        </button>
      </div>

      {list.length === 0 ? (
        <p style={{ color: "#6b7280" }}>Nenhum bloqueio com status BLOQUEADO, ENTREGUE, AGUARDANDO_REPASSE ou EM_DEVOLUCAO. Crie um pedido em &quot;Pedidos&quot; para testar.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #e5e7eb", textAlign: "left" }}>
                <th style={{ padding: "10px 8px" }}>Data</th>
                <th style={{ padding: "10px 8px" }}>Seller</th>
                <th style={{ padding: "10px 8px" }}>Fornecedor</th>
                <th style={{ padding: "10px 8px" }}>Valor</th>
                <th style={{ padding: "10px 8px" }}>Status</th>
                <th style={{ padding: "10px 8px" }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.id} style={{ borderBottom: "1px solid #e5e7eb" }}>
                  <td style={{ padding: "10px 8px" }}>{formatDate(r.data_evento)}</td>
                  <td style={{ padding: "10px 8px" }}>{r.seller_nome}</td>
                  <td style={{ padding: "10px 8px" }}>{r.fornecedor_nome}</td>
                  <td style={{ padding: "10px 8px" }}>{formatMoney(r.valor_total)}</td>
                  <td style={{ padding: "10px 8px" }}>{r.status}</td>
                  <td style={{ padding: "10px 8px" }}>
                    {r.status === "BLOQUEADO" && (
                      <button
                        type="button"
                        onClick={() => confirmarEnvio(r.id, r.pedido_id)}
                        disabled={updatingId !== null}
                        style={btnPrimary}
                      >
                        {updatingId === r.id ? "…" : "Confirmar envio"}
                      </button>
                    )}
                    {["BLOQUEADO", "ENTREGUE", "AGUARDANDO_REPASSE"].includes(r.status) && (
                      <button
                        type="button"
                        onClick={() => patchStatus(r.id, "EM_DEVOLUCAO")}
                        disabled={updatingId !== null}
                        style={{ ...btnDanger, marginLeft: r.status === "BLOQUEADO" ? 8 : 0 }}
                      >
                        {updatingId === r.id ? "…" : "Registrar devolução"}
                      </button>
                    )}
                    {r.status === "EM_DEVOLUCAO" && (
                      <button
                        type="button"
                        onClick={() => patchStatus(r.id, "DEVOLVIDO")}
                        disabled={updatingId !== null}
                        style={btnPrimary}
                      >
                        {updatingId === r.id ? "…" : "Fornecedor conferiu"}
                      </button>
                    )}
                    {r.status === "DEVOLVIDO" && <span style={{ color: "#6b7280" }}>Concluído</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 style={{ fontSize: 18, fontWeight: 600, marginTop: 32, marginBottom: 8 }}>Devolução após o repasse</h2>
      <p style={{ color: "#6b7280", marginBottom: 16, fontSize: 14 }}>
        Registros já <strong>PAGOS</strong>. Se o cliente devolveu depois do repasse, registre o débito para descontar no próximo repasse (fornecedor + DropCore).
      </p>
      {listPago.length === 0 ? (
        <p style={{ color: "#6b7280" }}>Nenhum registro com status PAGO no momento.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #e5e7eb", textAlign: "left" }}>
                <th style={{ padding: "10px 8px" }}>Data</th>
                <th style={{ padding: "10px 8px" }}>Seller</th>
                <th style={{ padding: "10px 8px" }}>Fornecedor</th>
                <th style={{ padding: "10px 8px" }}>Valor</th>
                <th style={{ padding: "10px 8px" }}>Ciclo</th>
                <th style={{ padding: "10px 8px" }}>Ação</th>
              </tr>
            </thead>
            <tbody>
              {listPago.map((r) => (
                <tr key={r.id} style={{ borderBottom: "1px solid #e5e7eb" }}>
                  <td style={{ padding: "10px 8px" }}>{formatDate(r.data_evento)}</td>
                  <td style={{ padding: "10px 8px" }}>{r.seller_nome}</td>
                  <td style={{ padding: "10px 8px" }}>{r.fornecedor_nome}</td>
                  <td style={{ padding: "10px 8px" }}>{formatMoney(r.valor_total)}</td>
                  <td style={{ padding: "10px 8px" }}>{r.ciclo_repasse ?? "—"}</td>
                  <td style={{ padding: "10px 8px" }}>
                    {r.debito_ja_registrado ? (
                      <span style={{ color: "#6b7280", fontSize: 13 }}>✓ Débito registrado</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => registrarDebitoPosRepasse(r.id)}
                        disabled={updatingDebitoId !== null}
                        style={{ ...btnDanger, opacity: updatingDebitoId !== null ? 0.7 : 1 }}
                      >
                        {updatingDebitoId === r.id ? "…" : "Registrar débito (próximo repasse)"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
