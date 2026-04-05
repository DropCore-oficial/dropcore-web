"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { PlanLimitsBadge, PLAN_LIMITS_REFRESH_EVENT } from "@/components/PlanLimitsBadge";

type Seller = { id: string; nome: string; documento: string | null };
type Fornecedor = { id: string; nome: string };
type Sku = { id: string; sku: string; nome_produto: string | null; custo_base: number | null; custo_dropcore: number | null; status?: string | null };
type Pedido = {
  id: string;
  seller_id: string;
  fornecedor_id: string;
  sku_id?: string | null;
  nome_produto?: string | null;
  valor_total: number;
  status: string;
  criado_em: string;
  seller_nome?: string;
  fornecedor_nome?: string;
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
function formatDate(s: string) {
  return new Date(s).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export default function PedidosPage() {
  const router = useRouter();
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [sellerId, setSellerId] = useState("");
  const [fornecedorId, setFornecedorId] = useState("");
  const [skuId, setSkuId] = useState("");
  const [skus, setSkus] = useState<Sku[]>([]);
  const [skusLoading, setSkusLoading] = useState(false);
  const [valorFornecedor, setValorFornecedor] = useState("");
  const [valorDropcore, setValorDropcore] = useState("");
  const [precoVenda, setPrecoVenda] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [entregandoId, setEntregandoId] = useState<string | null>(null);

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
      const meRes = await fetch("/api/org/me", { headers: { Authorization: `Bearer ${token}` } });
      const meJson = await meRes.json();
      if (!meRes.ok || !meJson?.org_id) {
        setLoading(false);
        return;
      }
      const orgId = meJson.org_id;
      setOrgId(orgId);

      const [pedRes, sellersRes, fornRes] = await Promise.all([
        fetch(`/api/org/pedidos?status=${encodeURIComponent(statusFilter)}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch("/api/org/sellers", { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`/api/org/fornecedores?orgId=${encodeURIComponent(orgId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      const pedData = await pedRes.json();
      const sellersData = await sellersRes.json();
      const fornData = await fornRes.json();

      if (Array.isArray(pedData)) setPedidos(pedData);
      else setPedidos([]);
      if (Array.isArray(sellersData)) setSellers(sellersData);
      if (Array.isArray(fornData)) setFornecedores(fornData.filter((f: Fornecedor) => f.id && f.nome));
    } catch {
      setError("Erro ao carregar.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [statusFilter]);

  async function loadSkus(fornId: string) {
    if (!fornId || !orgId) { setSkus([]); setSkuId(""); return; }
    setSkusLoading(true);
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch(
        `/api/org/catalogo/search?orgId=${encodeURIComponent(orgId)}&fornecedorId=${encodeURIComponent(fornId)}&q=`,
        { headers: { Authorization: `Bearer ${session.access_token}` } }
      );
      const json = await res.json();
      // API retorna { ok, items, count }
      const lista = Array.isArray(json) ? json : (json?.items ?? []);
      setSkus(lista.filter((s: Sku) => s.status === "ativo" || s.status === "Ativo"));
    } catch {
      setSkus([]);
    } finally {
      setSkusLoading(false);
    }
  }

  function handleFornecedorChange(id: string) {
    setFornecedorId(id);
    setSkuId("");
    setValorFornecedor("");
    setValorDropcore("");
    loadSkus(id);
  }

  function handleSkuChange(id: string) {
    setSkuId(id);
    if (!id) { setValorFornecedor(""); setValorDropcore(""); return; }
    const sku = skus.find((s) => s.id === id);
    if (!sku) return;
    const custoBase = sku.custo_base ?? 0;
    const custoDropcore = sku.custo_dropcore ?? 0;
    const margemDropcore = Math.max(0, custoDropcore - custoBase);
    setValorFornecedor(custoBase.toFixed(2).replace(".", ","));
    setValorDropcore(margemDropcore.toFixed(2).replace(".", ","));
  }

  async function confirmarEnvio(pedidoId: string) {
    setEntregandoId(pedidoId);
    setError(null);
    setSuccess(null);
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch(`/api/org/pedidos/${pedidoId}/entregar`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json();
      if (res.ok) {
        setSuccess(`Envio confirmado! Pedido entra no repasse de ${json.ciclo_repasse ?? "—"}.`);
        load();
      } else {
        setError(json?.error || "Erro ao confirmar envio.");
      }
    } catch {
      setError("Erro ao confirmar envio.");
    } finally {
      setEntregandoId(null);
    }
  }

  async function enviar() {
    const vF = parseFloat(String(valorFornecedor).replace(",", "."));
    const vD = parseFloat(String(valorDropcore).replace(",", "."));
    if (!sellerId || !fornecedorId) {
      setError("Selecione seller e fornecedor.");
      return;
    }
    if (!Number.isFinite(vF) || vF < 0 || !Number.isFinite(vD) || vD < 0 || vF + vD <= 0) {
      setError("Valores inválidos. Use valor fornecedor e valor DropCore (ex.: 30 e 4,50).");
      return;
    }
    setSending(true);
    setError(null);
    setSuccess(null);
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch("/api/org/pedidos", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          seller_id: sellerId,
          fornecedor_id: fornecedorId,
          valor_fornecedor: vF,
          valor_dropcore: vD,
          sku_id: skuId || null,
          nome_produto: skuId ? (skus.find(s => s.id === skuId)?.nome_produto ?? skus.find(s => s.id === skuId)?.sku ?? null) : null,
          preco_venda: precoVenda ? parseFloat(precoVenda.replace(",", ".")) : null,
        }),
      });
      const json = await res.json();
      if (res.status === 402 && json?.code === "SALDO_INSUFICIENTE") {
        setError(
          `Saldo insuficiente. Disponível: ${formatMoney(json.saldo_disponivel ?? 0)}. Necessário: ${formatMoney(json.valor_total ?? 0)}.`
        );
        return;
      }
      if (!res.ok) {
        setError(json?.error || "Erro ao criar pedido.");
        return;
      }
      setSuccess(
        `Pedido criado e saldo bloqueado. Valor total: ${formatMoney(json.valor_total ?? vF + vD)}. Ciclo repasse: ${json.ciclo_repasse ?? "—"}.`
      );
      setValorFornecedor("");
      setValorDropcore("");
      setShowForm(false);
      window.dispatchEvent(new Event(PLAN_LIMITS_REFRESH_EVENT));
      load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro");
    } finally {
      setSending(false);
    }
  }

  function statusLabel(s: string) {
    const map: Record<string, string> = {
      enviado: "Enviado (bloqueado)",
      aguardando_repasse: "Aguard. repasse",
      entregue: "Entregue",
      devolvido: "Devolvido",
      cancelado: "Cancelado",
      erro_saldo: "Erro (saldo insuf.)",
    };
    return map[s] ?? s;
  }

  if (loading) {
    return (
      <div style={{ padding: 24 }}>
        <p>Carregando…</p>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
        <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>Pedidos</h1>
        <PlanLimitsBadge />
      </div>
      <p style={{ color: "#6b7280", marginBottom: 24, fontSize: 14 }}>
        Lista de pedidos enviados. Ao criar um novo pedido, o saldo do seller é bloqueado automaticamente.
      </p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        <button type="button" onClick={() => router.push("/dashboard")} style={btnSecondary}>
          Voltar
        </button>
        <button type="button" onClick={() => router.push("/admin/devolucoes")} style={btnSecondary}>
          Bloqueios e devoluções
        </button>
        <button
          type="button"
          onClick={() => setShowForm(!showForm)}
          style={{ ...btnPrimary, opacity: showForm ? 0.8 : 1 }}
        >
          {showForm ? "Fechar formulário" : "Novo pedido"}
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

      {showForm && (
        <div
          style={{
            marginBottom: 24,
            padding: 20,
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            background: "#fafafa",
          }}
        >
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Criar pedido (bloquear saldo)</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 4 }}>Seller *</label>
              <select
                value={sellerId}
                onChange={(e) => setSellerId(e.target.value)}
                style={{ width: "100%", maxWidth: 320, padding: 10, borderRadius: 6, border: "1px solid #d1d5db" }}
              >
                <option value="">Selecione</option>
                {sellers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nome} {s.documento ? `(${s.documento})` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 4 }}>Fornecedor *</label>
              <select
                value={fornecedorId}
                onChange={(e) => handleFornecedorChange(e.target.value)}
                style={{ width: "100%", maxWidth: 320, padding: 10, borderRadius: 6, border: "1px solid #d1d5db" }}
              >
                <option value="">Selecione</option>
                {fornecedores.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nome}
                  </option>
                ))}
              </select>
            </div>
            {fornecedorId && (
              <div>
                <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 4 }}>
                  Produto / SKU {skusLoading ? "(carregando…)" : "(opcional)"}
                </label>
                <select
                  value={skuId}
                  onChange={(e) => handleSkuChange(e.target.value)}
                  disabled={skusLoading}
                  style={{ width: "100%", maxWidth: 320, padding: 10, borderRadius: 6, border: "1px solid #d1d5db" }}
                >
                  <option value="">Sem produto específico</option>
                  {skus.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nome_produto || s.sku} — R$ {(s.custo_dropcore ?? 0).toFixed(2).replace(".", ",")}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 4 }}>
                Preço de venda ao cliente (R$) <span style={{ color: "#9ca3af" }}>— visível só para o seller</span>
              </label>
              <input
                type="text"
                value={precoVenda}
                onChange={(e) => setPrecoVenda(e.target.value)}
                placeholder="Ex: 89,90"
                style={{ width: "100%", maxWidth: 320, padding: 10, borderRadius: 6, border: "1px solid #d1d5db" }}
              />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, maxWidth: 320 }}>
              <div>
                <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 4 }}>
                  Valor fornecedor (R$)
                </label>
                <input
                  type="text"
                  value={valorFornecedor}
                  onChange={(e) => setValorFornecedor(e.target.value)}
                  placeholder="Ex: 30"
                  style={{ width: "100%", padding: 10, borderRadius: 6, border: "1px solid #d1d5db" }}
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 4 }}>
                  Valor DropCore (R$)
                </label>
                <input
                  type="text"
                  value={valorDropcore}
                  onChange={(e) => setValorDropcore(e.target.value)}
                  placeholder="Ex: 4,50"
                  style={{ width: "100%", padding: 10, borderRadius: 6, border: "1px solid #d1d5db" }}
                />
              </div>
            </div>
            <p style={{ fontSize: 12, color: "#6b7280" }}>
              Total debitado = valor fornecedor + valor DropCore (ex.: 15% sobre o custo).
            </p>
            <button
              type="button"
              onClick={enviar}
              disabled={sending}
              style={{
                ...btnPrimary,
                opacity: sending ? 0.7 : 1,
                cursor: sending ? "not-allowed" : "pointer",
                alignSelf: "flex-start",
              }}
            >
              {sending ? "Enviando…" : "Criar pedido e bloquear saldo"}
            </button>
          </div>
        </div>
      )}

      <div style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
        <label style={{ fontSize: 14 }}>Filtrar status:</label>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{ padding: 8, borderRadius: 6, border: "1px solid #d1d5db" }}
        >
          <option value="">Todos</option>
          <option value="enviado">Enviado (bloqueado)</option>
          <option value="aguardando_repasse">Aguardando repasse</option>
          <option value="entregue">Entregue</option>
          <option value="devolvido">Devolvido</option>
          <option value="cancelado">Cancelado</option>
          <option value="erro_saldo">Erro saldo</option>
        </select>
      </div>

      {pedidos.length === 0 ? (
        <div style={{ padding: 24, textAlign: "center", color: "#6b7280", background: "#f9fafb", borderRadius: 8 }}>
          Nenhum pedido encontrado. Clique em &quot;Novo pedido&quot; para criar.
        </div>
      ) : (
        <div className="dropcore-scroll-x">
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                <th style={{ textAlign: "left", padding: 10 }}>Data</th>
                <th style={{ textAlign: "left", padding: 10 }}>Seller</th>
                <th style={{ textAlign: "left", padding: 10 }}>Fornecedor</th>
                <th style={{ textAlign: "left", padding: 10 }}>Produto</th>
                <th style={{ textAlign: "right", padding: 10 }}>Valor</th>
                <th style={{ textAlign: "left", padding: 10 }}>Status</th>
                <th style={{ textAlign: "left", padding: 10 }}>Ação</th>
              </tr>
            </thead>
            <tbody>
              {pedidos.map((p) => (
                <tr key={p.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                  <td style={{ padding: 10 }}>{formatDate(p.criado_em)}</td>
                  <td style={{ padding: 10 }}>{p.seller_nome ?? "—"}</td>
                  <td style={{ padding: 10 }}>{p.fornecedor_nome ?? "—"}</td>
                  <td style={{ padding: 10, color: p.nome_produto ? "#111" : "#9ca3af" }}>{p.nome_produto ?? "—"}</td>
                  <td style={{ padding: 10, textAlign: "right", fontWeight: 500 }}>{formatMoney(p.valor_total)}</td>
                  <td style={{ padding: 10 }}>
                    <span
                      style={{
                        padding: "2px 8px",
                        borderRadius: 4,
                        fontSize: 12,
                        background:
                          p.status === "erro_saldo" ? "#fef2f2"
                          : p.status === "enviado" ? "#eff6ff"
                          : p.status === "aguardando_repasse" ? "#fefce8"
                          : p.status === "entregue" ? "#f0fdf4"
                          : "#f3f4f6",
                        color:
                          p.status === "erro_saldo" ? "#991b1b"
                          : p.status === "enviado" ? "#1d4ed8"
                          : p.status === "aguardando_repasse" ? "#854d0e"
                          : p.status === "entregue" ? "#166534"
                          : "#374151",
                      }}
                    >
                      {statusLabel(p.status)}
                    </span>
                  </td>
                  <td style={{ padding: 10 }}>
                    {p.status === "enviado" && (
                      <button
                        onClick={() => confirmarEnvio(p.id)}
                        disabled={entregandoId === p.id}
                        style={{
                          padding: "4px 12px",
                          fontSize: 12,
                          borderRadius: 6,
                          border: "1px solid #ca8a04",
                          background: entregandoId === p.id ? "#fefce8" : "#fff",
                          color: "#854d0e",
                          cursor: entregandoId === p.id ? "not-allowed" : "pointer",
                          fontWeight: 500,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {entregandoId === p.id ? "Confirmando…" : "↑ Confirmar envio"}
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
