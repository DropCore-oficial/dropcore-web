"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import Link from "next/link";
import { FornecedorNav } from "../FornecedorNav";
import { NotificationToasts } from "@/components/NotificationToasts";
import { IconArrowRight, IconCheck, IconX, IconClock } from "@/components/seller/Icons";
import { AMBER_PREMIUM_SURFACE_TRANSPARENT, AMBER_PREMIUM_TEXT_PRIMARY } from "@/lib/amberPremium";
import { AmberPremiumCallout } from "@/components/ui/AmberPremiumCallout";
import { cn } from "@/lib/utils";

const FORNECEDOR_BADGE_PENDENTE = cn(
  AMBER_PREMIUM_SURFACE_TRANSPARENT,
  AMBER_PREMIUM_TEXT_PRIMARY
);

type FornecedorData = {
  id: string;
  nome: string;
  org_id: string;
  status: string;
  cadastro_minimo_completo?: boolean;
  logo_url?: string | null;
};

type RepasseItem = {
  id: string;
  ciclo_repasse: string;
  valor_total: number;
  status: string;
  pago_em: string | null;
  atualizado_em: string | null;
};
type RepasseFuturo = {
  ciclo_repasse: string;
  valor_previsto: number;
  pedidos: number;
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

/** Mesma regra que `vencimentoExibicaoAdmin`: em trial ativo → data fim do trial; senão → vencimento da mensalidade. */
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

const statusLabel: Record<string, { label: string; cor: string }> = {
  pendente: { label: "Pendente", cor: FORNECEDOR_BADGE_PENDENTE },
  liberado: { label: "Liberado", cor: "text-sky-700 dark:text-sky-300 bg-sky-100 dark:bg-sky-950/40 border-sky-300 dark:border-sky-700" },
  pago: { label: "Pago", cor: "text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-700" },
};

export default function FornecedorDashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fornecedor, setFornecedor] = useState<FornecedorData | null>(null);
  const [repasseItems, setRepasseItems] = useState<RepasseItem[]>([]);
  const [repasseFuturos, setRepasseFuturos] = useState<RepasseFuturo[]>([]);
  const [totalAReceber, setTotalAReceber] = useState(0);
  const [stats, setStats] = useState<{
    pedidos_aguardando_postagem: number;
    pedidos_mes_count: number;
    pedidos_mes_valor: number;
    produtos_ativos: number;
    estoque_baixo: number;
    total_a_receber: number;
  } | null>(null);
  const [mensalidades, setMensalidades] = useState<Mensalidade[]>([]);
  const [trialAtivo, setTrialAtivo] = useState(false);
  const [trialValidoAte, setTrialValidoAte] = useState<string | null>(null);
  const [modalPixMensalidade, setModalPixMensalidade] = useState<Mensalidade | null>(null);
  const [pixLoading, setPixLoading] = useState(false);
  const [pixQrCode, setPixQrCode] = useState<string | null>(null);
  const [pixCopiaCola, setPixCopiaCola] = useState<string | null>(null);
  const [pixErro, setPixErro] = useState<string | null>(null);
  const [pixExpiraEm, setPixExpiraEm] = useState<string | null>(null);
  const [pixRestanteSec, setPixRestanteSec] = useState<number | null>(null);
  const [pixCopiado, setPixCopiado] = useState(false);
  const [repasseAberto, setRepasseAberto] = useState(false);
  const [tooltipHover, setTooltipHover] = useState<{ dia: string; valor: number; count: number } | null>(null);
  const repasseRef = useRef<HTMLDivElement>(null);
  const [chartMode, setChartMode] = useState<"hoje" | "dias">("dias");
  const [chartPeriodo, setChartPeriodo] = useState<7 | 14 | 30 | 60 | 90 | 120 | "month:current" | "month:last" | string>(14);
  const [desempenho, setDesempenho] = useState<{
    vendasPorDia: { dia: string; valor: number; count: number }[];
    totalPedidos: number;
    valorTotal: number;
    ticketMedio: number | null;
    topProduto: { nome: string; count: number; valor: number } | null;
    dias: number;
    modo?: string;
    valorAnterior?: number;
    pedidosAnteriores?: number;
    pedidos?: { criado_em: string; valor_fornecedor: number; nome_produto: string | null }[];
  } | null>(null);

  const searchParams = useSearchParams();
  const pagarAbertoRef = useRef(false);

  const temMensalidadeVencida = mensalidades.some((m) => m.vencido);
  const cobrancaMensalidadeAtiva = !trialAtivo;
  const totalRepasseFuturo = repasseFuturos.reduce((acc, item) => acc + Number(item.valor_previsto || 0), 0);
  const proxRepasseFuturo = repasseFuturos[0] ?? null;

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) {
        router.replace("/fornecedor/login");
        return;
      }
      const headers = { Authorization: `Bearer ${session.access_token}` };

      const [meRes, repRes, statsRes, mensRes] = await Promise.all([
        fetch("/api/fornecedor/me", { headers, cache: "no-store" }),
        fetch("/api/fornecedor/repasse-list?include_preview=1", { headers, cache: "no-store" }),
        fetch("/api/fornecedor/dashboard-stats", { headers, cache: "no-store" }),
        fetch("/api/fornecedor/mensalidades", { headers, cache: "no-store" }),
      ]);

      if (!meRes.ok) {
        const j = await meRes.json().catch(() => ({}));
        if (
          meRes.status === 401 ||
          meRes.status === 404 ||
          (meRes.status === 403 && j?.code === "FORNECEDOR_SEM_VINCULO_ORG_MEMBERS")
        ) {
          await supabaseBrowser.auth.signOut();
          router.replace("/fornecedor/login");
          return;
        }
        throw new Error(typeof j?.error === "string" ? j.error : "Erro ao carregar dados.");
      }
      const meJson = await meRes.json();
      setFornecedor(meJson.fornecedor);

      if (repRes.ok) {
        const repJson = await repRes.json();
        setRepasseItems(repJson.items ?? []);
        setTotalAReceber(repJson.total_a_receber ?? 0);
        setRepasseFuturos(repJson.futuros ?? []);
      } else {
        setRepasseItems([]);
        setRepasseFuturos([]);
        setTotalAReceber(0);
      }

      if (statsRes.ok) {
        const statsJson = await statsRes.json();
        setStats(statsJson);
      } else {
        setStats(null);
      }
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

      const modo = chartMode;
      const periodParam = typeof chartPeriodo === "string" ? chartPeriodo : String(chartPeriodo);
      const desempenhoRes = await fetch(
        `/api/fornecedor/desempenho?modo=${modo}&periodo=${encodeURIComponent(periodParam)}`,
        { headers, cache: "no-store" }
      );
      if (desempenhoRes.ok) {
        const dJson = await desempenhoRes.json();
        setDesempenho(dJson);
      } else {
        setDesempenho(null);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro inesperado.");
    } finally {
      setLoading(false);
    }
  }

  async function loadDesempenho() {
    const { data: { session } } = await supabaseBrowser.auth.getSession();
    if (!session?.access_token) return;
    try {
      const periodParam = typeof chartPeriodo === "string" ? chartPeriodo : String(chartPeriodo);
      const res = await fetch(
        `/api/fornecedor/desempenho?modo=${chartMode}&periodo=${encodeURIComponent(periodParam)}`,
        { headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store" }
      );
      if (res.ok) {
        const d = await res.json();
        setDesempenho(d);
      }
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!loading) loadDesempenho();
  }, [chartMode, chartPeriodo, loading]);

  useEffect(() => {
    const pagar = searchParams.get("pagar");
    if (
      pagar === "1" &&
      mensalidades.length > 0 &&
      !loading &&
      !pagarAbertoRef.current &&
      cobrancaMensalidadeAtiva
    ) {
      pagarAbertoRef.current = true;
      abrirPixMensalidade(mensalidades[0]);
    }
  }, [searchParams.get("pagar"), mensalidades.length, loading, cobrancaMensalidadeAtiva]);

  useEffect(() => {
    if (!temMensalidadeVencida || !cobrancaMensalidadeAtiva) return;
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, [temMensalidadeVencida, cobrancaMensalidadeAtiva]);

  useEffect(() => {
    if (!pixExpiraEm || !pixQrCode) return;
    const tick = () => {
      const rest = Math.max(0, Math.floor((new Date(pixExpiraEm!).getTime() - Date.now()) / 1000));
      setPixRestanteSec(rest);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [pixExpiraEm, pixQrCode]);

  useEffect(() => {
    if (repasseItems.length > 0 && totalAReceber > 0) {
      setRepasseAberto(true);
    }
  }, [repasseItems.length, totalAReceber]);

  async function abrirPixMensalidade(m: Mensalidade) {
    setModalPixMensalidade(m);
    setPixLoading(true);
    setPixQrCode(null);
    setPixCopiaCola(null);
    setPixErro(null);
    setPixExpiraEm(null);
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) { router.replace("/fornecedor/login"); return; }
      const res = await fetch(`/api/fornecedor/mensalidades/${m.id}/cobranca-pix`, {
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
    setPixErro(null);
    setPixExpiraEm(null);
  }

  // Dados do gráfico — igual ao seller (YYYY-MM-DD para dias, "HH:00" para hoje)
  const chartData = (() => {
    if (!desempenho) return [];
    if (chartMode === "hoje" && desempenho.modo === "hoje") {
      return desempenho.vendasPorDia ?? [];
    }
    if (chartMode === "dias" && desempenho.pedidos && typeof chartPeriodo === "number") {
      const dias = desempenho.dias;
      const agora = new Date();
      const toKey = (d: Date) => d.toISOString().slice(0, 10);
      const diasArr: { dia: string; valor: number; count: number }[] = [];
      for (let i = dias - 1; i >= 0; i--) {
        const d = new Date(agora.getTime() - i * 24 * 60 * 60 * 1000);
        diasArr.push({ dia: toKey(d), valor: 0, count: 0 });
      }
      const map = new Map(diasArr.map((x) => [x.dia, x]));
      for (const p of desempenho.pedidos) {
        if (!p?.criado_em || p.criado_em.length < 10) continue;
        const key = toKey(new Date(p.criado_em));
        const row = map.get(key);
        if (row) {
          row.valor += Number(p.valor_fornecedor) || 0;
          row.count += 1;
        }
      }
      if (diasArr.some((d) => d.valor > 0)) return diasArr;
    }
    return desempenho.vendasPorDia ?? [];
  })();

  const isHojeMode = chartMode === "hoje";
  const formatAxisLabel = (d: { dia: string }) => {
    if (!d?.dia) return "";
    if (d.dia.includes(":")) return d.dia;
    if (d.dia.length >= 10) return `${d.dia.slice(8)}/${d.dia.slice(5, 7)}`;
    return d.dia;
  };
  const ultimoDiaKey = chartData[chartData.length - 1]?.dia;
  const hojeKeyChart = new Date().toISOString().slice(0, 10);
  const ultimoDiaHoje = !isHojeMode && ultimoDiaKey === hojeKeyChart;

  const dataHojeFmt = new Date().toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--background)] app-bg flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 rounded-xl border-2 border-[var(--card-border)] border-t-neutral-500 dark:border-t-neutral-400 animate-spin" />
          <p className="text-sm text-[var(--muted)] font-medium">Carregando...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[var(--background)] app-bg flex items-center justify-center p-4">
        <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] shadow-lg p-8 max-w-md w-full text-center">
          <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-950/50 flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
          </div>
          <p className="text-red-700 dark:text-red-300 font-semibold mb-2">Ocorreu um erro</p>
          <p className="text-[var(--muted)] text-sm mb-6">{error}</p>
          <button onClick={load} className="rounded-xl bg-neutral-700 text-white dark:bg-neutral-600 dark:hover:bg-neutral-500 px-6 py-2.5 text-sm font-medium hover:opacity-90 transition-opacity">
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] app-bg pt-[calc(3.5rem+env(safe-area-inset-top,0px))] md:pt-14 pb-[calc(6.25rem+env(safe-area-inset-bottom,0px))] md:pb-8">
      <div className="dropcore-shell-4xl py-5 md:py-7 space-y-5 md:space-y-6">
        <header className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4 sm:p-5 shadow-sm overflow-visible">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <div className="flex min-w-0 flex-1 items-stretch gap-3">
              {fornecedor?.logo_url ? (
                <div className="flex shrink-0 items-center">
                  <img
                    src={fornecedor.logo_url}
                    alt=""
                    className="h-[5.25rem] w-[5.25rem] shrink-0 rounded-2xl border-0 object-contain bg-transparent p-0 outline-none ring-0 sm:h-[5.5rem] sm:w-[5.5rem]"
                  />
                </div>
              ) : (
                <div className="flex shrink-0 items-center">
                  <div className="flex h-[5.25rem] w-[5.25rem] shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-2xl font-bold text-white shadow-md shadow-emerald-500/25 sm:h-[5.5rem] sm:w-[5.5rem]">
                    {fornecedor?.nome?.charAt(0).toUpperCase() ?? "F"}
                  </div>
                </div>
              )}
              <div className="min-w-0 flex flex-1 flex-col justify-center gap-0.5 pt-0.5">
                <p className="text-sm font-medium uppercase tracking-wide text-emerald-700/90 dark:text-emerald-400/90 leading-snug">
                  Painel do fornecedor
                </p>
                <h1 className="text-2xl font-bold leading-tight tracking-tight text-[var(--foreground)] sm:text-3xl truncate">
                  {fornecedor?.nome ?? "Fornecedor"}
                </h1>
                <p className="text-base leading-snug text-[var(--muted)] capitalize">{dataHojeFmt}</p>
              </div>
            </div>
            {(stats?.pedidos_aguardando_postagem ?? 0) > 0 && (
              <div className="flex w-full flex-wrap items-center justify-end gap-2 border-t border-[var(--card-border)] pt-3 sm:w-auto sm:border-0 sm:pt-0 sm:shrink-0">
                <Link
                  href="/fornecedor/pedidos?status=enviado"
                  className={cn(
                    AMBER_PREMIUM_SURFACE_TRANSPARENT,
                    AMBER_PREMIUM_TEXT_PRIMARY,
                    "inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold touch-manipulation transition-colors hover:opacity-95 dark:hover:border-amber-300/70"
                  )}
                >
                  <span className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-md bg-amber-500 text-white text-[10px] font-bold tabular-nums">
                    {stats?.pedidos_aguardando_postagem ?? 0}
                  </span>
                  aguardando postagem
                </Link>
              </div>
            )}
          </div>
        </header>

        {fornecedor && fornecedor.cadastro_minimo_completo === false && (
          <Link
            href="/fornecedor/cadastro"
            className="group flex gap-4 rounded-2xl border border-sky-200/90 dark:border-sky-800/80 bg-sky-100 dark:bg-sky-950/35 px-4 py-4 shadow-sm hover:border-sky-300 dark:hover:border-sky-700 hover:shadow-md transition-all"
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-500 text-white shadow-sm">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-sky-950 dark:text-sky-100">Complete o cadastro da empresa</p>
              <p className="text-xs text-sky-800/85 dark:text-sky-300/90 mt-1 leading-relaxed">
                CNPJ, telefone, e-mail comercial e PIX ou dados bancários para receber repasses.
              </p>
              <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-sky-700 dark:text-sky-400 group-hover:gap-2 transition-all">
                Preencher agora
                <span aria-hidden>→</span>
              </span>
            </div>
          </Link>
        )}

        {/* 1b. Repasses futuros — alerta no início */}
        {repasseFuturos.length > 0 && (
          <AmberPremiumCallout
            title="Repasses futuros"
            className="rounded-2xl shadow-sm overflow-hidden items-start px-4 py-4 sm:px-5"
            action={
              <button
                type="button"
                onClick={() => {
                  setRepasseAberto(true);
                  repasseRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                className="rounded-lg bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 text-sm font-semibold shrink-0"
              >
                Ver repasses →
              </button>
            }
          >
            <p className="text-sm font-bold text-[var(--foreground)] tabular-nums">
              {BRL.format(totalRepasseFuturo)} previstos
            </p>
            {proxRepasseFuturo && (
              <p className="text-[11px] text-[var(--muted)] mt-1">
                Próximo: {formatDate(proxRepasseFuturo.ciclo_repasse)} · {proxRepasseFuturo.pedidos} pedido
                {proxRepasseFuturo.pedidos !== 1 ? "s" : ""}
              </p>
            )}
          </AmberPremiumCallout>
        )}

        <section className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] shadow-sm overflow-hidden">
          <div className="relative p-4 sm:p-5">
            <div className="absolute left-0 top-4 bottom-4 w-1 rounded-r-full bg-gradient-to-b from-emerald-500 to-emerald-600 opacity-90" aria-hidden />
            <div className="pl-4 sm:pl-5">
              <p className="text-xs font-medium text-[var(--muted)]">Total a receber (repasses)</p>
              <p className="mt-1 text-3xl sm:text-4xl font-bold tracking-tight text-emerald-700 dark:text-emerald-400 tabular-nums">
                {BRL.format(totalAReceber)}
              </p>
              <p className="mt-1 text-xs text-[var(--muted)]">Valores liberados e pendentes conforme regras da organização</p>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 border-t border-[var(--card-border)]/80 bg-[var(--card)] p-3 pt-0 sm:p-4 sm:pt-0">
            <Link
              href="/fornecedor/pedidos?status=enviado"
              className="group rounded-xl border border-[var(--card-border)] bg-[var(--card)] px-3.5 py-3.5 min-h-[5.25rem] transition-all hover:border-emerald-300 dark:hover:border-emerald-700 hover:shadow-sm text-left active:scale-[0.99]"
            >
              <p className="text-[11px] font-semibold text-[var(--muted)]">Para postar</p>
              <p className="mt-1 text-xl font-bold tabular-nums text-[var(--foreground)] group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition-colors">
                {stats?.pedidos_aguardando_postagem ?? 0}
              </p>
              <p className="text-[11px] text-[var(--muted)] mt-1 leading-snug">pedidos enviados</p>
            </Link>
            <Link
              href="/fornecedor/produtos"
              className="group rounded-xl border border-[var(--card-border)] bg-[var(--card)] px-3.5 py-3.5 min-h-[5.25rem] transition-all hover:border-emerald-300 dark:hover:border-emerald-700 hover:shadow-sm text-left active:scale-[0.99]"
            >
              <p className="text-[11px] font-semibold text-[var(--muted)]">Produtos ativos</p>
              <p className="mt-1 text-xl font-bold tabular-nums text-[var(--foreground)] group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition-colors">
                {stats?.produtos_ativos ?? 0}
              </p>
              <p className="text-[11px] text-[var(--muted)] mt-1 leading-snug">no catálogo</p>
            </Link>
            <Link
              href="/fornecedor/produtos?estoqueBaixo=1"
              className={`group rounded-xl border px-3.5 py-3.5 min-h-[5.25rem] transition-all hover:shadow-sm text-left active:scale-[0.99] ${
                (stats?.estoque_baixo ?? 0) > 0
                  ? AMBER_PREMIUM_SURFACE_TRANSPARENT
                  : "border-[var(--card-border)] bg-[var(--card)] hover:border-emerald-300 dark:hover:border-emerald-700"
              }`}
            >
              <p className="text-[11px] font-semibold text-[var(--muted)]">Estoque baixo</p>
              <p className="mt-1 text-xl font-bold tabular-nums text-[var(--foreground)]">{stats?.estoque_baixo ?? 0}</p>
              <p className="text-[11px] text-[var(--muted)] mt-1 leading-snug">abaixo do mínimo</p>
            </Link>
            <Link
              href="/fornecedor/pedidos"
              className="group rounded-xl border border-[var(--card-border)] bg-[var(--card)] px-3.5 py-3.5 min-h-[5.25rem] transition-all hover:border-emerald-300 dark:hover:border-emerald-700 hover:shadow-sm text-left active:scale-[0.99]"
            >
              <p className="text-[11px] font-semibold text-[var(--muted)]">Pedidos no mês</p>
              <p className="mt-1 text-xl font-bold tabular-nums text-[var(--foreground)] group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition-colors">
                {stats?.pedidos_mes_count ?? 0}
              </p>
              <p className="text-[11px] text-[var(--muted)] mt-1 tabular-nums leading-snug">{BRL.format(stats?.pedidos_mes_valor ?? 0)}</p>
            </Link>
          </div>

          {mensalidades.length > 0 && (
            <div className="flex flex-col gap-3 border-t border-[var(--card-border)] bg-[var(--card)] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5 sm:py-4">
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-sm font-semibold text-[var(--foreground)]">Mensalidade pendente</p>
                <p className="text-xs leading-relaxed text-[var(--muted)]">
                  {subtituloBannerMensalidade(mensalidades[0], trialAtivo, trialValidoAte)}
                </p>
                {!cobrancaMensalidadeAtiva && (
                  <p className="text-xs leading-relaxed text-[var(--muted)] pt-0.5">
                    Sem cobrança enquanto o teste grátis estiver ativo.
                  </p>
                )}
              </div>
              {cobrancaMensalidadeAtiva ? (
                <button
                  type="button"
                  onClick={() => abrirPixMensalidade(mensalidades[0])}
                  className="w-full shrink-0 rounded-xl bg-[var(--foreground)] px-4 py-2.5 text-sm font-semibold text-[var(--card)] shadow-sm hover:opacity-90 sm:w-auto touch-manipulation"
                >
                  Pagar {BRL.format(mensalidades[0].valor)}
                </button>
              ) : null}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] shadow-sm overflow-hidden">
          <div className="px-4 py-3.5 border-b border-[var(--card-border)] flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[var(--foreground)]">Volume a receber</p>
              <p className="text-xs text-[var(--muted)] mt-0.5">
                {chartMode === "hoje" ? "Por hora — hoje" : "Por dia — escolha o período"}
              </p>
            </div>
            <div className="dropcore-scroll-x -mx-1 flex max-w-full flex-nowrap items-center gap-2 overflow-x-auto px-1 pb-0.5 sm:flex-wrap sm:overflow-visible sm:pb-0">
              <div className="flex rounded-lg border border-[var(--card-border)] overflow-hidden bg-neutral-100 dark:bg-neutral-900">
                <button
                  type="button"
                  onClick={() => setChartMode("hoje")}
                  className={`px-3 py-1.5 text-[11px] font-medium transition-colors ${
                    chartMode === "hoje"
                      ? "bg-emerald-600 text-white"
                      : "bg-transparent text-neutral-600 hover:bg-neutral-200/80 dark:text-neutral-400 dark:hover:bg-neutral-800"
                  }`}
                >
                  Hoje
                </button>
                <button
                  type="button"
                  onClick={() => setChartMode("dias")}
                  className={`px-3 py-1.5 text-[11px] font-medium transition-colors border-l border-[var(--card-border)] ${
                    chartMode === "dias"
                      ? "bg-emerald-600 text-white"
                      : "bg-transparent text-neutral-600 hover:bg-neutral-200/80 dark:text-neutral-400 dark:hover:bg-neutral-800"
                  }`}
                >
                  Período
                </button>
              </div>
              {chartMode === "dias" && (
                <>
                  {([7, 14, 30, 60, 90, 120] as const).map((n) => (
                    <button
                      key={n}
                      onClick={() => setChartPeriodo(n)}
                      className={`rounded-lg border border-[var(--card-border)] px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
                        chartPeriodo === n
                          ? "border-emerald-600 bg-emerald-600 text-white"
                          : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200/90 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800"
                      }`}
                    >
                      {n}d
                    </button>
                  ))}
                  <select
                    value={typeof chartPeriodo === "string" ? chartPeriodo : ""}
                    onChange={(e) => { const v = e.target.value; if (v) setChartPeriodo(v); }}
                    className="rounded-lg border border-[var(--card-border)] bg-neutral-50 px-2.5 py-1.5 text-[11px] font-medium text-neutral-900 shadow-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:bg-neutral-950 dark:text-neutral-100 dark:focus:ring-neutral-500"
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
                </>
              )}
            </div>
          </div>
          <div className="p-4">
            {chartData && chartData.some((d) => d.valor > 0) ? (
              <>
                <div className="flex items-end gap-1 h-32 relative">
                  {chartData.map((d) => {
                    const chartMax = Math.max(...chartData.map((x) => x.valor), 1);
                    const barMaxH = 96;
                    const barH = d.valor > 0 ? Math.max(20, (d.valor / chartMax) * barMaxH) : 4;
                    const periodLabel = isHojeMode ? d.dia : formatAxisLabel(d);
                    const ticketMedio = (d.count ?? 0) > 0 ? (d.valor / (d.count ?? 1)) : null;
                    return (
                      <div
                        key={d.dia}
                        className="flex-1 flex flex-col justify-end items-center group relative"
                        onMouseEnter={() => setTooltipHover(d)}
                        onMouseLeave={() => setTooltipHover(null)}
                      >
                        <div
                          className="w-full rounded-t bg-emerald-600 hover:bg-emerald-700 transition-colors cursor-default"
                          style={{ height: `${barH}px` }}
                          title={`${periodLabel}: ${BRL.format(d.valor)} · ${d.count ?? 0} pedidos`}
                        />
                        {tooltipHover?.dia === d.dia && (
                          <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
                            <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] shadow-xl py-3 px-4 min-w-[180px]">
                              <p className="text-xs font-semibold text-[var(--foreground)] mb-2.5">
                                {isHojeMode ? periodLabel : `${periodLabel}`}
                              </p>
                              <div className="space-y-1.5 text-xs">
                                <div className="flex justify-between gap-4">
                                  <span className="text-[var(--muted)]">Valor a receber</span>
                                  <span className="font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">{BRL.format(d.valor)}</span>
                                </div>
                                <div className="flex justify-between gap-4">
                                  <span className="text-[var(--muted)]">Pedidos</span>
                                  <span className="font-semibold text-[var(--foreground)]">{d.count ?? 0}</span>
                                </div>
                                {ticketMedio != null && (
                                  <div className="flex justify-between gap-4 pt-1 border-t border-[var(--card-border)]">
                                    <span className="text-[var(--muted)]">Ticket médio</span>
                                    <span className="font-semibold text-[var(--foreground)] tabular-nums">{BRL.format(ticketMedio)}</span>
                                  </div>
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
                  <span className="text-[10px] text-[var(--muted)]">{formatAxisLabel(chartData[0] ?? { dia: "" })}</span>
                  <span className={`text-[10px] ${ultimoDiaHoje ? "font-medium text-emerald-600 dark:text-emerald-400" : "text-[var(--muted)]"}`}>
                    {ultimoDiaHoje ? "Hoje" : formatAxisLabel(chartData[chartData.length - 1] ?? { dia: "" })}
                  </span>
                </div>
              </>
            ) : (
              <div className="text-center py-12 px-4">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100/80 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400">
                  <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M3 3v18h18" />
                    <path d="M18 17V9" />
                    <path d="M13 17V5" />
                    <path d="M8 17v-3" />
                  </svg>
                </div>
                <p className="text-base font-semibold text-[var(--foreground)]">Nenhum volume neste período</p>
                <p className="text-sm text-[var(--muted)] mt-1 max-w-sm mx-auto">
                  Quando houver pedidos confirmados, o gráfico mostra o valor a receber por hora ou por dia.
                </p>
                <button
                  type="button"
                  onClick={() => router.push("/fornecedor/produtos")}
                  className="mt-5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2.5 text-sm font-semibold shadow-sm shadow-emerald-600/25 transition-colors"
                >
                  Gerir catálogo
                </button>
              </div>
            )}
          </div>
        </section>

        {/* 2b. Analytics — desempenho detalhado (igual ao seller) */}
        {desempenho && (desempenho.totalPedidos > 0 || desempenho.valorTotal > 0) && (
          <section className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] shadow-sm overflow-hidden">
            <div className="px-4 py-3 flex items-center justify-between border-b border-[var(--card-border)] bg-[var(--card)]">
              <p className="text-xs font-semibold text-[var(--foreground)]">
                Desempenho · {chartMode === "hoje" ? "Hoje" : `${desempenho.dias} dias`}
                {desempenho.valorAnterior != null && desempenho.valorAnterior > 0 && (
                  <span className="ml-2 text-[var(--muted)]">
                    ({(desempenho.valorTotal - desempenho.valorAnterior) / desempenho.valorAnterior >= 0 ? "+" : ""}
                    {(((desempenho.valorTotal - desempenho.valorAnterior) / desempenho.valorAnterior) * 100).toFixed(0)}% vs anterior)
                  </span>
                )}
              </p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-0 divide-x divide-y sm:divide-y-0 divide-[var(--card-border)]">
              <div className="px-4 py-3">
                <p className="text-[11px] text-[var(--muted)]">Valor total</p>
                <p className="text-sm font-bold text-[var(--foreground)] tabular-nums">{BRL.format(desempenho.valorTotal)}</p>
              </div>
              <div className="px-4 py-3">
                <p className="text-[11px] text-[var(--muted)]">Pedidos</p>
                <p className="text-sm font-bold text-[var(--foreground)]">{desempenho.totalPedidos}</p>
              </div>
              <div className="px-4 py-3">
                <p className="text-[11px] text-[var(--muted)]">Ticket médio</p>
                <p className="text-sm font-bold text-[var(--foreground)] tabular-nums">
                  {desempenho.ticketMedio != null ? BRL.format(desempenho.ticketMedio) : "—"}
                </p>
              </div>
              <div className="px-4 py-3">
                <p className="text-[11px] text-[var(--muted)]">Período</p>
                <p className="text-sm font-bold text-[var(--foreground)]">{desempenho.dias} dias</p>
              </div>
            </div>
            {desempenho.topProduto && (
              <div className="px-4 py-2 border-t border-[var(--card-border)] flex items-center justify-between text-xs">
                <span className="text-[var(--muted)]">Top:</span>
                <span className="font-medium text-[var(--foreground)] truncate max-w-[60%]">{desempenho.topProduto.nome}</span>
                <span className="text-[var(--muted)] shrink-0">{desempenho.topProduto.count} pedidos · {BRL.format(desempenho.topProduto.valor)}</span>
              </div>
            )}
          </section>
        )}

        <section aria-label="Atalhos">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)] mb-2 px-0.5">Acesso rápido</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              type="button"
              onClick={() => router.push("/fornecedor/produtos")}
              className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4 text-left transition-all hover:border-emerald-300 dark:hover:border-emerald-700 hover:shadow-md group"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400">
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                    <line x1="12" y1="22.08" x2="12" y2="12" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-[var(--foreground)] group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition-colors">Produtos</p>
                  <p className="text-xs text-[var(--muted)] mt-0.5 leading-snug">SKUs, preços e estoque</p>
                </div>
              </div>
            </button>
            <button
              type="button"
              onClick={() => router.push("/fornecedor/pedidos")}
              className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4 text-left transition-all hover:border-emerald-300 dark:hover:border-emerald-700 hover:shadow-md group"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400">
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2" />
                    <path d="M15 18h2" />
                    <path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-[var(--foreground)] group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition-colors">Pedidos</p>
                  <p className="text-xs text-[var(--muted)] mt-0.5 leading-snug">Postagem e acompanhamento</p>
                </div>
              </div>
            </button>
            <button
              type="button"
              onClick={() => router.push("/fornecedor/cadastro")}
              className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4 text-left transition-all hover:border-emerald-300 dark:hover:border-emerald-700 hover:shadow-md group"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400">
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <rect width="20" height="14" x="2" y="5" rx="2" />
                    <line x1="2" x2="22" y1="10" y2="10" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-[var(--foreground)] group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition-colors">Cadastro</p>
                  <p className="text-xs text-[var(--muted)] mt-0.5 leading-snug">Empresa e dados bancários</p>
                </div>
              </div>
            </button>
          </div>
        </section>

        {/* 4. Alerta estoque baixo */}
        {stats && (stats.estoque_baixo ?? 0) > 0 && (
          <Link
            href="/fornecedor/produtos?estoqueBaixo=1"
            className="w-full rounded-xl border border-[var(--card-border)] bg-[var(--card)] px-4 py-3 flex items-center gap-3 text-left hover:bg-[var(--background)]"
          >
            <div className="w-9 h-9 rounded-lg bg-[var(--background)] flex items-center justify-center shrink-0 text-[var(--muted)]">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 9v4" />
                <path d="M10.363 3.591 2.257 18.028a1.5 1.5 0 0 0 1.274 2.257h16.938a1.5 1.5 0 0 0 1.274-2.257L13.637 3.59a1.5 1.5 0 0 0-2.274 0z" />
                <path d="M12 16h.01" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[var(--foreground)]">
                {stats.estoque_baixo} {stats.estoque_baixo === 1 ? "produto" : "produtos"} com estoque abaixo do mínimo
              </p>
              <p className="text-xs text-[var(--muted)]">Clique para repor estoque</p>
            </div>
            <IconArrowRight className="w-5 h-5 text-[var(--muted)] shrink-0" />
          </Link>
        )}

        {/* 5. Repasses — recolhível */}
        <section ref={repasseRef} className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] shadow-sm overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-[var(--card-border)] bg-[var(--card)] px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-[var(--foreground)]">Repasses</p>
              <p className="text-xs text-[var(--muted)]">Histórico por ciclo e status de pagamento</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={load} className="rounded-lg border border-[var(--card-border)] px-2.5 py-1.5 text-xs text-[var(--muted)] hover:bg-[var(--background)]">
                Atualizar
              </button>
              <button
                type="button"
                onClick={() => setRepasseAberto(!repasseAberto)}
                className="rounded-lg px-2 py-1.5 text-xs text-[var(--muted)] hover:bg-[var(--background)] hover:text-[var(--foreground)] transition-colors flex items-center gap-1.5"
                title={repasseAberto ? "Recolher" : "Expandir"}
              >
                {!repasseAberto && <span>{repasseItems.length} repasse{repasseItems.length !== 1 ? "s" : ""}</span>}
                <svg className={`w-4 h-4 transition-transform ${repasseAberto ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="m18 15-6-6-6 6" />
                </svg>
              </button>
            </div>
          </div>

          {repasseAberto && (
            <div className="p-3">
              {repasseFuturos.length > 0 && (
                <div className="mb-3 rounded-lg border border-sky-200 dark:border-sky-900/60 bg-sky-100 dark:bg-sky-950/20 p-3">
                  <p className="text-xs font-semibold text-sky-800 dark:text-sky-300 mb-2">Previsão de próximos repasses</p>
                  <div className="space-y-1.5">
                    {repasseFuturos.map((f) => (
                      <div key={f.ciclo_repasse} className="flex items-center justify-between gap-3 text-xs">
                        <span className="text-[var(--foreground)]">
                          Ciclo {formatDate(f.ciclo_repasse)} · {f.pedidos} pedido{f.pedidos !== 1 ? "s" : ""}
                        </span>
                        <span className="font-semibold text-sky-700 dark:text-sky-300 tabular-nums">{BRL.format(f.valor_previsto)}</span>
                      </div>
                    ))}
                  </div>
                  <p className="mt-2 text-[11px] text-[var(--muted)]">
                    Valores previstos; entram em “Repasses” após o fechamento do ciclo pela org.
                  </p>
                </div>
              )}
              {repasseItems.length === 0 ? (
                <div className="py-12 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-[var(--background)] flex items-center justify-center mx-auto mb-4 text-[var(--muted)]">
                    <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect width="20" height="14" x="2" y="5" rx="2" />
                      <line x1="2" x2="22" y1="10" y2="10" />
                    </svg>
                  </div>
                  <p className="text-sm font-medium text-[var(--muted)]">Nenhum repasse no momento</p>
                  <p className="text-xs text-[var(--muted)] mt-1">Os repasses aparecem aqui quando houver pedidos confirmados no ciclo</p>
                </div>
              ) : (
                <div className="rounded-lg border border-[var(--card-border)] overflow-hidden">
                  {repasseItems.map((r) => {
                    const st = statusLabel[r.status] ?? { label: r.status, cor: "text-[var(--muted)] bg-[var(--background)] border-[var(--card-border)]" };
                    return (
                      <div
                        key={r.id}
                        className="flex items-center gap-4 px-4 py-3 border-b border-[var(--card-border)] last:border-0 hover:bg-[var(--background)] transition-colors"
                      >
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400">
                          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                          </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-[var(--foreground)]">Ciclo {formatDate(r.ciclo_repasse)}</p>
                          <span className={`inline-block mt-1 rounded-md px-2 py-0.5 text-[10px] font-medium border ${st.cor}`}>{st.label}</span>
                          {r.pago_em && <p className="text-xs text-[var(--muted)] mt-1">Pago em {formatDate(r.pago_em)}</p>}
                        </div>
                        <p className="text-base font-bold tabular-nums text-emerald-600 dark:text-emerald-400 shrink-0">{BRL.format(r.valor_total)}</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </section>
      </div>

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
                <p className="text-xs text-red-700 dark:text-red-400 bg-red-100 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-xl px-3 py-2">{pixErro}</p>
              )}
              {pixLoading && <p className="text-sm text-[var(--muted)]">Gerando PIX...</p>}
              {!pixLoading && pixQrCode && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                    <IconCheck className="w-5 h-5" />
                    <p className="text-sm font-semibold">PIX gerado! Pague agora</p>
                  </div>
                  <p className="text-xs text-[var(--muted)]">Escaneie o QR Code ou copie o código PIX. Após pagar, aguarde a confirmação automática.</p>
                  {pixRestanteSec !== null && (
                    <div
                      className={`flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-medium ${
                        pixRestanteSec <= 60
                          ? cn(AMBER_PREMIUM_SURFACE_TRANSPARENT, AMBER_PREMIUM_TEXT_PRIMARY)
                          : "bg-[var(--background)] text-[var(--muted)]"
                      }`}
                    >
                      <IconClock className={`w-4 h-4 shrink-0 ${pixRestanteSec <= 60 ? "animate-pulse" : ""}`} />
                      Válido por {Math.floor(pixRestanteSec / 60)}:{(pixRestanteSec % 60).toString().padStart(2, "0")}
                    </div>
                  )}
                  <div className="flex justify-center p-4 bg-[var(--background)] rounded-xl">
                    <img src={`data:image/png;base64,${pixQrCode}`} alt="QR Code PIX" className="w-40 h-40" />
                  </div>
                  {pixCopiaCola && (
                    <div className="space-y-2">
                      <p className="text-xs text-[var(--muted)]">Código PIX (copia e cola):</p>
                      <div className="rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-xs font-mono text-[var(--foreground)] text-left break-all max-h-20 overflow-y-auto">
                        {pixCopiaCola}
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          await navigator.clipboard.writeText(pixCopiaCola!);
                          setPixCopiado(true);
                          setTimeout(() => setPixCopiado(false), 2000);
                        }}
                        className="w-full rounded-xl border-2 border-emerald-500 dark:border-emerald-600 bg-emerald-600 dark:bg-emerald-700 text-white font-semibold py-2.5 text-sm hover:opacity-90 transition-colors flex items-center justify-center gap-2"
                      >
                        {pixCopiado ? "✓ Copiado!" : "Copiar código PIX"}
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

      <FornecedorNav active="dashboard" />
      <NotificationToasts />
    </div>
  );
}
