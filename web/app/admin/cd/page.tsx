"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { PageLayout, Card, Button, Alert, Input } from "@/components/ui";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { ModalOverlay } from "@/components/ui/ModalOverlay";
import { MODAL_PANEL_BODY_CLASS } from "@/lib/modalOverlay";
import { CD_BAIXA_MOTIVOS, cdBaixaMotivoLabel } from "@/lib/cdBaixaMotivos";
import { cn } from "@/lib/utils";

type Fornecedor = { id: string; nome: string };

type Remessa = {
  remessa_id: string;
  fornecedor_id: string;
  fornecedor_nome: string;
  sku_id: string;
  sku: string;
  nome_produto: string | null;
  cor: string | null;
  tamanho: string | null;
  quantidade: number;
  observacao: string | null;
  criado_em: string;
};

type EstoqueSku = {
  sku_id: string;
  sku: string;
  nome_produto: string | null;
  cor: string | null;
  tamanho: string | null;
  fornecedor_id: string;
  estoque_atual: number;
  conferido: number;
};

const ABAS = [
  { key: "remessas", label: "Remessas pendentes" },
  { key: "estoque", label: "Estoque conferido" },
  { key: "historico", label: "Histórico" },
] as const;
type Aba = (typeof ABAS)[number]["key"];

type Movimento = {
  id: string;
  tipo: "remessa_declarada" | "conferencia_entrada" | "baixa_manual";
  fornecedor_id: string;
  fornecedor_nome: string;
  sku_id: string;
  sku: string;
  nome_produto: string | null;
  cor: string | null;
  tamanho: string | null;
  quantidade: number;
  declarado: number | null;
  motivo: string | null;
  observacao: string | null;
  criado_em: string;
};

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function movimentoTituloETag(m: Movimento): { titulo: string; tagTexto: string; tagTone: "neutral" | "success" | "danger" } {
  if (m.tipo === "remessa_declarada") return { titulo: "Remessa declarada", tagTexto: `${m.quantidade} un.`, tagTone: "neutral" };
  if (m.tipo === "baixa_manual") return { titulo: "Baixa manual", tagTexto: `-${m.quantidade} un.`, tagTone: "danger" };
  const bate = m.declarado != null && m.declarado === m.quantidade;
  return {
    titulo: "Conferência de entrada",
    tagTexto: m.declarado != null ? `${m.declarado} declarado → ${m.quantidade} conferido` : `${m.quantidade} conferido`,
    tagTone: bate ? "success" : "danger",
  };
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("pt-BR");
  } catch {
    return iso;
  }
}

export default function AdminCdPage() {
  const router = useRouter();
  const [orgId, setOrgId] = useState<string | null>(null);
  const [roleBase, setRoleBase] = useState<string | null>(null);
  const [fornecedoresCd, setFornecedoresCd] = useState<Fornecedor[]>([]);
  const [aba, setAba] = useState<Aba>("remessas");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) {
        router.replace("/login");
        return;
      }
      const res = await fetch("/api/org/me", { headers: { Authorization: `Bearer ${session.access_token}` } });
      const json = await res.json();
      if (!res.ok || !json?.org_id) {
        setError(json?.error || "Erro ao carregar organização.");
        return;
      }
      setOrgId(json.org_id);
      setRoleBase(json.role_base ?? null);
      // Lista mínima (id/nome), segura também pro operador do CD — /api/org/fornecedores
      // é admin-only e traz campo bancário, não cabe aqui.
      const resF = await fetch(`/api/org/cd/fornecedores?orgId=${json.org_id}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const dataF = await resF.json();
      if (resF.ok && Array.isArray(dataF.fornecedores)) setFornecedoresCd(dataF.fornecedores);
    })();
  }, [router]);

  async function authHeaders(): Promise<Record<string, string>> {
    const { data: { session } } = await supabaseBrowser.auth.getSession();
    if (!session?.access_token) throw new Error("Sessão expirada, faça login novamente.");
    return { Authorization: `Bearer ${session.access_token}` };
  }

  return (
    <PageLayout maxWidth="lg">
      <div className="space-y-6">
        <AdminPageHeader
          eyebrow="Operação"
          title="Centro de Distribuição"
          subtitle="Remessas declaradas pelo fornecedor, conferência de entrada e baixa manual de estoque no CD."
        />

        {error && <Alert variant="danger">{error}</Alert>}

        <div className="dropcore-tabs-scroll flex items-center gap-5 overflow-x-auto border-b border-[var(--card-border)] px-1">
          {ABAS.map((a) => {
            const ativo = aba === a.key;
            return (
              <button
                key={a.key}
                type="button"
                onClick={() => setAba(a.key)}
                className={cn(
                  "-mb-px flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 pb-2.5 pt-1 text-sm font-medium transition-colors",
                  ativo
                    ? "border-emerald-500 text-emerald-600 dark:text-emerald-400"
                    : "border-transparent text-[var(--muted)] hover:text-[var(--foreground)]"
                )}
              >
                {a.label}
              </button>
            );
          })}
        </div>

        {orgId && aba === "remessas" && (
          <RemessasPendentes orgId={orgId} fornecedoresCd={fornecedoresCd} authHeaders={authHeaders} />
        )}
        {orgId && aba === "estoque" && (
          <EstoqueConferido orgId={orgId} fornecedoresCd={fornecedoresCd} authHeaders={authHeaders} roleBase={roleBase} />
        )}
        {orgId && aba === "historico" && (
          <HistoricoCd orgId={orgId} fornecedoresCd={fornecedoresCd} authHeaders={authHeaders} />
        )}

        <div className="pt-2">
          <Button variant="secondary" onClick={() => router.push("/dashboard")}>
            Voltar ao Dashboard
          </Button>
        </div>
      </div>
    </PageLayout>
  );
}

function RemessasPendentes({
  orgId,
  fornecedoresCd,
  authHeaders,
}: {
  orgId: string;
  fornecedoresCd: Fornecedor[];
  authHeaders: () => Promise<Record<string, string>>;
}) {
  const [remessas, setRemessas] = useState<Remessa[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fornecedorFiltro, setFornecedorFiltro] = useState("");
  const [conferirAlvo, setConferirAlvo] = useState<Remessa | null>(null);
  const [quantidadeConferida, setQuantidadeConferida] = useState("");
  const [observacao, setObservacao] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const headers = await authHeaders();
      const qs = new URLSearchParams({ orgId });
      if (fornecedorFiltro) qs.set("fornecedorId", fornecedorFiltro);
      const res = await fetch(`/api/org/cd/remessas-pendentes?${qs.toString()}`, { headers });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Erro ao carregar remessas.");
      setRemessas(Array.isArray(data.remessas) ? data.remessas : []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao carregar remessas.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, fornecedorFiltro]);

  async function confirmarConferencia() {
    if (!conferirAlvo) return;
    const quantidade = parseFloat(quantidadeConferida.replace(",", "."));
    if (!Number.isFinite(quantidade) || quantidade <= 0) {
      setError("Quantidade conferida inválida.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/org/cd/conferencia?orgId=${orgId}`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ remessa_id: conferirAlvo.remessa_id, quantidade_conferida: quantidade, observacao: observacao.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Erro ao confirmar conferência.");
      setConferirAlvo(null);
      setQuantidadeConferida("");
      setObservacao("");
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao confirmar conferência.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select value={fornecedorFiltro} onChange={(e) => setFornecedorFiltro(e.target.value)} className="u-input h-9 max-w-xs text-sm">
          <option value="">Todos os fornecedores do CD</option>
          {fornecedoresCd.map((f) => (
            <option key={f.id} value={f.id}>{f.nome}</option>
          ))}
        </select>
        <Button variant="secondary" size="sm" onClick={load}>Atualizar</Button>
      </div>

      {error && <Alert variant="danger">{error}</Alert>}

      {loading ? (
        <p className="text-sm text-[var(--muted)]">Carregando...</p>
      ) : remessas.length === 0 ? (
        <Card padding="lg" className="text-center text-[var(--muted)]">Nenhuma remessa pendente de conferência.</Card>
      ) : (
        <div className="space-y-2">
          {remessas.map((r) => (
            <article key={r.remessa_id} className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4">
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div>
                  <p className="font-semibold text-[var(--foreground)]">{r.sku} — {r.nome_produto ?? "—"}</p>
                  <p className="text-[12px] text-[var(--muted)]">{r.fornecedor_nome} · {r.cor ?? "—"}/{r.tamanho ?? "—"} · declarado em {formatDate(r.criado_em)}</p>
                </div>
                <Button
                  variant="success"
                  size="sm"
                  onClick={() => { setConferirAlvo(r); setQuantidadeConferida(String(r.quantidade)); setObservacao(""); setError(null); }}
                >
                  Conferir ({r.quantidade})
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}

      {conferirAlvo && (
        <ModalOverlay onBackdropClick={() => setConferirAlvo(null)}>
          <div className={cn(MODAL_PANEL_BODY_CLASS, "p-5 space-y-3")}>
            <p className="font-semibold text-[var(--foreground)]">Conferir entrada — {conferirAlvo.sku}</p>
            <p className="text-[12px] text-[var(--muted)]">Declarado: {conferirAlvo.quantidade} unidade(s). Ajuste se o recebido for diferente.</p>
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1">Quantidade conferida</label>
              <Input type="number" min={0} value={quantidadeConferida} onChange={(e) => setQuantidadeConferida(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1">Observação (opcional)</label>
              <Input value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="Ex: 1 unidade avariada na caixa" />
            </div>
            {error && <p className="text-[12px] text-[var(--danger)]">{error}</p>}
            <div className="flex gap-2 pt-1">
              <Button variant="success" onClick={confirmarConferencia} disabled={saving}>
                {saving ? "Salvando..." : "Confirmar entrada"}
              </Button>
              <Button variant="secondary" onClick={() => setConferirAlvo(null)} disabled={saving}>Cancelar</Button>
            </div>
          </div>
        </ModalOverlay>
      )}
    </div>
  );
}

function EstoqueConferido({
  orgId,
  fornecedoresCd,
  authHeaders,
  roleBase,
}: {
  orgId: string;
  fornecedoresCd: Fornecedor[];
  authHeaders: () => Promise<Record<string, string>>;
  roleBase: string | null;
}) {
  const [skus, setSkus] = useState<EstoqueSku[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fornecedorFiltro, setFornecedorFiltro] = useState("");
  const [baixaAlvo, setBaixaAlvo] = useState<EstoqueSku | null>(null);
  const [remessaAlvo, setRemessaAlvo] = useState<EstoqueSku | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const headers = await authHeaders();
      const qs = new URLSearchParams({ orgId });
      if (fornecedorFiltro) qs.set("fornecedorId", fornecedorFiltro);
      const res = await fetch(`/api/org/cd/estoque?${qs.toString()}`, { headers });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Erro ao carregar estoque.");
      setSkus(Array.isArray(data.skus) ? data.skus : []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao carregar estoque.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, fornecedorFiltro]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select value={fornecedorFiltro} onChange={(e) => setFornecedorFiltro(e.target.value)} className="u-input h-9 max-w-xs text-sm">
          <option value="">Todos os fornecedores do CD</option>
          {fornecedoresCd.map((f) => (
            <option key={f.id} value={f.id}>{f.nome}</option>
          ))}
        </select>
        <Button variant="secondary" size="sm" onClick={load}>Atualizar</Button>
      </div>

      {error && <Alert variant="danger">{error}</Alert>}

      {loading ? (
        <p className="text-sm text-[var(--muted)]">Carregando...</p>
      ) : skus.length === 0 ? (
        <Card padding="lg" className="text-center text-[var(--muted)]">Nenhum SKU de fornecedor do CD encontrado.</Card>
      ) : (
        <div className="space-y-2">
          {skus.map((s) => {
            const bate = s.conferido === s.estoque_atual;
            return (
              <article key={s.sku_id} className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div>
                    <p className="font-semibold text-[var(--foreground)]">{s.sku} — {s.nome_produto ?? "—"}</p>
                    <p className="text-[12px] text-[var(--muted)]">{s.cor ?? "—"}/{s.tamanho ?? "—"}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <dl className="text-right text-[12px]">
                      <div><dt className="inline text-[var(--muted)]">Estoque: </dt><dd className="inline font-medium text-[var(--foreground)]">{s.estoque_atual}</dd></div>
                      <div>
                        <dt className="inline text-[var(--muted)]">Conferido: </dt>
                        <dd className={cn("inline font-medium", bate ? "text-[var(--foreground)]" : "text-[var(--danger)]")}>{s.conferido}</dd>
                      </div>
                    </dl>
                    <Button variant="secondary" size="sm" onClick={() => setRemessaAlvo(s)}>Remessa</Button>
                    {roleBase !== "operacional" && (
                      <Button variant="secondary" size="sm" onClick={() => setBaixaAlvo(s)}>Baixa</Button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {baixaAlvo && (
        <BaixaManualModal
          orgId={orgId}
          alvo={baixaAlvo}
          authHeaders={authHeaders}
          onClose={() => setBaixaAlvo(null)}
          onSuccess={() => { setBaixaAlvo(null); load(); }}
        />
      )}

      {remessaAlvo && (
        <RemessaAdminModal
          orgId={orgId}
          alvo={remessaAlvo}
          authHeaders={authHeaders}
          onClose={() => setRemessaAlvo(null)}
          onSuccess={() => setRemessaAlvo(null)}
        />
      )}
    </div>
  );
}

function RemessaAdminModal({
  orgId,
  alvo,
  authHeaders,
  onClose,
  onSuccess,
}: {
  orgId: string;
  alvo: EstoqueSku;
  authHeaders: () => Promise<Record<string, string>>;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [quantidade, setQuantidade] = useState("");
  const [observacao, setObservacao] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function declarar() {
    setError(null);
    const qtd = parseFloat(quantidade.replace(",", "."));
    if (!Number.isFinite(qtd) || qtd <= 0) {
      setError("Quantidade inválida.");
      return;
    }
    setSaving(true);
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/org/cd/remessa?orgId=${orgId}`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ fornecedor_id: alvo.fornecedor_id, sku_id: alvo.sku_id, quantidade: qtd, observacao: observacao.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Erro ao declarar remessa.");
      onSuccess();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao declarar remessa.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalOverlay onBackdropClick={onClose}>
      <div className={cn(MODAL_PANEL_BODY_CLASS, "p-5 space-y-3")}>
        <p className="font-semibold text-[var(--foreground)]">Declarar remessa — {alvo.sku}</p>
        <p className="text-[12px] text-[var(--muted)]">
          {alvo.nome_produto ?? "—"} · {alvo.cor ?? "—"}/{alvo.tamanho ?? "—"} · em nome do fornecedor
        </p>

        {error && <p className="text-[12px] text-[var(--danger)]">{error}</p>}

        <div>
          <label className="block text-xs text-[var(--muted)] mb-1">Quantidade</label>
          <Input type="number" min={0} value={quantidade} onChange={(e) => setQuantidade(e.target.value)} className="max-w-[8rem]" />
        </div>

        <div>
          <label className="block text-xs text-[var(--muted)] mb-1">Observação (opcional)</label>
          <Input value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="Ex: fornecedor avisou por telefone" />
        </div>

        <div className="flex gap-2 pt-1">
          <Button variant="success" onClick={declarar} disabled={saving}>
            {saving ? "Declarando..." : "Declarar remessa"}
          </Button>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
        </div>
      </div>
    </ModalOverlay>
  );
}

function BaixaManualModal({
  orgId,
  alvo,
  authHeaders,
  onClose,
  onSuccess,
}: {
  orgId: string;
  alvo: EstoqueSku;
  authHeaders: () => Promise<Record<string, string>>;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [quantidade, setQuantidade] = useState("");
  const [motivo, setMotivo] = useState<string>("");
  const [observacao, setObservacao] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function registrarBaixa() {
    setError(null);
    if (!motivo) {
      setError("Selecione o motivo.");
      return;
    }
    const qtd = parseFloat(quantidade.replace(",", "."));
    if (!Number.isFinite(qtd) || qtd <= 0) {
      setError("Quantidade inválida.");
      return;
    }
    setSaving(true);
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/org/cd/baixa-manual?orgId=${orgId}`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ fornecedor_id: alvo.fornecedor_id, sku_id: alvo.sku_id, quantidade: qtd, motivo, observacao: observacao.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Erro ao registrar baixa.");
      onSuccess();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao registrar baixa.");
    } finally {
      setSaving(false);
    }
  }

  const motivoFinanceiro = motivo === "avaria_perda_dropcore" || motivo === "defeito_fabrica_fornecedor";

  return (
    <ModalOverlay onBackdropClick={onClose}>
      <div className={cn(MODAL_PANEL_BODY_CLASS, "p-5 space-y-3")}>
        <p className="font-semibold text-[var(--foreground)]">Baixa manual — {alvo.sku}</p>
        <p className="text-[12px] text-[var(--muted)]">
          {alvo.nome_produto ?? "—"} · {alvo.cor ?? "—"}/{alvo.tamanho ?? "—"} · estoque atual {alvo.estoque_atual}
        </p>

        {error && <p className="text-[12px] text-[var(--danger)]">{error}</p>}

        <div>
          <label className="block text-xs text-[var(--muted)] mb-1">Quantidade</label>
          <Input type="number" min={0} value={quantidade} onChange={(e) => setQuantidade(e.target.value)} className="max-w-[8rem]" />
        </div>

        <div>
          <label className="block text-xs text-[var(--muted)] mb-1">Motivo</label>
          <select value={motivo} onChange={(e) => setMotivo(e.target.value)} className="u-input w-full">
            <option value="">Selecione...</option>
            {CD_BAIXA_MOTIVOS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
          {motivoFinanceiro && (
            <p className="text-[11px] text-[var(--muted)] mt-1">
              Responsável pelo custo é definido automaticamente pelo motivo — {motivo === "avaria_perda_dropcore" ? "DropCore" : "fornecedor"}.
            </p>
          )}
        </div>

        <div>
          <label className="block text-xs text-[var(--muted)] mb-1">Observação (opcional)</label>
          <Input value={observacao} onChange={(e) => setObservacao(e.target.value)} />
        </div>

        <div className="flex gap-2 pt-1">
          <Button variant="danger" onClick={registrarBaixa} disabled={saving}>
            {saving ? "Registrando..." : "Registrar baixa"}
          </Button>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
        </div>
      </div>
    </ModalOverlay>
  );
}

function HistoricoCd({
  orgId,
  fornecedoresCd,
  authHeaders,
}: {
  orgId: string;
  fornecedoresCd: Fornecedor[];
  authHeaders: () => Promise<Record<string, string>>;
}) {
  const [movimentos, setMovimentos] = useState<Movimento[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fornecedorFiltro, setFornecedorFiltro] = useState("");
  const [page, setPage] = useState(0);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const headers = await authHeaders();
      const qs = new URLSearchParams({ orgId, page: String(page), perPage: "30" });
      if (fornecedorFiltro) qs.set("fornecedorId", fornecedorFiltro);
      const res = await fetch(`/api/org/cd/historico?${qs.toString()}`, { headers });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Erro ao carregar histórico.");
      setMovimentos(Array.isArray(data.movimentos) ? data.movimentos : []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao carregar histórico.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, fornecedorFiltro, page]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={fornecedorFiltro}
          onChange={(e) => { setFornecedorFiltro(e.target.value); setPage(0); }}
          className="u-input h-9 max-w-xs text-sm"
        >
          <option value="">Todos os fornecedores do CD</option>
          {fornecedoresCd.map((f) => (
            <option key={f.id} value={f.id}>{f.nome}</option>
          ))}
        </select>
        <Button variant="secondary" size="sm" onClick={load}>Atualizar</Button>
      </div>

      {error && <Alert variant="danger">{error}</Alert>}

      {loading ? (
        <p className="text-sm text-[var(--muted)]">Carregando...</p>
      ) : movimentos.length === 0 ? (
        <Card padding="lg" className="text-center text-[var(--muted)]">Nenhuma movimentação encontrada.</Card>
      ) : (
        <div className="space-y-2">
          {movimentos.map((m) => {
            const { titulo, tagTexto, tagTone } = movimentoTituloETag(m);
            const tagClass =
              tagTone === "success"
                ? "text-emerald-600 dark:text-emerald-400"
                : tagTone === "danger"
                  ? "text-[var(--danger)]"
                  : "text-[var(--muted)]";
            return (
              <article key={m.id} className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div>
                    <p className="font-semibold text-[var(--foreground)]">
                      {titulo} — {m.sku} ({m.nome_produto ?? "—"})
                    </p>
                    <p className="text-[12px] text-[var(--muted)]">
                      {m.fornecedor_nome} · {m.cor ?? "—"}/{m.tamanho ?? "—"} · {formatDateTime(m.criado_em)}
                      {m.tipo === "baixa_manual" && m.motivo && <> · {cdBaixaMotivoLabel(m.motivo)}</>}
                      {m.observacao && <> · {m.observacao}</>}
                    </p>
                  </div>
                  <span className={cn("inline-flex items-center gap-1.5 text-[12px] font-medium", tagClass)}>
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden />
                    {tagTexto}
                  </span>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>
          Anterior
        </Button>
        <Button variant="secondary" size="sm" onClick={() => setPage((p) => p + 1)} disabled={movimentos.length < 30}>
          Próxima
        </Button>
      </div>
    </div>
  );
}
