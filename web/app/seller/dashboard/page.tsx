"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { SellerNav } from "../SellerNav";
import { NotificationToasts } from "@/components/NotificationToasts";
import { IconTipoExtrato, IconDevolucao, IconArrowRight, IconPlus, IconClipboard, IconDeposito, IconCheck, IconX, IconClock } from "@/components/seller/Icons";
import { planoSellerDefinido } from "@/lib/sellerDocumento";
import {
  nomeExibicaoPlanoSeller,
  SELLER_PLANO_NOME_PRO,
  SELLER_PLANO_NOME_START,
  SELLER_PLANO_OPCOES_LEGIVEL,
} from "@/lib/sellerPlanoLabels";
import { VALOR_DEFAULT_MENSALIDADE_SELLER, VALOR_DEFAULT_MENSALIDADE_SELLER_PRO } from "@/lib/sellerPlanoPrecos";
import {
  AMBER_PREMIUM_SHELL,
  AMBER_PREMIUM_SURFACE,
  AMBER_PREMIUM_SURFACE_TRANSPARENT,
  AMBER_PREMIUM_TEXT_PRIMARY,
} from "@/lib/amberPremium";
import {
  SELLER_SALDO_CRITICO_ACCENT_BAR,
  SELLER_SALDO_CRITICO_BODY,
  SELLER_SALDO_CRITICO_BUTTON,
  SELLER_SALDO_CRITICO_CARD_SURFACE,
  SELLER_SALDO_CRITICO_ICON_STROKE,
  SELLER_SALDO_CRITICO_ICON_WRAP,
  SELLER_SALDO_CRITICO_INNER_PAD,
  SELLER_SALDO_CRITICO_TITLE,
} from "@/lib/dangerSellerSaldoCriticoUi";
import {
  DANGER_PREMIUM_SHELL,
  DANGER_PREMIUM_SURFACE_TRANSPARENT,
  DANGER_PREMIUM_TEXT_PRIMARY,
  DANGER_PREMIUM_TEXT_SOFT,
} from "@/lib/semanticPremium";
import {
  PRIMARY_ACTION_BLUE_OUTLINE_HOVER,
  PRIMARY_ACTION_BLUE_SURFACE_TRANSPARENT,
  PRIMARY_ACTION_BLUE_TEXT_PRIMARY,
} from "@/lib/primaryActionBlueUi";
import { cn } from "@/lib/utils";
import { parseValorMonetarioPtBr } from "@/lib/parseValorMonetarioPtBr";

const SELLER_LEDGER_BADGE_AMBER = cn(AMBER_PREMIUM_SHELL, AMBER_PREMIUM_TEXT_PRIMARY);
const SELLER_LEDGER_BADGE_DANGER = cn(DANGER_PREMIUM_SHELL, DANGER_PREMIUM_TEXT_PRIMARY);

type SellerData = {
  id: string;
  nome: string;
  documento: string | null;
  plano: string | null;
  status: string;
  saldo_atual: number;
  saldo_bloqueado: number;
  saldo_disponivel: number;
  data_entrada: string | null;
  email: string | null;
  logo_url?: string | null;
};

type Kpis = {
  pedidos_mes: number;
  total_mes: number;
};

type SaldoAlerta = {
  nivel: "ok" | "atencao" | "critico";
  saldo_disponivel: number;
  custo_medio_pedido: number | null;
  amostra_pedidos: number;
  pedidos_estimados: number | null;
};

type VinculoFornecedor = {
  ativo: boolean;
  vinculado_em: string | null;
  pode_trocar_a_partir_de: string | null;
  meses_minimos: number;
  dentro_compromisso: boolean;
  liberado_antecipado: boolean;
};

type LedgerEntry = {
  id: string;
  tipo: string;
  valor_total: number;
  status: string;
  data_evento: string;
  referencia: string | null;
  pedido_id: string | null;
  nome_produto: string | null;
  preco_venda: number | null;
  custo: number | null;
  fornecedor_nome: string | null;
};

type Deposito = {
  id: string;
  valor: number;
  status: string;
  criado_em: string;
  aprovado_em: string | null;
};

type Mensalidade = {
  id: string;
  ciclo: string;
  valor: number;
  status: string;
  vencimento_em: string | null;
  vencido: boolean;
};

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function formatDate(s: string) {
  return new Date(s).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatDateTime(s: string) {
  return new Date(s).toLocaleDateString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

/** Mesma regra do fornecedor: em trial ativo → data fim do trial; senão → vencimento da mensalidade. */
function subtituloBannerMensalidade(
  m: Mensalidade,
  trialAtivo: boolean,
  trialValidoAte: string | null
): string {
  if (m.vencido && !trialAtivo) {
    return "Em atraso — regularize para manter o acesso";
  }
  if (trialAtivo && trialValidoAte) {
    const iso = trialValidoAte.length >= 10 ? `${trialValidoAte.slice(0, 10)}T12:00:00` : trialValidoAte;
    const d = new Date(iso);
    if (!Number.isNaN(d.getTime())) {
      return `Teste grátis até ${d.toLocaleDateString("pt-BR", { day: "numeric", month: "short" })}`;
    }
  }
  if (m.vencimento_em) {
    return `Vence em ${new Date(m.vencimento_em + "T12:00:00").toLocaleDateString("pt-BR", { day: "numeric", month: "short" })}`;
  }
  return "Pagamento em aberto";
}

const tipoLabel: Record<string, { label: string }> = {
  CREDITO:   { label: "Depósito recebido" },
  BLOQUEIO:  { label: "Pedido enviado" },
  VENDA:     { label: "Venda" },
  DEVOLUCAO: { label: "Devolução" },
  REPASSE:   { label: "Repasse" },
  AJUSTE:    { label: "Ajuste" },
};

const statusLabel: Record<string, { label: string; cor: string }> = {
  BLOQUEADO:         { label: "Aguardando envio",  cor: SELLER_LEDGER_BADGE_AMBER },
  ENTREGUE:          { label: "Entregue",           cor: "text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-950/40 border-blue-300 dark:border-blue-700" },
  AGUARDANDO_REPASSE:{ label: "Pedido postado",     cor: "text-sky-700 dark:text-sky-300 bg-sky-100 dark:bg-sky-950/40 border-sky-300 dark:border-sky-700" },
  EM_DEVOLUCAO:      { label: "Em devolução",       cor: SELLER_LEDGER_BADGE_DANGER },
  DEVOLVIDO:         { label: "Devolvido",          cor: "text-violet-700 dark:text-violet-300 bg-violet-100 dark:bg-violet-950/40 border-violet-300 dark:border-violet-700" },
  PAGO:              { label: "Concluído",          cor: "text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-700" },
  CANCELADO:         { label: "Cancelado",          cor: "text-[var(--muted)] bg-[var(--surface-subtle)] border-[var(--card-border)]" },
  LIBERADO:          { label: "Disponível",         cor: "text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-700" },
};

const isPositivo = (tipo: string) => tipo === "CREDITO" || tipo === "DEVOLUCAO";
const isNegativo = (tipo: string) => tipo === "BLOQUEIO" || tipo === "VENDA";

/** YYYY-MM-DD no fuso local do browser (não usar toISOString() para dia civil — quebra Hoje/Ontem no BR à noite). */
function dateToLocalYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function dataEventoParaYmdLocal(iso: string): string {
  if (!iso || typeof iso !== "string") return "1970-01-01";
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return iso.slice(0, 10);
  return dateToLocalYmd(t);
}

function groupByDate(entries: LedgerEntry[]): { label: string; items: LedgerEntry[] }[] {
  const agora = new Date();
  const hoje = dateToLocalYmd(agora);
  const ont = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() - 1);
  const ontem = dateToLocalYmd(ont);

  const dSemana = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  const day = dSemana.getDay();
  const diff = day === 0 ? 6 : day - 1;
  dSemana.setDate(dSemana.getDate() - diff);
  const inicioSemanaStr = dateToLocalYmd(dSemana);

  const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1);
  const inicioMesStr = dateToLocalYmd(inicioMes);

  const groups: { label: string; minDate: string; items: LedgerEntry[] }[] = [
    { label: "Hoje", minDate: hoje, items: [] },
    { label: "Ontem", minDate: ontem, items: [] },
    { label: "Esta semana", minDate: inicioSemanaStr, items: [] },
    { label: "Este mês", minDate: inicioMesStr, items: [] },
    { label: "Mais antigo", minDate: "1970-01-01", items: [] },
  ];

  for (const e of entries) {
    const d = dataEventoParaYmdLocal(e.data_evento);
    if (d >= hoje) groups[0].items.push(e);
    else if (d >= ontem) groups[1].items.push(e);
    else if (d >= inicioSemanaStr) groups[2].items.push(e);
    else if (d >= inicioMesStr) groups[3].items.push(e);
    else groups[4].items.push(e);
  }

  return groups.filter((g) => g.items.length > 0);
}

function armazemHeaderAria(vinculo: VinculoFornecedor): string {
  return vinculo.liberado_antecipado
    ? "Ver regras: liberação antecipada de troca de armazém"
    : vinculo.dentro_compromisso
      ? vinculo.pode_trocar_a_partir_de
        ? `Ver regras do armazém. Compromisso ativo até ${formatDate(vinculo.pode_trocar_a_partir_de.slice(0, 10))}`
        : `Ver regras do armazém. Prazo mínimo de ${vinculo.meses_minimos} meses`
      : "Ver regras: troca de armazém pelo suporte";
}

/** Cartão “Regras do armazém” — só na faixa mobile (dedo); desktop usa linha da data + link. */
function SellerHeaderArmazemCardButton({ vinculo, onOpen }: { vinculo: VinculoFornecedor; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={armazemHeaderAria(vinculo)}
      className={cn(
        "min-h-10 w-full rounded-xl border bg-[var(--card)] px-3 py-2 text-left text-xs font-semibold touch-manipulation transition-colors",
        vinculo.liberado_antecipado
          ? cn(
              AMBER_PREMIUM_SURFACE_TRANSPARENT,
              AMBER_PREMIUM_TEXT_PRIMARY,
              "hover:opacity-95 dark:hover:border-amber-300/70"
            )
          : !vinculo.dentro_compromisso && !vinculo.liberado_antecipado
            ? "border-emerald-500/35 text-emerald-700 dark:border-emerald-600/40 dark:text-emerald-300 hover:bg-emerald-50/80 dark:hover:bg-emerald-950/30"
            : cn(
                PRIMARY_ACTION_BLUE_SURFACE_TRANSPARENT,
                PRIMARY_ACTION_BLUE_TEXT_PRIMARY,
                PRIMARY_ACTION_BLUE_OUTLINE_HOVER
              )
      )}
    >
      <span className="block leading-snug">
        {vinculo.liberado_antecipado
          ? "Liberação antecipada"
          : vinculo.dentro_compromisso
            ? vinculo.pode_trocar_a_partir_de
              ? `Até ${formatDate(vinculo.pode_trocar_a_partir_de.slice(0, 10))}`
              : `${vinculo.meses_minimos} meses mín.`
            : "Troca liberada"}
      </span>
      <span className="mt-0.5 block text-[10px] font-medium text-[var(--muted)]">Regras do armazém</span>
    </button>
  );
}

export default function SellerDashboardPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const destaqueId = searchParams.get("destaque");
  const tabParam = searchParams.get("tab");
  const depositoRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [seller, setSeller] = useState<SellerData | null>(null);
  const [planoPrecos, setPlanoPrecos] = useState<{ starter: number; pro: number } | null>(null);
  const [planoSaving, setPlanoSaving] = useState<"" | "starter" | "pro">("");
  const [planoEscolhaErro, setPlanoEscolhaErro] = useState<string | null>(null);
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [saldoAlerta, setSaldoAlerta] = useState<SaldoAlerta | null>(null);
  const [vinculoFornecedor, setVinculoFornecedor] = useState<VinculoFornecedor | null>(null);
  const [extrato, setExtrato] = useState<LedgerEntry[]>([]);
  const [depositos, setDepositos] = useState<Deposito[]>([]);
  const [mensalidades, setMensalidades] = useState<Mensalidade[]>([]);
  const [trialAtivo, setTrialAtivo] = useState(false);
  const [trialValidoAte, setTrialValidoAte] = useState<string | null>(null);
  const [tab, setTab] = useState<"extrato" | "depositos">(tabParam === "depositos" ? "depositos" : "extrato");
  const [filtroStatus, setFiltroStatus] = useState("");
  const [modalDeposito, setModalDeposito] = useState(false);
  const [depositoValor, setDepositoValor] = useState("");
  const [depositoLoading, setDepositoLoading] = useState(false);
  const [depositoErro, setDepositoErro] = useState<string | null>(null);
  const [depositoSucesso, setDepositoSucesso] = useState(false);
  const [depositoQrCode, setDepositoQrCode] = useState<string | null>(null);
  const [depositoCopiaCola, setDepositoCopiaCola] = useState<string | null>(null);
  const [depositoCopiado, setDepositoCopiado] = useState(false);
  const [depositoExpiraEm, setDepositoExpiraEm] = useState<string | null>(null);
  const [depositoRestanteSec, setDepositoRestanteSec] = useState<number | null>(null);
  const [pixMensalidadeCopiado, setPixMensalidadeCopiado] = useState(false);
  const [modalPixMensalidade, setModalPixMensalidade] = useState<Mensalidade | null>(null);
  const [modalArmazem, setModalArmazem] = useState(false);
  const [pixLoading, setPixLoading] = useState(false);
  const [pixQrCode, setPixQrCode] = useState<string | null>(null);
  const [pixCopiaCola, setPixCopiaCola] = useState<string | null>(null);
  const [pixErro, setPixErro] = useState<string | null>(null);
  const [pixExpiraEm, setPixExpiraEm] = useState<string | null>(null);
  const [pixRestanteSec, setPixRestanteSec] = useState<number | null>(null);
  const [movimentacoesAberto, setMovimentacoesAberto] = useState(false);
  const [chartPeriodo, setChartPeriodo] = useState<7 | 14 | 30 | 60 | 90 | 120 | "month:current" | "month:last" | string>(14);
  /** Olist/Tiny: token API salvo na integração. */
  const [olistIntegrado, setOlistIntegrado] = useState<boolean | null>(null);
  const [filtroTipo, setFiltroTipo] = useState<"" | "pedidos">("");
  const autoOpenedRef = useRef(false);
  const extratoRef = useRef<HTMLDivElement>(null);
  const [chartTooltipHover, setChartTooltipHover] = useState<{ dia: string; valor: number; count: number } | null>(null);

  const temMensalidadeVencida = mensalidades.some((m) => m.vencido);
  const cobrancaMensalidadeAtiva = !trialAtivo;

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) {
        router.replace("/seller/login");
        return;
      }
      const [meRes, mensRes, olistRes] = await Promise.all([
        fetch("/api/seller/me", { headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store" }),
        fetch("/api/seller/mensalidades", { headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store" }),
        fetch("/api/seller/olist", { headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store" }),
      ]);
      const json = await meRes.json();
      if (!meRes.ok) {
        if (meRes.status === 401 || meRes.status === 404) {
          await supabaseBrowser.auth.signOut();
          router.replace("/seller/login");
          return;
        }
        throw new Error(json?.error ?? "Erro ao carregar dados.");
      }
      setSeller(json.seller);
      setPlanoPrecos(json.plano_precos_mensalidade ?? null);
      setKpis(json.kpis ?? null);
      setSaldoAlerta(json.saldo_alerta ?? null);
      setVinculoFornecedor(json.vinculo_fornecedor ?? null);
      // Deduplica extrato por id
      const raw = json.extrato ?? [];
      const seen = new Set<string>();
      setExtrato(raw.filter((e: LedgerEntry) => { if (seen.has(e.id)) return false; seen.add(e.id); return true; }));
      setDepositos(json.depositos ?? []);
      if (mensRes.ok) {
        const mensJson = await mensRes.json();
        setMensalidades(mensJson.items ?? []);
        setTrialAtivo(!!mensJson.trial_ativo);
        setTrialValidoAte(mensJson.trial_valido_ate ?? null);
      } else {
        setMensalidades([]);
        setTrialAtivo(false);
        setTrialValidoAte(null);
      }
      if (olistRes.ok) {
        const olistJson = await olistRes.json();
        setOlistIntegrado(Boolean(olistJson.connected));
      } else {
        setOlistIntegrado(false);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro inesperado.");
    } finally {
      setLoading(false);
    }
  }

  async function escolherPlano(plano: "starter" | "pro") {
    setPlanoEscolhaErro(null);
    setPlanoSaving(plano);
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) {
        router.replace("/seller/login");
        return;
      }
      const res = await fetch("/api/seller/plano", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ plano }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? "Erro ao salvar o plano.");
      await load();
    } catch (e: unknown) {
      setPlanoEscolhaErro(e instanceof Error ? e.message : "Erro inesperado.");
    } finally {
      setPlanoSaving("");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!pixExpiraEm || !pixQrCode) return;
    const tick = () => {
      const rest = Math.max(0, Math.floor((new Date(pixExpiraEm).getTime() - Date.now()) / 1000));
      setPixRestanteSec(rest);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [pixExpiraEm, pixQrCode]);

  useEffect(() => {
    if (!temMensalidadeVencida || !cobrancaMensalidadeAtiva) return;
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, [temMensalidadeVencida, cobrancaMensalidadeAtiva]);

  useEffect(() => {
    if (tabParam === "depositos" || destaqueId) {
      setTab("depositos");
      setMovimentacoesAberto(true);
    }
  }, [tabParam, destaqueId]);

  useEffect(() => {
    if (!loading && !autoOpenedRef.current && (extrato.length > 0 || depositos.length > 0)) {
      autoOpenedRef.current = true;
      setMovimentacoesAberto(true);
    }
  }, [loading, extrato.length, depositos.length]);

  const pagarParam = searchParams.get("pagar");
  const pagarAbertoRef = useRef(false);
  useEffect(() => {
    if (
      pagarParam === "1" &&
      mensalidades.length > 0 &&
      !loading &&
      !pagarAbertoRef.current &&
      cobrancaMensalidadeAtiva
    ) {
      pagarAbertoRef.current = true;
      abrirPixMensalidade(mensalidades[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagarParam, mensalidades.length, loading, cobrancaMensalidadeAtiva]);

  useEffect(() => {
    if (destaqueId && depositos.length > 0 && !loading) {
      const el = depositoRefs.current[destaqueId];
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [destaqueId, depositos, loading]);

  // Polling automático: verifica no MP se depósitos pendentes já foram pagos
  const pendentesCount = depositos.filter((d) => d.status === "pendente").length;
  useEffect(() => {
    if (pendentesCount === 0 || !seller) return;
    const sync = async () => {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch("/api/seller/deposito-pix/sync", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json();
      if (json.ok && json.aprovados > 0) load();
    };
    const id = setInterval(sync, 10000);
    sync();
    return () => clearInterval(id);
  }, [pendentesCount, seller?.id]);

  useEffect(() => {
    const bloquear = Boolean(seller && !planoSellerDefinido(seller.plano) && !loading && !error);
    if (!bloquear) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [seller, seller?.plano, loading, error]);

  async function solicitarDeposito() {
    setDepositoErro(null);
    setDepositoQrCode(null);
    setDepositoCopiaCola(null);
    setDepositoLoading(true);
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) { router.replace("/seller/login"); return; }
      const valorDep = parseValorMonetarioPtBr(depositoValor);
      if (!Number.isFinite(valorDep)) {
        throw new Error("Valor inválido. Digite só números e vírgula ou ponto (ex.: 777 ou 777,00). Evite espaços no meio do valor.");
      }
      if (valorDep < 500) {
        throw new Error(`Valor mínimo R$ 500,00. Interpretamos o campo como ${BRL.format(valorDep)} — confira se não há espaço ou caractere estranho entre os dígitos.`);
      }
      const res = await fetch("/api/seller/deposito-pix", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ valor: valorDep }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Erro ao solicitar depósito.");
      if (!json.qr_code_base64 && !json.qr_code) {
        throw new Error("Resposta sem QR Code PIX. A cobrança não foi concluída — tente de novo.");
      }
      setDepositoQrCode(json.qr_code_base64 ?? null);
      setDepositoCopiaCola(json.qr_code ?? null);
      setDepositoExpiraEm(json.expira_em ?? null);
      setDepositoSucesso(true);
      setDepositoValor("");
      load();
    } catch (e: unknown) {
      setDepositoErro(e instanceof Error ? e.message : "Erro inesperado.");
    } finally {
      setDepositoLoading(false);
    }
  }

  function fecharModal() {
    setModalDeposito(false);
    setDepositoValor("");
    setDepositoErro(null);
    setDepositoSucesso(false);
    setDepositoQrCode(null);
    setDepositoCopiaCola(null);
    setDepositoExpiraEm(null);
    setDepositoRestanteSec(null);
  }

  // Cronômetro do PIX (expira em 30 min)
  useEffect(() => {
    if (!depositoExpiraEm || !depositoQrCode) return;
    const tick = () => {
      const rest = Math.max(0, Math.floor((new Date(depositoExpiraEm).getTime() - Date.now()) / 1000));
      setDepositoRestanteSec(rest);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [depositoExpiraEm, depositoQrCode]);

  async function abrirPixMensalidade(m: Mensalidade) {
    setModalPixMensalidade(m);
    setPixLoading(true);
    setPixQrCode(null);
    setPixCopiaCola(null);
    setPixErro(null);
    setPixExpiraEm(null);
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) { router.replace("/seller/login"); return; }
      const res = await fetch(`/api/seller/mensalidades/${m.id}/cobranca-pix`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Erro ao gerar PIX.");
      setPixQrCode(json.qr_code_base64 ?? null);
      setPixCopiaCola(json.qr_code ?? null);
      setPixExpiraEm(json.expira_em ?? null);
    } catch (e: unknown) {
      setPixErro(e instanceof Error ? e.message : "Erro ao gerar PIX.");
    } finally {
      setPixLoading(false);
    }
  }

  function fecharModalPix() {
    setModalPixMensalidade(null);
    setPixQrCode(null);
    setPixCopiaCola(null);
    setPixMensalidadeCopiado(false);
    setPixErro(null);
    setPixExpiraEm(null);
  }

  const isPro = seller?.plano?.toLowerCase() === "pro";
  const planoOk = planoSellerDefinido(seller?.plano);
  const precoStarterMensal = planoPrecos?.starter ?? VALOR_DEFAULT_MENSALIDADE_SELLER;
  const precoProMensal = planoPrecos?.pro ?? VALOR_DEFAULT_MENSALIDADE_SELLER_PRO;
  const dataHojeFmt = new Date().toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  function renderPlanoHeaderControls(opts?: { linkClassName?: string; showVerPlano?: boolean }) {
    const showVerPlano = opts?.showVerPlano ?? true;
    const linkClassName = opts?.linkClassName;
    if (!planoOk) {
      const pend = (
        <span className={cn(SELLER_LEDGER_BADGE_AMBER, "rounded-md px-2 py-0.5 text-[10px] font-semibold")}>
          Plano pendente
        </span>
      );
      if (!showVerPlano) {
        return (
          <Link
            href="/seller/plano"
            className="inline-flex shrink-0 items-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--card)]"
            aria-label="Definir ou ver plano"
          >
            {pend}
          </Link>
        );
      }
      return pend;
    }
    const badgeClass = cn(
      "inline-flex shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-tight",
      isPro
        ? "bg-emerald-700 text-white shadow-sm shadow-emerald-600/25 hover:bg-emerald-700/95 dark:bg-emerald-700 dark:text-white"
        : "bg-emerald-600 text-white shadow-sm shadow-emerald-600/20 hover:bg-emerald-700 dark:bg-emerald-600 dark:text-white dark:hover:bg-emerald-700"
    );
    const badgeTitle = isPro
      ? `Plano ${SELLER_PLANO_NOME_PRO} — analytics e desempenho ampliados`
      : `Plano ${SELLER_PLANO_NOME_START} — resumo e operação essencial`;
    const badge = (
      <span translate="no" lang="en" className={badgeClass} title={badgeTitle}>
        {nomeExibicaoPlanoSeller(seller?.plano)}
      </span>
    );
    return (
      <>
        {!showVerPlano ? (
          <Link
            href="/seller/plano"
            className="inline-flex shrink-0 items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--card)]"
            aria-label="Ver detalhes do plano"
          >
            {badge}
          </Link>
        ) : (
          badge
        )}
        {showVerPlano && (
          <Link
            href="/seller/plano"
            className={cn(
              "shrink-0 py-0.5 text-[11px] font-semibold text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-400",
              linkClassName
            )}
          >
            Ver plano
          </Link>
        )}
      </>
    );
  }

  const extratoFiltrado = (() => {
    let list = extrato;
    if (filtroStatus) list = list.filter((e) => e.status === filtroStatus);
    if (filtroTipo === "pedidos") list = list.filter((e) => e.tipo === "BLOQUEIO" || e.tipo === "VENDA");
    return list;
  })();

  const emDevolucaoCount = extrato.filter((e) => e.status === "EM_DEVOLUCAO").length;
  const devolvidoCount = extrato.filter((e) => e.tipo === "DEVOLUCAO").length;
  const temDevolucoes = emDevolucaoCount > 0 || devolvidoCount > 0;

  const aLiberar = extrato
    .filter((e) => e.status === "AGUARDANDO_REPASSE" && (e.tipo === "BLOQUEIO" || e.tipo === "VENDA"))
    .reduce((s, e) => s + e.valor_total, 0);
  const extratoAgrupado = groupByDate(extratoFiltrado);
  const previewExtrato = extrato.slice(0, 3);

  // Analytics Pro — calculado a partir do extrato (últimos 30 dias)
  const analytics30d = (() => {
    if (!isPro) return null;
    const agora = new Date();
    const inicio30d = new Date(agora.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const pedidos30d = extrato.filter(
      (e) => (e.tipo === "BLOQUEIO" || e.tipo === "VENDA") && e.data_evento >= inicio30d && e.status !== "CANCELADO"
    );
    const custoTotal = pedidos30d.reduce((s, e) => s + e.valor_total, 0);

    // Receita de venda e lucro (só para pedidos com preco_venda preenchido)
    const comVenda = pedidos30d.filter((e) => e.preco_venda != null && e.preco_venda > 0);
    const receitaTotal = comVenda.reduce((s, e) => s + (e.preco_venda ?? 0), 0);
    const lucroTotal = comVenda.reduce((s, e) => s + ((e.preco_venda ?? 0) - (e.custo ?? e.valor_total)), 0);
    const margemMedia = receitaTotal > 0 ? (lucroTotal / receitaTotal) * 100 : null;
    const ticketMedioVenda = comVenda.length > 0 ? receitaTotal / comVenda.length : null;

    // Agrupar por dia (últimos 14 dias) — usando preco_venda quando disponível
    const dias: Record<string, { receita: number; custo: number }> = {};
    for (let i = 13; i >= 0; i--) {
      const d = new Date(agora.getTime() - i * 24 * 60 * 60 * 1000);
      const key = d.toISOString().slice(0, 10);
      dias[key] = { receita: 0, custo: 0 };
    }
    pedidos30d.forEach((e) => {
      const key = e.data_evento.slice(0, 10);
      if (key in dias) {
        dias[key].receita += e.preco_venda ?? 0;
        dias[key].custo += e.custo ?? e.valor_total;
      }
    });

    // Top produto por receita
    const produtosMap: Record<string, { nome: string; count: number; receita: number; lucro: number }> = {};
    pedidos30d.forEach((e) => {
      if (e.nome_produto) {
        if (!produtosMap[e.nome_produto]) produtosMap[e.nome_produto] = { nome: e.nome_produto, count: 0, receita: 0, lucro: 0 };
        produtosMap[e.nome_produto].count += 1;
        produtosMap[e.nome_produto].receita += e.preco_venda ?? 0;
        produtosMap[e.nome_produto].lucro += (e.preco_venda ?? 0) - (e.custo ?? e.valor_total);
      }
    });
    const topProduto = Object.values(produtosMap).sort((a, b) => b.count - a.count)[0] ?? null;

    return {
      pedidos: pedidos30d.length,
      custoTotal,
      receitaTotal,
      lucroTotal,
      margemMedia,
      ticketMedioVenda,
      vendasPorDia: Object.entries(dias),
      topProduto,
      temDadosVenda: comVenda.length > 0,
    };
  })();

  // Gráfico — usa dados do Desempenho quando Pro+14d (garantido funcionar); senão calcula do extrato
  const chartData = (() => {
    if (isPro && analytics30d && chartPeriodo === 14) {
      return (analytics30d.vendasPorDia as [string, { receita: number; custo: number; count?: number }][]).map(([dia, v]) => ({
        dia,
        valor: v.custo,
        count: (v as { count?: number }).count ?? 0,
      }));
    }
    const toKey = (d: Date) => d.toISOString().slice(0, 10);
    const agora = new Date();
    const hojeKey = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}-${String(agora.getDate()).padStart(2, "0")}`;
    let dias: { dia: string; valor: number; count: number }[] = [];

    if (typeof chartPeriodo === "number") {
      for (let i = chartPeriodo - 1; i >= 0; i--) {
        const d = new Date(agora.getTime() - i * 24 * 60 * 60 * 1000);
        dias.push({ dia: toKey(d), valor: 0, count: 0 });
      }
    } else if (chartPeriodo === "month:current") {
      const primeiro = new Date(agora.getFullYear(), agora.getMonth(), 1);
      const ultimo = new Date(agora);
      for (let d = new Date(primeiro); d <= ultimo; d.setDate(d.getDate() + 1)) {
        dias.push({ dia: toKey(d), valor: 0, count: 0 });
      }
    } else if (chartPeriodo === "month:last") {
      const mesPassado = new Date(agora.getFullYear(), agora.getMonth() - 1, 1);
      const ultimoDia = new Date(agora.getFullYear(), agora.getMonth(), 0);
      for (let d = new Date(mesPassado); d <= ultimoDia; d.setDate(d.getDate() + 1)) {
        dias.push({ dia: toKey(d), valor: 0, count: 0 });
      }
    } else if (typeof chartPeriodo === "string" && chartPeriodo.startsWith("month:")) {
      const [y, m] = chartPeriodo.slice(6).split("-").map(Number);
      if (y && m) {
        const primeiro = new Date(y, m - 1, 1);
        const ultimoDia = new Date(y, m, 0);
        const ate = hojeKey.startsWith(`${y}-${String(m).padStart(2, "0")}`) ? new Date(agora) : ultimoDia;
        for (let d = new Date(primeiro); d <= ate; d.setDate(d.getDate() + 1)) {
          dias.push({ dia: toKey(d), valor: 0, count: 0 });
        }
      }
    }
    if (dias.length === 0) {
      for (let i = 13; i >= 0; i--) {
        const d = new Date(agora.getTime() - i * 24 * 60 * 60 * 1000);
        dias.push({ dia: toKey(d), valor: 0, count: 0 });
      }
    }

    const map = new Map(dias.map((x) => [x.dia, x]));
    extrato.forEach((e) => {
      const t = String(e.tipo || "").toUpperCase();
      const s = String(e.status || "").toUpperCase();
      if (s === "CANCELADO") return;
      if (t !== "BLOQUEIO" && t !== "VENDA") return;
      const raw = e.data_evento;
      if (!raw || typeof raw !== "string" || raw.length < 10) return;
      const key = raw.slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return;
      const row = map.get(key);
      if (row) {
        row.valor += Number(e.valor_total) || 0;
        row.count += 1;
      }
    });
    return dias;
  })();
  const chartMax = Math.max(...chartData.map((d) => d.valor), 1);
  const ultimoDiaKey = chartData[chartData.length - 1]?.dia;
  const hojeKeyChart = new Date().toISOString().slice(0, 10);
  const ultimoDiaHoje = ultimoDiaKey === hojeKeyChart;

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--background)] app-bg flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 rounded-xl border-2 border-[var(--card-border)] border-t-emerald-500 dark:border-t-emerald-500 animate-spin" />
          <p className="text-sm text-[var(--muted)] font-medium">Carregando...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[var(--background)] app-bg flex items-center justify-center p-4">
        <div
          className={cn(
            "rounded-2xl bg-[var(--card)] shadow-lg p-8 max-w-md w-full text-center",
            DANGER_PREMIUM_SURFACE_TRANSPARENT
          )}
        >
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--danger)]/15 dark:bg-[var(--danger)]/20">
            <svg className="h-6 w-6 text-[var(--danger)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <p className={cn("mb-2 font-semibold", DANGER_PREMIUM_TEXT_PRIMARY)}>Ocorreu um erro</p>
          <p className="text-[var(--muted)] text-sm mb-6">{error}</p>
          <button onClick={load} className="rounded-xl bg-[var(--foreground)] text-[var(--background)] px-6 py-2.5 text-sm font-medium hover:opacity-90 transition-opacity">
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] app-bg pt-[calc(3.5rem+env(safe-area-inset-top,0px))] md:pt-14 pb-[calc(6.25rem+env(safe-area-inset-bottom,0px))] md:pb-8">
      <div className="dropcore-shell-4xl py-5 md:py-7 space-y-5 md:space-y-6">
        {/* 1. Header — mesmo cartão do painel fornecedor (mobile/desktop) */}
        <header className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4 sm:p-5 shadow-sm overflow-visible">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <div className="flex min-w-0 flex-1 items-stretch gap-3">
              {seller?.logo_url ? (
                <div className="flex shrink-0 items-center">
                  <img
                    src={seller.logo_url}
                    alt=""
                    className="h-[5.25rem] w-[5.25rem] shrink-0 rounded-2xl border-0 object-contain bg-transparent p-0 outline-none ring-0 sm:h-[5.5rem] sm:w-[5.5rem]"
                  />
                </div>
              ) : (
                <div className="flex shrink-0 items-center">
                  <div className="flex h-[5.25rem] w-[5.25rem] shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-2xl font-bold text-white shadow-md shadow-emerald-500/25 sm:h-[5.5rem] sm:w-[5.5rem]">
                    {seller?.nome?.charAt(0).toUpperCase() ?? "S"}
                  </div>
                </div>
              )}
              <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 pt-0.5">
                <div className="hidden min-w-0 w-full flex-nowrap items-center justify-between gap-x-3 sm:flex">
                  <p className="m-0 min-w-0 text-sm font-medium uppercase tracking-wide text-emerald-700/90 dark:text-emerald-400/90 leading-snug">
                    Painel do seller
                  </p>
                  <div
                    className={cn(
                      "flex shrink-0 items-center gap-2 rounded-xl border border-[var(--card-border)] bg-[var(--background)]/70 px-2 py-1 dark:bg-[var(--background)]/40"
                    )}
                  >
                    {renderPlanoHeaderControls({ linkClassName: "pr-0.5" })}
                  </div>
                </div>
                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 sm:hidden">
                  <p className="m-0 flex min-w-0 items-center text-sm font-medium uppercase leading-none tracking-wide text-emerald-700/90 dark:text-emerald-400/90">
                    Painel do seller
                  </p>
                  {renderPlanoHeaderControls({ showVerPlano: false })}
                </div>
                <h1 className="min-w-0 text-2xl font-bold leading-tight tracking-tight text-[var(--foreground)] sm:text-3xl truncate">
                  {seller?.nome ?? "Seller"}
                </h1>
                <p className="text-base leading-snug text-[var(--muted)] capitalize sm:hidden">{dataHojeFmt}</p>
                <p className="hidden text-base leading-snug sm:block">
                  <span className="text-[var(--muted)] capitalize">{dataHojeFmt}</span>
                  {vinculoFornecedor?.ativo && (
                    <>
                      <span className="text-[var(--muted)]/70" aria-hidden>
                        {" "}
                        ·{" "}
                      </span>
                      <button
                        type="button"
                        onClick={() => setModalArmazem(true)}
                        aria-label={armazemHeaderAria(vinculoFornecedor)}
                        className={cn(
                          "text-sm font-semibold underline decoration-current/30 underline-offset-[3px] transition hover:opacity-90",
                          vinculoFornecedor.liberado_antecipado && AMBER_PREMIUM_TEXT_PRIMARY,
                          !vinculoFornecedor.dentro_compromisso &&
                            !vinculoFornecedor.liberado_antecipado &&
                            "text-emerald-700 decoration-emerald-600/35 dark:text-emerald-300 dark:decoration-emerald-400/35",
                          vinculoFornecedor.dentro_compromisso &&
                            !vinculoFornecedor.liberado_antecipado &&
                            "text-[var(--primary-blue)] decoration-[var(--primary-blue)]/30 hover:text-[var(--primary-blue-hover)]"
                        )}
                      >
                        {vinculoFornecedor.liberado_antecipado
                          ? "Liberação antecipada — ver regras"
                          : vinculoFornecedor.dentro_compromisso
                            ? vinculoFornecedor.pode_trocar_a_partir_de
                              ? `Até ${formatDate(vinculoFornecedor.pode_trocar_a_partir_de.slice(0, 10))} — ver regras`
                              : `${vinculoFornecedor.meses_minimos} meses no armazém — ver regras`
                            : "Troca liberada — ver regras"}
                      </button>
                    </>
                  )}
                </p>
              </div>
            </div>
            {(pendentesCount > 0 || vinculoFornecedor?.ativo) && (
              <div
                className={cn(
                  "flex w-full flex-col items-stretch gap-2 border-t border-[var(--card-border)] pt-3 sm:w-auto sm:shrink-0 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end sm:border-0 sm:pt-0",
                  pendentesCount === 0 && vinculoFornecedor?.ativo && "sm:hidden"
                )}
              >
                {pendentesCount > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setTab("depositos");
                      setMovimentacoesAberto(true);
                      extratoRef.current?.scrollIntoView({ behavior: "smooth" });
                    }}
                    className="min-h-10 rounded-xl border border-[var(--card-border)] bg-[var(--card)] px-3 py-2 text-xs font-semibold text-[var(--foreground)] touch-manipulation hover:bg-[var(--surface-hover)] transition-colors sm:shrink-0"
                  >
                    {pendentesCount} PIX pendente{pendentesCount !== 1 ? "s" : ""}
                  </button>
                )}
                {vinculoFornecedor?.ativo && (
                  <div className="w-full sm:hidden">
                    <SellerHeaderArmazemCardButton vinculo={vinculoFornecedor} onOpen={() => setModalArmazem(true)} />
                  </div>
                )}
              </div>
            )}
          </div>
        </header>

        {saldoAlerta && saldoAlerta.nivel !== "ok" && (
          <div
            role="status"
            className={cn(
              "rounded-2xl p-4 sm:p-5",
              saldoAlerta.nivel === "critico" ? SELLER_SALDO_CRITICO_CARD_SURFACE : cn(AMBER_PREMIUM_SURFACE, "shadow-sm")
            )}
          >
            {saldoAlerta.nivel === "critico" && (
              <div className={SELLER_SALDO_CRITICO_ACCENT_BAR} aria-hidden />
            )}
            <div className={saldoAlerta.nivel === "critico" ? SELLER_SALDO_CRITICO_INNER_PAD : undefined}>
            {saldoAlerta.nivel === "critico" ? (
              <div className="flex gap-3">
                <span className={SELLER_SALDO_CRITICO_ICON_WRAP}>
                  <svg
                    className={SELLER_SALDO_CRITICO_ICON_STROKE}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                </span>
                <div className="min-w-0 flex-1">
                  <p className={SELLER_SALDO_CRITICO_TITLE}>Saldo crítico para novos pedidos</p>
                </div>
              </div>
            ) : (
              <p className={cn("text-sm font-semibold", AMBER_PREMIUM_TEXT_PRIMARY)}>Saldo baixo — antecipe um depósito</p>
            )}
            <p
              className={cn(
                "mt-1 text-xs leading-relaxed text-[var(--foreground)]",
                saldoAlerta.nivel === "critico" && SELLER_SALDO_CRITICO_BODY
              )}
            >
              Disponível: <span className="font-semibold tabular-nums">{BRL.format(saldoAlerta.saldo_disponivel)}</span>
              {saldoAlerta.custo_medio_pedido != null && saldoAlerta.pedidos_estimados != null ? (
                <>
                  {" "}
                  · Com base no custo médio dos seus últimos pedidos no extrato (~{BRL.format(saldoAlerta.custo_medio_pedido)} por pedido
                  {saldoAlerta.amostra_pedidos > 0 ? `, ${saldoAlerta.amostra_pedidos} lançamentos` : ""}), dá para aproximadamente{" "}
                  <span className="font-semibold tabular-nums">{saldoAlerta.pedidos_estimados}</span> pedido
                  {saldoAlerta.pedidos_estimados === 1 ? "" : "s"} sem recarregar.
                </>
              ) : (
                <>
                  {" "}
                  · Sem histórico suficiente de pedidos no extrato para estimar; faça um depósito PIX antes de escalar vendas.
                </>
              )}
            </p>
            <button
              type="button"
              onClick={() => setModalDeposito(true)}
              className={cn(
                saldoAlerta.nivel === "critico"
                  ? SELLER_SALDO_CRITICO_BUTTON
                  : "mt-3 rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors bg-emerald-600 hover:bg-emerald-700"
              )}
            >
              Depositar PIX
            </button>
            </div>
          </div>
        )}

        {/* 2. Resumo financeiro — um único fundo de cartão (sem faixa cinza); alinhado ao fornecedor */}
        <section className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] shadow-sm overflow-hidden">
          <div className="relative p-4 sm:p-5">
            <div className="absolute left-0 top-4 bottom-4 w-1 rounded-r-full bg-gradient-to-b from-emerald-500 to-emerald-600 opacity-90" aria-hidden />
            <div className="pl-4 sm:pl-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-medium text-[var(--muted)]">Saldo total</p>
                <p className="mt-1 text-3xl sm:text-4xl font-bold tracking-tight text-emerald-700 dark:text-emerald-400 tabular-nums">
                  {BRL.format(seller?.saldo_atual ?? 0)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalDeposito(true)}
                className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 text-sm font-semibold shrink-0 shadow-sm shadow-emerald-600/20 transition-colors"
              >
                + Depositar PIX
              </button>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-2.5 border-t border-[var(--card-border)]/80 pt-5 sm:grid-cols-4">
              <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] px-3.5 py-3.5 min-h-[5.25rem] shadow-[0_1px_0_rgb(0_0_0/0.04)] dark:shadow-none">
                <p className="text-[11px] font-semibold text-[var(--muted)]">Disponível</p>
                <p className="mt-1 text-xl font-bold text-[var(--foreground)] tabular-nums">{BRL.format(seller?.saldo_disponivel ?? 0)}</p>
              </div>
              <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] px-3.5 py-3.5 min-h-[5.25rem] shadow-[0_1px_0_rgb(0_0_0/0.04)] dark:shadow-none">
                <p className="text-[11px] font-semibold text-[var(--muted)]">Bloqueado</p>
                <p className="mt-1 text-xl font-bold text-[var(--foreground)] tabular-nums">{BRL.format(seller?.saldo_bloqueado ?? 0)}</p>
              </div>
              <button
                type="button"
                onClick={() => { setFiltroTipo("pedidos"); setFiltroStatus(""); setTab("extrato"); setMovimentacoesAberto(true); extratoRef.current?.scrollIntoView({ behavior: "smooth" }); }}
                className="group rounded-xl border border-[var(--card-border)] bg-[var(--card)] px-3.5 py-3.5 min-h-[5.25rem] text-left shadow-[0_1px_0_rgb(0_0_0/0.04)] transition-all hover:border-emerald-300 dark:shadow-none dark:hover:border-emerald-700 hover:shadow-sm active:scale-[0.99]"
              >
                <p className="text-[11px] font-semibold text-[var(--muted)]">Pedidos (mês)</p>
                <p className="mt-1 text-xl font-bold tabular-nums text-[var(--foreground)] group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition-colors">
                  {kpis?.pedidos_mes ?? 0}
                </p>
              </button>
              <button
                type="button"
                onClick={() => { setFiltroTipo("pedidos"); setFiltroStatus(""); setTab("extrato"); setMovimentacoesAberto(true); extratoRef.current?.scrollIntoView({ behavior: "smooth" }); }}
                className="group rounded-xl border border-[var(--card-border)] bg-[var(--card)] px-3.5 py-3.5 min-h-[5.25rem] text-left shadow-[0_1px_0_rgb(0_0_0/0.04)] transition-all hover:border-emerald-300 dark:shadow-none dark:hover:border-emerald-700 hover:shadow-sm active:scale-[0.99]"
              >
                <p className="text-[11px] font-semibold text-[var(--muted)]">Volume (mês)</p>
                <p className="mt-1 text-xl font-bold tabular-nums text-[var(--foreground)] group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition-colors">
                  {BRL.format(kpis?.total_mes ?? 0)}
                </p>
              </button>
            </div>
          </div>
            {aLiberar > 0 && (
              <div className="mx-3 sm:mx-4 mt-3 flex items-center justify-between rounded-xl border border-[var(--card-border)] bg-[var(--surface-subtle)] px-3.5 py-3">
                <span className="text-xs font-medium text-[var(--muted)]">A liberar (aguardando repasse)</span>
                <span className="text-base font-bold text-[var(--foreground)] tabular-nums">{BRL.format(aLiberar)}</span>
              </div>
            )}
            {mensalidades.length > 0 && (
              <div className="mx-3 mb-3 mt-3 sm:mx-4 sm:mb-4 flex flex-col gap-2 rounded-xl border border-[var(--card-border)] px-3.5 py-3 bg-[var(--surface-subtle)] sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <p className="text-xs font-medium text-[var(--foreground)]">Mensalidade pendente</p>
                  <p className="text-[11px] text-[var(--muted)] leading-relaxed">
                    {subtituloBannerMensalidade(mensalidades[0], trialAtivo, trialValidoAte)}
                  </p>
                  {!cobrancaMensalidadeAtiva && (
                    <p className="text-[11px] text-[var(--muted)] pt-0.5 leading-relaxed">
                      Sem cobrança enquanto o teste grátis estiver ativo.
                    </p>
                  )}
                </div>
                {cobrancaMensalidadeAtiva ? (
                  <button
                    type="button"
                    onClick={() => abrirPixMensalidade(mensalidades[0])}
                    className="shrink-0 rounded-xl bg-[var(--foreground)] text-[var(--background)] hover:opacity-90 px-4 py-2 text-sm font-semibold"
                  >
                    Pagar {BRL.format(mensalidades[0].valor)}
                  </button>
                ) : null}
              </div>
            )}
        </section>

        {/* 2a. Gráfico — volume por dia (hoje sempre fixo à direita) */}
        <section className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--card-border)] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[var(--foreground)]">Volume de pedidos</p>
              <p className="text-xs text-[var(--muted)] mt-0.5">Hoje fixo à direita do gráfico</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {([7, 14, 30, 60, 90, 120] as const).map((n) => (
                <button
                  key={n}
                  onClick={() => setChartPeriodo(n)}
                  className={`rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
                    chartPeriodo === n
                      ? "bg-emerald-600 text-white"
                      : "bg-[var(--surface-subtle)] text-[var(--muted)] hover:bg-[var(--surface-hover)]"
                  }`}
                >
                  {n}d
                </button>
              ))}
              <select
                value={typeof chartPeriodo === "string" ? chartPeriodo : ""}
                onChange={(e) => { const v = e.target.value; if (v) setChartPeriodo(v); }}
                className="rounded-lg px-2.5 py-1.5 text-[11px] font-medium bg-[var(--surface-subtle)] text-[var(--foreground)] border-0 cursor-pointer focus:ring-2 focus:ring-emerald-500"
              >
                <option value="">Mês...</option>
                <option value="month:current">Este mês</option>
                <option value="month:last">Mês passado</option>
                {(() => {
                  const opts: { value: string; label: string }[] = [];
                  const agora = new Date();
                  for (let i = 2; i <= 12; i++) {
                    const d = new Date(agora.getFullYear(), agora.getMonth() - i, 1);
                    const key = `month:${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
                    opts.push({ value: key, label: d.toLocaleDateString("pt-BR", { month: "short", year: "numeric" }) });
                  }
                  return opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>);
                })()}
              </select>
            </div>
          </div>
          <div className="p-4">
            {chartMax <= 0 ? (
              <div className="text-center py-10">
                <p className="text-sm text-[var(--muted)] mb-3">Sem movimentações neste período</p>
                <button
                  onClick={() => router.push("/seller/produtos")}
                  className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 text-sm font-semibold"
                >
                  Comece a vender
                </button>
              </div>
            ) : (
              <>
                <div className="flex items-end gap-1 h-32 relative">
                  {chartData.map((d) => {
                    const periodLabel = d.dia?.length >= 10 ? `${d.dia.slice(8)}/${d.dia.slice(5, 7)}` : d.dia;
                    const count = (d as { count?: number }).count ?? 0;
                    const ticketMedio = count > 0 ? d.valor / count : null;
                    const barMaxH = 96;
                    const barH = d.valor > 0 ? Math.max(20, (d.valor / chartMax) * barMaxH) : 4;
                    return (
                      <div
                        key={d.dia}
                        className="flex-1 flex flex-col justify-end items-center relative"
                        onMouseEnter={() => setChartTooltipHover({ dia: d.dia, valor: d.valor, count })}
                        onMouseLeave={() => setChartTooltipHover(null)}
                      >
                        <div
                          className="w-full rounded-t bg-emerald-600 hover:bg-emerald-700 transition-colors cursor-default"
                          style={{ height: `${barH}px` }}
                          title={`${periodLabel}: ${BRL.format(d.valor)}${count ? ` · ${count} pedidos` : ""}`}
                        />
                        {chartTooltipHover?.dia === d.dia && (
                          <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
                            <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] shadow-xl py-3 px-4 min-w-[180px]">
                              <p className="text-xs font-semibold text-[var(--foreground)] mb-2.5">{periodLabel}</p>
                              <div className="space-y-1.5 text-xs">
                                <div className="flex justify-between gap-4">
                                  <span className="text-[var(--muted)]">Volume</span>
                                  <span className="font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">{BRL.format(d.valor)}</span>
                                </div>
                                {count > 0 && (
                                  <>
                                    <div className="flex justify-between gap-4">
                                      <span className="text-[var(--muted)]">Pedidos</span>
                                      <span className="font-semibold text-[var(--foreground)]">{count}</span>
                                    </div>
                                    {ticketMedio != null && (
                                      <div className="flex justify-between gap-4 pt-1 border-t border-[var(--card-border)]">
                                        <span className="text-[var(--muted)]">Ticket médio</span>
                                        <span className="font-semibold text-[var(--foreground)] tabular-nums">{BRL.format(ticketMedio)}</span>
                                      </div>
                                    )}
                                  </>
                                )}
                              </div>
                              <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 rotate-45 border-r border-b border-[var(--card-border)] bg-[var(--card)]" />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-between mt-1 px-0.5">
                  <span className="text-[10px] text-[var(--muted)]">
                    {chartData[0]?.dia?.length >= 10 ? `${chartData[0].dia.slice(8)}/${chartData[0].dia.slice(5, 7)}` : chartData[0]?.dia ?? ""}
                  </span>
                  <span className={`text-[10px] ${ultimoDiaHoje ? "font-medium text-emerald-600 dark:text-emerald-400" : "text-[var(--muted)]"}`}>
                    {ultimoDiaHoje ? "Hoje" : (() => {
                      const last = chartData[chartData.length - 1]?.dia;
                      return last?.length >= 10 ? `${last.slice(8)}/${last.slice(5, 7)}` : last ?? "";
                    })()}
                  </span>
                </div>
              </>
            )}
          </div>
        </section>

        {/* 2b. Analytics Pro — desempenho detalhado */}
        {isPro && analytics30d && (
          <section className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] shadow-sm overflow-hidden">
            <div className="px-4 py-3 flex items-center justify-between border-b border-[var(--card-border)] bg-[var(--card)]">
              <div className="flex items-center gap-2">
                <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">Desempenho</p>
                <span translate="no" lang="en" className="rounded-full bg-emerald-600 px-2.5 py-0.5 text-[10px] font-bold text-white">
                  {SELLER_PLANO_NOME_PRO} · 30 dias
                </span>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-0 divide-x divide-y sm:divide-y-0 divide-[var(--card-border)]">
              {analytics30d.temDadosVenda ? (
                <>
                  <div className="px-4 py-3">
                    <p className="text-[11px] text-[var(--muted)]">Receita</p>
                    <p className="text-sm font-bold text-[var(--foreground)] tabular-nums">{BRL.format(analytics30d.receitaTotal)}</p>
                  </div>
                  <div className="px-4 py-3">
                    <p className="text-[11px] text-[var(--muted)]">Custo</p>
                    <p className="text-sm font-bold text-[var(--muted)] tabular-nums">{BRL.format(analytics30d.custoTotal)}</p>
                  </div>
                  <div className="px-4 py-3">
                    <p className="text-[11px] text-[var(--muted)]">Lucro</p>
                    <p
                      className={cn(
                        "text-sm font-bold tabular-nums",
                        analytics30d.lucroTotal >= 0 ? "text-emerald-600 dark:text-emerald-400" : DANGER_PREMIUM_TEXT_SOFT
                      )}
                    >
                      {BRL.format(analytics30d.lucroTotal)}
                    </p>
                  </div>
                  <div className="px-4 py-3">
                    <p className="text-[11px] text-[var(--muted)]">{analytics30d.margemMedia != null ? "Margem" : "Ticket médio"}</p>
                    <p className={`text-sm font-bold tabular-nums ${analytics30d.margemMedia != null && analytics30d.margemMedia >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-[var(--foreground)]"}`}>
                      {analytics30d.margemMedia != null ? `${analytics30d.margemMedia.toFixed(1)}%` : analytics30d.pedidos > 0 ? BRL.format(analytics30d.custoTotal / analytics30d.pedidos) : "—"}
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <div className="px-4 py-3 sm:col-span-2">
                    <p className="text-[11px] text-[var(--muted)]">Custo total (pedidos)</p>
                    <p className="text-sm font-bold text-[var(--foreground)] tabular-nums">{BRL.format(analytics30d.custoTotal)}</p>
                  </div>
                  <div className="px-4 py-3 sm:col-span-2">
                    <p className="text-[11px] text-[var(--muted)]">Pedidos</p>
                    <p className="text-sm font-bold text-[var(--foreground)]">{analytics30d.pedidos}</p>
                  </div>
                </>
              )}
            </div>
            {analytics30d.topProduto && (
              <div className="px-4 py-2 border-t border-[var(--card-border)] flex items-center justify-between text-xs">
                <span className="text-[var(--muted)]">Top:</span>
                <span className="font-medium text-[var(--foreground)] truncate max-w-[60%]">{analytics30d.topProduto.nome}</span>
                <span className="text-[var(--muted)] shrink-0">{analytics30d.topProduto.count} vendas</span>
              </div>
            )}
            {analytics30d.vendasPorDia.some(([, v]) => (v as { receita: number; custo: number }).receita > 0 || (v as { receita: number; custo: number }).custo > 0) && (
              <div className="px-4 pb-3 pt-1">
                <div className="flex items-end gap-[2px] h-10 rounded overflow-hidden">
                  {(analytics30d.vendasPorDia as [string, { receita: number; custo: number }][]).map(([dia, val]) => {
                    const principal = analytics30d!.temDadosVenda ? val.receita : val.custo;
                    const max = Math.max(...(analytics30d!.vendasPorDia as [string, { receita: number; custo: number }][]).map(([, v]) => analytics30d!.temDadosVenda ? v.receita : v.custo), 1);
                    return (
                      <div key={dia} title={`${dia}: ${BRL.format(principal)}`} className="flex-1 min-w-0 bg-emerald-600 hover:bg-emerald-700 rounded-t" style={{ height: `${Math.max((principal / max) * 100, principal > 0 ? 4 : 2)}%` }} />
                    );
                  })}
                </div>
                <p className="text-[10px] text-[var(--muted)] mt-1">Últimos 14 dias</p>
              </div>
            )}
          </section>
        )}

        {/* 3. Atalhos — mesmo padrão “Acesso rápido” do fornecedor */}
        <section aria-label="Atalhos">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)] mb-2 px-0.5">
            Acesso rápido
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button onClick={() => router.push("/seller/calculadora")} className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4 flex items-center gap-3 text-left transition-all hover:border-emerald-300 dark:hover:border-emerald-700 hover:shadow-md group">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="4" y="2" width="16" height="20" rx="2" />
                <line x1="7" y1="6" x2="17" y2="6" />
                <line x1="8" y1="10" x2="9" y2="10" />
                <line x1="11.5" y1="10" x2="12.5" y2="10" />
                <line x1="15" y1="10" x2="16" y2="10" />
                <line x1="8" y1="14" x2="9" y2="14" />
                <line x1="11.5" y1="14" x2="12.5" y2="14" />
                <line x1="15" y1="14" x2="16" y2="14" />
                <line x1="8" y1="18" x2="9" y2="18" />
                <line x1="11.5" y1="18" x2="12.5" y2="18" />
                <line x1="15" y1="18" x2="16" y2="18" />
              </svg>
            </div>
            <span className="text-sm font-bold text-[var(--foreground)] truncate group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition-colors">Calculadora</span>
          </button>
          <button onClick={() => router.push("/seller/produtos")} className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4 flex items-center gap-3 text-left transition-all hover:border-emerald-300 dark:hover:border-emerald-700 hover:shadow-md group">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                <line x1="12" y1="22.08" x2="12" y2="12" />
              </svg>
            </div>
            <span className="text-sm font-bold text-[var(--foreground)] truncate group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition-colors">Produtos</span>
          </button>
          <button onClick={() => router.push("/seller/integracoes-erp")} className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4 flex items-center gap-3 text-left transition-all hover:border-emerald-300 dark:hover:border-emerald-700 hover:shadow-md group relative">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22v-5" />
                <path d="M9 8V2" />
                <path d="M15 8V2" />
                <path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z" />
              </svg>
            </div>
            <span className="text-sm font-bold text-[var(--foreground)] truncate group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition-colors">ERP</span>
            {olistIntegrado === true && (
              <span className="absolute top-2 right-2 rounded-full bg-emerald-100 dark:bg-emerald-950/50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                Olist/Tiny ok
              </span>
            )}
          </button>
          </div>
        </section>

        {/* 4. Alerta devoluções (se houver) */}
        {temDevolucoes && (
          <button
            type="button"
            onClick={() => { setTab("extrato"); setFiltroStatus(emDevolucaoCount > 0 ? "EM_DEVOLUCAO" : "DEVOLVIDO"); setMovimentacoesAberto(true); extratoRef.current?.scrollIntoView({ behavior: "smooth" }); }}
            className="w-full rounded-2xl border border-[var(--card-border)] bg-[var(--card)] px-4 py-3 flex items-center gap-3 text-left shadow-sm hover:bg-[var(--surface-hover)]"
          >
            <div className="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-950/50 flex items-center justify-center shrink-0 text-emerald-700 dark:text-emerald-400">
              <IconDevolucao className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[var(--foreground)]">
                {emDevolucaoCount > 0 ? `${emDevolucaoCount} pedido(s) em devolução` : `${devolvidoCount} devolução(ões) concluída(s)`}
              </p>
              <p className="text-xs text-[var(--muted)]">Clique para ver no extrato</p>
            </div>
            <IconArrowRight className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
          </button>
        )}

        {/* 5. Extrato / Depósitos — recolhível */}
        <section ref={extratoRef} className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] shadow-sm overflow-hidden">
          {/* Cabeçalho: sempre uma linha; em telas estreitas desliza horizontalmente */}
          <div className="border-b border-[var(--card-border)] bg-[var(--card)] px-3 py-2.5">
            <div className="flex min-w-0 flex-nowrap items-stretch gap-2 overflow-x-auto overscroll-x-contain pb-0.5 [-webkit-overflow-scrolling:touch] sm:justify-between sm:overflow-visible sm:pb-0">
              <div className="flex shrink-0 flex-nowrap items-stretch gap-2">
                {(["extrato", "depositos"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => { setTab(t); if (!movimentacoesAberto) setMovimentacoesAberto(true); }}
                    type="button"
                    className={cn(
                      "inline-flex min-h-10 shrink-0 items-center justify-center rounded-lg border px-3 text-xs font-medium transition-colors touch-manipulation whitespace-nowrap",
                      "outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--card)]",
                      tab === t
                        ? "border-emerald-600 bg-emerald-600 text-white font-semibold hover:bg-emerald-700 dark:border-emerald-600 dark:bg-emerald-600 dark:text-white dark:hover:bg-emerald-700"
                        : "border-[var(--card-border)] bg-[var(--card)] text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]"
                    )}
                  >
                    {t === "extrato" ? "Extrato" : "Depósitos PIX"}
                  </button>
                ))}
              </div>
              <div className="flex shrink-0 flex-nowrap items-stretch gap-2 sm:pl-2">
                {tab === "depositos" && (
                  <button
                    type="button"
                    onClick={() => setModalDeposito(true)}
                    className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white outline-none transition-colors hover:bg-emerald-700 whitespace-nowrap touch-manipulation focus-visible:ring-2 focus-visible:ring-emerald-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--card)]"
                  >
                    + Novo depósito
                  </button>
                )}
                <button
                  type="button"
                  onClick={load}
                  className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-3 text-xs font-medium text-[var(--muted)] outline-none transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)] touch-manipulation whitespace-nowrap focus-visible:ring-2 focus-visible:ring-emerald-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--card)]"
                >
                  Atualizar
                </button>
                <button
                  type="button"
                  onClick={() => setMovimentacoesAberto(!movimentacoesAberto)}
                  className="inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-2.5 text-xs font-medium text-[var(--muted)] outline-none transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)] touch-manipulation focus-visible:ring-2 focus-visible:ring-emerald-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--card)]"
                  title={movimentacoesAberto ? "Recolher" : "Expandir"}
                >
                  {!movimentacoesAberto && (
                    <span className="whitespace-nowrap">
                      {tab === "extrato" ? (
                        <>
                          <span className="sm:hidden">{extratoFiltrado.length} mov.</span>
                          <span className="hidden sm:inline">{extratoFiltrado.length} movimentações</span>
                        </>
                      ) : (
                        <>
                          {depositos.length} depósito{depositos.length !== 1 ? "s" : ""}
                        </>
                      )}
                    </span>
                  )}
                  <svg
                    className={`h-4 w-4 shrink-0 transition-transform ${movimentacoesAberto ? "rotate-180" : ""}`}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden
                  >
                    <path d="m18 15-6-6-6 6" />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          {/* Conteúdo (recolhível) */}
          {movimentacoesAberto && (
          <>
          {/* Extrato */}
          {tab === "extrato" && (
            <div className="p-3">
              <div className="overflow-x-auto pb-2 -mx-1">
                <div className="flex gap-2 min-w-max">
                  {filtroTipo === "pedidos" && (
                    <button
                      onClick={() => setFiltroTipo("")}
                      className="rounded-full px-3.5 py-2 text-xs font-medium whitespace-nowrap bg-emerald-600 text-white shadow-sm"
                    >
                      Pedidos
                    </button>
                  )}
                  {["", "BLOQUEADO", "AGUARDANDO_REPASSE", "PAGO", "EM_DEVOLUCAO", "DEVOLVIDO", "CANCELADO"].map((s) => (
                    <button
                      key={s || "todos"}
                      onClick={() => setFiltroStatus(s)}
                      className={`rounded-full px-3.5 py-2 text-xs font-medium whitespace-nowrap transition-colors ${
                        filtroStatus === s
                          ? "bg-emerald-600 text-white shadow-sm"
                          : "bg-[var(--surface-subtle)] text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]"
                      }`}
                    >
                      {s === "" ? "Todos" : (statusLabel[s]?.label ?? s)}
                    </button>
                  ))}
                </div>
              </div>

              {extratoFiltrado.length === 0 ? (
                <div className="py-16 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-[var(--surface-subtle)] flex items-center justify-center mx-auto mb-4 text-[var(--muted)]">
                    <IconClipboard className="w-7 h-7" />
                  </div>
                  <p className="text-sm font-medium text-[var(--muted)]">
                    {filtroTipo === "pedidos" ? "Nenhum pedido" : `Nenhuma movimentação${filtroStatus ? " com este filtro" : ""}`}
                  </p>
                  <p className="text-xs text-[var(--muted)] mt-1">Suas transações aparecerão aqui</p>
                  {(filtroStatus || filtroTipo) && (
                    <button
                      onClick={() => { setFiltroStatus(""); setFiltroTipo(""); }}
                      className="mt-4 rounded-lg bg-emerald-100 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 px-4 py-2 text-sm font-medium hover:bg-emerald-100 dark:hover:bg-emerald-900/40"
                    >
                      Ver todas
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-6">
                  {extratoAgrupado.map((group) => (
                    <div key={group.label}>
                      <p className="text-[11px] font-semibold text-[var(--muted)] uppercase tracking-wider mb-3 px-1">{group.label}</p>
                      <div className="rounded-lg border border-[var(--card-border)] overflow-hidden">
                      {group.items.map((e) => {
                        const info = tipoLabel[e.tipo] ?? { label: e.tipo };
                        const st = statusLabel[e.status];
                        return (
                          <div key={e.id} className="flex items-center gap-4 px-4 py-3 border-b border-[var(--card-border)] last:border-0 hover:bg-[var(--surface-hover)]/50 transition-colors">
                              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                                isPositivo(e.tipo) ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400" :
                                isNegativo(e.tipo) ? "bg-[var(--surface-subtle)] text-[var(--muted)]" :
                                "bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400"
                              }`}>
                                <IconTipoExtrato tipo={e.tipo} className="w-5 h-5" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-[var(--foreground)]">{e.nome_produto || info.label}</p>
                                <p className="text-xs text-[var(--muted)] mt-0.5">
                                  {formatDateTime(e.data_evento)}{e.fornecedor_nome ? ` · ${e.fornecedor_nome}` : ""}
                                </p>
                                {e.preco_venda != null && e.custo != null && e.preco_venda > 0 && (
                                  <p className="text-[11px] text-[var(--muted)] mt-1">
                                    Venda {BRL.format(e.preco_venda)} · Margem{" "}
                                    <span
                                      className={
                                        e.preco_venda - e.custo >= 0
                                          ? "text-emerald-600 dark:text-emerald-400"
                                          : DANGER_PREMIUM_TEXT_SOFT
                                      }
                                    >
                                      {((e.preco_venda - e.custo) / e.preco_venda * 100).toFixed(0)}%
                                    </span>
                                  </p>
                                )}
                              </div>
                              <div className="text-right shrink-0">
                                <p className={`text-base font-bold tabular-nums ${isPositivo(e.tipo) ? "text-emerald-600 dark:text-emerald-400" : isNegativo(e.tipo) ? "text-[var(--foreground)]" : "text-[var(--muted)]"}`}>
                                  {isPositivo(e.tipo) ? "+" : isNegativo(e.tipo) ? "−" : ""}{BRL.format(e.valor_total)}
                                </p>
                                {st && <span className={`inline-block mt-1.5 rounded-md px-2 py-0.5 text-[10px] font-medium ${st.cor}`}>{st.label}</span>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Depósitos */}
          {tab === "depositos" && (
            <div className="p-3">
              {depositos.length === 0 ? (
                <div className="py-16 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-emerald-100 dark:bg-emerald-950/40 flex items-center justify-center mx-auto mb-4 text-emerald-500 dark:text-emerald-400">
                    <IconDeposito className="w-7 h-7" />
                  </div>
                  <p className="text-sm font-medium text-[var(--muted)]">Nenhum depósito ainda</p>
                  <p className="text-xs text-[var(--muted)] mt-1">Adicione saldo via PIX para continuar vendendo</p>
                <button onClick={() => setModalDeposito(true)} className="mt-6 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 text-sm font-semibold shadow-md shadow-emerald-900/15 hover:shadow-emerald-900/20 transition-all">
                    + Solicitar depósito
                  </button>
                </div>
              ) : (
                <div className="rounded-lg border border-[var(--card-border)] overflow-hidden">
                  {depositos.map((d) => (
                    <div
                      key={d.id}
                      ref={(el) => { depositoRefs.current[d.id] = el; }}
                      className={`flex items-center gap-4 px-4 py-4 border-b border-[var(--card-border)] last:border-0 hover:bg-[var(--surface-hover)]/50 transition-colors ${
                        destaqueId === d.id ? "ring-2 ring-emerald-500 ring-inset bg-emerald-100 dark:bg-emerald-950/20" : ""
                      }`}
                    >
                      <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center shrink-0 text-emerald-600 dark:text-emerald-400">
                        <IconPlus className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[var(--foreground)]">Depósito via PIX</p>
                        <p className="text-xs text-[var(--muted)] mt-0.5">
                          {formatDate(d.criado_em)}
                          {d.aprovado_em ? ` · Aprovado em ${formatDate(d.aprovado_em)}` : " · Aguardando aprovação"}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">+{BRL.format(d.valor)}</p>
                        <span className={`inline-block mt-1.5 rounded-md px-2.5 py-1 text-[10px] font-semibold ${
                          d.status === "aprovado"
                            ? "bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300"
                            : d.status === "pendente"
                              ? SELLER_LEDGER_BADGE_AMBER
                              : "bg-[var(--surface-subtle)] text-[var(--muted)]"
                        }`}>
                          {d.status === "aprovado" ? "Aprovado" : d.status === "pendente" ? "Pendente" : d.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          </>
          )}
        </section>

        {modalDeposito && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/50 backdrop-blur-md animate-fade-in-up">
            <div className="w-full max-w-sm rounded-2xl border border-[var(--card-border)] bg-[var(--card)] shadow-2xl overflow-hidden animate-fade-in-up animate-fade-in-up-delay-1">
              <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-[var(--card-border)]">
                <h2 className="text-sm font-semibold text-[var(--foreground)]">Solicitar depósito via PIX</h2>
                <button onClick={fecharModal} className="p-1 -m-1 text-[var(--muted)] hover:text-[var(--foreground)] transition-colors rounded">
                  <IconX className="w-5 h-5" />
                </button>
              </div>

              {depositoSucesso ? (
                depositoQrCode ? (
                  <div className="p-5 space-y-4">
                    <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                      <IconCheck className="w-5 h-5" />
                      <p className="text-sm font-semibold text-[var(--foreground)]">PIX gerado! Pague agora</p>
                    </div>
                    <p className="text-xs text-[var(--muted)]">Escaneie o QR Code ou copie o código PIX. O saldo será creditado automaticamente após o pagamento.</p>
                    {depositoRestanteSec !== null && (
                      <div
                        className={`flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-medium ${
                          depositoRestanteSec <= 60
                            ? cn(AMBER_PREMIUM_SURFACE, AMBER_PREMIUM_TEXT_PRIMARY)
                            : "bg-[var(--surface-subtle)] text-[var(--muted)]"
                        }`}
                      >
                        <IconClock className={`w-4 h-4 shrink-0 ${depositoRestanteSec <= 60 ? "animate-pulse" : ""}`} />
                        Válido por {Math.floor(depositoRestanteSec / 60)}:{(depositoRestanteSec % 60).toString().padStart(2, "0")}
                      </div>
                    )}
                    <div className="flex justify-center p-4 bg-[var(--card)] rounded-xl">
                      <img src={`data:image/png;base64,${depositoQrCode}`} alt="QR Code PIX" className="w-40 h-40" />
                    </div>
                    {depositoCopiaCola && (
                      <div className="space-y-2">
                        <p className="text-xs text-[var(--muted)]">Código PIX (copia e cola):</p>
                        <div className="rounded-xl border border-[var(--card-border)] bg-[var(--surface-subtle)] px-3 py-2 text-xs font-mono text-[var(--muted)] break-all max-h-20 overflow-y-auto">
                          {depositoCopiaCola}
                        </div>
                        <button
                          onClick={async () => {
                            await navigator.clipboard.writeText(depositoCopiaCola!);
                            setDepositoCopiado(true);
                            setTimeout(() => setDepositoCopiado(false), 2000);
                          }}
                          className="w-full rounded-xl border-2 border-emerald-500 dark:border-emerald-600 bg-emerald-600 dark:bg-emerald-700 text-white font-semibold py-2.5 text-sm hover:bg-emerald-700 dark:hover:bg-emerald-600 transition-colors flex items-center justify-center gap-2"
                        >
                          {depositoCopiado ? "✓ Copiado!" : "Copiar código PIX"}
                        </button>
                      </div>
                    )}
                    <button onClick={fecharModal} className="w-full rounded-xl bg-emerald-600 dark:bg-emerald-700 text-white font-semibold py-2.5 text-sm hover:bg-emerald-700 dark:hover:bg-emerald-600 transition-colors">
                      Fechar
                    </button>
                  </div>
                ) : (
                  <div className="p-5 text-center space-y-3">
                    <div className="w-12 h-12 rounded-full bg-emerald-100 border border-emerald-300 flex items-center justify-center mx-auto text-emerald-600">
                      <IconCheck className="w-6 h-6" />
                    </div>
                    <p className="text-sm font-semibold text-[var(--foreground)]">Solicitação enviada!</p>
                    <p className="text-xs text-[var(--muted)]">Faça o PIX e aguarde a aprovação. O saldo será creditado assim que confirmado.</p>
                    <button onClick={fecharModal} className="w-full rounded-xl border border-[var(--card-border)] bg-[var(--surface-subtle)] text-[var(--foreground)] font-semibold py-2.5 text-sm hover:bg-[var(--surface-hover)] transition-colors mt-2">
                      Fechar
                    </button>
                  </div>
                )
              ) : (
                <div className="p-5 space-y-4">
                  <div className="rounded-xl bg-[var(--surface-subtle)] border border-[var(--card-border)] p-3 text-xs text-[var(--muted)] space-y-1">
                    <p>1. Informe o valor que deseja depositar (mín. R$ 500)</p>
                    <p>2. Clique em Depositar — o QR Code PIX será gerado</p>
                    <p>3. Escaneie ou copie o código e pague no app do seu banco</p>
                    <p>4. O saldo é creditado automaticamente após o pagamento</p>
                  </div>

                  <div>
                    <label className="text-xs text-[var(--muted)] mb-1.5 block">Valor (mínimo R$ 500,00)</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="Ex.: 777,00"
                      value={depositoValor}
                      onChange={(e) => setDepositoValor(e.target.value)}
                      className="w-full rounded-xl bg-[var(--card)] border border-[var(--card-border)] px-3 py-2.5 text-[var(--foreground)] text-sm focus:outline-none focus:border-emerald-500 placeholder:text-[var(--muted)]"
                    />
                    <p className="mt-1 text-[11px] text-[var(--muted)]">
                      Não deixe espaço entre os dígitos — o valor pode ser interpretado errado (ex.: 77 seguido de 7 vira só 77).
                    </p>
                  </div>

                  {depositoErro && (
                    <p className={cn("text-xs rounded-xl px-3 py-2", DANGER_PREMIUM_SHELL, DANGER_PREMIUM_TEXT_PRIMARY)}>
                      {depositoErro}
                    </p>
                  )}

                  <div className="flex gap-2 pt-1">
                    <button onClick={fecharModal} className="flex-1 rounded-xl border border-[var(--card-border)] py-2.5 text-sm text-[var(--muted)] hover:bg-[var(--surface-hover)] transition-colors">
                      Cancelar
                    </button>
                    <button
                      onClick={solicitarDeposito}
                      disabled={depositoLoading || !depositoValor}
                      className="flex-1 rounded-xl bg-emerald-600 dark:bg-emerald-700 text-white font-semibold py-2.5 text-sm hover:bg-emerald-700 dark:hover:bg-emerald-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {depositoLoading ? "Gerando PIX..." : "Depositar"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Modal PIX Mensalidade */}
        {modalPixMensalidade && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/50 backdrop-blur-md animate-fade-in-up">
            <div className="w-full max-w-sm rounded-2xl border border-[var(--card-border)] bg-[var(--card)] shadow-2xl overflow-hidden animate-fade-in-up animate-fade-in-up-delay-1">
              <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-[var(--card-border)]">
                <h2 className="text-sm font-semibold text-[var(--foreground)]">Pagar mensalidade</h2>
                <button onClick={fecharModalPix} className="p-1 -m-1 text-[var(--muted)] hover:text-[var(--foreground)] transition-colors rounded">
                  <IconX className="w-5 h-5" />
                </button>
              </div>
              <div className="p-5 space-y-4">
                <p className="text-sm text-[var(--muted)]">
                  Valor: <strong className="text-[var(--foreground)]">{BRL.format(modalPixMensalidade.valor)}</strong>
                </p>
                {pixErro && (
                  <p className={cn("text-xs rounded-xl px-3 py-2", DANGER_PREMIUM_SHELL, DANGER_PREMIUM_TEXT_PRIMARY)}>{pixErro}</p>
                )}
                {pixLoading && <p className="text-sm text-[var(--muted)]">Gerando PIX...</p>}
                {!pixLoading && pixQrCode && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                      <IconCheck className="w-5 h-5" />
                      <p className="text-sm font-semibold text-[var(--foreground)]">PIX gerado! Pague agora</p>
                    </div>
                    <p className="text-xs text-[var(--muted)]">Escaneie o QR Code ou copie o código PIX. Após pagar, aguarde a confirmação automática.</p>
                    {pixRestanteSec !== null && (
                      <div
                        className={`flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-medium ${
                          pixRestanteSec <= 60
                            ? cn(AMBER_PREMIUM_SURFACE, AMBER_PREMIUM_TEXT_PRIMARY)
                            : "bg-[var(--surface-subtle)] text-[var(--muted)]"
                        }`}
                      >
                        <IconClock className={`w-4 h-4 shrink-0 ${pixRestanteSec <= 60 ? "animate-pulse" : ""}`} />
                        Válido por {Math.floor(pixRestanteSec / 60)}:{(pixRestanteSec % 60).toString().padStart(2, "0")}
                      </div>
                    )}
                    <div className="flex justify-center p-4 bg-[var(--card)] rounded-xl">
                      <img src={`data:image/png;base64,${pixQrCode}`} alt="QR Code PIX" className="w-40 h-40" />
                    </div>
                    {pixCopiaCola && (
                      <div className="space-y-2">
                        <p className="text-xs text-[var(--muted)]">Código PIX (copia e cola):</p>
                        <div className="rounded-xl border border-[var(--card-border)] bg-[var(--surface-subtle)] px-3 py-2 text-xs font-mono text-left break-all max-h-20 overflow-y-auto">
                          {pixCopiaCola}
                        </div>
                        <button
                          type="button"
                          onClick={async () => {
                            await navigator.clipboard.writeText(pixCopiaCola!);
                            setPixMensalidadeCopiado(true);
                            setTimeout(() => setPixMensalidadeCopiado(false), 2000);
                          }}
                          className="w-full rounded-xl border-2 border-emerald-500 dark:border-emerald-600 bg-emerald-600 dark:bg-emerald-700 text-white font-semibold py-2.5 text-sm hover:opacity-90 transition-colors flex items-center justify-center gap-2"
                        >
                          {pixMensalidadeCopiado ? "Copiado!" : "Copiar código PIX"}
                        </button>
                      </div>
                    )}
                  </div>
                )}
                {!pixLoading && !pixQrCode && !pixErro && <p className="text-sm text-[var(--muted)]">Clique em Pagar para gerar o PIX.</p>}
              </div>
            </div>
          </div>
        )}

      </div>

      {!planoOk && seller && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/55 backdrop-blur-md"
          role="dialog"
          aria-modal="true"
          aria-labelledby="seller-plano-onboarding-titulo"
        >
          <div className="w-full max-w-lg rounded-2xl border border-[var(--card-border)] bg-[var(--card)] shadow-2xl p-6 sm:p-8 space-y-5 max-h-[90vh] overflow-y-auto">
            <div>
              <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400 uppercase tracking-wide">Bem-vindo</p>
              <h2 id="seller-plano-onboarding-titulo" className="text-xl font-bold text-[var(--foreground)] mt-1">
                Escolha seu plano
              </h2>
              <p className="text-sm text-[var(--muted)] mt-2 leading-relaxed">
                Para continuar no painel, selecione {SELLER_PLANO_OPCOES_LEGIVEL}. Os valores são a mensalidade de referência cadastrada na plataforma (tabela financeira); se a sua organização tiver outro valor contratual, ele será aplicado nas cobranças.
              </p>
            </div>
            {planoEscolhaErro && (
              <p className={cn("text-sm rounded-xl px-3 py-2", DANGER_PREMIUM_SHELL, DANGER_PREMIUM_TEXT_PRIMARY)}>
                {planoEscolhaErro}
              </p>
            )}
            <div className="grid sm:grid-cols-2 gap-3">
              <button
                type="button"
                disabled={planoSaving !== ""}
                onClick={() => void escolherPlano("starter")}
                className="rounded-xl border-2 border-[var(--card-border)] bg-[var(--surface-subtle)] px-4 py-4 text-left hover:border-emerald-500/60 transition-colors disabled:opacity-50"
              >
                <p className="text-sm font-bold text-[var(--foreground)]">
                  <span translate="no" lang="en">
                    {SELLER_PLANO_NOME_START}
                  </span>
                </p>
                <p className="text-lg font-bold text-emerald-700 dark:text-emerald-400 tabular-nums mt-1">{BRL.format(precoStarterMensal)}<span className="text-xs font-normal text-[var(--muted)]">/mês</span></p>
                <p className="text-[11px] text-[var(--muted)] mt-2 leading-snug">
                  Resumo financeiro, gráfico de volume por dia e fluxo essencial para operar com o armazém.
                </p>
                {planoSaving === "starter" ? (
                  <p className="text-xs text-emerald-600 mt-2">Salvando...</p>
                ) : null}
              </button>
              <button
                type="button"
                disabled={planoSaving !== ""}
                onClick={() => void escolherPlano("pro")}
                className="rounded-xl border-2 border-emerald-500/40 bg-emerald-100 dark:bg-emerald-950/25 px-4 py-4 text-left hover:border-emerald-500 transition-colors disabled:opacity-50"
              >
                <p className="text-sm font-bold text-[var(--foreground)]">
                  <span translate="no" lang="en">
                    {SELLER_PLANO_NOME_PRO}
                  </span>
                </p>
                <p className="text-lg font-bold text-emerald-700 dark:text-emerald-400 tabular-nums mt-1">{BRL.format(precoProMensal)}<span className="text-xs font-normal text-[var(--muted)]">/mês</span></p>
                <p className="text-[11px] text-[var(--muted)] mt-2 leading-snug">
                  Inclui blocos de desempenho e analytics no painel para acompanhar receita, custo e margem quando houver dados de venda.
                </p>
                {planoSaving === "pro" ? (
                  <p className="text-xs text-emerald-600 mt-2">Salvando...</p>
                ) : null}
              </button>
            </div>
          </div>
        </div>
      )}

      {modalArmazem && vinculoFornecedor?.ativo && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-md animate-fade-in-up"
          role="dialog"
          aria-modal="true"
          aria-labelledby="seller-modal-armazem-titulo"
          onClick={() => setModalArmazem(false)}
        >
          <div
            className="w-full max-w-md max-h-[min(90vh,calc(100dvh-2rem))] overflow-y-auto rounded-2xl border border-[var(--card-border)] bg-[var(--card)] shadow-2xl overflow-x-hidden animate-fade-in-up animate-fade-in-up-delay-1"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-[var(--card-border)]">
              <h2
                id="seller-modal-armazem-titulo"
                className={
                  vinculoFornecedor.liberado_antecipado
                    ? cn("text-sm font-semibold", AMBER_PREMIUM_TEXT_PRIMARY)
                    : !vinculoFornecedor.dentro_compromisso && !vinculoFornecedor.liberado_antecipado
                      ? "text-sm font-semibold text-emerald-700 dark:text-emerald-300"
                      : cn("text-sm font-semibold", PRIMARY_ACTION_BLUE_TEXT_PRIMARY)
                }
              >
                {vinculoFornecedor.liberado_antecipado
                  ? "Troca de armazém liberada pela DropCore"
                  : vinculoFornecedor.dentro_compromisso
                    ? "Compromisso mínimo com o armazém"
                    : "Armazém vinculado — troca liberada"}
              </h2>
              <button
                type="button"
                onClick={() => setModalArmazem(false)}
                className="p-1 -m-1 text-[var(--muted)] hover:text-[var(--foreground)] transition-colors rounded shrink-0"
                aria-label="Fechar"
              >
                <IconX className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 text-sm leading-relaxed text-[var(--foreground)] space-y-3">
              {vinculoFornecedor.liberado_antecipado ? (
                <p>
                  A equipe marcou liberação antecipada (ex.: infração comprovada). Combine a troca ou desvinculação pelo suporte antes de alterar integrações ou catálogo.
                </p>
              ) : vinculoFornecedor.dentro_compromisso ? (
                <p>
                  Pela regra da plataforma, permanecemos pelo menos <strong>{vinculoFornecedor.meses_minimos} meses</strong> com o mesmo armazém quando tudo corre bem (vale também entre uma troca e outra).
                  {vinculoFornecedor.pode_trocar_a_partir_de ? (
                    <>
                      {" "}
                      Troca ou remoção do víncio com a equipe a partir de{" "}
                      <span className="font-semibold">{formatDate(vinculoFornecedor.pode_trocar_a_partir_de.slice(0, 10))}</span>.
                    </>
                  ) : null}{" "}
                  Em caso de erro grave do fornecedor (pedidos errados, descumprimento), fale com o suporte DropCore.
                </p>
              ) : (
                <p>
                  {vinculoFornecedor.pode_trocar_a_partir_de ? (
                    <>
                      <strong>Já liberado desde {formatDate(vinculoFornecedor.pode_trocar_a_partir_de.slice(0, 10))}</strong> — fale com o <strong>suporte DropCore</strong> para trocar de armazém ou ajustar o víncio (a alteração é feita pela equipe no painel).
                    </>
                  ) : (
                    <>
                      Você pode solicitar troca ou desvinculação de armazém pelo <strong>suporte DropCore</strong>. A alteração é feita pela equipe no painel.
                    </>
                  )}{" "}
                  A cada troca efetiva, o período mínimo de <strong>{vinculoFornecedor.meses_minimos} meses</strong> volta a contar com o novo armazém.
                </p>
              )}
              <button
                type="button"
                onClick={() => setModalArmazem(false)}
                className="w-full rounded-xl bg-emerald-600 dark:bg-emerald-700 text-white font-semibold py-2.5 text-sm hover:bg-emerald-700 dark:hover:bg-emerald-600 transition-colors"
              >
                Entendi
              </button>
            </div>
          </div>
        </div>
      )}

      <SellerNav active="dashboard" />
      <NotificationToasts />
    </div>
  );
}
