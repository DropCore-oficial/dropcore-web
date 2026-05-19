"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Button, PageLayout } from "@/components/ui";
import { toTitleCase } from "@/lib/formatText";
import { sellerCadastroPendente } from "@/lib/sellerDocumento";
import { AMBER_PREMIUM_LINK } from "@/lib/amberPremium";
import { cn } from "@/lib/utils";

type Seller = {
  id: string;
  nome: string;
  documento: string | null;
  plano: string | null;
  status: string;
  saldo_atual: number;
  saldo_bloqueado: number;
  data_entrada: string | null;
  criado_em: string;
};

const modalOverlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.4)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 50,
};

export default function AdminSellersPage() {
  const router = useRouter();
  const [orgId, setOrgId] = useState<string | null>(null);
  const [orgLoading, setOrgLoading] = useState(true);
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [modalNew, setModalNew] = useState(false);
  const [newNome, setNewNome] = useState("");
  const [newSending, setNewSending] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data: { session } } = await supabaseBrowser.auth.getSession();
        if (!session?.access_token) {
          router.replace("/login");
          return;
        }
        const res = await fetch("/api/org/me", { headers: { Authorization: `Bearer ${session.access_token}` } });
        const json = await res.json();
        if (mounted && res.ok && json?.org_id) setOrgId(json.org_id);
      } finally {
        if (mounted) setOrgLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [router]);

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    (async () => {
      setListLoading(true);
      setError(null);
      try {
        const { data: { session } } = await supabaseBrowser.auth.getSession();
        if (!session?.access_token || cancelled) return;
        const params = new URLSearchParams();
        if (statusFilter) params.set("status", statusFilter);
        if (q) params.set("q", q);
        const res = await fetch(`/api/org/sellers?${params}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(data?.error || "Erro ao carregar");
        setSellers(Array.isArray(data) ? data : []);
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Erro");
        if (!cancelled) setSellers([]);
      } finally {
        if (!cancelled) setListLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [orgId, statusFilter, q]);

  async function createSeller() {
    if (!newNome.trim()) {
      setError("Nome é obrigatório.");
      return;
    }
    setNewSending(true);
    setError(null);
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch("/api/org/sellers", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          nome: newNome.trim(),
          status: "ativo",
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Erro");
      setSellers((prev) => [json, ...prev]);
      setNewNome("");
      setModalNew(false);
      if (json?.id) router.push(`/admin/sellers/${json.id}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao criar seller");
    } finally {
      setNewSending(false);
    }
  }

  const formatMoney = (n: number) => `R$ ${Number(n).toFixed(2).replace(".", ",")}`;

  if (orgLoading) {
    return (
      <PageLayout maxWidth="md">
        <DashboardHeader href="/dashboard" onLogout={() => router.push("/login")} />
        <div className="text-[var(--muted)]">Carregando...</div>
      </PageLayout>
    );
  }
  if (!orgId) return null;

  return (
    <PageLayout maxWidth="md">
      <DashboardHeader href="/dashboard" onLogout={() => router.push("/login")} />
      <h1 className="text-2xl font-semibold mb-2 text-[var(--foreground)]">Sellers</h1>
      <p className="text-[var(--muted)] mb-5 text-sm">
        Cadastre sellers só com nome interno; CNPJ, contato, endereço e plano (Start ou Pro) o seller escolhe no painel (Cadastro), após o convite. Toque num seller para ver detalhes, convite e extrato.
      </p>

      {error && <div className="mb-4 p-3 bg-[var(--danger)]/8 text-[var(--danger)] rounded-[var(--radius)]">{error}</div>}

      <div className="flex gap-2 mb-4 flex-wrap">
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onBlur={() => setQ(toTitleCase(q))}
          placeholder="Buscar por nome ou documento"
          className="flex-1 min-w-[180px] u-input"
        />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="u-input py-2 px-3">
          <option value="">Todos os status</option>
          <option value="ativo">Ativo</option>
          <option value="inativo">Inativo</option>
          <option value="bloqueado">Bloqueado</option>
        </select>
        <Button variant="secondary" onClick={() => router.push("/admin/depositos-pix")}>
          Depósitos PIX
        </Button>
        <Button variant="success" onClick={() => setModalNew(true)}>
          + Novo Seller
        </Button>
      </div>

      {listLoading && <div>Carregando...</div>}
      {!listLoading && sellers.length === 0 && !error && (
        <div className="p-6 bg-[var(--background)] rounded-[var(--radius)] text-[var(--muted)]">Nenhum seller cadastrado. Clique em + Novo Seller.</div>
      )}

      {!listLoading && sellers.length > 0 && (
        <div className="flex flex-col gap-2">
          {sellers.map((s) => (
            <button
              type="button"
              key={s.id}
              onClick={() => router.push(`/admin/sellers/${s.id}`)}
              className="text-left py-3.5 px-4 border border-[var(--card-border)] rounded-[var(--radius)] bg-[var(--card)] cursor-pointer hover:opacity-90 transition-opacity"
            >
              <div className="font-semibold text-[var(--foreground)]">{s.nome || "Sem nome"}</div>
              <div className="text-[13px] text-[var(--muted)] mt-1">
                {s.documento && `${s.documento} · `}
                Saldo: {formatMoney(s.saldo_atual)} · Status: {s.status}
                {sellerCadastroPendente(s.documento, s.plano) && (
                  <span className={cn(AMBER_PREMIUM_LINK)}> · Cadastro / plano pendente</span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      <div className="mt-6">
        <Button variant="secondary" onClick={() => router.push("/dashboard")}>
          Voltar ao Dashboard
        </Button>
      </div>

      {modalNew && (
        <div style={modalOverlay} role="dialog" aria-modal="true" aria-labelledby="modal-new-seller-title">
          <div className="flex flex-col max-w-[420px] max-h-[90vh] rounded-[var(--radius)] border border-[var(--card-border)] bg-[var(--card)] p-5 w-[calc(100%-32px)] shadow-[var(--shadow-card)]">
            <h3 id="modal-new-seller-title" className="mb-3 shrink-0 text-lg">Novo Seller</h3>
            <div className="overflow-y-auto flex-1 mb-4">
              <p className="text-[12px] text-[var(--muted)] mb-3 leading-relaxed">
                Crie só com identificação interna (nome). O seller preenche CNPJ ou CPF, e-mail, endereço e escolhe o plano (Start ou Pro) no painel após aceitar o convite.
              </p>
              <div className="mb-3">
                <label className="block text-xs text-[var(--muted)] mb-1">Nome ou razão provisória *</label>
                <input
                  type="text"
                  value={newNome}
                  onChange={(e) => setNewNome(e.target.value)}
                  onBlur={() => setNewNome(toTitleCase(newNome))}
                  placeholder="Ex.: Loja parceira X"
                  className="w-full u-input"
                />
              </div>
            </div>
            {error && <div className="text-[var(--danger)] text-[13px] mb-3 shrink-0">{error}</div>}
            <div className="flex gap-2 shrink-0">
              <Button type="button" variant="success" onClick={createSeller} disabled={newSending}>
                {newSending ? "Salvando..." : "Criar"}
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setModalNew(false);
                  setNewNome("");
                  setError(null);
                }}
              >
                Cancelar
              </Button>
            </div>
          </div>
        </div>
      )}
    </PageLayout>
  );
}
