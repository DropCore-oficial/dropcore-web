"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import {
  SUCCESS_PREMIUM_SURFACE,
  SUCCESS_PREMIUM_TEXT_PRIMARY,
  DANGER_PREMIUM_SURFACE,
  DANGER_PREMIUM_TEXT_PRIMARY,
  INFO_PREMIUM_SURFACE,
  INFO_PREMIUM_TEXT_PRIMARY,
} from "@/lib/semanticPremium";
import { cn } from "@/lib/utils";

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
    <div className="dropcore-shell-6xl space-y-5 pt-6 pb-5 md:pb-7">
      <AdminPageHeader
        eyebrow="Financeiro"
        title="Relatório entrada/saída"
        subtitle="Entrada (depósitos PIX), saída (repasses pagos aos fornecedores) e receita DropCore no período."
        right={
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-sm" style={{ color: "var(--muted)" }}>
              De:
              <input
                type="date"
                value={de}
                onChange={(e) => setDe(e.target.value.slice(0, 10))}
                style={{ marginLeft: 8, padding: 8, borderRadius: 6, border: "1px solid var(--card-border)", background: "var(--card)", color: "var(--foreground)" }}
              />
            </label>
            <label className="text-sm" style={{ color: "var(--muted)" }}>
              Até:
              <input
                type="date"
                value={ate}
                onChange={(e) => setAte(e.target.value.slice(0, 10))}
                style={{ marginLeft: 8, padding: 8, borderRadius: 6, border: "1px solid var(--card-border)", background: "var(--card)", color: "var(--foreground)" }}
              />
            </label>
            <button type="button" onClick={() => load()} disabled={loading} style={btnSecondary}>
              {loading ? "Carregando..." : "Atualizar"}
            </button>
          </div>
        }
      />

      {error && (
        <div className={cn(DANGER_PREMIUM_SURFACE, DANGER_PREMIUM_TEXT_PRIMARY, "rounded-xl px-4 py-3 text-sm")}>
          {error}
        </div>
      )}

      {loading && !data ? (
        <p style={{ color: "var(--muted)" }}>Carregando...</p>
      ) : data ? (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginBottom: 24 }}>
            <div className={cn(SUCCESS_PREMIUM_SURFACE, "rounded-xl p-4")}>
              <div className={cn(SUCCESS_PREMIUM_TEXT_PRIMARY, "text-xs mb-1")}>Entrada</div>
              <div className={cn(SUCCESS_PREMIUM_TEXT_PRIMARY, "text-xl font-bold")}>{formatMoney(data.resumo.entrada)}</div>
              <div className="text-[11px] mt-1" style={{ color: "var(--muted)" }}>{data.resumo.total_depositos} depósito(s) PIX</div>
            </div>
            <div className={cn(DANGER_PREMIUM_SURFACE, "rounded-xl p-4")}>
              <div className={cn(DANGER_PREMIUM_TEXT_PRIMARY, "text-xs mb-1")}>Saída</div>
              <div className={cn(DANGER_PREMIUM_TEXT_PRIMARY, "text-xl font-bold")}>{formatMoney(data.resumo.saida)}</div>
              <div className="text-[11px] mt-1" style={{ color: "var(--muted)" }}>{data.resumo.total_ciclos_fechados ?? data.resumo.total_repasses ?? 0} ciclo(s) fechado(s)</div>
            </div>
            <div className={cn(INFO_PREMIUM_SURFACE, "rounded-xl p-4")}>
              <div className={cn(INFO_PREMIUM_TEXT_PRIMARY, "text-xs mb-1")}>Receita DropCore</div>
              <div className={cn(INFO_PREMIUM_TEXT_PRIMARY, "text-xl font-bold")}>{formatMoney(data.resumo.receita_dropcore)}</div>
              <div className="text-[11px] mt-1" style={{ color: "var(--muted)" }}>Taxa dos repasses</div>
            </div>
          </div>

          {(data.linhas_entrada.length > 0 || data.linhas_saida.length > 0) && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Entradas ({data.linhas_entrada.length})</h3>
                {data.linhas_entrada.length === 0 ? (
                  <p style={{ color: "var(--muted)", fontSize: 14 }}>Nenhuma entrada no período.</p>
                ) : (
                  <div className="dropcore-scroll-x">
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                      <thead>
                        <tr style={{ borderBottom: "2px solid var(--card-border)", textAlign: "left" }}>
                          <th style={{ padding: "8px 6px" }}>Data</th>
                          <th style={{ padding: "8px 6px", textAlign: "right" }}>Valor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.linhas_entrada.map((r, i) => (
                          <tr key={i} style={{ borderBottom: "1px solid var(--card-border)" }}>
                            <td style={{ padding: "8px 6px" }}>{formatDate(r.data)}</td>
                            <td className={cn(SUCCESS_PREMIUM_TEXT_PRIMARY)} style={{ padding: "8px 6px", textAlign: "right" }}>+{formatMoney(r.valor)}</td>
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
                  <p style={{ color: "var(--muted)", fontSize: 14 }}>Nenhuma saída no período.</p>
                ) : (
                  <div className="dropcore-scroll-x">
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                      <thead>
                        <tr style={{ borderBottom: "2px solid var(--card-border)", textAlign: "left" }}>
                          <th style={{ padding: "8px 6px" }}>Data</th>
                          <th style={{ padding: "8px 6px", textAlign: "right" }}>Valor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.linhas_saida.map((r, i) => (
                          <tr key={i} style={{ borderBottom: "1px solid var(--card-border)" }}>
                            <td style={{ padding: "8px 6px" }}>{formatDate(r.data)}</td>
                            <td className={cn(DANGER_PREMIUM_TEXT_PRIMARY)} style={{ padding: "8px 6px", textAlign: "right" }}>-{formatMoney(r.valor)}</td>
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
