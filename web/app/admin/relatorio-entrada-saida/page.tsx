"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

type ReportData = {
  periodo: { de: string; ate: string };
  resumo: {
    entrada: number;
    saida: number;
    receita_dropcore: number;
    total_ciclos_fechados?: number;
    total_repasses?: number; // compat
    total_depositos: number;
  };
  linhas_entrada: { tipo: string; valor: number; data: string; descricao: string }[];
  linhas_saida: { tipo: string; valor: number; data: string; descricao: string }[];
};

const btnPrimary: React.CSSProperties = { padding: "8px 16px", background: "#16a34a", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 14 };
const btnSecondary: React.CSSProperties = { padding: "8px 16px", border: "1px solid #d1d5db", borderRadius: 6, background: "#fff", cursor: "pointer", fontSize: 14 };

function formatMoney(n: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
}

function formatDate(s: string) {
  if (!s) return "—";
  const d = s.includes("T") ? new Date(s) : new Date(s + "T12:00:00");
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function primeiroDiaMes(): string {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}
function ultimoDiaMes(): string {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  d.setDate(0);
  return d.toISOString().slice(0, 10);
}

export default function RelatorioEntradaSaidaPage() {
  const router = useRouter();
  const [de, setDe] = useState(primeiroDiaMes);
  const [ate, setAte] = useState(ultimoDiaMes);
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) {
        router.replace("/login");
        return;
      }
      const res = await fetch(
        `/api/org/financial/relatorio-entrada-saida?de=${encodeURIComponent(de)}&ate=${encodeURIComponent(ate)}`,
        { headers: { Authorization: `Bearer ${session.access_token}` } }
      );
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error || "Erro ao carregar.");
        return;
      }
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (de && ate) load();
  }, [de, ate]);

  return (
    <div style={{ padding: 24, maxWidth: 800, margin: "0 auto" }}>
      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 8 }}>Relatório entrada/saída</h1>
      <p style={{ color: "#6b7280", marginBottom: 24, fontSize: 14 }}>
        Entrada (depósitos PIX), saída (repasses pagos aos fornecedores) e receita DropCore no período.
      </p>

      {error && (
        <div style={{ marginBottom: 16, padding: 12, background: "#fef2f2", color: "#991b1b", borderRadius: 8 }}>
          {error}
        </div>
      )}

      <div style={{ marginBottom: 24, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <label style={{ fontSize: 14, fontWeight: 500 }}>
          De:
          <input
            type="date"
            value={de}
            onChange={(e) => setDe(e.target.value.slice(0, 10))}
            style={{ marginLeft: 8, padding: 8, borderRadius: 6, border: "1px solid #d1d5db" }}
          />
        </label>
        <label style={{ fontSize: 14, fontWeight: 500 }}>
          Até:
          <input
            type="date"
            value={ate}
            onChange={(e) => setAte(e.target.value.slice(0, 10))}
            style={{ marginLeft: 8, padding: 8, borderRadius: 6, border: "1px solid #d1d5db" }}
          />
        </label>
        <button type="button" onClick={() => load()} disabled={loading} style={btnSecondary}>
          {loading ? "Carregando…" : "Atualizar"}
        </button>
        <button type="button" onClick={() => router.push("/dashboard")} style={btnSecondary}>
          Voltar
        </button>
      </div>

      {loading && !data ? (
        <p style={{ color: "#6b7280" }}>Carregando…</p>
      ) : data ? (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginBottom: 24 }}>
            <div style={{ padding: 16, background: "#f0fdf4", borderRadius: 12, border: "1px solid #bbf7d0" }}>
              <div style={{ fontSize: 12, color: "#166534", marginBottom: 4 }}>Entrada</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: "#166534" }}>{formatMoney(data.resumo.entrada)}</div>
              <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>{data.resumo.total_depositos} depósito(s) PIX</div>
            </div>
            <div style={{ padding: 16, background: "#fef2f2", borderRadius: 12, border: "1px solid #fecaca" }}>
              <div style={{ fontSize: 12, color: "#991b1b", marginBottom: 4 }}>Saída</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: "#991b1b" }}>{formatMoney(data.resumo.saida)}</div>
              <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>{data.resumo.total_ciclos_fechados ?? data.resumo.total_repasses ?? 0} ciclo(s) fechado(s)</div>
            </div>
            <div style={{ padding: 16, background: "#eff6ff", borderRadius: 12, border: "1px solid #bfdbfe" }}>
              <div style={{ fontSize: 12, color: "#1d4ed8", marginBottom: 4 }}>Receita DropCore</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: "#1d4ed8" }}>{formatMoney(data.resumo.receita_dropcore)}</div>
              <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>Taxa dos repasses</div>
            </div>
          </div>

          {(data.linhas_entrada.length > 0 || data.linhas_saida.length > 0) && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Entradas ({data.linhas_entrada.length})</h3>
                {data.linhas_entrada.length === 0 ? (
                  <p style={{ color: "#6b7280", fontSize: 14 }}>Nenhuma entrada no período.</p>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                      <thead>
                        <tr style={{ borderBottom: "2px solid #e5e7eb", textAlign: "left" }}>
                          <th style={{ padding: "8px 6px" }}>Data</th>
                          <th style={{ padding: "8px 6px", textAlign: "right" }}>Valor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.linhas_entrada.map((r, i) => (
                          <tr key={i} style={{ borderBottom: "1px solid #e5e7eb" }}>
                            <td style={{ padding: "8px 6px" }}>{formatDate(r.data)}</td>
                            <td style={{ padding: "8px 6px", textAlign: "right", color: "#166534" }}>+{formatMoney(r.valor)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Saídas ({data.linhas_saida.length})</h3>
                {data.linhas_saida.length === 0 ? (
                  <p style={{ color: "#6b7280", fontSize: 14 }}>Nenhuma saída no período.</p>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                      <thead>
                        <tr style={{ borderBottom: "2px solid #e5e7eb", textAlign: "left" }}>
                          <th style={{ padding: "8px 6px" }}>Data</th>
                          <th style={{ padding: "8px 6px", textAlign: "right" }}>Valor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.linhas_saida.map((r, i) => (
                          <tr key={i} style={{ borderBottom: "1px solid #e5e7eb" }}>
                            <td style={{ padding: "8px 6px" }}>{formatDate(r.data)}</td>
                            <td style={{ padding: "8px 6px", textAlign: "right", color: "#991b1b" }}>-{formatMoney(r.valor)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
