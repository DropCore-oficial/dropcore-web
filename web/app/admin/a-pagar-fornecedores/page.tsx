"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

type Item = {
  id: string;
  fornecedor_nome: string;
  ciclo_repasse: string;
  valor_total: number;
  status: string;
};

const btnPrimary: React.CSSProperties = { padding: "8px 16px", background: "#16a34a", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 14 };
const btnSecondary: React.CSSProperties = { padding: "8px 16px", border: "1px solid var(--card-border)", borderRadius: 6, background: "var(--card)", color: "var(--foreground)", cursor: "pointer", fontSize: 14 };

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  async function marcarComoPago(id: string) {
    setUpdatingId(id);
    setMessage(null);
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch(`/api/org/financial/repasse-fornecedor/${id}/marcar-pago`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json();
      if (res.ok) {
        setMessage({ type: "ok", text: json.mensagem || "Repasse marcado como pago." });
        load();
      } else {
        setMessage({ type: "err", text: json?.error || "Erro ao marcar." });
      }
    } catch (e) {
      setMessage({ type: "err", text: e instanceof Error ? e.message : "Erro" });
    } finally {
      setUpdatingId(null);
    }
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
        return;
      }
      setItems(data.items ?? []);
      setTotalAPagar(data.total_a_pagar ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
      setItems([]);
      setTotalAPagar(0);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [router]);

  return (
    <div style={{ padding: 24, maxWidth: 720, margin: "0 auto" }}>
      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 8 }}>A pagar aos fornecedores</h1>
      <p style={{ color: "var(--muted)", marginBottom: 24, fontSize: 14 }}>
        Valores que você deve repassar a cada fornecedor (gerados ao fechar o repasse em &quot;Repasse ao fornecedor&quot;). Pague fora do sistema e depois marque como pago, se quiser.
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

      <div style={{ marginBottom: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" onClick={() => load()} disabled={loading} style={btnSecondary}>
          {loading ? "Carregando…" : "Atualizar"}
        </button>
        <button type="button" onClick={() => router.push("/admin/repasse-fornecedor")} style={btnSecondary}>
          Repasse ao fornecedor
        </button>
        <button type="button" onClick={() => router.push("/dashboard")} style={btnSecondary}>
          Voltar
        </button>
      </div>

      {loading && items.length === 0 ? (
        <p style={{ color: "var(--muted)" }}>Carregando…</p>
      ) : items.length === 0 ? (
        <p style={{ color: "var(--muted)" }}>Nenhum repasse pendente ou liberado. Feche um ciclo em &quot;Repasse ao fornecedor&quot; para gerar valores aqui.</p>
      ) : (
        <>
          <p style={{ marginBottom: 16, fontSize: 15, fontWeight: 600 }}>
            Total a pagar (pendente/liberado): {formatMoney(totalAPagar)}
          </p>
          <div className="dropcore-scroll-x">
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
                          onClick={() => marcarComoPago(r.id)}
                          disabled={updatingId !== null}
                          style={{ ...btnPrimary, opacity: updatingId !== null ? 0.7 : 1, fontSize: 13 }}
                        >
                          {updatingId === r.id ? "…" : "Marcar como pago"}
                        </button>
                      )}
                      {r.status === "pago" && <span style={{ color: "#6b7280" }}>Pago</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
