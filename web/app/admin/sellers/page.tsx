"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Button, PageLayout } from "@/components/ui";
import { toTitleCase } from "@/lib/formatText";
import { MESES_MINIMOS_COM_FORNECEDOR, dataMinimaTrocaFornecedor, podeTrocarFornecedorAgora } from "@/lib/sellerFornecedorVinculo";
import { sellerCadastroPendente } from "@/lib/sellerDocumento";

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
  email?: string | null;
  telefone?: string | null;
  cep?: string | null;
  endereco?: string | null;
  nome_responsavel?: string | null;
  cpf_responsavel?: string | null;
  data_nascimento?: string | null;
  nome_banco?: string | null;
  nome_no_banco?: string | null;
  agencia?: string | null;
  conta?: string | null;
  tipo_conta?: string | null;
  fornecedor_id?: string | null;
  fornecedor_vinculado_em?: string | null;
  fornecedor_desvinculo_liberado?: boolean;
};

type SellerComMov = Seller & {
  movimentacoes: { id: string; tipo: string; valor: number; motivo: string | null; referencia: string | null; criado_em: string }[];
};

// Padrão de modais (usa tokens globais)
const modalOverlay: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 };
const modalBox: React.CSSProperties = { background: "var(--card)", padding: 24, borderRadius: 8, maxWidth: 380, width: "calc(100% - 32px)", boxShadow: "var(--shadow-card)", border: "1px solid var(--border-subtle)" };

export default function AdminSellersPage() {
  const router = useRouter();
  const [orgId, setOrgId] = useState<string | null>(null);
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SellerComMov | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [modal, setModal] = useState<"new" | "credit" | "edit" | null>(null);
  const [creditValor, setCreditValor] = useState("");
  const [creditSending, setCreditSending] = useState(false);
  const [pixChave, setPixChave] = useState("");
  const [newNome, setNewNome] = useState("");
  const [newSending, setNewSending] = useState(false);
  const [editNome, setEditNome] = useState("");
  const [editDocumento, setEditDocumento] = useState("");
  const [editPlano, setEditPlano] = useState("");
  const [editStatus, setEditStatus] = useState("");
  const [editSending, setEditSending] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteSending, setDeleteSending] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [inviteSending, setInviteSending] = useState(false);
  const [fornecedores, setFornecedores] = useState<{ id: string; nome: string }[]>([]);
  const [editFornecedorId, setEditFornecedorId] = useState("");
  const [editFornecedorLiberado, setEditFornecedorLiberado] = useState(false);
  const [editConfirmarTrocaAntesPrazo, setEditConfirmarTrocaAntesPrazo] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) {
        router.replace("/login");
        return;
      }
      const res = await fetch("/api/org/me", { headers: { Authorization: `Bearer ${session.access_token}` } });
      const json = await res.json();
      if (res.ok && json?.org_id) setOrgId(json.org_id);
      else setLoading(false);
    })();
  }, [router]);

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
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
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [orgId, statusFilter, q]);

  useEffect(() => {
    if (!orgId) return;
    (async () => {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch(`/api/org/fornecedores?orgId=${orgId}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json();
      if (res.ok && Array.isArray(data)) setFornecedores(data);
    })();
  }, [orgId]);

  useEffect(() => {
    if (!selectedId || !orgId) return;
    setDetailLoading(true);
    setDetail(null);
    (async () => {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch(`/api/org/sellers/${selectedId}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setDetail(data);
        setEditFornecedorLiberado(Boolean(data.fornecedor_desvinculo_liberado));
        setEditConfirmarTrocaAntesPrazo(false);
      }
      setDetailLoading(false);
    })();
  }, [selectedId, orgId]);

  const MINIMO_CREDITO = 500;

  async function addCredit() {
    if (!selectedId || !creditValor.trim()) {
      setError("Valor é obrigatório.");
      return;
    }
    const valor = parseFloat(creditValor.replace(",", "."));
    if (!Number.isFinite(valor) || valor <= 0) {
      setError("Valor inválido.");
      return;
    }
    if (valor < MINIMO_CREDITO) {
      setError(`Valor mínimo para adicionar crédito é R$ ${MINIMO_CREDITO},00.`);
      return;
    }
    
    setCreditSending(true);
    setError(null);
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) return;
      
      const body: Record<string, unknown> = {
        valor,
        motivo: "PIX",
        pix_chave: pixChave || "chave-pix-exemplo@dropcore.com.br",
      };
      
      const res = await fetch(`/api/org/sellers/${selectedId}/deposito-pix`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Erro");
      setCreditValor("");
      setPixChave("");
      setModal(null);
      if (json?.pendente && json?.mensagem) {
        setError(null);
        alert(json.mensagem + "\n\nAcesse: Admin > Depósitos PIX");
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao adicionar crédito");
    } finally {
      setCreditSending(false);
    }
  }

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
      setModal(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao criar seller");
    } finally {
      setNewSending(false);
    }
  }

  async function editSeller() {
    if (!selectedId || !editNome.trim()) return;
    setEditSending(true);
    setError(null);
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) return;
      const novoForn = editFornecedorId.trim() || null;
      const antForn = detail?.fornecedor_id ?? null;
      const fornecedorMudou = novoForn !== antForn;
      const liberadoMudou = editFornecedorLiberado !== Boolean(detail?.fornecedor_desvinculo_liberado);
      const patchBody: Record<string, unknown> = {
        nome: editNome.trim(),
        documento: editDocumento.trim() || null,
        plano: editPlano.trim() || null,
        status: editStatus || "ativo",
      };
      if (fornecedorMudou) {
        patchBody.fornecedor_id = novoForn;
        patchBody.fornecedor_desvinculo_liberado = editFornecedorLiberado;
        patchBody.confirmar_troca_fornecedor_antes_prazo = editConfirmarTrocaAntesPrazo;
      } else if (liberadoMudou) {
        patchBody.fornecedor_desvinculo_liberado = editFornecedorLiberado;
      }
      const res = await fetch(`/api/org/sellers/${selectedId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify(patchBody),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Erro");
      if (detail) setDetail({ ...detail, ...json });
      setSellers((prev) => prev.map((s) => (s.id === selectedId ? { ...s, ...json } : s)));
      setModal(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setEditSending(false);
    }
  }

  async function gerarConvite() {
    if (!selectedId) return;
    setInviteSending(true);
    setInviteLink(null);
    setError(null);
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch(`/api/org/sellers/${selectedId}/invite`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Erro ao gerar convite");
      setInviteLink(json.link);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao gerar convite");
    } finally {
      setInviteSending(false);
    }
  }

  async function deleteSeller() {
    if (!selectedId) return;
    setDeleteSending(true);
    setError(null);
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch(`/api/org/sellers/${selectedId}`, { method: "DELETE", headers: { Authorization: `Bearer ${session.access_token}` } });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Erro ao excluir");
      setSellers((prev) => prev.filter((s) => s.id !== selectedId));
      setSelectedId(null);
      setDetail(null);
      setDeleteConfirm(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao excluir");
    } finally {
      setDeleteSending(false);
    }
  }

  const formatMoney = (n: number) => `R$ ${Number(n).toFixed(2).replace(".", ",")}`;
  const formatDate = (s: string | null) => (s ? new Date(s).toLocaleDateString("pt-BR") : "—");

  if (!orgId && !loading) return null;

  if (selectedId && (detail || detailLoading)) {
    return (
      <PageLayout maxWidth="md">
        <DashboardHeader href="/dashboard" onLogout={() => router.push("/login")} />
        <Button variant="secondary" onClick={() => { setSelectedId(null); setDetail(null); }} className="mb-4">
          ← Voltar à lista
        </Button>
        {detailLoading && <div>Carregando...</div>}
        {detail && !detailLoading && (
          <>
            <div className="p-5 border border-[var(--card-border)] rounded-[var(--radius)] bg-[var(--card)] mb-4 shadow-[var(--shadow-card)]">
              <h2 className="text-lg font-semibold mb-3 text-[var(--foreground)]">{detail.nome}</h2>
              <div className="text-[13px] text-[var(--muted)]">
                Documento: {detail.documento || "—"} · Plano: {detail.plano || "—"} · Status: {detail.status}
              </div>
              {sellerCadastroPendente(detail.documento, detail.plano) && (
                <p className="text-[12px] text-amber-800 dark:text-amber-300 mt-2 leading-relaxed">
                  O seller ainda não concluiu dados comerciais, CNPJ/CPF, endereço ou escolha de plano no painel. Gere o convite para ele acessar e preencher em Cadastro.
                </p>
              )}
              <div className="text-[13px] mt-2">
                Data entrada: {formatDate(detail.data_entrada)}
              </div>
              <div className="mt-4 flex gap-4">
                <div>
                  <span className="text-xs text-[var(--muted)]">Saldo disponível</span>
                  <div className="text-xl font-bold text-[var(--success)]">{formatMoney(detail.saldo_atual)}</div>
                </div>
                <div>
                  <span className="text-xs text-[var(--muted)]">Saldo bloqueado</span>
                  <div className="text-lg font-semibold text-[var(--foreground)]">{formatMoney(detail.saldo_bloqueado)}</div>
                </div>
              </div>
              <div className="flex gap-2 mt-4 flex-wrap">
                <Button variant="success" onClick={() => { setError(null); setModal("credit"); }}>
                  + Adicionar crédito
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setError(null);
                    setEditNome(detail.nome);
                    setEditDocumento(detail.documento ?? "");
                    setEditPlano(detail.plano ?? "");
                    setEditStatus(detail.status);
                    setEditFornecedorId(detail.fornecedor_id ?? "");
                    setEditFornecedorLiberado(Boolean(detail.fornecedor_desvinculo_liberado));
                    setEditConfirmarTrocaAntesPrazo(false);
                    setModal("edit");
                  }}
                >
                  Editar
                </Button>
                <Button variant="danger" onClick={() => setDeleteConfirm(true)}>
                  Excluir
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => { setInviteLink(null); setError(null); gerarConvite(); }}
                  disabled={inviteSending}
                  className="border-[var(--info)] text-[var(--info)]"
                >
                  {inviteSending ? "Gerando..." : "🔗 Gerar link de acesso"}
                </Button>
              </div>
            </div>

            {detail.fornecedor_id && (
              <div className="p-5 border border-[var(--card-border)] rounded-[var(--radius)] bg-[var(--card)] mb-4 shadow-[var(--shadow-card)]">
                <h3 className="text-sm font-semibold mb-2 text-[var(--foreground)]">Armazém vinculado</h3>
                <p className="text-[13px] text-[var(--foreground)]">
                  {fornecedores.find((f) => f.id === detail.fornecedor_id)?.nome ?? `ID ${detail.fornecedor_id}`}
                </p>
                {detail.fornecedor_vinculado_em && (
                  <p className="text-[11px] text-[var(--muted)] mt-1">
                    Víncio registrado em {formatDate(detail.fornecedor_vinculado_em.slice(0, 10))}
                  </p>
                )}
                {(() => {
                  const pode = podeTrocarFornecedorAgora(
                    detail.fornecedor_vinculado_em ?? null,
                    Boolean(detail.fornecedor_desvinculo_liberado),
                    false
                  );
                  const min = dataMinimaTrocaFornecedor(detail.fornecedor_vinculado_em ?? null);
                  if (detail.fornecedor_desvinculo_liberado) {
                    return (
                      <p className="text-[11px] text-amber-800 dark:text-amber-300 mt-2 font-medium">
                        Liberação antecipada ativa — pode trocar ou desvincular o armazém pelo painel (com registro interno).
                      </p>
                    );
                  }
                  if (!pode && min) {
                    return (
                      <p className="text-[11px] text-[var(--muted)] mt-2">
                        Regra: {MESES_MINIMOS_COM_FORNECEDOR} meses com o armazém atual após cada víncio ou troca (evita pinga-pinga). Liberação na plataforma a partir de{" "}
                        <span className="font-semibold text-[var(--foreground)]">{formatDate(min.toISOString().slice(0, 10))}</span>; infração comprovada → opções em Editar.
                      </p>
                    );
                  }
                  return (
                    <p className="text-[11px] text-emerald-800 dark:text-emerald-300 mt-2">
                      Período mínimo já cumprido — pode alterar o armazém vinculado.
                    </p>
                  );
                })()}
              </div>
            )}

            {inviteLink && (
              <div className="p-4 border border-[var(--info)] rounded-[var(--radius)] bg-[var(--info)]/8 mb-4">
                <div className="text-[13px] font-semibold text-[var(--info)] mb-2">Link de acesso gerado!</div>
                <div className="text-xs text-[var(--muted)] mb-2">Envie este link ao seller. Válido por 7 dias, uso único.</div>
                <div className="font-mono text-xs bg-[var(--info)]/12 p-2 rounded-[var(--radius-sm)] break-all mb-2">
                  {inviteLink}
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => { navigator.clipboard.writeText(inviteLink); }}
                  className="border-[var(--info)] text-[var(--info)]"
                >
                  Copiar link
                </Button>
              </div>
            )}
            {(detail.email || detail.telefone || detail.cep || detail.endereco || detail.nome_responsavel || (detail as any).cpf_responsavel || detail.data_nascimento) && (
              <div className="p-5 border border-[var(--card-border)] rounded-[var(--radius)] bg-[var(--card)] mb-4 shadow-[var(--shadow-card)]">
                <h3 className="text-sm font-semibold mb-2 text-[var(--foreground)]">Dados de contato</h3>
                <div className="text-[13px] grid gap-1.5">
                  {detail.email && <div>E-mail: {detail.email}</div>}
                  {detail.telefone && <div>Telefone: {detail.telefone}</div>}
                  {detail.cep && <div>CEP: {detail.cep}</div>}
                  {detail.endereco && <div>Endereço: {detail.endereco}</div>}
                  {detail.nome_responsavel && <div>Responsável: {detail.nome_responsavel}</div>}
                  {(detail as any).cpf_responsavel && <div>CPF do responsável: {(detail as any).cpf_responsavel}</div>}
                  {detail.data_nascimento && <div>Data de nascimento: {formatDate(detail.data_nascimento)}</div>}
                </div>
              </div>
            )}
            {(detail.nome_banco || detail.nome_no_banco || detail.agencia || detail.conta || detail.tipo_conta) && (
              <div className="p-5 border border-[var(--card-border)] rounded-[var(--radius)] bg-[var(--card)] mb-4 shadow-[var(--shadow-card)]">
                <h3 className="text-sm font-semibold mb-2 text-[var(--foreground)]">Dados bancários</h3>
                <div className="text-[13px] grid gap-1.5">
                  {detail.nome_banco && <div>Banco: {detail.nome_banco}</div>}
                  {detail.nome_no_banco && <div>Nome no banco: {detail.nome_no_banco}</div>}
                  {(detail.agencia || detail.conta) && <div>Agência: {detail.agencia || "—"} · Conta: {detail.conta || "—"}</div>}
                  {detail.tipo_conta && <div>Tipo: {detail.tipo_conta}</div>}
                </div>
              </div>
            )}
            <div className="p-4 border border-[var(--card-border)] rounded-[var(--radius)] bg-[var(--background)]">
              <h3 className="text-sm font-semibold mb-2 text-[var(--foreground)]">Extrato (movimentações)</h3>
              {detail.movimentacoes.length === 0 ? (
                <div className="text-[13px] text-[var(--muted)]">Nenhuma movimentação ainda.</div>
              ) : (
                <div className="dropcore-scroll-x -mx-1">
                <table className="w-full text-[13px] border-collapse min-w-[320px]">
                  <thead>
                    <tr className="border-b border-[var(--card-border)] text-left">
                      <th className="py-1.5 px-2">Data</th>
                      <th className="py-1.5 px-2">Tipo</th>
                      <th className="py-1.5 px-2">Valor</th>
                      <th className="py-1.5 px-2">Motivo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.movimentacoes.map((m) => (
                      <tr key={m.id} className="border-b border-[var(--card-border)]/50">
                        <td className="py-1.5 px-2">{formatDate(m.criado_em)}</td>
                        <td className="py-1.5 px-2">{m.tipo}</td>
                        <td className={`py-1.5 px-2 ${m.tipo === "credito" ? "text-[var(--success)]" : "text-[var(--danger)]"}`}>
                          {m.tipo === "credito" ? "+" : "-"} {formatMoney(m.valor)}
                        </td>
                        <td className="py-1.5 px-2 text-[var(--muted)]">{m.motivo || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              )}
            </div>
          </>
        )}
        {modal === "credit" && (() => {
          const valorNum = parseFloat(creditValor.replace(",", "."));
          const valorValido = Number.isFinite(valorNum) && valorNum >= MINIMO_CREDITO;
          const mostraErroMinimo = creditValor.trim() !== "" && (!Number.isFinite(valorNum) || valorNum < MINIMO_CREDITO);
          return (
          <div style={modalOverlay}>
            <div style={modalBox}>
              <h3 className="mb-3 text-lg">Adicionar crédito</h3>
              <p className="text-xs text-[var(--muted)] mb-3">Valor mínimo: R$ 500,00. Pagamento apenas via PIX.</p>
              <div className="mb-2">
                <label className="block text-xs text-[var(--muted)] mb-1">Valor (R$)</label>
                <input type="text" value={creditValor} onChange={(e) => setCreditValor(e.target.value)} placeholder="Ex: 500" className="w-full u-input box-border" />
                {mostraErroMinimo && (
                  <p className="text-xs text-[var(--danger)] mt-1.5">Valor mínimo permitido: R$ 500,00</p>
                )}
              </div>
              {valorValido && (
                <div className="mb-4 p-3 bg-[var(--background)] rounded-[var(--radius-sm)] border border-[var(--card-border)]">
                  <div className="text-xs font-semibold mb-2 text-[var(--foreground)]">Pagamento via PIX</div>
                  <div className="mb-2.5 p-4 bg-[var(--card)] rounded-[var(--radius-sm)] border-2 border-dashed border-[var(--success)] text-center">
                    <div className="text-[11px] text-[var(--muted)] mb-2">Escaneie o QR Code ou copie a chave PIX</div>
                    <div className="text-lg font-bold text-[var(--success)] mb-2">R$ {creditValor || "0,00"}</div>
                    <div className="w-40 h-40 mx-auto bg-[var(--border-subtle)] rounded-[var(--radius)] flex items-center justify-center border border-[var(--card-border)]">
                      <div className="text-[11px] text-[var(--muted)] text-center">QR Code<br />será gerado aqui</div>
                    </div>
                    <div className="mt-3">
                      <div className="text-[11px] text-[var(--muted)] mb-1">Chave PIX:</div>
                      <div className="text-xs font-mono bg-[var(--border-subtle)] py-1.5 px-2.5 rounded border border-transparent break-all">
                        {pixChave || "chave-pix-exemplo@dropcore.com.br"}
                      </div>
                      <Button variant="secondary" size="sm" onClick={() => navigator.clipboard.writeText(pixChave || "chave-pix-exemplo@dropcore.com.br")} className="mt-2">
                        Copiar chave
                      </Button>
                    </div>
                  </div>
                  <div className="text-[11px] text-[var(--muted)] p-2 bg-[var(--card)] rounded border border-[var(--card-border)]">
                    <strong>Compensação:</strong> Crédito disponível <strong>instantaneamente</strong> após a confirmação do pagamento.
                  </div>
                </div>
              )}

              {error && <div className="text-[var(--danger)] text-[13px] mb-3">{error}</div>}
              <div className="flex gap-2">
                <Button type="button" variant="success" onClick={addCredit} disabled={creditSending || !valorValido}>
                  {creditSending ? "Salvando..." : "Confirmar"}
                </Button>
                <Button variant="secondary" onClick={() => { setModal(null); setCreditValor(""); setPixChave(""); setError(null); }}>
                  Cancelar
                </Button>
              </div>
            </div>
          </div>
          );
        })()}
        {modal === "edit" && (
          <div style={modalOverlay}>
            <div style={modalBox}>
              <h3 className="mb-3 text-lg">Editar seller</h3>
              <div className="mb-3">
                <label className="block text-xs text-[var(--muted)] mb-1">Nome *</label>
                <input type="text" value={editNome} onChange={(e) => setEditNome(e.target.value)} onBlur={() => setEditNome(toTitleCase(editNome))} className="w-full u-input" />
              </div>
              <div className="mb-3">
                <label className="block text-xs text-[var(--muted)] mb-1">CNPJ/CPF</label>
                <input type="text" value={editDocumento} onChange={(e) => setEditDocumento(e.target.value)} className="w-full u-input" />
                <p className="text-[11px] text-[var(--muted)] mt-1 italic">⚠️ O CNPJ deve ser o mesmo da conta do marketplace do seller.</p>
              </div>
              <div className="mb-3">
                <label className="block text-xs text-[var(--muted)] mb-1">Fornecedor conectado</label>
                <select
                  value={editFornecedorId}
                  onChange={(e) => setEditFornecedorId(e.target.value)}
                  className="w-full u-input"
                >
                  <option value="">Nenhum (seller escolhe na calculadora)</option>
                  {fornecedores.map((f) => (
                    <option key={f.id} value={f.id}>{f.nome}</option>
                  ))}
                </select>
                <p className="text-[11px] text-[var(--muted)] mt-1">Ex: Djulios — catálogo e ERP usam este armazém.</p>
                {(editFornecedorId.trim() || detail?.fornecedor_id) && (
                  <div className="mt-3 space-y-2 rounded-lg border border-[var(--card-border)] bg-[var(--background)] p-3">
                    <p className="text-[11px] text-[var(--muted)] leading-relaxed">
                      Com tudo certo entre as partes, o seller fica pelo menos <strong>{MESES_MINIMOS_COM_FORNECEDOR} meses</strong> com o armazém atual após cada víncio ou troca. Para exceção (infração, pedidos errados), use as opções abaixo.
                    </p>
                    <label className="flex cursor-pointer items-start gap-2 text-[12px] text-[var(--foreground)]">
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={editFornecedorLiberado}
                        onChange={(e) => setEditFornecedorLiberado(e.target.checked)}
                      />
                      <span>Liberar troca / desvinculação antes do prazo (infração comprovada)</span>
                    </label>
                    <label className="flex cursor-pointer items-start gap-2 text-[12px] text-[var(--foreground)]">
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={editConfirmarTrocaAntesPrazo}
                        onChange={(e) => setEditConfirmarTrocaAntesPrazo(e.target.checked)}
                      />
                      <span>Confirmo exceção documentada (troca antes do prazo neste salvamento)</span>
                    </label>
                  </div>
                )}
              </div>
              <div className="mb-3">
                <label className="block text-xs text-[var(--muted)] mb-1">Plano</label>
                <select value={editPlano} onChange={(e) => setEditPlano(e.target.value)} className="w-full u-input">
                  <option value="">—</option>
                  <option value="Starter">Starter</option>
                  <option value="Pro">Pro</option>
                </select>
              </div>
              <div className="mb-4">
                <label className="block text-xs text-[var(--muted)] mb-1">Status</label>
                <select value={editStatus} onChange={(e) => setEditStatus(e.target.value)} className="w-full u-input">
                  <option value="ativo">Ativo</option>
                  <option value="inativo">Inativo</option>
                  <option value="bloqueado">Bloqueado</option>
                </select>
              </div>
              {error && <div className="text-[var(--danger)] text-[13px] mb-3">{error}</div>}
              <div className="flex gap-2">
                <Button type="button" variant="success" onClick={editSeller} disabled={editSending}>
                  {editSending ? "Salvando..." : "Salvar"}
                </Button>
                <Button variant="secondary" onClick={() => { setModal(null); setError(null); }}>
                  Cancelar
                </Button>
              </div>
            </div>
          </div>
        )}
        {deleteConfirm && (
          <div style={modalOverlay}>
            <div style={modalBox}>
              <h3 className="mb-3 text-lg">Excluir seller?</h3>
              <p className="text-sm text-[var(--muted)] mb-5">As movimentações serão excluídas. Essa ação não pode ser desfeita.</p>
              {error && <div className="text-[var(--danger)] text-[13px] mb-3">{error}</div>}
              <div className="flex gap-2">
                <Button type="button" variant="danger" onClick={deleteSeller} disabled={deleteSending}>
                  {deleteSending ? "Excluindo..." : "Excluir"}
                </Button>
                <Button variant="secondary" onClick={() => { setDeleteConfirm(false); setError(null); }} disabled={deleteSending}>
                  Cancelar
                </Button>
              </div>
            </div>
          </div>
        )}
      </PageLayout>
    );
  }

  return (
    <PageLayout maxWidth="md">
      <DashboardHeader href="/dashboard" onLogout={() => router.push("/login")} />
      <h1 className="text-2xl font-semibold mb-2 text-[var(--foreground)]">Sellers</h1>
      <p className="text-[var(--muted)] mb-5 text-sm">
        Cadastre sellers só com nome interno; CNPJ, contato, endereço e plano (Starter ou Pro) o seller escolhe no painel (Cadastro), após o convite.
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
        <Button variant="success" onClick={() => setModal("new")}>
          + Novo Seller
        </Button>
      </div>

      {loading && <div>Carregando...</div>}
      {!loading && sellers.length === 0 && !error && <div className="p-6 bg-[var(--background)] rounded-[var(--radius)] text-[var(--muted)]">Nenhum seller cadastrado. Clique em + Novo Seller.</div>}

      {!loading && sellers.length > 0 && (
        <div className="flex flex-col gap-2">
          {sellers.map((s) => (
            <div
              key={s.id}
              onClick={() => setSelectedId(s.id)}
              className="py-3.5 px-4 border border-[var(--card-border)] rounded-[var(--radius)] bg-[var(--card)] cursor-pointer hover:opacity-90 transition-opacity"
            >
              <div className="font-semibold text-[var(--foreground)]">{s.nome || "Sem nome"}</div>
              <div className="text-[13px] text-[var(--muted)] mt-1">
                {s.documento && `${s.documento} · `}
                Saldo: {formatMoney(s.saldo_atual)} · Status: {s.status}
                {sellerCadastroPendente(s.documento, s.plano) && (
                  <span className="text-amber-700 dark:text-amber-400"> · Cadastro / plano pendente</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-6">
        <Button variant="secondary" onClick={() => router.push("/dashboard")}>
          Voltar ao Dashboard
        </Button>
      </div>

      {modal === "new" && (
        <div style={modalOverlay} role="dialog" aria-modal="true" aria-labelledby="modal-new-seller-title">
          <div className="flex flex-col max-w-[420px] max-h-[90vh] rounded-[var(--radius)] border border-[var(--card-border)] bg-[var(--card)] p-5 w-[calc(100%-32px)] shadow-[var(--shadow-card)]">
            <h3 id="modal-new-seller-title" className="mb-3 shrink-0 text-lg">Novo Seller</h3>
            <div className="overflow-y-auto flex-1 mb-4">
              <p className="text-[12px] text-[var(--muted)] mb-3 leading-relaxed">
                Crie só com identificação interna (nome). O seller preenche CNPJ ou CPF, e-mail, endereço e escolhe o plano (Starter ou Pro) no painel após aceitar o convite.
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
                  setModal(null);
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
