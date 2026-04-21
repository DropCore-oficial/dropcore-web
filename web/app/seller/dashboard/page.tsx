"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { SellerNav } from "../SellerNav";
import { NotificationToasts } from "@/components/NotificationToasts";
import { NotificationBell } from "@/components/NotificationBell";
import { ThemeToggle } from "@/components/ThemeToggle";
import { IconTipoExtrato, IconDevolucao, IconArrowRight, IconPlus, IconClipboard, IconDeposito, IconChevronDown, IconCheck, IconX, IconClock } from "@/components/seller/Icons";

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

const tipoLabel: Record<string, { label: string }> = {
  CREDITO:   { label: "Depósito recebido" },
  BLOQUEIO:  { label: "Pedido enviado" },
  VENDA:     { label: "Venda" },
  DEVOLUCAO: { label: "Devolução" },
  REPASSE:   { label: "Repasse" },
  AJUSTE:    { label: "Ajuste" },
};

const statusLabel: Record<string, { label: string; cor: string }> = {
  BLOQUEADO:         { label: "Aguardando envio",  cor: "text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700" },
  ENTREGUE:          { label: "Entregue",           cor: "text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/40 border-blue-300 dark:border-blue-700" },
  AGUARDANDO_REPASSE:{ label: "Pedido postado",     cor: "text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/40 border-sky-300 dark:border-sky-700" },
  EM_DEVOLUCAO:      { label: "Em devolução",       cor: "text-orange-700 dark:text-orange-300 bg-orange-50 dark:bg-orange-950/40 border-orange-300 dark:border-orange-700" },
  DEVOLVIDO:         { label: "Devolvido",          cor: "text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-950/40 border-violet-300 dark:border-violet-700" },
  PAGO:              { label: "Concluído",          cor: "text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-700" },
  CANCELADO:         { label: "Cancelado",          cor: "text-neutral-600 dark:text-neutral-400 bg-neutral-100 dark:bg-neutral-800 border-neutral-300 dark:border-neutral-700" },
  LIBERADO:          { label: "Disponível",         cor: "text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-700" },
};

const isPositivo = (tipo: string) => tipo === "CREDITO" || tipo === "DEVOLUCAO";
const isNegativo = (tipo: string) => tipo === "BLOQUEIO" || tipo === "VENDA";

function groupByDate(entries: LedgerEntry[]): { label: string; items: LedgerEntry[] }[] {
  const hoje = new Date().toISOString().slice(0, 10);
  const ontem = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - diff);
  const inicioSemanaStr = d.toISOString().slice(0, 10);
  const inicioMes = new Date();
  inicioMes.setDate(1);
  const inicioMesStr = inicioMes.toISOString().slice(0, 10);

  const groups: { label: string; minDate: string; items: LedgerEntry[] }[] = [
    { label: "Hoje", minDate: hoje, items: [] },
    { label: "Ontem", minDate: ontem, items: [] },
    { label: "Esta semana", minDate: inicioSemanaStr, items: [] },
    { label: "Este mês", minDate: inicioMesStr, items: [] },
    { label: "Mais antigo", minDate: "1970-01-01", items: [] },
  ];

  for (const e of entries) {
    const d = e.data_evento.slice(0, 10);
    if (d >= hoje) groups[0].items.push(e);
    else if (d >= ontem) groups[1].items.push(e);
    else if (d >= inicioSemanaStr) groups[2].items.push(e);
    else if (d >= inicioMesStr) groups[3].items.push(e);
    else groups[4].items.push(e);
  }

  return groups.filter((g) => g.items.length > 0);
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
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [saldoAlerta, setSaldoAlerta] = useState<SaldoAlerta | null>(null);
  const [extrato, setExtrato] = useState<LedgerEntry[]>([]);
  const [depositos, setDepositos] = useState<Deposito[]>([]);
  const [mensalidades, setMensalidades] = useState<Mensalidade[]>([]);
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
  const [pixLoading, setPixLoading] = useState(false);
  const [pixQrCode, setPixQrCode] = useState<string | null>(null);
  const [pixCopiaCola, setPixCopiaCola] = useState<string | null>(null);
  const [pixErro, setPixErro] = useState<string | null>(null);
  const [pixExpiraEm, setPixExpiraEm] = useState<string | null>(null);
  const [pixRestanteSec, setPixRestanteSec] = useState<number | null>(null);
  const [movimentacoesAberto, setMovimentacoesAberto] = useState(false);
  const [chartPeriodo, setChartPeriodo] = useState<7 | 14 | 30 | 60 | 90 | 120 | "month:current" | "month:last" | string>(14);
  const [erpConectado, setErpConectado] = useState<boolean | null>(null);
  const [filtroTipo, setFiltroTipo] = useState<"" | "pedidos">("");
  const autoOpenedRef = useRef(false);
  const extratoRef = useRef<HTMLDivElement>(null);
  const [chartTooltipHover, setChartTooltipHover] = useState<{ dia: string; valor: number; count: number } | null>(null);

  const temMensalidadeVencida = mensalidades.some((m) => m.vencido);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) {
        router.replace("/seller/login");
        return;
      }
      const [meRes, mensRes, erpRes] = await Promise.all([
        fetch("/api/seller/me", { headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store" }),
        fetch("/api/seller/mensalidades", { headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store" }),
        fetch("/api/seller/erp-api-key", { headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store" }),
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
      setKpis(json.kpis ?? null);
      setSaldoAlerta(json.saldo_alerta ?? null);
      // Deduplica extrato por id
      const raw = json.extrato ?? [];
      const seen = new Set<string>();
      setExtrato(raw.filter((e: LedgerEntry) => { if (seen.has(e.id)) return false; seen.add(e.id); return true; }));
      setDepositos(json.depositos ?? []);
      if (mensRes.ok) {
        const mensJson = await mensRes.json();
        setMensalidades(mensJson.items ?? []);
      } else {
        setMensalidades([]);
      }
      if (erpRes.ok) {
        const erpJson = await erpRes.json();
        setErpConectado(erpJson.has_key ?? false);
      } else {
        setErpConectado(false);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro inesperado.");
    } finally {
      setLoading(false);
    }
  }

  const pagarMensRef = useRef(false);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const pagar = searchParams.get("pagar");
    if (pagar === "1" && mensalidades.length > 0 && !loading && !pagarMensRef.current) {
      pagarMensRef.current = true;
      abrirPixMensalidade(mensalidades[0]);
    }
  }, [searchParams.get("pagar"), mensalidades.length, loading]);

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
    if (temMensalidadeVencida) {
      const id = setInterval(load, 10000);
      return () => clearInterval(id);
    }
  }, [temMensalidadeVencida]);

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
    if (pagarParam === "1" && mensalidades.length > 0 && !loading && !pagarAbertoRef.current) {
      pagarAbertoRef.current = true;
      abrirPixMensalidade(mensalidades[0]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagarParam, mensalidades.length, loading]);

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

  async function sair() {
    await supabaseBrowser.auth.signOut();
    router.replace("/seller/login");
  }

  async function solicitarDeposito() {
    setDepositoErro(null);
    setDepositoQrCode(null);
    setDepositoCopiaCola(null);
    setDepositoLoading(true);
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) { router.replace("/seller/login"); return; }
      const res = await fetch("/api/seller/deposito-pix", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ valor: parseFloat(depositoValor.replace(",", ".")) }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Erro ao solicitar depósito.");
      if (json.qr_code_base64) {
        setDepositoQrCode(json.qr_code_base64);
        setDepositoCopiaCola(json.qr_code ?? null);
        setDepositoExpiraEm(json.expira_em ?? null);
        setDepositoSucesso(true);
      } else {
        setDepositoSucesso(true);
      }
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
          <div className="w-10 h-10 rounded-xl border-2 border-neutral-200 dark:border-neutral-700 border-t-emerald-500 dark:border-t-emerald-500 animate-spin" />
          <p className="text-sm text-neutral-500 dark:text-neutral-400 font-medium">Carregando…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[var(--background)] app-bg flex items-center justify-center p-4">
        <div className="rounded-2xl border border-red-200/80 dark:border-red-900/50 bg-white dark:bg-neutral-900/80 shadow-lg p-8 max-w-md w-full text-center">
          <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-950/50 flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
          </div>
          <p className="text-red-700 dark:text-red-300 font-semibold mb-2">Ocorreu um erro</p>
          <p className="text-neutral-600 dark:text-neutral-400 text-sm mb-6">{error}</p>
          <button onClick={load} className="rounded-xl bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 px-6 py-2.5 text-sm font-medium hover:opacity-90 transition-opacity">
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] app-bg pt-[calc(3rem+env(safe-area-inset-top,0px))] md:pt-14 pb-[calc(6.25rem+env(safe-area-inset-bottom,0px))] md:pb-8">
      <div className="w-full max-w-4xl mx-auto dropcore-px-content py-5 space-y-4">
        {/* 1. Header */}
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 min-w-0">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center text-base font-semibold text-emerald-700 dark:text-emerald-400 shrink-0">
              {seller?.nome?.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">Olá,</p>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 truncate">{seller?.nome}</h1>
                <span className={`rounded-md px-2 py-0.5 text-[10px] font-semibold ${
                  isPro ? "bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300" : "bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400"
                }`}>{isPro ? "PRO" : "STARTER"}</span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto sm:justify-end sm:shrink-0">
            {pendentesCount > 0 && (
              <button type="button" onClick={() => { setTab("depositos"); setMovimentacoesAberto(true); extratoRef.current?.scrollIntoView({ behavior: "smooth" }); }} className="rounded-lg bg-[var(--card)] border border-[var(--card-border)] px-2.5 py-2 min-h-[40px] sm:min-h-0 text-xs font-medium text-neutral-700 dark:text-neutral-300 touch-manipulation">
                {pendentesCount} PIX pendente{pendentesCount !== 1 ? "s" : ""}
              </button>
            )}
            <ThemeToggle className="hidden md:inline-flex min-h-[40px] min-w-[40px] items-center justify-center touch-manipulation" />
            <NotificationBell context="seller" />
            <button type="button" onClick={sair} className="rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-3 py-2 min-h-[40px] sm:min-h-0 text-sm font-medium text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800 touch-manipulation">
              Sair
            </button>
          </div>
        </header>

        {saldoAlerta && saldoAlerta.nivel !== "ok" && (
          <div
            role="status"
            className={`rounded-xl border p-4 shadow-sm ${
              saldoAlerta.nivel === "critico"
                ? "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/35"
                : "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30"
            }`}
          >
            <p className={`text-sm font-semibold ${saldoAlerta.nivel === "critico" ? "text-red-900 dark:text-red-200" : "text-amber-900 dark:text-amber-200"}`}>
              {saldoAlerta.nivel === "critico" ? "Saldo crítico para novos pedidos" : "Saldo baixo — antecipe um depósito"}
            </p>
            <p className="mt-1 text-xs text-neutral-700 dark:text-neutral-300 leading-relaxed">
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
              className={`mt-3 rounded-lg px-4 py-2 text-sm font-semibold text-white ${
                saldoAlerta.nivel === "critico" ? "bg-red-700 hover:bg-red-800" : "bg-amber-700 hover:bg-amber-800"
              }`}
            >
              Depositar PIX
            </button>
          </div>
        )}

        {/* 2. Resumo financeiro */}
        <section className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] shadow-sm overflow-hidden">
          <div className="p-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-0.5">Saldo total</p>
                <p className="text-2xl sm:text-3xl font-bold text-neutral-900 dark:text-neutral-100 tabular-nums">{BRL.format(seller?.saldo_atual ?? 0)}</p>
              </div>
              <button onClick={() => setModalDeposito(true)} className="rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 text-sm font-semibold shrink-0">
                + Depositar PIX
              </button>
            </div>
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="rounded-lg bg-[var(--card)] border border-[var(--card-border)] px-3 py-2">
                <p className="text-[11px] text-neutral-500 dark:text-neutral-400 font-medium">Disponível</p>
                <p className="text-sm font-bold text-neutral-900 dark:text-neutral-100 tabular-nums">{BRL.format(seller?.saldo_disponivel ?? 0)}</p>
              </div>
              <div className="rounded-lg bg-[var(--card)] border border-[var(--card-border)] px-3 py-2">
                <p className="text-[11px] text-neutral-500 dark:text-neutral-400 font-medium">Bloqueado</p>
                <p className="text-sm font-bold text-neutral-700 dark:text-neutral-300 tabular-nums">{BRL.format(seller?.saldo_bloqueado ?? 0)}</p>
              </div>
              <button
                type="button"
                onClick={() => { setFiltroTipo("pedidos"); setFiltroStatus(""); setTab("extrato"); setMovimentacoesAberto(true); extratoRef.current?.scrollIntoView({ behavior: "smooth" }); }}
                className="rounded-lg bg-[var(--card)] border border-[var(--card-border)] px-3 py-2 text-left hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
              >
                <p className="text-[11px] text-neutral-500 dark:text-neutral-400 font-medium">Pedidos (mês)</p>
                <p className="text-sm font-bold text-neutral-900 dark:text-neutral-100 tabular-nums">{kpis?.pedidos_mes ?? 0}</p>
              </button>
              <button
                type="button"
                onClick={() => { setFiltroTipo("pedidos"); setFiltroStatus(""); setTab("extrato"); setMovimentacoesAberto(true); extratoRef.current?.scrollIntoView({ behavior: "smooth" }); }}
                className="rounded-lg bg-[var(--card)] border border-[var(--card-border)] px-3 py-2 text-left hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
              >
                <p className="text-[11px] text-neutral-500 dark:text-neutral-400 font-medium">Volume (mês)</p>
                <p className="text-sm font-bold text-neutral-900 dark:text-neutral-100 tabular-nums">{BRL.format(kpis?.total_mes ?? 0)}</p>
              </button>
            </div>
            {aLiberar > 0 && (
              <div className="mt-3 pt-3 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-between">
                <span className="text-xs text-neutral-500 dark:text-neutral-400 font-medium">A liberar (aguardando repasse)</span>
                <span className="text-sm font-bold text-neutral-900 dark:text-neutral-100 tabular-nums">{BRL.format(aLiberar)}</span>
              </div>
            )}
            {mensalidades.length > 0 && (
              <div className="mt-3 pt-3 border-t flex items-center justify-between rounded-lg px-3 py-2 bg-[var(--card)] border border-[var(--card-border)]">
                <div>
                  <p className="text-xs font-medium text-neutral-700 dark:text-neutral-300">Mensalidade pendente</p>
                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400">{mensalidades[0].vencido ? "Vencida" : mensalidades[0].vencimento_em ? `Vence ${new Date(mensalidades[0].vencimento_em + "T12:00:00").toLocaleDateString("pt-BR", { day: "numeric", month: "short" })}` : ""}</p>
                </div>
                <button onClick={() => abrirPixMensalidade(mensalidades[0])} className="rounded-lg bg-neutral-900 dark:bg-neutral-100 hover:opacity-90 text-white dark:text-neutral-900 px-3 py-1.5 text-xs font-medium">
                  Pagar {BRL.format(mensalidades[0].valor)}
                </button>
              </div>
            )}
          </div>
        </section>

        {/* 2a. Gráfico — volume por dia (hoje sempre fixo à direita) */}
        <section className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-neutral-100 dark:border-neutral-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <p className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">Volume de pedidos · Hoje fixo</p>
            <div className="flex flex-wrap items-center gap-2">
              {([7, 14, 30, 60, 90, 120] as const).map((n) => (
                <button
                  key={n}
                  onClick={() => setChartPeriodo(n)}
                  className={`rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
                    chartPeriodo === n
                      ? "bg-emerald-600 text-white"
                      : "bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700"
                  }`}
                >
                  {n}d
                </button>
              ))}
              <select
                value={typeof chartPeriodo === "string" ? chartPeriodo : ""}
                onChange={(e) => { const v = e.target.value; if (v) setChartPeriodo(v); }}
                className="rounded-lg px-2.5 py-1.5 text-[11px] font-medium bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 border-0 cursor-pointer focus:ring-2 focus:ring-emerald-500"
              >
                <option value="">Mês…</option>
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
                <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-3">Sem movimentações neste período</p>
                <button
                  onClick={() => router.push("/seller/catalogo")}
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
                          className="w-full rounded-t bg-emerald-500 hover:bg-emerald-600 transition-colors cursor-default"
                          style={{ height: `${barH}px` }}
                          title={`${periodLabel}: ${BRL.format(d.valor)}${count ? ` · ${count} pedidos` : ""}`}
                        />
                        {chartTooltipHover?.dia === d.dia && (
                          <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
                            <div className="rounded-xl border border-neutral-200 dark:border-neutral-600 bg-white dark:bg-neutral-900 shadow-xl py-3 px-4 min-w-[180px]">
                              <p className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-2.5">{periodLabel}</p>
                              <div className="space-y-1.5 text-xs">
                                <div className="flex justify-between gap-4">
                                  <span className="text-neutral-500 dark:text-neutral-400">Volume</span>
                                  <span className="font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">{BRL.format(d.valor)}</span>
                                </div>
                                {count > 0 && (
                                  <>
                                    <div className="flex justify-between gap-4">
                                      <span className="text-neutral-500 dark:text-neutral-400">Pedidos</span>
                                      <span className="font-semibold text-neutral-900 dark:text-neutral-100">{count}</span>
                                    </div>
                                    {ticketMedio != null && (
                                      <div className="flex justify-between gap-4 pt-1 border-t border-neutral-100 dark:border-neutral-800">
                                        <span className="text-neutral-500 dark:text-neutral-400">Ticket médio</span>
                                        <span className="font-semibold text-neutral-900 dark:text-neutral-100 tabular-nums">{BRL.format(ticketMedio)}</span>
                                      </div>
                                    )}
                                  </>
                                )}
                              </div>
                              <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 rotate-45 border-r border-b border-neutral-200 dark:border-neutral-600 bg-white dark:bg-neutral-900" />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-between mt-1 px-0.5">
                  <span className="text-[10px] text-neutral-500">
                    {chartData[0]?.dia?.length >= 10 ? `${chartData[0].dia.slice(8)}/${chartData[0].dia.slice(5, 7)}` : chartData[0]?.dia ?? ""}
                  </span>
                  <span className={`text-[10px] ${ultimoDiaHoje ? "font-medium text-emerald-600 dark:text-emerald-400" : "text-neutral-500"}`}>
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
          <section className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] shadow-sm overflow-hidden">
            <div className="px-4 py-3 flex items-center justify-between border-b border-neutral-100 dark:border-neutral-800 bg-[var(--card)]">
              <div className="flex items-center gap-2">
                <p className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">Desempenho</p>
                <span className="rounded-full bg-neutral-100 dark:bg-neutral-800 px-2 py-0.5 text-[10px] font-bold text-neutral-700 dark:text-neutral-300">PRO · 30 dias</span>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-0 divide-x divide-y sm:divide-y-0 divide-neutral-100 dark:divide-neutral-800">
              {analytics30d.temDadosVenda ? (
                <>
                  <div className="px-4 py-3">
                    <p className="text-[11px] text-neutral-500 dark:text-neutral-400">Receita</p>
                    <p className="text-sm font-bold text-neutral-900 dark:text-neutral-100 tabular-nums">{BRL.format(analytics30d.receitaTotal)}</p>
                  </div>
                  <div className="px-4 py-3">
                    <p className="text-[11px] text-neutral-500 dark:text-neutral-400">Custo</p>
                    <p className="text-sm font-bold text-neutral-600 dark:text-neutral-400 tabular-nums">{BRL.format(analytics30d.custoTotal)}</p>
                  </div>
                  <div className="px-4 py-3">
                    <p className="text-[11px] text-neutral-500 dark:text-neutral-400">Lucro</p>
                    <p className={`text-sm font-bold tabular-nums ${analytics30d.lucroTotal >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500"}`}>{BRL.format(analytics30d.lucroTotal)}</p>
                  </div>
                  <div className="px-4 py-3">
                    <p className="text-[11px] text-neutral-500 dark:text-neutral-400">{analytics30d.margemMedia != null ? "Margem" : "Ticket médio"}</p>
                    <p className={`text-sm font-bold tabular-nums ${analytics30d.margemMedia != null && analytics30d.margemMedia >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-neutral-900 dark:text-neutral-100"}`}>
                      {analytics30d.margemMedia != null ? `${analytics30d.margemMedia.toFixed(1)}%` : analytics30d.pedidos > 0 ? BRL.format(analytics30d.custoTotal / analytics30d.pedidos) : "—"}
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <div className="px-4 py-3 sm:col-span-2">
                    <p className="text-[11px] text-neutral-500 dark:text-neutral-400">Custo total (pedidos)</p>
                    <p className="text-sm font-bold text-neutral-900 dark:text-neutral-100 tabular-nums">{BRL.format(analytics30d.custoTotal)}</p>
                  </div>
                  <div className="px-4 py-3 sm:col-span-2">
                    <p className="text-[11px] text-neutral-500 dark:text-neutral-400">Pedidos</p>
                    <p className="text-sm font-bold text-neutral-900 dark:text-neutral-100">{analytics30d.pedidos}</p>
                  </div>
                </>
              )}
            </div>
            {analytics30d.topProduto && (
              <div className="px-4 py-2 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-between text-xs">
                <span className="text-neutral-500 dark:text-neutral-400">Top:</span>
                <span className="font-medium text-neutral-900 dark:text-neutral-100 truncate max-w-[60%]">{analytics30d.topProduto.nome}</span>
                <span className="text-neutral-500 shrink-0">{analytics30d.topProduto.count} vendas</span>
              </div>
            )}
            {analytics30d.vendasPorDia.some(([, v]) => (v as { receita: number; custo: number }).receita > 0 || (v as { receita: number; custo: number }).custo > 0) && (
              <div className="px-4 pb-3 pt-1">
                <div className="flex items-end gap-[2px] h-10 rounded overflow-hidden">
                  {(analytics30d.vendasPorDia as [string, { receita: number; custo: number }][]).map(([dia, val]) => {
                    const principal = analytics30d!.temDadosVenda ? val.receita : val.custo;
                    const max = Math.max(...(analytics30d!.vendasPorDia as [string, { receita: number; custo: number }][]).map(([, v]) => analytics30d!.temDadosVenda ? v.receita : v.custo), 1);
                    return (
                      <div key={dia} title={`${dia}: ${BRL.format(principal)}`} className="flex-1 min-w-0 bg-emerald-500 hover:bg-emerald-600 rounded-t" style={{ height: `${Math.max((principal / max) * 100, principal > 0 ? 4 : 2)}%` }} />
                    );
                  })}
                </div>
                <p className="text-[10px] text-neutral-500 dark:text-neutral-400 mt-1">Últimos 14 dias</p>
              </div>
            )}
          </section>
        )}

        {/* 3. Atalhos — linha horizontal */}
        <section className="grid grid-cols-3 gap-2">
          <button onClick={() => router.push("/seller/calculadora")} className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4 flex items-center gap-3 hover:border-neutral-300 dark:hover:border-neutral-600 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors text-left group">
            <div className="w-10 h-10 rounded-xl bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-neutral-600 dark:text-neutral-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
            <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 truncate">Calculadora</span>
          </button>
          <button onClick={() => router.push("/seller/catalogo")} className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4 flex items-center gap-3 hover:border-neutral-300 dark:hover:border-neutral-600 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors text-left group">
            <div className="w-10 h-10 rounded-xl bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-neutral-600 dark:text-neutral-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                <line x1="12" y1="22.08" x2="12" y2="12" />
              </svg>
            </div>
            <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 truncate">Catálogo</span>
          </button>
          <button onClick={() => router.push("/seller/integracoes-erp")} className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4 flex items-center gap-3 hover:border-neutral-300 dark:hover:border-neutral-600 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors text-left group relative">
            <div className="w-10 h-10 rounded-xl bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-neutral-600 dark:text-neutral-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22v-5" />
                <path d="M9 8V2" />
                <path d="M15 8V2" />
                <path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z" />
              </svg>
            </div>
            <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 truncate">Integrações</span>
            {erpConectado === true && (
              <span className="absolute top-2 right-2 rounded-full bg-neutral-100 dark:bg-neutral-800 px-2 py-0.5 text-[10px] font-semibold text-neutral-600 dark:text-neutral-400">
                Conectado
              </span>
            )}
          </button>
        </section>

        {/* 4. Alerta devoluções (se houver) */}
        {temDevolucoes && (
          <button
            type="button"
            onClick={() => { setTab("extrato"); setFiltroStatus(emDevolucaoCount > 0 ? "EM_DEVOLUCAO" : "DEVOLVIDO"); setMovimentacoesAberto(true); extratoRef.current?.scrollIntoView({ behavior: "smooth" }); }}
            className="w-full rounded-xl border border-[var(--card-border)] bg-[var(--card)] px-4 py-3 flex items-center gap-3 text-left hover:bg-neutral-50 dark:hover:bg-neutral-800"
          >
            <div className="w-9 h-9 rounded-lg bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center shrink-0 text-neutral-600 dark:text-neutral-300">
              <IconDevolucao className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                {emDevolucaoCount > 0 ? `${emDevolucaoCount} pedido(s) em devolução` : `${devolvidoCount} devolução(ões) concluída(s)`}
              </p>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">Clique para ver no extrato</p>
            </div>
            <IconArrowRight className="w-5 h-5 text-neutral-400 shrink-0" />
          </button>
        )}

        {/* 5. Extrato / Depósitos — recolhível */}
        <section ref={extratoRef} className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] shadow-sm overflow-hidden">
          {/* Cabeçalho com tabs e botão recolher */}
          <div className="flex items-center justify-between gap-3 border-b border-neutral-200 dark:border-neutral-700 bg-[var(--card)] px-3">
            <div className="flex items-center gap-1">
              {(["extrato", "depositos"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => { setTab(t); if (!movimentacoesAberto) setMovimentacoesAberto(true); }}
                  className={`px-4 py-3 text-sm font-medium rounded-t-lg -mb-px transition-all ${
                    tab === t
                      ? "bg-white dark:bg-neutral-900 text-emerald-600 dark:text-emerald-400 border border-neutral-200 dark:border-neutral-700 border-b-transparent shadow-sm"
                      : "text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300"
                  }`}
                >
                  {t === "extrato" ? "Extrato" : "Depósitos PIX"}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              {tab === "depositos" && (
                <button onClick={() => setModalDeposito(true)} className="rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 text-xs font-semibold">
                  + Novo depósito
                </button>
              )}
              <button onClick={load} className="rounded-lg border border-neutral-200 dark:border-neutral-600 px-2.5 py-1.5 text-xs text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800">
                Atualizar
              </button>
              <button
                type="button"
                onClick={() => setMovimentacoesAberto(!movimentacoesAberto)}
                className="rounded-lg px-2 py-1.5 text-xs text-neutral-500 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700 hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors flex items-center gap-1.5"
                title={movimentacoesAberto ? "Recolher" : "Expandir"}
              >
                {!movimentacoesAberto && (
                  <span>
                    {tab === "extrato" ? `${extratoFiltrado.length} movimentações` : `${depositos.length} depósito${depositos.length !== 1 ? "s" : ""}`}
                  </span>
                )}
                <svg className={`w-4 h-4 transition-transform ${movimentacoesAberto ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="m18 15-6-6-6 6" />
                </svg>
              </button>
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
                          : "bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700 hover:text-neutral-900 dark:hover:text-neutral-200"
                      }`}
                    >
                      {s === "" ? "Todos" : (statusLabel[s]?.label ?? s)}
                    </button>
                  ))}
                </div>
              </div>

              {extratoFiltrado.length === 0 ? (
                <div className="py-16 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center mx-auto mb-4 text-neutral-400 dark:text-neutral-500">
                    <IconClipboard className="w-7 h-7" />
                  </div>
                  <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">
                    {filtroTipo === "pedidos" ? "Nenhum pedido" : `Nenhuma movimentação${filtroStatus ? " com este filtro" : ""}`}
                  </p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-500 mt-1">Suas transações aparecerão aqui</p>
                  {(filtroStatus || filtroTipo) && (
                    <button
                      onClick={() => { setFiltroStatus(""); setFiltroTipo(""); }}
                      className="mt-4 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 px-4 py-2 text-sm font-medium hover:bg-emerald-100 dark:hover:bg-emerald-900/40"
                    >
                      Ver todas
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-6">
                  {extratoAgrupado.map((group) => (
                    <div key={group.label}>
                      <p className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-3 px-1">{group.label}</p>
                      <div className="rounded-lg border border-neutral-100 dark:border-neutral-800 overflow-hidden">
                      {group.items.map((e) => {
                        const info = tipoLabel[e.tipo] ?? { label: e.tipo };
                        const st = statusLabel[e.status];
                        return (
                          <div key={e.id} className="flex items-center gap-4 px-4 py-3 border-b border-neutral-100 dark:border-neutral-800 last:border-0 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors">
                              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                                isPositivo(e.tipo) ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400" :
                                isNegativo(e.tipo) ? "bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400" :
                                "bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400"
                              }`}>
                                <IconTipoExtrato tipo={e.tipo} className="w-5 h-5" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{e.nome_produto || info.label}</p>
                                <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                                  {formatDateTime(e.data_evento)}{e.fornecedor_nome ? ` · ${e.fornecedor_nome}` : ""}
                                </p>
                                {e.preco_venda != null && e.custo != null && e.preco_venda > 0 && (
                                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-1">
                                    Venda {BRL.format(e.preco_venda)} · Margem{" "}
                                    <span className={e.preco_venda - e.custo >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500"}>
                                      {((e.preco_venda - e.custo) / e.preco_venda * 100).toFixed(0)}%
                                    </span>
                                  </p>
                                )}
                              </div>
                              <div className="text-right shrink-0">
                                <p className={`text-base font-bold tabular-nums ${isPositivo(e.tipo) ? "text-emerald-600 dark:text-emerald-400" : isNegativo(e.tipo) ? "text-neutral-900 dark:text-neutral-100" : "text-neutral-400 dark:text-neutral-500"}`}>
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
                  <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Nenhum depósito ainda</p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-500 mt-1">Adicione saldo via PIX para continuar vendendo</p>
                  <button onClick={() => setModalDeposito(true)} className="mt-6 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 text-sm font-semibold shadow-lg shadow-emerald-900/20 hover:shadow-emerald-900/30 transition-all">
                    + Solicitar depósito
                  </button>
                </div>
              ) : (
                <div className="rounded-lg border border-neutral-100 dark:border-neutral-800 overflow-hidden">
                  {depositos.map((d) => (
                    <div
                      key={d.id}
                      ref={(el) => { depositoRefs.current[d.id] = el; }}
                      className={`flex items-center gap-4 px-4 py-4 border-b border-neutral-100 dark:border-neutral-800 last:border-0 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors ${
                        destaqueId === d.id ? "ring-2 ring-emerald-500 ring-inset bg-emerald-50/50 dark:bg-emerald-950/20" : ""
                      }`}
                    >
                      <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center shrink-0 text-emerald-600 dark:text-emerald-400">
                        <IconPlus className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">Depósito via PIX</p>
                        <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
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
                              ? "bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300"
                              : "bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400"
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
            <div className="w-full max-w-sm rounded-2xl border border-neutral-200/80 dark:border-neutral-700/80 bg-white dark:bg-neutral-900 shadow-2xl overflow-hidden animate-fade-in-up animate-fade-in-up-delay-1">
              <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-neutral-200 dark:border-neutral-700">
                <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Solicitar depósito via PIX</h2>
                <button onClick={fecharModal} className="p-1 -m-1 text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-colors rounded">
                  <IconX className="w-5 h-5" />
                </button>
              </div>

              {depositoSucesso ? (
                depositoQrCode ? (
                  <div className="p-5 space-y-4">
                    <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                      <IconCheck className="w-5 h-5" />
                      <p className="text-sm font-semibold">PIX gerado! Pague agora</p>
                    </div>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">Escaneie o QR Code ou copie o código PIX. O saldo será creditado automaticamente após o pagamento.</p>
                    {depositoRestanteSec !== null && (
                      <div className={`flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-medium ${depositoRestanteSec <= 60 ? "bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-200" : "bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400"}`}>
                        <IconClock className={`w-4 h-4 shrink-0 ${depositoRestanteSec <= 60 ? "animate-pulse" : ""}`} />
                        Válido por {Math.floor(depositoRestanteSec / 60)}:{(depositoRestanteSec % 60).toString().padStart(2, "0")}
                      </div>
                    )}
                    <div className="flex justify-center p-4 bg-white dark:bg-neutral-800 rounded-xl">
                      <img src={`data:image/png;base64,${depositoQrCode}`} alt="QR Code PIX" className="w-40 h-40" />
                    </div>
                    {depositoCopiaCola && (
                      <div className="space-y-2">
                        <p className="text-xs text-neutral-500 dark:text-neutral-400">Código PIX (copia e cola):</p>
                        <div className="rounded-xl border border-neutral-300 dark:border-neutral-600 bg-neutral-50 dark:bg-neutral-800 px-3 py-2 text-xs font-mono text-neutral-600 dark:text-neutral-400 break-all max-h-20 overflow-y-auto">
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
                    <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Solicitação enviada!</p>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">Faça o PIX e aguarde a aprovação. O saldo será creditado assim que confirmado.</p>
                    <button onClick={fecharModal} className="w-full rounded-xl bg-white dark:bg-neutral-800 text-black dark:text-white font-semibold py-2.5 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors mt-2">
                      Fechar
                    </button>
                  </div>
                )
              ) : (
                <div className="p-5 space-y-4">
                  <div className="rounded-xl bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 p-3 text-xs text-neutral-600 space-y-1">
                    <p>1. Informe o valor que deseja depositar (mín. R$ 500)</p>
                    <p>2. Clique em Depositar — o QR Code PIX será gerado</p>
                    <p>3. Escaneie ou copie o código e pague no app do seu banco</p>
                    <p>4. O saldo é creditado automaticamente após o pagamento</p>
                  </div>

                  <div>
                    <label className="text-xs text-neutral-500 dark:text-neutral-400 mb-1.5 block">Valor (mínimo R$ 500,00)</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="0,00"
                      value={depositoValor}
                      onChange={(e) => setDepositoValor(e.target.value)}
                      className="w-full rounded-xl bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-600 px-3 py-2.5 text-neutral-900 dark:text-neutral-100 text-sm focus:outline-none focus:border-neutral-400 dark:focus:border-neutral-500 placeholder-neutral-400 dark:placeholder-neutral-500"
                    />
                  </div>

                  {depositoErro && (
                    <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{depositoErro}</p>
                  )}

                  <div className="flex gap-2 pt-1">
                    <button onClick={fecharModal} className="flex-1 rounded-xl border border-neutral-300 dark:border-neutral-600 py-2.5 text-sm text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors">
                      Cancelar
                    </button>
                    <button
                      onClick={solicitarDeposito}
                      disabled={depositoLoading || !depositoValor}
                      className="flex-1 rounded-xl bg-emerald-600 dark:bg-emerald-700 text-white font-semibold py-2.5 text-sm hover:bg-emerald-700 dark:hover:bg-emerald-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {depositoLoading ? "Gerando PIX…" : "Depositar"}
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
            <div className="w-full max-w-sm rounded-2xl border border-neutral-200/80 dark:border-neutral-700/80 bg-white dark:bg-neutral-900 shadow-2xl overflow-hidden animate-fade-in-up animate-fade-in-up-delay-1">
              <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-neutral-200 dark:border-neutral-700">
                <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Pagar mensalidade</h2>
                <button onClick={fecharModalPix} className="p-1 -m-1 text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-colors rounded">
                  <IconX className="w-5 h-5" />
                </button>
              </div>
              <div className="p-5 space-y-4">
                <p className="text-sm text-neutral-600 dark:text-neutral-400">
                  Valor: <strong className="text-neutral-900 dark:text-neutral-100">{BRL.format(modalPixMensalidade.valor)}</strong>
                </p>
                {pixErro && (
                  <p className="text-xs text-red-700 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-xl px-3 py-2">{pixErro}</p>
                )}
                {pixLoading && <p className="text-sm text-neutral-500">Gerando PIX…</p>}
                {!pixLoading && pixQrCode && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                      <IconCheck className="w-5 h-5" />
                      <p className="text-sm font-semibold">PIX gerado! Pague agora</p>
                    </div>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">Escaneie o QR Code ou copie o código PIX. Após pagar, aguarde a confirmação automática.</p>
                    {pixRestanteSec !== null && (
                      <div className={`flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-medium ${pixRestanteSec <= 60 ? "bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-200" : "bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400"}`}>
                        <IconClock className={`w-4 h-4 shrink-0 ${pixRestanteSec <= 60 ? "animate-pulse" : ""}`} />
                        Válido por {Math.floor(pixRestanteSec / 60)}:{(pixRestanteSec % 60).toString().padStart(2, "0")}
                      </div>
                    )}
                    <div className="flex justify-center p-4 bg-white dark:bg-neutral-800 rounded-xl">
                      <img src={`data:image/png;base64,${pixQrCode}`} alt="QR Code PIX" className="w-40 h-40" />
                    </div>
                    {pixCopiaCola && (
                      <div className="space-y-2">
                        <p className="text-xs text-neutral-500 dark:text-neutral-400">Código PIX (copia e cola):</p>
                        <div className="rounded-xl border border-neutral-300 dark:border-neutral-600 bg-neutral-50 dark:bg-neutral-800 px-3 py-2 text-xs font-mono text-left break-all max-h-20 overflow-y-auto">
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
                {!pixLoading && !pixQrCode && !pixErro && <p className="text-sm text-neutral-500">Clique em Pagar para gerar o PIX.</p>}
              </div>
            </div>
          </div>
        )}

      </div>

      <SellerNav active="dashboard" />
      <NotificationToasts />
    </div>
  );
}
