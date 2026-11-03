"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { Button, PageLayout } from "@/components/ui";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { toTitleCase } from "@/lib/formatText";
import { sellerCadastroPendente } from "@/lib/sellerDocumento";
import { AMBER_PREMIUM_LINK } from "@/lib/amberPremium";
import { DANGER_PREMIUM_TEXT_SOFT } from "@/lib/semanticPremium";
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
  convite_pendente_expira_em?: string | null;
};

function diasParaVencerConvite(iso: string): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
}

/** Números de página com reticências pra não estourar a barra quando há muitas páginas. */
function getPageNumbers(current: number, total: number): (number | "...")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | "...")[] = [1];
  if (current > 3) pages.push("...");
  for (let p = Math.max(2, current - 1); p <= Math.min(total - 1, current + 1); p++) pages.push(p);
  if (current < total - 2) pages.push("...");
  pages.push(total);
  return pages;
}

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
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [totalSellers, setTotalSellers] = useState(0);
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
        params.set("page", String(page));
        params.set("limit", String(pageSize));
        const res = await fetch(`/api/org/sellers?${params}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(data?.error || "Erro ao carregar");
        setSellers(Array.isArray(data?.items) ? data.items : []);
        setTotalSellers(typeof data?.total_count === "number" ? data.total_count : 0);
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Erro");
        if (!cancelled) setSellers([]);
      } finally {
        if (!cancelled) setListLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [orgId, statusFilter, q, page, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, q]);

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
      <PageLayout maxWidth="lg">
        <div className="text-[var(--muted)]">Carregando...</div>
      </PageLayout>
    );
  }
  if (!orgId) return null;

  return (
    <PageLayout maxWidth="lg">
      <AdminPageHeader
        eyebrow="Operação"
        title="Sellers"
        subtitle="Cadastre sellers só com nome interno; CNPJ, contato e endereço o seller preenche no painel (Cadastro), após o convite. Plano, ciclo (mensal/semestral/anual) e desconto são definidos pelo admin em cada seller. Toque num seller para ver detalhes, convite e extrato."
      />

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
                {s.status === "convite_expirado" && (
                  <span className={cn(DANGER_PREMIUM_TEXT_SOFT, "font-medium")}> · Convite expirado, nunca aceito</span>
                )}
                {s.convite_pendente_expira_em && (
                  <span className={cn(AMBER_PREMIUM_LINK, "font-medium")}>
                    {" "}
                    · Convite pendente — vence em {diasParaVencerConvite(s.convite_pendente_expira_em)}d
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {!listLoading && totalSellers > 0 && (
        <div className="mt-4 flex flex-col items-center gap-3 pt-1 sm:flex-row sm:justify-between">
          <p className="text-xs text-[var(--muted)]">
            Total <span className="font-semibold text-[var(--foreground)]">{totalSellers}</span> seller
            {totalSellers !== 1 ? "s" : ""}
          </p>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              aria-label="Página anterior"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[var(--card-border)] bg-[var(--card)] text-[var(--foreground)] transition-colors hover:bg-[var(--muted)]/10 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="m15 18-6-6 6-6" />
              </svg>
            </button>
            {getPageNumbers(page, Math.max(1, Math.ceil(totalSellers / pageSize))).map((p, idx) =>
              p === "..." ? (
                <span key={`ellipsis-${idx}`} className="px-1 text-xs text-[var(--muted)]">
                  …
                </span>
              ) : (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPage(p)}
                  aria-current={p === page ? "page" : undefined}
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[11px] font-semibold transition-colors",
                    p === page
                      ? "bg-emerald-600 text-white"
                      : "border border-[var(--card-border)] bg-[var(--card)] text-[var(--foreground)] hover:bg-[var(--muted)]/10"
                  )}
                >
                  {p}
                </button>
              )
            )}
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(Math.max(1, Math.ceil(totalSellers / pageSize)), p + 1))}
              disabled={page >= Math.max(1, Math.ceil(totalSellers / pageSize))}
              aria-label="Próxima página"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[var(--card-border)] bg-[var(--card)] text-[var(--foreground)] transition-colors hover:bg-[var(--muted)]/10 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="m9 18 6-6-6-6" />
              </svg>
            </button>
            <div className="relative ml-1.5 shrink-0">
              <div
                aria-hidden
                className="pointer-events-none flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-[var(--card-border)] bg-[var(--card)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--foreground)]"
              >
                {pageSize}/página
                <svg className="h-3.5 w-3.5 shrink-0 opacity-70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </div>
              <select
                aria-label="Itens por página"
                value={pageSize}
                onChange={(e) => {
                  setPage(1);
                  setPageSize(Number(e.target.value));
                }}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              >
                <option value={20}>20/página</option>
                <option value={50}>50/página</option>
                <option value={100}>100/página</option>
                <option value={300}>300/página</option>
              </select>
            </div>
          </div>
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
                Crie só com identificação interna (nome). O seller preenche CNPJ ou CPF, e-mail e endereço no painel após aceitar o convite. Defina plano, ciclo e desconto depois, na tela de detalhe deste seller.
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
