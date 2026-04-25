"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { PlanLimitsBadge } from "@/components/PlanLimitsBadge";
import { DashboardHeader } from "@/components/DashboardHeader";
import { PageLayout, Card, Button, Alert, Input } from "@/components/ui";
import { toTitleCase } from "@/lib/formatText";
import { formatCnpjBr } from "@/lib/fornecedorCadastro";

type Fornecedor = {
  id: string;
  nome: string;
  org_id: string;
  status: string;
  premium?: boolean;
  sla_postagem_dias: number | null;
  janela_validacao_dias: number | null;
  criado_em: string;
  cnpj?: string | null;
  telefone?: string | null;
  email_comercial?: string | null;
};

export default function AdminEmpresasPage() {
  const router = useRouter();
  const [orgId, setOrgId] = useState<string | null>(null);
  const [empresas, setEmpresas] = useState<Fornecedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [invitingId, setInvitingId] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<{ nome: string; link: string } | null>(null);
  const [modalNova, setModalNova] = useState(false);
  const [novoNome, setNovoNome] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    async function loadOrg() {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) {
        setError("Faça login para acessar.");
        router.replace("/login");
        return;
      }
      const res = await fetch("/api/org/me", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error || "Erro ao carregar organização.");
        setLoading(false);
        return;
      }
      if (!json?.org_id) {
        setError("Usuário não pertence a nenhuma organização.");
        setLoading(false);
        return;
      }
      setOrgId(json.org_id);
    }
    loadOrg();
  }, [router]);

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const orgIdSafe = orgId;
        if (!orgIdSafe) return;
        const { data: { session } } = await supabaseBrowser.auth.getSession();
        if (!session?.access_token || cancelled) return;
        const res = await fetch(`/api/org/fornecedores?orgId=${encodeURIComponent(orgIdSafe)}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(data?.error || "Erro ao carregar empresas.");
          setEmpresas([]);
          return;
        }
        setEmpresas(Array.isArray(data) ? data : []);
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message || "Erro ao carregar empresas.");
          setEmpresas([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [orgId]);

  function irParaCatalogo(fornecedor: Fornecedor) {
    const params = new URLSearchParams({
      fornecedorId: fornecedor.id,
      fornecedorNome: fornecedor.nome || "",
    });
    router.push(`/admin/catalogo?${params.toString()}`);
  }

  function irParaCatalogoSoLeitura(fornecedor: Fornecedor) {
    const params = new URLSearchParams({
      fornecedorId: fornecedor.id,
      fornecedorNome: fornecedor.nome || "",
    });
    router.push(`/catalogo?${params.toString()}`);
  }

  async function enviarConvite(emp: Fornecedor) {
    if (!orgId) return;
    setInvitingId(emp.id);
    setError(null);
    setInviteLink(null);
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) {
        router.replace("/login");
        return;
      }
      const res = await fetch(`/api/org/fornecedores/${encodeURIComponent(emp.id)}/invite`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Erro ao gerar convite.");
      setInviteLink({ nome: emp.nome || "Fornecedor", link: json.link });
    } catch (e: any) {
      setError(e?.message ?? "Erro ao gerar convite.");
    } finally {
      setInvitingId(null);
    }
  }

  function copiarLink() {
    if (inviteLink?.link) {
      navigator.clipboard.writeText(inviteLink.link);
      setInviteLink(null);
    }
  }

  async function excluirFornecedor(emp: Fornecedor) {
    if (!orgId) return;
    const ok = window.confirm(
      `Excluir permanentemente "${emp.nome || "esta empresa"}"? Pedidos, SKUs e dados financeiros ligados a este fornecedor serão excluídos. Essa ação não pode ser desfeita.`
    );
    if (!ok) return;
    setDeletingId(emp.id);
    setError(null);
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) {
        router.replace("/login");
        return;
      }
      const res = await fetch(
        `/api/org/fornecedores/${encodeURIComponent(emp.id)}?orgId=${encodeURIComponent(orgId)}`,
        { method: "DELETE", headers: { Authorization: `Bearer ${session.access_token}` } }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Erro ao excluir empresa.");
      setEmpresas((prev) => prev.filter((e) => e.id !== emp.id));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao excluir empresa.");
    } finally {
      setDeletingId(null);
    }
  }

  async function adicionarEmpresa() {
    if (!orgId || !novoNome.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) {
        router.replace("/login");
        return;
      }
      const res = await fetch(`/api/org/fornecedores?orgId=${encodeURIComponent(orgId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ nome: novoNome.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Erro ao criar empresa.");
      setEmpresas((prev) => [...prev, json]);
      setModalNova(false);
      setNovoNome("");
    } catch (e: any) {
      setError(e?.message ?? "Erro ao criar empresa.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageLayout maxWidth="md">
      <DashboardHeader href="/dashboard" onLogout={() => router.push("/login")} />
      <div className="space-y-8">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-semibold text-[var(--foreground)]">Empresas / Fornecedores</h1>
          <PlanLimitsBadge />
        </div>
        <p className="text-sm text-[var(--muted)]">
          Clique em uma empresa para ver o catálogo de SKUs dela.
        </p>
        <Button variant="success" onClick={() => setModalNova(true)}>
          + Adicionar empresa
        </Button>

        {error && <Alert variant="danger">{error}</Alert>}

        {modalNova && (
          <Card padding="md">
            <p className="font-semibold text-[var(--foreground)] mb-3">Nova empresa / fornecedor</p>
            <Input
              value={novoNome}
              onChange={(e) => setNovoNome(e.target.value)}
              onBlur={() => setNovoNome(toTitleCase(novoNome))}
              placeholder="Nome da empresa"
              onKeyDown={(e) => e.key === "Enter" && adicionarEmpresa()}
              className="mb-4 max-w-md"
            />
            <div className="flex gap-2">
              <Button variant="success" onClick={adicionarEmpresa} disabled={saving || !novoNome.trim()}>
                {saving ? "Salvando..." : "Criar"}
              </Button>
              <Button variant="secondary" onClick={() => { setModalNova(false); setNovoNome(""); setError(null); }} disabled={saving}>
                Cancelar
              </Button>
            </div>
          </Card>
        )}

        {inviteLink && (
          <Alert variant="info" title={`Convite para ${inviteLink.nome}`} action={
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={copiarLink} className="border-[var(--info)] text-[var(--info)]">
                Copiar link
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setInviteLink(null)}>Fechar</Button>
            </div>
          }>
            <p className="text-xs break-all">{inviteLink.link}</p>
          </Alert>
        )}

        {loading && <p className="text-sm text-[var(--muted)]">Carregando empresas...</p>}

        {!loading && empresas.length === 0 && !error && (
          <Card padding="lg" className="text-center text-[var(--muted)]">
            Nenhuma empresa cadastrada nesta organização.
          </Card>
        )}

        {!loading && empresas.length > 0 && (
          <div className="flex flex-col gap-3">
            {empresas.map((emp) => (
              <Card key={emp.id} padding="md">
                <div className="font-semibold text-[var(--foreground)]">{emp.nome || "Sem nome"}</div>
                <div className="text-sm text-[var(--muted)] mt-1">
                  Status: {emp.status || "—"}
                  {emp.sla_postagem_dias != null && ` · SLA: ${emp.sla_postagem_dias} dias`}
                </div>
                <dl className="mt-2 text-xs text-[var(--foreground)] space-y-1 border-t border-[var(--card-border)] pt-2">
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                    <dt className="text-[var(--muted)] shrink-0">CNPJ</dt>
                    <dd className="font-mono tabular-nums">{formatCnpjBr(emp.cnpj ?? null)}</dd>
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                    <dt className="text-[var(--muted)] shrink-0">Telefone</dt>
                    <dd>{emp.telefone?.trim() || "—"}</dd>
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                    <dt className="text-[var(--muted)] shrink-0">E-mail</dt>
                    <dd className="break-all">{emp.email_comercial?.trim() || "—"}</dd>
                  </div>
                </dl>
                <p className="text-[11px] text-[var(--muted)] mt-1.5">
                  Preenchidos pelo fornecedor no painel (Cadastro).
                </p>
                <div className="mt-3 flex gap-2 flex-wrap">
                  <Button variant="success" size="sm" onClick={() => irParaCatalogo(emp)}>
                    Editar catálogo
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => irParaCatalogoSoLeitura(emp)}>
                    Ver só leitura
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => enviarConvite(emp)} disabled={!!invitingId} className="border-[var(--info)] text-[var(--info)]">
                    {invitingId === emp.id ? "Gerando..." : "Convidar (login)"}
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => excluirFornecedor(emp)}
                    disabled={deletingId !== null}
                  >
                    {deletingId === emp.id ? "Excluindo..." : "Excluir"}
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-4">
          <Button variant="secondary" onClick={() => router.push("/dashboard")}>
            Voltar ao Dashboard
          </Button>
          <Button variant="secondary" onClick={() => router.push("/admin/catalogo")} className="border-[var(--success)] text-[var(--success)]">
            Catálogo (todas as empresas)
          </Button>
          <Button variant="secondary" onClick={() => router.push("/admin/alteracoes-produtos")}>
            Alterações em análise
          </Button>
        </div>
      </div>
    </PageLayout>
  );
}
