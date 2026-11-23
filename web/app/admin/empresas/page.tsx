"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { PlanLimitsBadge } from "@/components/PlanLimitsBadge";
import { PageLayout, Card, Button, Alert, Input } from "@/components/ui";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { toTitleCase } from "@/lib/formatText";
import { formatCnpjBr } from "@/lib/fornecedorCadastro";
import { AMBER_PREMIUM_LINK } from "@/lib/amberPremium";
import { DANGER_PREMIUM_TEXT_SOFT } from "@/lib/semanticPremium";
import { cn } from "@/lib/utils";
import { ModalOverlay } from "@/components/ui/ModalOverlay";
import { MODAL_PANEL_BODY_CLASS } from "@/lib/modalOverlay";

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
  convite_pendente_expira_em?: string | null;
  opera_no_cd?: boolean;
  cd_fulfillment_taxa_valor?: number;
};

function diasParaVencerConvite(iso: string): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
}

export default function AdminEmpresasPage() {
  const router = useRouter();
  const [orgId, setOrgId] = useState<string | null>(null);
  const [empresas, setEmpresas] = useState<Fornecedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [invitingId, setInvitingId] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<{ nome: string; link: string; portal_trial_dias?: number } | null>(null);
  const [fornecedorConviteTrialDias, setFornecedorConviteTrialDias] = useState(7);
  const [modalNova, setModalNova] = useState(false);
  const [novoNome, setNovoNome] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [cdTaxaRascunho, setCdTaxaRascunho] = useState<Record<string, string>>({});
  const [salvandoCdId, setSalvandoCdId] = useState<string | null>(null);

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
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ portal_trial_dias: fornecedorConviteTrialDias }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Erro ao gerar convite.");
      setInviteLink({
        nome: emp.nome || "Fornecedor",
        link: json.link,
        portal_trial_dias: typeof json.portal_trial_dias === "number" ? json.portal_trial_dias : fornecedorConviteTrialDias,
      });
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

  const [confirmarExclusao, setConfirmarExclusao] = useState<Fornecedor | null>(null);

  async function excluirFornecedor(emp: Fornecedor) {
    if (!orgId) return;
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

  async function salvarConfigCd(emp: Fornecedor, patch: { opera_no_cd?: boolean; cd_fulfillment_taxa_valor?: number }) {
    if (!orgId) return;
    setSalvandoCdId(emp.id);
    setError(null);
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) {
        router.replace("/login");
        return;
      }
      const res = await fetch(`/api/org/fornecedores/${encodeURIComponent(emp.id)}?orgId=${encodeURIComponent(orgId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify(patch),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Erro ao salvar configuração do CD.");
      setEmpresas((prev) => prev.map((e) => (e.id === emp.id ? { ...e, ...json } : e)));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao salvar configuração do CD.");
    } finally {
      setSalvandoCdId(null);
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
    <PageLayout maxWidth="lg">
      <div className="space-y-8">
        <AdminPageHeader
          eyebrow="Operação"
          title="Empresas / Fornecedores"
          titleExtra={<PlanLimitsBadge />}
          subtitle="Clique em uma empresa para ver o catálogo de SKUs dela."
          right={
            <Button variant="success" onClick={() => setModalNova(true)}>
              + Adicionar empresa
            </Button>
          }
        />

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

        {confirmarExclusao ? (
          <ModalOverlay onBackdropClick={() => setConfirmarExclusao(null)}>
            <div className={cn(MODAL_PANEL_BODY_CLASS, "p-5")}>
              <p className="font-semibold text-[var(--foreground)]">Excluir empresa?</p>
              <p className="mt-1.5 text-sm text-[var(--muted)]">
                Excluir permanentemente &quot;{confirmarExclusao.nome || "esta empresa"}&quot;? Pedidos, SKUs e dados
                financeiros ligados a este fornecedor serão excluídos. Essa ação não pode ser desfeita.
              </p>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmarExclusao(null)}
                  className="rounded-md border border-[var(--card-border)] bg-[var(--card)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--foreground)] hover:bg-[var(--muted)]/10"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const emp = confirmarExclusao;
                    setConfirmarExclusao(null);
                    void excluirFornecedor(emp);
                  }}
                  className="rounded-md bg-[var(--danger)] px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:opacity-90 dark:bg-red-500 dark:hover:bg-red-400 dark:ring-1 dark:ring-inset dark:ring-white/20"
                >
                  Excluir
                </button>
              </div>
            </div>
          </ModalOverlay>
        ) : null}

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
            {inviteLink.portal_trial_dias !== undefined && (
              <p className="text-[11px] mt-2 text-[var(--muted)]">
                Teste grátis no painel após aceitar:{" "}
                <strong className="text-[var(--foreground)]">
                  {inviteLink.portal_trial_dias === 0 ? "nenhum (0 dias)" : `${inviteLink.portal_trial_dias} dia(s)`}
                </strong>
                .
              </p>
            )}
          </Alert>
        )}

        <Card padding="md" className="mb-4">
          <p className="text-sm font-medium text-[var(--foreground)] mb-2">Convites (login fornecedor)</p>
          <label htmlFor="forn-convite-trial" className="text-[12px] text-[var(--muted)] block mb-1">
            Dias de teste grátis no painel ao aceitar o convite (0 = sem período)
          </label>
          <Input
            id="forn-convite-trial"
            type="number"
            min={0}
            max={365}
            className="max-w-[6rem] h-9 text-sm mb-1"
            value={fornecedorConviteTrialDias}
            onChange={(e) => setFornecedorConviteTrialDias(Math.min(365, Math.max(0, parseInt(e.target.value, 10) || 0)))}
          />
          <p className="text-[11px] text-[var(--muted)]">Mesmo conceito do convite da calculadora: você define quantos dias grátis (ou zero).</p>
        </Card>

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
                  {emp.status === "convite_expirado" && (
                    <span className={cn(DANGER_PREMIUM_TEXT_SOFT, "font-medium")}> · Convite expirado, nunca aceito</span>
                  )}
                  {emp.convite_pendente_expira_em && (
                    <span className={cn(AMBER_PREMIUM_LINK, "font-medium")}>
                      {" "}
                      · Convite pendente — vence em {diasParaVencerConvite(emp.convite_pendente_expira_em)}d
                    </span>
                  )}
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

                <div className="mt-3 rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div>
                      <p className="text-sm font-medium text-[var(--foreground)]">Centro de Distribuição DropCore</p>
                      <p className="text-[11px] text-[var(--muted)]">
                        {emp.opera_no_cd
                          ? "Estoque conferido no CD — fornecedor fica com estoque somente leitura."
                          : "Fornecedor avulso — despacha do próprio endereço."}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => salvarConfigCd(emp, { opera_no_cd: !emp.opera_no_cd })}
                      disabled={salvandoCdId === emp.id}
                      className={cn(
                        "rounded-md px-2.5 py-1.5 text-[11px] font-semibold shadow-sm shrink-0",
                        emp.opera_no_cd
                          ? "bg-emerald-600 text-white hover:bg-emerald-700"
                          : "border border-[var(--card-border)] bg-[var(--card)] text-[var(--foreground)] hover:bg-[var(--muted)]/10"
                      )}
                    >
                      {salvandoCdId === emp.id ? "Salvando..." : emp.opera_no_cd ? "Opera no CD" : "Fora do CD"}
                    </button>
                  </div>

                  {emp.opera_no_cd && (
                    <div className="mt-3 border-t border-[var(--card-border)] pt-3">
                      <label htmlFor={`cd-taxa-${emp.id}`} className="text-[12px] text-[var(--muted)] block mb-1">
                        Taxa de fulfillment por pedido (R$) — 0 = isento
                      </label>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Input
                          id={`cd-taxa-${emp.id}`}
                          type="number"
                          min={0}
                          step="0.01"
                          className="max-w-[7rem] h-9 text-sm"
                          value={cdTaxaRascunho[emp.id] ?? String(emp.cd_fulfillment_taxa_valor ?? 0)}
                          onChange={(e) => setCdTaxaRascunho((prev) => ({ ...prev, [emp.id]: e.target.value }))}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const raw = cdTaxaRascunho[emp.id];
                            const valor = raw == null ? emp.cd_fulfillment_taxa_valor ?? 0 : Math.max(0, parseFloat(raw.replace(",", ".")) || 0);
                            salvarConfigCd(emp, { cd_fulfillment_taxa_valor: valor });
                          }}
                          disabled={salvandoCdId === emp.id}
                          className="rounded-md bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
                        >
                          Salvar taxa
                        </button>
                        <span className="text-[11px] text-[var(--muted)]">
                          {(emp.cd_fulfillment_taxa_valor ?? 0) === 0
                            ? "R$ 0,00 (isento)"
                            : `Hoje: R$ ${(emp.cd_fulfillment_taxa_valor ?? 0).toFixed(2).replace(".", ",")} por pedido`}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

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
                    onClick={() => setConfirmarExclusao(emp)}
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
