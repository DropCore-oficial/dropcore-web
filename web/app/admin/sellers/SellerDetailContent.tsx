"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { Button, PageLayout } from "@/components/ui";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { toTitleCase } from "@/lib/formatText";
import { MESES_MINIMOS_COM_FORNECEDOR, dataMinimaTrocaFornecedor, podeTrocarFornecedorAgora } from "@/lib/sellerFornecedorVinculo";
import { sellerCadastroPendente } from "@/lib/sellerDocumento";
import { AMBER_PREMIUM_TEXT_SOFT } from "@/lib/amberPremium";
import { DANGER_PREMIUM_SHELL, DANGER_PREMIUM_TEXT_PRIMARY } from "@/lib/semanticPremium";
import { cn } from "@/lib/utils";
import { MODAL_OVERLAY_CLASS, MODAL_PANEL_CLASS, MODAL_PANEL_BODY_CLASS } from "@/lib/modalOverlay";
import { AbaPilula } from "@/components/seller/GestorAvulsoAbaPilula";
import {
  calcularValorMensalSellerPlano,
  SELLER_PLANO_CICLO_CARENCIA_DIAS,
  type SellerPlanoCiclo,
  type SellerPlanoDescontoTipo,
} from "@/lib/sellerPlanoCicloDesconto";
import { VALOR_DEFAULT_MENSALIDADE_SELLER, VALOR_DEFAULT_MENSALIDADE_SELLER_PRO } from "@/lib/sellerPlanoPrecos";

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const hojeIso = new Date().toISOString().slice(0, 10);

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
  mensalidade_dia_vencimento?: number | null;
  plano_ciclo?: string | null;
  plano_ciclo_carencia_fim?: string | null;
  plano_desconto_tipo?: string | null;
  plano_desconto_valor?: number | null;
  plano_ciclo_valor_travado?: number | null;
  plano_ciclo_compromisso_fim?: string | null;
};

type SellerComMov = Seller & {
  movimentacoes: { id: string; tipo: string; valor: number; motivo: string | null; referencia: string | null; criado_em: string }[];
};

// Padrão de modais (usa tokens globais)
const modalOverlay: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 };
const modalBox: React.CSSProperties = {
  background: "var(--card)",
  padding: 24,
  borderRadius: 8,
  maxWidth: 380,
  width: "calc(100% - 32px)",
  maxHeight: "min(90dvh, calc(100vh - 2rem))",
  overflowY: "auto",
  boxShadow: "var(--shadow-card)",
  border: "1px solid var(--border-subtle)",
};

export function SellerDetailContent({ sellerId }: { sellerId: string }) {
  const router = useRouter();
  const [orgId, setOrgId] = useState<string | null>(null);
  const [orgLoading, setOrgLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<SellerComMov | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [modal, setModal] = useState<"credit" | "edit" | "planoCiclo" | null>(null);
  const [planoCicloPlanoSel, setPlanoCicloPlanoSel] = useState<"starter" | "pro">("starter");
  const [planoCicloSel, setPlanoCicloSel] = useState<SellerPlanoCiclo>("mensal");
  const [planoCicloDescontoTipoSel, setPlanoCicloDescontoTipoSel] = useState<"cheio" | SellerPlanoDescontoTipo>("cheio");
  const [planoCicloDescontoValorInput, setPlanoCicloDescontoValorInput] = useState("");
  const [planoCicloSending, setPlanoCicloSending] = useState(false);
  const [creditValor, setCreditValor] = useState("");
  const [creditSending, setCreditSending] = useState(false);
  const [pixChave, setPixChave] = useState("");
  const [editNome, setEditNome] = useState("");
  const [editDocumento, setEditDocumento] = useState("");
  const [editStatus, setEditStatus] = useState("");
  const [editSending, setEditSending] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteSending, setDeleteSending] = useState(false);
  const [inviteConviteErro, setInviteConviteErro] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [invitePortalTrialDiasGerado, setInvitePortalTrialDiasGerado] = useState<number | null>(null);
  const [inviteValidadeDiasStr, setInviteValidadeDiasStr] = useState("7");
  const [sellerConviteLinkCopiado, setSellerConviteLinkCopiado] = useState(false);
  const [sellerConviteCopiarErro, setSellerConviteCopiarErro] = useState<string | null>(null);
  const [inviteSending, setInviteSending] = useState(false);
  const [fornecedores, setFornecedores] = useState<{ id: string; nome: string }[]>([]);
  const [editFornecedorId, setEditFornecedorId] = useState("");
  const [editFornecedorLiberado, setEditFornecedorLiberado] = useState(false);
  const [editConfirmarTrocaAntesPrazo, setEditConfirmarTrocaAntesPrazo] = useState(false);
  const [editMensalidadeDiaStr, setEditMensalidadeDiaStr] = useState("");

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
    if (!sellerId || !orgId) return;
    setDetailLoading(true);
    setDetail(null);
    setInviteLink(null);
    setInvitePortalTrialDiasGerado(null);
    setInviteConviteErro(null);
    setSellerConviteLinkCopiado(false);
    setSellerConviteCopiarErro(null);
    setInviteValidadeDiasStr("7");
    (async () => {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch(`/api/org/sellers/${sellerId}`, {
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
  }, [sellerId, orgId]);

  async function addCredit() {
    if (!sellerId || !creditValor.trim()) {
      setError("Valor é obrigatório.");
      return;
    }
    const valor = parseFloat(creditValor.replace(",", "."));
    if (!Number.isFinite(valor) || valor <= 0) {
      setError("Valor inválido.");
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
      
      const res = await fetch(`/api/org/sellers/${sellerId}/deposito-pix`, {
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

  async function editSeller() {
    if (!sellerId || !editNome.trim()) return;
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
        status: editStatus || "ativo",
      };
      const diaTrim = editMensalidadeDiaStr.trim();
      if (diaTrim === "") {
        patchBody.mensalidade_dia_vencimento = null;
      } else {
        const n = parseInt(diaTrim, 10);
        if (!Number.isFinite(n) || n < 1 || n > 28) {
          setError("Dia de vencimento da mensalidade: use um número de 1 a 28, ou deixe vazio para o padrão (dia 10).");
          setEditSending(false);
          return;
        }
        patchBody.mensalidade_dia_vencimento = n;
      }
      if (fornecedorMudou) {
        patchBody.fornecedor_id = novoForn;
        patchBody.fornecedor_desvinculo_liberado = editFornecedorLiberado;
        patchBody.confirmar_troca_fornecedor_antes_prazo = editConfirmarTrocaAntesPrazo;
      } else if (liberadoMudou) {
        patchBody.fornecedor_desvinculo_liberado = editFornecedorLiberado;
      }
      const res = await fetch(`/api/org/sellers/${sellerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify(patchBody),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Erro");
      if (detail) setDetail({ ...detail, ...json });
      setModal(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setEditSending(false);
    }
  }

  const planoCicloValorCheio = planoCicloPlanoSel === "pro" ? VALOR_DEFAULT_MENSALIDADE_SELLER_PRO : VALOR_DEFAULT_MENSALIDADE_SELLER;
  const planoCicloDescontoPreview =
    planoCicloDescontoTipoSel === "cheio"
      ? planoCicloValorCheio
      : calcularValorMensalSellerPlano(
          planoCicloValorCheio,
          planoCicloDescontoTipoSel,
          Number(planoCicloDescontoValorInput.replace(",", ".")) || null
        );

  async function salvarPlanoCiclo() {
    setPlanoCicloSending(true);
    setError(null);
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) return;
      let descontoValor: number | null = null;
      if (planoCicloDescontoTipoSel !== "cheio") {
        descontoValor = Number(planoCicloDescontoValorInput.replace(",", "."));
        if (!Number.isFinite(descontoValor) || descontoValor <= 0) {
          setError("Informe um valor de desconto maior que zero.");
          setPlanoCicloSending(false);
          return;
        }
        if (planoCicloDescontoTipoSel === "percentual" && descontoValor > 100) {
          setError("Desconto percentual não pode passar de 100%.");
          setPlanoCicloSending(false);
          return;
        }
      }
      const res = await fetch(`/api/org/sellers/${sellerId}/plano-ciclo`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          plano: planoCicloPlanoSel,
          ciclo: planoCicloSel,
          desconto_tipo: planoCicloDescontoTipoSel === "cheio" ? null : planoCicloDescontoTipoSel,
          desconto_valor: descontoValor,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Erro");
      if (detail && json?.seller) setDetail({ ...detail, ...json.seller });
      setModal(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setPlanoCicloSending(false);
    }
  }

  const mailtoSellerConviteHref = useMemo(() => {
    if (!inviteLink || !detail) return "";
    const subject = encodeURIComponent(`Convite — painel seller DropCore (${detail.nome})`);
    const body = encodeURIComponent(
      `Olá,\n\nSegue o link para criar acesso ao painel seller DropCore:\n\n${inviteLink}\n\nAtenciosamente,`,
    );
    const toRaw = detail.email?.trim();
    const to = toRaw ? encodeURIComponent(toRaw) : "";
    return `mailto:${to}?subject=${subject}&body=${body}`;
  }, [inviteLink, detail?.email, detail?.nome]);

  async function copiarLinkSellerConvite() {
    setSellerConviteCopiarErro(null);
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setSellerConviteLinkCopiado(true);
      window.setTimeout(() => setSellerConviteLinkCopiado(false), 2500);
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = inviteLink;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        setSellerConviteLinkCopiado(true);
        window.setTimeout(() => setSellerConviteLinkCopiado(false), 2500);
      } catch {
        setSellerConviteCopiarErro("Não foi possível copiar. Selecione o link acima manualmente.");
      }
    }
  }

  async function gerarConvite() {
    if (!sellerId) return;
    const diasNum = Number(inviteValidadeDiasStr);
    if (!inviteValidadeDiasStr.trim() || !Number.isFinite(diasNum) || diasNum < 0 || diasNum > 365) {
      setInviteConviteErro("Informe os dias de acesso no painel (0 a 365). Use 0 para não dar teste grátis.");
      return;
    }
    const portalTrialDias = Math.floor(diasNum);
    setInviteSending(true);
    setInviteLink(null);
    setInvitePortalTrialDiasGerado(null);
    setSellerConviteCopiarErro(null);
    setSellerConviteLinkCopiado(false);
    setInviteConviteErro(null);
    setError(null);
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch(`/api/org/sellers/${sellerId}/invite`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ portal_trial_dias: portalTrialDias }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Erro ao gerar convite");
      setInviteLink(json.link);
      setInvitePortalTrialDiasGerado(typeof json.portal_trial_dias === "number" ? json.portal_trial_dias : portalTrialDias);
      setInviteConviteErro(null);
    } catch (e: unknown) {
      setInviteConviteErro(e instanceof Error ? e.message : "Erro ao gerar convite");
    } finally {
      setInviteSending(false);
    }
  }

  async function deleteSeller() {
    if (!sellerId) return;
    setDeleteSending(true);
    setError(null);
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch(`/api/org/sellers/${sellerId}`, { method: "DELETE", headers: { Authorization: `Bearer ${session.access_token}` } });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Erro ao excluir");
      setDeleteConfirm(false);
      router.replace("/admin/sellers");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao excluir");
    } finally {
      setDeleteSending(false);
    }
  }

  const formatMoney = (n: number) => `R$ ${Number(n).toFixed(2).replace(".", ",")}`;
  const formatDate = (s: string | null) => (s ? new Date(s).toLocaleDateString("pt-BR") : "—");

  if (orgLoading) {
    return (
      <PageLayout maxWidth="md">
        <div className="text-[var(--muted)]">Carregando...</div>
      </PageLayout>
    );
  }
  if (!orgId) return null;

  return (
    <PageLayout maxWidth="md">
      <AdminPageHeader
        eyebrow="Operação"
        title={detail?.nome ?? "Seller"}
        backHref="/admin/sellers"
      />
        {detailLoading && <div>Carregando...</div>}
        {detail && !detailLoading && (
          <>
            <div className="p-5 border border-[var(--card-border)] rounded-[var(--radius)] bg-[var(--card)] mb-4 shadow-[var(--shadow-card)]">
              <h2 className="text-lg font-semibold mb-3 text-[var(--foreground)]">{detail.nome}</h2>
              <div className="text-[13px] text-[var(--muted)]">
                Documento: {detail.documento || "—"} · Plano: {detail.plano || "—"} · Status: {detail.status}
              </div>
              {sellerCadastroPendente(detail.documento, detail.plano) && (
                <p className={cn("text-[12px] mt-2 leading-relaxed", AMBER_PREMIUM_TEXT_SOFT)}>
                  O seller ainda não concluiu dados comerciais, CNPJ/CPF, endereço ou escolha de plano no painel. Gere o convite para ele acessar e preencher em Cadastro.
                </p>
              )}
              <div className="text-[13px] mt-2">
                Data entrada: {formatDate(detail.data_entrada)}
              </div>
              <div className="text-[13px] mt-1 text-[var(--muted)]">
                Mensalidade — vence todo dia{" "}
                <span className="font-medium text-[var(--foreground)]">
                  {detail.mensalidade_dia_vencimento != null ? detail.mensalidade_dia_vencimento : "10 (padrão legado)"}
                </span>{" "}
                de cada mês (novas linhas geradas pelo admin ou pelo cron).
              </div>
              <div className="text-[13px] mt-1 text-[var(--muted)]">
                Ciclo:{" "}
                <span className="font-medium text-[var(--foreground)]">
                  {detail.plano_ciclo === "semestral" ? "Semestral" : detail.plano_ciclo === "anual" ? "Anual" : "Mensal"}
                </span>
                {detail.plano_ciclo_carencia_fim && (
                  <>
                    {" "}
                    ·{" "}
                    {detail.plano_ciclo_carencia_fim >= hojeIso
                      ? `em carência até ${formatDate(detail.plano_ciclo_carencia_fim)}`
                      : `carência terminou em ${formatDate(detail.plano_ciclo_carencia_fim)}`}
                  </>
                )}
                {detail.plano_desconto_tipo && (
                  <>
                    {" "}
                    · Desconto:{" "}
                    {detail.plano_desconto_tipo === "percentual"
                      ? `${detail.plano_desconto_valor ?? 0}%`
                      : BRL.format(Number(detail.plano_desconto_valor ?? 0))}
                  </>
                )}
                {detail.plano_ciclo_valor_travado != null && detail.plano_ciclo_compromisso_fim && (
                  <>
                    {" "}
                    · Preço travado em {BRL.format(Number(detail.plano_ciclo_valor_travado))}
                    {detail.plano_ciclo_compromisso_fim >= hojeIso
                      ? ` até ${formatDate(detail.plano_ciclo_compromisso_fim)} (reajuste de tabela não pega durante o compromisso)`
                      : ` — compromisso terminou em ${formatDate(detail.plano_ciclo_compromisso_fim)}, já acompanha a tabela`}
                  </>
                )}
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
                    const planoLc = String(detail.plano ?? "").trim().toLowerCase();
                    setPlanoCicloPlanoSel(planoLc === "pro" ? "pro" : "starter");
                    const cicloAtual = detail.plano_ciclo;
                    setPlanoCicloSel(cicloAtual === "semestral" || cicloAtual === "anual" ? cicloAtual : "mensal");
                    setPlanoCicloDescontoTipoSel(
                      detail.plano_desconto_tipo === "valor" || detail.plano_desconto_tipo === "percentual"
                        ? detail.plano_desconto_tipo
                        : "cheio"
                    );
                    setPlanoCicloDescontoValorInput(
                      detail.plano_desconto_valor != null ? String(detail.plano_desconto_valor) : ""
                    );
                    setModal("planoCiclo");
                  }}
                >
                  Plano, ciclo e desconto
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setError(null);
                    setEditNome(detail.nome);
                    setEditDocumento(detail.documento ?? "");
                    setEditStatus(detail.status);
                    setEditFornecedorId(detail.fornecedor_id ?? "");
                    setEditFornecedorLiberado(Boolean(detail.fornecedor_desvinculo_liberado));
                    setEditConfirmarTrocaAntesPrazo(false);
                    setEditMensalidadeDiaStr(
                      detail.mensalidade_dia_vencimento != null ? String(detail.mensalidade_dia_vencimento) : "",
                    );
                    setModal("edit");
                  }}
                >
                  Editar
                </Button>
                <Button variant="danger" onClick={() => setDeleteConfirm(true)}>
                  Excluir
                </Button>
              </div>
            </div>

            <section className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-6 shadow-sm mb-4">
              <h3 className="text-lg font-semibold mb-1 text-[var(--foreground)]">Convite — painel seller</h3>
              <p className="text-sm text-[var(--muted)] mb-5">
                Gere um link para o seller criar login no DropCore. O link expira em 7 dias (uso único). &quot;Dias de acesso&quot; =
                teste grátis da mensalidade no painel após aceitar (igual ao fluxo da calculadora; use 0 para não dar período grátis).
              </p>
              <div className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                <div className="space-y-4">
                  <div className="max-w-[180px]">
                    <label className="block text-xs text-[var(--muted)] mb-1.5" htmlFor="seller-convite-dias">
                      Dias de acesso
                    </label>
                    <input
                      id="seller-convite-dias"
                      type="number"
                      min={0}
                      max={365}
                      value={inviteValidadeDiasStr}
                      onChange={(e) => setInviteValidadeDiasStr(e.target.value)}
                      className="w-full rounded-xl bg-[var(--card)] border border-[var(--card-border)] px-3 py-2.5 text-sm text-[var(--foreground)] placeholder-[var(--muted)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]/50"
                    />
                    <p className="mt-1 text-[11px] text-[var(--muted)]">
                      Padrão: 7 dias (teste no painel). Use 0 para não dar período grátis. Máximo: 365 dias.
                    </p>
                  </div>
                </div>
                <div className="flex flex-col justify-between gap-4">
                  <button
                    type="button"
                    onClick={() => {
                      setInviteLink(null);
                      setInvitePortalTrialDiasGerado(null);
                      setInviteConviteErro(null);
                      void gerarConvite();
                    }}
                    disabled={inviteSending}
                    className="w-full rounded-md bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-2.5 py-1.5 text-[11px] shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {inviteSending ? "Gerando link..." : "Gerar link de convite"}
                  </button>
                  {inviteConviteErro && (
                    <div className={cn("rounded-xl px-3 py-2 text-xs", DANGER_PREMIUM_SHELL, DANGER_PREMIUM_TEXT_PRIMARY)}>
                      {inviteConviteErro}
                    </div>
                  )}
                </div>
              </div>
            </section>

            {inviteLink && (
              <section className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-6 shadow-sm mb-4 space-y-3">
                <h3 className="text-sm font-semibold text-[var(--foreground)]">Último convite gerado</h3>
                <div className="space-y-2 text-xs text-[var(--muted)]">
                  <div>
                    <span className="font-semibold text-[var(--foreground)]">Dias de acesso (painel): </span>
                    {invitePortalTrialDiasGerado === null
                      ? "—"
                      : invitePortalTrialDiasGerado === 0
                        ? "0 (sem teste grátis)"
                        : `${invitePortalTrialDiasGerado} dia(s)`}
                  </div>
                  <div>
                    <span className="font-semibold text-[var(--foreground)]">Link: </span>
                    <a href={inviteLink} target="_blank" rel="noreferrer" className="break-all text-[var(--accent)] hover:underline">
                      {inviteLink}
                    </a>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => void copiarLinkSellerConvite()}
                      className="rounded-md border border-[var(--card-border)] bg-[var(--card)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--foreground)] hover:bg-[var(--muted)]/10 touch-manipulation"
                    >
                      {sellerConviteLinkCopiado ? "Copiado!" : "Copiar link"}
                    </button>
                    <a
                      href={mailtoSellerConviteHref}
                      className="inline-flex items-center justify-center rounded-md bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1.5 text-[11px] font-semibold shadow-sm touch-manipulation"
                    >
                      {detail.email?.trim() ? "Abrir e-mail para o seller" : "Abrir rascunho de e-mail"}
                    </a>
                  </div>
                  {sellerConviteCopiarErro && (
                    <p className="text-[11px] text-red-600 dark:text-red-400">{sellerConviteCopiarErro}</p>
                  )}
                  <p className="text-[11px] text-[var(--muted)] max-w-xl">
                    O botão verde abre o seu programa de e-mail com o texto e o link prontos
                    {detail.email?.trim() ? " e o destinatário preenchido" : ""}. O envio sai do seu e-mail, não dos servidores DropCore.
                  </p>
                </div>
              </section>
            )}

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
                      <p className={cn("text-[11px] mt-2 font-medium", AMBER_PREMIUM_TEXT_SOFT)}>
                        Liberação antecipada ativa — pode trocar ou desvincular o armazém pelo painel (com registro interno).
                      </p>
                    );
                  }
                  if (!pode && min) {
                    return (
                      <p className="text-[11px] text-[var(--muted)] mt-2">
                        Regra: {MESES_MINIMOS_COM_FORNECEDOR} meses com o armazém atual após cada vínculo ou troca (evita pinga-pinga). Liberação na plataforma a partir de{" "}
                        <span className="font-semibold text-[var(--foreground)]">{formatDate(min.toISOString().slice(0, 10))}</span>; infração comprovada → opções em Editar.
                      </p>
                    );
                  }
                  return (
                    <p className="text-[11px] text-emerald-900 dark:text-emerald-300 mt-2">
                      Período mínimo já cumprido — pode alterar o armazém vinculado.
                    </p>
                  );
                })()}
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
            <div className="p-4 border border-[var(--card-border)] rounded-[var(--radius)] bg-[var(--card)]">
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
          const valorValido = Number.isFinite(valorNum) && valorNum > 0;
          return (
          <div style={modalOverlay}>
            <div style={modalBox}>
              <h3 className="mb-3 text-lg">Adicionar crédito</h3>
              <p className="text-xs text-[var(--muted)] mb-3">Admin pode lançar qualquer valor. Pagamento apenas via PIX.</p>
              <div className="mb-2">
                <label className="block text-xs text-[var(--muted)] mb-1">Valor (R$)</label>
                <input type="text" value={creditValor} onChange={(e) => setCreditValor(e.target.value)} placeholder="Ex: 500" className="w-full u-input box-border" />
              </div>
              {valorValido && (
                <div className="mb-4 p-3 bg-[var(--surface-subtle)] rounded-[var(--radius-sm)] border border-[var(--card-border)]">
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
                  <div className="mt-3 space-y-2 rounded-lg border border-[var(--card-border)] bg-[var(--surface-subtle)] p-3">
                    <p className="text-[11px] text-[var(--muted)] leading-relaxed">
                      Com tudo certo entre as partes, o seller fica pelo menos <strong>{MESES_MINIMOS_COM_FORNECEDOR} meses</strong> com o armazém atual após cada vínculo ou troca. Para exceção (infração, pedidos errados), use as opções abaixo.
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
                <label className="block text-xs text-[var(--muted)] mb-1">Dia vencimento mensalidade (1–28)</label>
                <input
                  type="number"
                  min={1}
                  max={28}
                  value={editMensalidadeDiaStr}
                  onChange={(e) => setEditMensalidadeDiaStr(e.target.value)}
                  placeholder="Vazio = dia 10"
                  className="w-full u-input"
                />
                <p className="text-[11px] text-[var(--muted)] mt-1 leading-relaxed">
                  Vazio = padrão legado (dia 10 ao gerar ciclos). Com valor, cada mês civil vence nesse dia. Linhas já criadas não mudam sozinhas — gere de novo o mês no admin se precisar alinhar.
                </p>
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
        {modal === "planoCiclo" && (
          <div className={MODAL_OVERLAY_CLASS} role="dialog" aria-modal="true">
            <div className={cn(MODAL_PANEL_CLASS, "max-w-[640px]")}>
              <div className="shrink-0 p-5 pb-0">
                <h3 className="mb-1 text-lg">Plano, ciclo e desconto</h3>
                <p className="text-[12px] leading-relaxed text-[var(--muted)]">
                  Ciclo não muda o valor da parcela — só define a carência (meses grátis) antes da 1ª cobrança.
                  Desconto é manual, aplicado sobre o valor de tabela do plano escolhido. No Semestral/Anual, o valor
                  calculado agora fica travado até o fim do compromisso — reajuste de tabela nesse meio tempo não
                  pega esse seller.
                </p>
              </div>
              <div className={cn(MODAL_PANEL_BODY_CLASS, "space-y-4 p-5 pt-4")}>
              <div>
                <label className="mb-1.5 block text-xs text-[var(--muted)]">Plano</label>
                <div className="grid grid-cols-2 gap-2">
                  {(["starter", "pro"] as const).map((valor) => {
                    const selecionado = planoCicloPlanoSel === valor;
                    return (
                      <button
                        key={valor}
                        type="button"
                        onClick={() => setPlanoCicloPlanoSel(valor)}
                        className={cn(
                          "rounded-xl border p-3 text-left transition-colors",
                          selecionado
                            ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20"
                            : "border-[var(--card-border)] bg-[var(--card)] hover:border-emerald-300 dark:hover:border-emerald-700"
                        )}
                      >
                        <span className="flex items-center gap-2">
                          <span
                            className={cn(
                              "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2",
                              selecionado ? "border-emerald-600 bg-emerald-600" : "border-[var(--card-border)]"
                            )}
                            aria-hidden
                          >
                            {selecionado && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                          </span>
                          <span className="text-sm font-semibold text-[var(--foreground)]">
                            {valor === "pro" ? "Pro" : "Start"}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs text-[var(--muted)]">Ciclo de compromisso</label>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {(
                    [
                      ["mensal", "Mensal", "Sem compromisso"],
                      ["semestral", "Semestral", `6 parcelas, ${SELLER_PLANO_CICLO_CARENCIA_DIAS.semestral} dias grátis`],
                      ["anual", "Anual", `12 parcelas, ${SELLER_PLANO_CICLO_CARENCIA_DIAS.anual} dias grátis`],
                    ] as const
                  ).map(([valor, titulo, subtitulo]) => {
                    const selecionado = planoCicloSel === valor;
                    return (
                      <button
                        key={valor}
                        type="button"
                        onClick={() => setPlanoCicloSel(valor)}
                        className={cn(
                          "rounded-xl border p-3 text-left transition-colors",
                          selecionado
                            ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20"
                            : "border-[var(--card-border)] bg-[var(--card)] hover:border-emerald-300 dark:hover:border-emerald-700"
                        )}
                      >
                        <span className="flex items-center gap-2">
                          <span
                            className={cn(
                              "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2",
                              selecionado ? "border-emerald-600 bg-emerald-600" : "border-[var(--card-border)]"
                            )}
                            aria-hidden
                          >
                            {selecionado && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                          </span>
                          <span className="text-sm font-semibold text-[var(--foreground)]">{titulo}</span>
                        </span>
                        <p className="mt-1 pl-6 text-xs text-[var(--muted)]">{subtitulo}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <p className="mb-1.5 block text-xs text-[var(--muted)]">Desconto na mensalidade</p>
                <div className="flex flex-wrap gap-1 rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-1">
                  {(
                    [
                      ["cheio", "Preço cheio"],
                      ["valor", "Valor fixo em R$"],
                      ["percentual", "Percentual (%)"],
                    ] as const
                  ).map(([valor, label]) => (
                    <AbaPilula
                      key={valor}
                      ativo={planoCicloDescontoTipoSel === valor}
                      onClick={() => setPlanoCicloDescontoTipoSel(valor)}
                      icon={null}
                    >
                      {label}
                    </AbaPilula>
                  ))}
                </div>
              </div>

              <div className="flex items-stretch gap-2">
                <div className="flex-1 rounded-xl border border-[var(--card-border)] bg-[var(--muted)]/10 px-3 py-2.5">
                  <p className="text-[11px] text-[var(--muted)]">Valor da mensalidade com essa configuração</p>
                  <p className="text-base font-bold text-[var(--foreground)]">{BRL.format(planoCicloDescontoPreview)}</p>
                </div>
                {planoCicloDescontoTipoSel !== "cheio" && (
                  <input
                    type="text"
                    inputMode="decimal"
                    value={planoCicloDescontoValorInput}
                    onChange={(e) => setPlanoCicloDescontoValorInput(e.target.value)}
                    placeholder={planoCicloDescontoTipoSel === "valor" ? "20" : "15"}
                    className="w-24 shrink-0 u-input"
                  />
                )}
              </div>

              {error && <div className="text-[13px] text-[var(--danger)]">{error}</div>}
              </div>

              <div className="flex shrink-0 gap-2 border-t border-[var(--card-border)] p-5 pt-4">
                <Button type="button" variant="success" onClick={salvarPlanoCiclo} disabled={planoCicloSending}>
                  {planoCicloSending ? "Salvando..." : "Salvar"}
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
