"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

type Deposito = {
  id: string;
  seller_id: string;
  valor: number;
  chave_pix: string | null;
  status: string;
  referencia: string | null;
  criado_em: string;
  aprovado_em: string | null;
  seller_nome?: string;
  seller_documento?: string | null;
};

const modalOverlay: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 };
const modalBox: React.CSSProperties = { background: "#fff", padding: 20, borderRadius: 8, maxWidth: 380, width: "calc(100% - 32px)", boxShadow: "0 4px 20px rgba(0,0,0,0.15)" };
const btnPrimary: React.CSSProperties = { padding: "8px 16px", background: "#16a34a", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 14 };
const btnSecondary: React.CSSProperties = { padding: "8px 16px", border: "1px solid #d1d5db", borderRadius: 6, background: "#fff", cursor: "pointer", fontSize: 14 };

function formatMoney(n: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
}
function formatDate(s: string | null) {
  if (!s) return "—";
  const d = new Date(s);
  return d.toLocaleDateString("pt-BR") + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export default function AdminDepositosPixPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const destaqueId = searchParams.get("destaque");
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const [list, setList] = useState<Deposito[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"pendente" | "aprovado" | "todos">("pendente");
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const { data: { session } } = await supabaseBrowser.auth.getSession();
    if (!session?.access_token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/org/sellers/depositos-pix?status=${filter}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Erro ao carregar");
      setList(Array.isArray(data) ? data : []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro");
      setList([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (destaqueId) setFilter("todos");
  }, [destaqueId]);

  useEffect(() => {
    load();
  }, [filter]);

  useEffect(() => {
    if (destaqueId && list.length > 0 && !loading) {
      const el = cardRefs.current[destaqueId];
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }, [destaqueId, list, loading]);

  async function aprovar(id: string) {
    const { data: { session } } = await supabaseBrowser.auth.getSession();
    if (!session?.access_token) return;
    setApprovingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/org/sellers/depositos-pix/${id}/aprovar`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Erro ao aprovar");
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao aprovar");
    } finally {
      setApprovingId(null);
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 720, margin: "0 auto" }}>
      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 8 }}>Depósitos PIX</h1>
      <p style={{ color: "#6b7280", marginBottom: 20, fontSize: 14 }}>
        Veja os depósitos PIX registrados e aprove quando o valor tiver entrado na conta. (Futuro: automação via banco.)
      </p>

      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as "pendente" | "aprovado" | "todos")}
          style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #d1d5db" }}
        >
          <option value="pendente">Pendentes</option>
          <option value="aprovado">Aprovados</option>
          <option value="todos">Todos</option>
        </select>
        <button type="button" onClick={() => router.push("/admin/sellers")} style={btnSecondary}>
          ← Sellers
        </button>
      </div>

      {error && <div style={{ marginBottom: 16, padding: 12, background: "#fef2f2", color: "#991b1b", borderRadius: 8 }}>{error}</div>}

      {loading && <div>Carregando...</div>}
      {!loading && list.length === 0 && (
        <div style={{ padding: 24, background: "#f9fafb", borderRadius: 8, color: "#6b7280" }}>
          {filter === "pendente" ? "Nenhum depósito PIX pendente." : "Nenhum registro."}
        </div>
      )}
      {!loading && list.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {list.map((d) => (
            <div
              key={d.id}
              ref={(el) => { cardRefs.current[d.id] = el; }}
              style={{
                padding: 16,
                border: destaqueId === d.id ? "2px solid #16a34a" : "1px solid #e5e7eb",
                borderRadius: 8,
                background: destaqueId === d.id ? "#f0fdf4" : "#fff",
                display: "flex",
                flexWrap: "wrap",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
              }}
            >
              <div>
                <div style={{ fontWeight: 600 }}>{d.seller_nome ?? "—"}</div>
                <div style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>
                  {formatMoney(d.valor)} · {formatDate(d.criado_em)}
                  {d.status === "aprovado" && d.aprovado_em && (
                    <span style={{ marginLeft: 8, color: "#166534" }}>Aprovado em {formatDate(d.aprovado_em)}</span>
                  )}
                </div>
                {d.chave_pix && <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4, fontFamily: "monospace" }}>{d.chave_pix}</div>}
              </div>
              {d.status === "pendente" && (
                <button
                  type="button"
                  onClick={() => aprovar(d.id)}
                  disabled={approvingId === d.id}
                  style={{ ...btnPrimary, opacity: approvingId === d.id ? 0.7 : 1, cursor: approvingId === d.id ? "not-allowed" : "pointer" }}
                >
                  {approvingId === d.id ? "Aprovando..." : "Aprovar (valor entrou)"}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
