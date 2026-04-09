"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

type Mensalidade = {
  id: string;
  tipo: string;
  entidade_id: string;
  ciclo: string;
  valor: number;
  status: string;
  vencimento_em: string | null;
  pago_em: string | null;
  entidade_nome?: string;
  em_teste_gratis?: boolean;
};

const btnPrimary: React.CSSProperties = {
  padding: "8px 16px",
  background: "#16a34a",
  color: "#fff",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 14,
};
const btnSecondary: React.CSSProperties = {
  padding: "8px 16px",
  border: "1px solid #d1d5db",
  borderRadius: 6,
  background: "#fff",
  cursor: "pointer",
  fontSize: 14,
};

function formatMoney(n: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
}

/** Evita exibir véspera do dia por UTC (ex.: ciclo 2026-04-01 → 01/04, não 31/03). */
function formatDateLocalYmd(s: string) {
  if (!s) return "—";
  const iso = s.length >= 10 ? `${s.slice(0, 10)}T12:00:00` : s;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString("pt-BR", { dateStyle: "short" });
}

function cicloAtual(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function proximoCiclo(ciclo: string): string {
  const [y, m] = ciclo.split("-").map(Number);
  if (m === 12) return `${y + 1}-01`;
  return `${y}-${String(m + 1).padStart(2, "0")}`;
}

export default function MensalidadesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const destaqueId = searchParams.get("destaque");
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});
  const [rows, setRows] = useState<Mensalidade[]>([]);
  const [loading, setLoading] = useState(true);
  const [gerando, setGerando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [ciclo, setCiclo] = useState(cicloAtual());
  const [tipoFilter, setTipoFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) {
        router.replace("/login");
        return;
      }
      const params = new URLSearchParams();
      if (ciclo && !destaqueId) params.set("ciclo", ciclo);
      if (tipoFilter) params.set("tipo", tipoFilter);
      if (statusFilter) params.set("status", statusFilter);
      const res = await fetch(`/api/org/mensalidades?${params}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Erro");
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [ciclo, tipoFilter, statusFilter, destaqueId]);

  useEffect(() => {
    if (!destaqueId || rows.length === 0) return;
    const row = rows.find((r) => r.id === destaqueId);
    if (!row) return;
    const el = rowRefs.current[destaqueId];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [destaqueId, rows]);

  async function gerar() {
    setGerando(true);
    setError(null);
    setSuccess(null);
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) {
        setError("Faça login novamente.");
        return;
      }
      const res = await fetch("/api/org/mensalidades/gerar", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ ciclo }),
        cache: "no-store",
      });
      let json: { geradas?: number; message?: string; error?: string } = {};
      try {
        json = await res.json();
      } catch {
        throw new Error(res.status === 401 ? "Sessão expirada. Faça login novamente." : "Erro ao processar resposta.");
      }
      if (!res.ok) throw new Error(json?.error || `Erro ${res.status}`);
      const n = json.geradas ?? 0;
      setSuccess(
        n > 0
          ? `Geradas ${n} mensalidades para ${ciclo}.`
          : json.message ?? `Nenhuma mensalidade nova. Já existem para ${ciclo} ou não há sellers/fornecedores ativos.`
      );
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    } finally {
      setGerando(false);
    }
  }

  async function marcarPago(id: string) {
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch(`/api/org/mensalidades/${id}/pagar`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Erro");
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    }
  }

  function statusLabel(s: string) {
    const map: Record<string, string> = {
      pendente: "Pendente",
      pago: "Pago",
      inadimplente: "Inadimplente",
      cancelado: "Cancelado",
    };
    return map[s] ?? s;
  }

  const pendentes = rows.filter((r) => r.status === "pendente");
  const totalPendente = pendentes.reduce((s, r) => s + r.valor, 0);
  const pendenteEmTeste = pendentes.filter((r) => r.em_teste_gratis).reduce((s, r) => s + r.valor, 0);
  const pendenteCobravelPortal = totalPendente - pendenteEmTeste;

  return (
    <div className="dropcore-safe-x max-w-4xl mx-auto px-3 sm:px-6 py-4 sm:py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 8 }}>Mensalidades</h1>
      <p style={{ color: "#6b7280", marginBottom: 24, fontSize: 14 }}>
        Mensalidades de sellers e fornecedores. Gere para o mês e marque como pago quando receber.
      </p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        <button type="button" onClick={() => router.push("/dashboard")} style={btnSecondary}>
          Voltar
        </button>
        <button
          type="button"
          onClick={gerar}
          disabled={gerando}
          style={{ ...btnPrimary, opacity: gerando ? 0.7 : 1, cursor: gerando ? "not-allowed" : "pointer" }}
        >
          {gerando ? "Gerando…" : `Gerar mensalidades de ${ciclo}`}
        </button>
      </div>

      {error && (
        <div style={{ marginBottom: 16, padding: 12, background: "#fef2f2", color: "#991b1b", borderRadius: 8 }}>
          {error}
        </div>
      )}
      {success && (
        <div style={{ marginBottom: 16, padding: 12, background: "#f0fdf4", color: "#166534", borderRadius: 8 }}>
          {success}
        </div>
      )}

      <div style={{ marginBottom: 16, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <label>
          Ciclo (mês):{" "}
          <input
            type="month"
            value={ciclo}
            onChange={(e) => setCiclo(e.target.value)}
            style={{ padding: 8, borderRadius: 6, border: "1px solid #d1d5db" }}
          />
        </label>
        <button
          type="button"
          onClick={() => setCiclo(proximoCiclo(ciclo))}
          style={{ ...btnSecondary, padding: "6px 12px", fontSize: 13 }}
        >
          Próximo mês →
        </button>
        <label>
          Tipo:{" "}
          <select
            value={tipoFilter}
            onChange={(e) => setTipoFilter(e.target.value)}
            style={{ padding: 8, borderRadius: 6, border: "1px solid #d1d5db" }}
          >
            <option value="">Todos</option>
            <option value="seller">Sellers</option>
            <option value="fornecedor">Fornecedores</option>
          </select>
        </label>
        <label>
          Status:{" "}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ padding: 8, borderRadius: 6, border: "1px solid #d1d5db" }}
          >
            <option value="">Todos</option>
            <option value="pendente">Pendente</option>
            <option value="pago">Pago</option>
            <option value="inadimplente">Inadimplente</option>
          </select>
        </label>
      </div>

      {totalPendente > 0 && (
        <div style={{ marginBottom: 16, padding: 12, background: "#fef3c7", borderRadius: 8 }}>
          <p className="m-0 text-sm">
            <strong>Total pendente (lista):</strong> {formatMoney(totalPendente)}
          </p>
          {pendenteEmTeste > 0 && (
            <p className="m-0 mt-2 text-xs text-amber-900/90 dark:text-amber-200/95 leading-relaxed">
              Deste valor, <strong>{formatMoney(pendenteEmTeste)}</strong> são de contas em <strong>teste grátis</strong> — o acesso ao painel seller/fornecedor{" "}
              <strong>não bloqueia</strong> por mensalidade até o fim do período. Cobrança efetiva no portal:{" "}
              <strong>{formatMoney(pendenteCobravelPortal)}</strong>.
            </p>
          )}
        </div>
      )}

      {loading ? (
        <p>Carregando…</p>
      ) : rows.length === 0 ? (
        <div style={{ padding: 24, textAlign: "center", color: "#6b7280", background: "#f9fafb", borderRadius: 8 }}>
          Nenhuma mensalidade encontrada. Clique em &quot;Gerar mensalidades&quot; para criar.
        </div>
      ) : (
        <>
        <p className="md:hidden text-[11px] text-neutral-500 mb-2">Deslize horizontalmente para ver todas as colunas.</p>
        <div className="dropcore-scroll-x rounded-lg border border-neutral-200 dark:border-neutral-700">
          <table className="min-w-[700px] w-full border-collapse text-sm" style={{ fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                <th style={{ textAlign: "left", padding: 10 }}>Ciclo</th>
                <th style={{ textAlign: "left", padding: 10 }}>Tipo</th>
                <th style={{ textAlign: "left", padding: 10 }}>Entidade</th>
                <th style={{ textAlign: "right", padding: 10 }}>Valor</th>
                <th style={{ textAlign: "left", padding: 10 }}>Status</th>
                <th style={{ textAlign: "left", padding: 10 }}>Vencimento</th>
                <th style={{ textAlign: "left", padding: 10 }}>Portal</th>
                <th style={{ padding: 10 }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  ref={(el) => { rowRefs.current[r.id] = el; }}
                  style={{
                    borderBottom: "1px solid #f3f4f6",
                    ...(destaqueId === r.id ? { background: "#f0fdf4", boxShadow: "inset 0 0 0 2px #22c55e" } : {}),
                  }}
                >
                  <td style={{ padding: 10 }}>{formatDateLocalYmd(r.ciclo)}</td>
                  <td style={{ padding: 10 }}>{r.tipo === "seller" ? "Seller" : "Fornecedor"}</td>
                  <td style={{ padding: 10 }}>
                    {r.entidade_nome ?? "—"}
                    {r.em_teste_gratis && (
                      <span className="ml-1.5 inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300">
                        Teste grátis
                      </span>
                    )}
                  </td>
                  <td style={{ padding: 10, textAlign: "right", fontWeight: 500 }}>{formatMoney(r.valor)}</td>
                  <td style={{ padding: 10 }}>
                    <span
                      style={{
                        padding: "2px 8px",
                        borderRadius: 4,
                        fontSize: 12,
                        background: r.status === "pago" ? "#f0fdf4" : r.status === "inadimplente" ? "#fef2f2" : "#f3f4f6",
                        color: r.status === "pago" ? "#166534" : r.status === "inadimplente" ? "#991b1b" : "#374151",
                      }}
                    >
                      {statusLabel(r.status)}
                    </span>
                  </td>
                  <td style={{ padding: 10 }}>{r.vencimento_em ? formatDateLocalYmd(r.vencimento_em) : "—"}</td>
                  <td style={{ padding: 10, fontSize: 12 }}>
                    {r.em_teste_gratis ? (
                      <span className="text-sky-700 dark:text-sky-400">Não bloqueia</span>
                    ) : (
                      <span className="text-neutral-500">Bloqueio se inadimpl.</span>
                    )}
                  </td>
                  <td style={{ padding: 10, display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {r.status === "pendente" && (
                      <button
                        type="button"
                        onClick={() => marcarPago(r.id)}
                        style={{ ...btnPrimary, padding: "4px 12px", fontSize: 12 }}
                      >
                        Marcar pago
                      </button>
                    )}
                    {r.status === "inadimplente" && (
                      <button
                        type="button"
                        onClick={() => marcarPago(r.id)}
                        style={{ padding: "4px 12px", fontSize: 12, borderRadius: 6, border: "1px solid #dc2626", background: "#fef2f2", color: "#991b1b", cursor: "pointer" }}
                      >
                        Regularizar
                      </button>
                    )}
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
