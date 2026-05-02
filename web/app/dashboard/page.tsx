"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { DropCoreLogo } from "@/components/DropCoreLogo";
import { MobileAppBar } from "@/components/MobileAppBar";
import { AdminMobileBottomNav } from "@/components/AdminMobileBottomNav";
import { NotificationBell } from "@/components/NotificationBell";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  AMBER_PREMIUM_SHELL,
  AMBER_PREMIUM_SURFACE,
  AMBER_PREMIUM_TEXT_PRIMARY,
  AMBER_PREMIUM_TEXT_SOFT,
} from "@/lib/amberPremium";
import { cn } from "@/lib/utils";

type MeResponse = {
  user_id: string;
  org_id: string;
  fornecedor_id?: string | null;
  seller_id?: string | null;
  role_base: "owner" | "admin" | "operacional" | string;
  pode_ver_dinheiro: boolean;
};

type Stats = {
  fornecedores_ativos: number;
  skus_ativos: number;
  estoque_baixo: number;
  sellers_ativos: number;
  pedidos_hoje: number;
  pedidos_aguardando_envio: number;
  repasses_pendentes: number;
  saldo_sellers_total?: number;
  depositos_pix_pendentes?: number;
  entrada_mes?: number;
  receita_dropcore?: number;
  mensalidades_sellers_pendente?: number;
  mensalidades_fornecedores_pendente?: number;
  inadimplentes_sellers?: number;
  inadimplentes_fornecedores?: number;
  plano?: string;
  lembrete_mensalidade?: { dias_ate_vencimento: number | null; fim_mes_proximo: boolean };
  plan_limits?: {
    vendas_mes: number;
    vendas_limite: number;
    produto_cor_count: number;
    produto_cor_limite: number;
  };
  alteracoes_pendentes?: number;
  repasse_ledger_pronto_proximo_ciclo?: number;
  repasse_proximo_ciclo?: string;
  repasse_futuros_previstos_total_valor?: number;
  repasse_futuros_previstos_total_pedidos?: number;
  repasse_futuros_previstos_ciclos_qtd?: number;
  repasse_futuros_proximo_ciclo?: string | null;
  repasse_futuros_proximo_pedidos?: number;
  mensalidade_portal?: {
    sellers: { em_teste: number; adimplentes: number; inadimplentes: number };
    fornecedores: { em_teste: number; adimplentes: number; inadimplentes: number };
  };
  portal_trial_days?: number;
};

type ProData = {
  total_pedidos: number;
  volume_total: number;
  volume_dropcore: number;
  volume_fornecedor: number;
  ticket_medio: number;
  margem_media_pct: number;
  receita_pago: number;
  receita_pendente: number;
  top_sellers: { id: string; nome: string; total: number; pedidos: number }[];
  top_fornecedores: { id: string; nome: string; total: number; dropcore: number; pedidos: number }[];
  vendas_por_dia: { dia: string; total: number; dropcore: number; count: number }[];
};

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function formatChartDayLabel(dia: string | undefined) {
  if (!dia) return "";
  if (dia.length >= 10) return `${dia.slice(8)}/${dia.slice(5, 7)}`;
  return dia;
}

function formatDateBR(date: string | undefined) {
  if (!date) return "—";
  const d = new Date(`${date}T12:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString("pt-BR");
}

/** Valor compacto no topo das barras (evita overflow em telas pequenas) */
function formatChartBarValue(total: number) {
  if (total >= 1_000_000) return BRL.format(total);
  if (total >= 10_000) {
    return `R$ ${(total / 1000).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} mil`;
  }
  return BRL.format(total);
}

type VendaDiaRow = ProData["vendas_por_dia"][number];

function VendasPorDiaChartBlock({
  series,
  chartTooltipHover,
  setChartTooltipHover,
}: {
  series: VendaDiaRow[];
  chartTooltipHover: VendaDiaRow | null;
  setChartTooltipHover: (d: VendaDiaRow | null) => void;
}) {
  if (series.length === 0) {
    return <p className="text-sm text-neutral-500 dark:text-neutral-400">—</p>;
  }

  const maxVal = Math.max(...series.map((x) => x.total), 1);
  const BAR_PX = 132;
  const gapStyle = {
    gap:
      series.length <= 2
        ? "1rem"
        : series.length <= 4
          ? "0.75rem"
          : series.length <= 7
            ? "0.5rem"
            : "0.375rem",
  } as const;
  const gridCols = { gridTemplateColumns: `repeat(${series.length}, minmax(0, 1fr))` };
  const yMid = maxVal / 2;
  const formatAxis = (v: number) => (v <= 0 ? "R$ 0" : BRL.format(Math.round(v * 100) / 100));

  return (
    <div className="w-full pb-0.5 overflow-visible">
      <div className="min-w-[min(100%,280px)] rounded-xl border border-neutral-200/90 dark:border-neutral-700/70 bg-gradient-to-b from-neutral-50 to-neutral-100/40 dark:from-neutral-900/40 dark:to-neutral-950/50 p-3 sm:p-4 overflow-visible">
        <div
          className="grid w-full min-w-0"
          style={{
            gridTemplateColumns: "2.25rem minmax(0, 1fr)",
            rowGap: "0.5rem",
            columnGap: "0.5rem",
          }}
        >
          <div />
          <div className="grid min-w-0" style={{ ...gridCols, ...gapStyle }}>
            {series.map((d) => (
              <div key={`v-${d.dia}`} className="min-w-0 px-0.5 text-center">
                <span className="block truncate text-[9px] font-semibold tabular-nums text-emerald-700 dark:text-emerald-300 sm:text-[10px]">
                  {formatChartBarValue(d.total)}
                </span>
                {d.count > 0 && (
                  <span className="mt-0.5 block text-[8px] text-neutral-500 dark:text-neutral-400">{d.count} ped</span>
                )}
              </div>
            ))}
          </div>

          <div
            className="flex flex-col justify-between py-0.5 text-[9px] sm:text-[10px] text-neutral-500 dark:text-neutral-400 tabular-nums leading-none"
            style={{ height: BAR_PX }}
            aria-hidden
          >
            <span className="text-right">{formatAxis(maxVal)}</span>
            <span className="text-right">{formatAxis(yMid)}</span>
            <span className="text-right">{formatAxis(0)}</span>
          </div>

          <div className="relative z-0 min-w-0 overflow-visible" style={{ height: BAR_PX }}>
            <div className="pointer-events-none absolute inset-0 flex flex-col justify-between" aria-hidden>
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className={`h-px w-full ${i === 3 ? "bg-neutral-300/90 dark:bg-neutral-600" : "bg-neutral-200/80 dark:bg-neutral-700/45"}`}
                />
              ))}
            </div>
            <div className="relative z-[1] grid h-full w-full items-end" style={{ ...gridCols, ...gapStyle }}>
              {series.map((d) => {
                const periodLabel = formatChartDayLabel(d.dia);
                const ticketMedio = (d.count ?? 0) > 0 ? d.total / (d.count ?? 1) : null;
                const barH = d.total > 0 ? Math.max(6, (d.total / maxVal) * BAR_PX) : 5;
                return (
                  <div
                    key={d.dia}
                    className="group relative flex min-h-0 min-w-0 flex-col justify-end"
                    onMouseEnter={() => setChartTooltipHover(d)}
                    onMouseLeave={() => setChartTooltipHover(null)}
                  >
                    <div
                      className="mx-auto w-full max-w-[3.25rem] rounded-t-[6px] bg-gradient-to-b from-emerald-400 to-emerald-600 shadow-sm ring-1 ring-emerald-600/25 transition group-hover:opacity-90 dark:from-emerald-500 dark:to-emerald-600 dark:ring-emerald-500/30"
                      style={{ height: `${barH}px` }}
                    />
                    {chartTooltipHover?.dia === d.dia && (
                      <div className="absolute top-full left-1/2 z-[60] mt-2 -translate-x-1/2 pointer-events-none">
                        <div className="relative rounded-xl border border-neutral-200 dark:border-neutral-600 bg-white dark:bg-neutral-900 shadow-xl px-4 pb-3 pt-3.5 min-w-[180px]">
                          <div className="absolute -top-1.5 left-1/2 z-10 h-3 w-3 -translate-x-1/2 rotate-45 border-l border-t border-neutral-200 bg-white dark:border-neutral-600 dark:bg-neutral-900" />
                          <p className="relative text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-2.5">{periodLabel}</p>
                          <div className="relative space-y-1.5 text-xs">
                            <div className="flex justify-between gap-4">
                              <span className="text-neutral-500 dark:text-neutral-400">Volume total</span>
                              <span className="font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">{BRL.format(d.total)}</span>
                            </div>
                            <div className="flex justify-between gap-4">
                              <span className="text-neutral-500 dark:text-neutral-400">Pedidos</span>
                              <span className="font-semibold text-neutral-900 dark:text-neutral-100">{d.count ?? 0}</span>
                            </div>
                            <div className="flex justify-between gap-4">
                              <span className="text-neutral-500 dark:text-neutral-400">DropCore</span>
                              <span className="font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">{BRL.format(d.dropcore ?? 0)}</span>
                            </div>
                            {ticketMedio != null && (
                              <div className="flex justify-between gap-4 pt-1 border-t border-neutral-100 dark:border-neutral-800">
                                <span className="text-neutral-500 dark:text-neutral-400">Ticket médio</span>
                                <span className="font-semibold text-neutral-900 dark:text-neutral-100 tabular-nums">{BRL.format(ticketMedio)}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div />
          <div className="grid min-w-0" style={{ ...gridCols, ...gapStyle }}>
            {series.map((d) => {
              const periodLabel = formatChartDayLabel(d.dia);
              const hojeKey = new Date().toISOString().slice(0, 10);
              const isHoje = d.dia === hojeKey;
              return (
                <span
                  key={`lbl-${d.dia}`}
                  className={`block text-center text-[10px] sm:text-[11px] leading-tight px-0.5 ${isHoje ? "font-semibold text-emerald-600 dark:text-emerald-400" : "text-neutral-500 dark:text-neutral-400"}`}
                >
                  {isHoje ? "Hoje" : periodLabel}
                </span>
              );
            })}
          </div>
        </div>
        {series.length > 14 && (
          <p className="mt-2 text-center text-[10px] text-neutral-400 dark:text-neutral-500">Role horizontalmente para ver todos os dias</p>
        )}
      </div>
    </div>
  );
}

/** Ícones dos atalhos — neutro (P&B); cor só nos badges */
function AdminNavIcon({ id }: { id: string }) {
  const common = "w-5 h-5 text-emerald-700 dark:text-emerald-400";
  switch (id) {
    case "pedidos":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16.5 9.4 7.55 4.24" /><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l2-1.14" />
          <path d="m7.5 4.21 9 5.05" /><path d="M3.29 7 12 12l8.71-5" /><path d="M12 22V12" />
        </svg>
      );
    case "sellers":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case "repasse":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 1l4 4-4 4" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><path d="M7 23l-4-4 4-4" /><path d="M21 13v2a4 4 0 0 1-4 4H3" />
        </svg>
      );
    case "empresas":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" /><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" /><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" /><path d="M10 6h4" /><path d="M10 10h4" /><path d="M10 14h4" /><path d="M10 18h4" />
        </svg>
      );
    case "alteracoes":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
      );
    case "devolucoes":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" />
        </svg>
      );
    case "pagar":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect width="20" height="14" x="2" y="5" rx="2" /><line x1="2" x2="22" y1="10" y2="10" />
        </svg>
      );
    case "pix":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect width="5" height="5" x="3" y="3" rx="1" /><rect width="5" height="5" x="16" y="3" rx="1" /><rect width="5" height="5" x="3" y="16" rx="1" /><path d="M21 16h-3a2 2 0 0 0-2 2v3" /><path d="M21 21v.01" /><path d="M12 7v3a2 2 0 0 1-2 2H7" /><path d="M3 12h.01" /><path d="M12 3h.01" /><path d="M12 16v.01" /><path d="M16 12h1" /><path d="M21 12v.01" /><path d="M12 21v-4" />
        </svg>
      );
    case "mensalidades":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 2v4" /><path d="M16 2v4" /><rect width="18" height="18" x="3" y="4" rx="2" /><path d="M3 10h18" />
        </svg>
      );
    case "relatorio":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-3 3" />
        </svg>
      );
    case "membros":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
      );
    default:
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
        </svg>
      );
  }
}

function secoesBadgeClass(tone: "amber" | "sky" | "violet") {
  switch (tone) {
    case "amber":
      return cn(AMBER_PREMIUM_SHELL, AMBER_PREMIUM_TEXT_PRIMARY);
    case "sky":
      return "bg-sky-100 dark:bg-sky-950/35 text-sky-900 dark:text-sky-300 border border-sky-200/90 dark:border-sky-800/60";
    case "violet":
      return "bg-violet-100 dark:bg-violet-950/35 text-violet-900 dark:text-violet-300 border border-violet-200/90 dark:border-violet-800/60";
    default:
      return "";
  }
}

async function fetchJsonSafe(res: Response) {
  const text = await res.text();
  try { return { ok: res.ok, status: res.status, json: JSON.parse(text) }; }
  catch { return { ok: false, status: res.status, json: { error: "Resposta inválida" } }; }
}

export default function DashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [proData, setProData] = useState<ProData | null>(null);
  const [chartTooltipHover, setChartTooltipHover] = useState<{ dia: string; total: number; dropcore: number; count: number } | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      let { data } = await supabaseBrowser.auth.getSession();
      let token = data.session?.access_token;
      if (!token) {
        const { data: r } = await supabaseBrowser.auth.refreshSession();
        token = r.session?.access_token;
      }
      if (!token) throw new Error("Sem sessão. Faça login novamente.");

      // Regra dura: conta de fornecedor nunca permanece no dashboard admin.
      try {
        const forneRaw = await fetch("/api/fornecedor/me", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        if (forneRaw.ok) {
          router.replace("/fornecedor/dashboard");
          return;
        }
      } catch {
        // se falhar rede aqui, segue fluxo padrão e trata no restante da carga
      }

      let meRes: { ok: boolean; json: unknown };
      try {
        const raw = await fetch("/api/org/me", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        meRes = await fetchJsonSafe(raw);
      } catch (fetchErr) {
        const msg = fetchErr instanceof Error && fetchErr.message === "Failed to fetch"
          ? "Falha na conexão com o servidor. Verifique se o npm run dev está rodando e tente novamente."
          : fetchErr instanceof Error ? fetchErr.message : "Erro ao buscar dados";
        throw new Error(`/api/org/me: ${msg}`);
      }
      if (!meRes.ok) throw new Error(meRes.json && typeof meRes.json === "object" && "error" in meRes.json ? String(meRes.json.error) : "Erro ao carregar perfil");
      const m = meRes.json as MeResponse;
      setMe(m);

      if (m.fornecedor_id) {
        router.replace("/fornecedor/dashboard");
        return;
      }

      if (m.seller_id) {
        router.replace("/seller/dashboard");
        return;
      }

      if (m.role_base === "owner" || m.role_base === "admin") {
        let statsRes: { ok: boolean; json: Stats & { plano?: string } };
        try {
          const raw = await fetch("/api/org/dashboard-stats", {
            headers: { Authorization: `Bearer ${token}` },
            cache: "no-store",
          });
          statsRes = await fetchJsonSafe(raw);
        } catch (fetchErr) {
          const msg = fetchErr instanceof Error && fetchErr.message === "Failed to fetch"
            ? "Falha na conexão. Servidor pode estar reiniciando. Tente novamente."
            : fetchErr instanceof Error ? fetchErr.message : "Erro ao buscar estatísticas";
          throw new Error(`/api/org/dashboard-stats: ${msg}`);
        }
        if (statsRes.ok) {
          setStats(statsRes.json as Stats);
          if (statsRes.json.plano === "pro") {
            fetch("/api/org/dashboard-pro", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" })
              .then((r) => r.json())
              .then((j) => { if (j?.total_pedidos !== undefined) setProData(j); })
              .catch(() => {});
          }
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Erro inesperado";
      setError(msg);
      if (typeof console !== "undefined" && console.error) console.error("[Dashboard load]", e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Bloqueia acesso ao dashboard para fornecedor ou não-admin.
  useEffect(() => {
    if (loading) return;
    if (!me) return;
    const isFornecedor = Boolean(me.fornecedor_id);
    if (isFornecedor) {
      router.replace("/fornecedor/dashboard");
      return;
    }
    if (me.seller_id) {
      router.replace("/seller/dashboard");
      return;
    }
    if (me.role_base !== "owner" && me.role_base !== "admin") {
      router.replace("/login");
    }
  }, [loading, me, router]);

  async function sair() {
    await supabaseBrowser.auth.signOut();
    router.replace("/login");
  }

  const isAdmin = me?.role_base === "owner" || me?.role_base === "admin";
  const roleLabel = me?.role_base === "owner" ? "Proprietário" : me?.role_base === "admin" ? "Admin" : me?.role_base ?? "—";
  const roleInitial = roleLabel.charAt(0).toUpperCase();
  const isPro = stats?.plano === "pro";
  const dataHojeFmt = new Date().toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const painelContextoLabel =
    me?.role_base === "owner" ? "Painel do proprietário" : "Painel da organização";

  // ── Alertas urgentes ─────────────────────────────────────────────────────────
  const alertas: { id: string; cor: string; texto: string; sub?: string; acao: string; rota: string }[] = [];
  if (stats) {
    if ((stats.pedidos_aguardando_envio ?? 0) > 0) {
      alertas.push({
        id: "envio",
        cor: "amber",
        texto: `${stats.pedidos_aguardando_envio} pedido${stats.pedidos_aguardando_envio !== 1 ? "s" : ""} aguardando confirmação de envio`,
        sub: "Confirme o envio para entrar no ciclo de repasse desta semana",
        acao: "Ver pedidos",
        rota: "/admin/pedidos",
      });
    }
    if ((stats.repasse_futuros_previstos_total_valor ?? 0) > 0) {
      alertas.push({
        id: "repasse-futuro",
        cor: "amber",
        texto: `Repasses futuros: ${stats.repasse_futuros_previstos_total_pedidos ?? 0} pedido${(stats.repasse_futuros_previstos_total_pedidos ?? 0) !== 1 ? "s" : ""} pronto(s)`,
        sub: stats.repasse_futuros_proximo_ciclo
          ? `Próximo ciclo: ${formatDateBR(stats.repasse_futuros_proximo_ciclo ?? undefined)}`
          : undefined,
        acao: "Ver repasse",
        rota: "/admin/repasse-fornecedor",
      });
    }
    if ((stats.depositos_pix_pendentes ?? 0) > 0) {
      alertas.push({
        id: "pix",
        cor: "blue",
        texto: `${stats.depositos_pix_pendentes} depósito${stats.depositos_pix_pendentes !== 1 ? "s" : ""} PIX aguardando aprovação`,
        sub: "Sellers aguardando crédito em conta",
        acao: "Ver depósitos",
        rota: "/admin/depositos-pix",
      });
    }
    const lembrete = stats.lembrete_mensalidade;
    if (lembrete?.dias_ate_vencimento !== null && lembrete?.dias_ate_vencimento !== undefined && lembrete.dias_ate_vencimento <= 7 && lembrete.dias_ate_vencimento >= 0) {
      alertas.push({
        id: "vencimento",
        cor: "amber",
        texto: lembrete.dias_ate_vencimento === 0
          ? "Mensalidade vence hoje"
          : lembrete.dias_ate_vencimento === 1
            ? "Mensalidade vence amanhã"
            : `Mensalidade vence em ${lembrete.dias_ate_vencimento} dias`,
        sub: "Faça o pagamento e marque como pago",
        acao: "Ver mensalidades",
        rota: "/admin/mensalidades",
      });
    }
    if (lembrete?.fim_mes_proximo && (stats.inadimplentes_sellers ?? 0) === 0 && (stats.inadimplentes_fornecedores ?? 0) === 0) {
      const proxMes = new Date();
      proxMes.setMonth(proxMes.getMonth() + 1);
      const nomeProxMes = proxMes.toLocaleDateString("pt-BR", { month: "long" });
      alertas.push({
        id: "fim-mes",
        cor: "blue",
        texto: `Fim do mês se aproximando`,
        sub: `Gere as mensalidades de ${nomeProxMes} quando o mês começar`,
        acao: "Ir para mensalidades",
        rota: "/admin/mensalidades",
      });
    }
    if ((stats.inadimplentes_sellers ?? 0) > 0 || (stats.inadimplentes_fornecedores ?? 0) > 0) {
      const partes = [];
      if ((stats.inadimplentes_sellers ?? 0) > 0) partes.push(`${stats.inadimplentes_sellers} seller${stats.inadimplentes_sellers !== 1 ? "s" : ""}`);
      if ((stats.inadimplentes_fornecedores ?? 0) > 0) partes.push(`${stats.inadimplentes_fornecedores} fornecedor${stats.inadimplentes_fornecedores !== 1 ? "es" : ""}`);
      alertas.push({
        id: "inadimpl",
        cor: "red",
        texto: `Inadimplentes: ${partes.join(" · ")}`,
        sub: "Pedidos bloqueados até regularizar mensalidades",
        acao: "Ver mensalidades",
        rota: "/admin/mensalidades",
      });
    }
  }

  const navItens: {
    title: string;
    desc: string;
    rota: string;
    icon: string;
    badge: string | null;
    /** Cor só no badge de alerta */
    badgeTone: "amber" | "sky" | "violet" | null;
  }[] = [
    { title: "Pedidos", desc: "Criar pedidos e confirmar envios", rota: "/admin/pedidos", icon: "pedidos", badge: stats?.pedidos_aguardando_envio ? `${stats.pedidos_aguardando_envio} pendentes` : null, badgeTone: "amber" },
    { title: "Sellers", desc: "Saldo, extrato e crédito operacional", rota: "/admin/sellers", icon: "sellers", badge: null, badgeTone: null },
    { title: "Repasse ao fornecedor", desc: "Fechar ciclo semanal e repassar valores", rota: "/admin/repasse-fornecedor", icon: "repasse", badge: stats?.repasses_pendentes ? `${stats.repasses_pendentes} pendentes` : null, badgeTone: "amber" },
    { title: "Empresas", desc: "Fornecedores e catálogo de SKUs", rota: "/admin/empresas", icon: "empresas", badge: null, badgeTone: null },
    { title: "Alterações em análise", desc: "Aprovar edições de produto", rota: "/admin/alteracoes-produtos", icon: "alteracoes", badge: (stats?.alteracoes_pendentes ?? 0) > 0 ? `${stats?.alteracoes_pendentes ?? 0} pendentes` : null, badgeTone: "violet" },
    { title: "Bloqueios e devoluções", desc: "Registrar e gerenciar devoluções", rota: "/admin/devolucoes", icon: "devolucoes", badge: null, badgeTone: null },
    { title: "A pagar fornecedores", desc: "Valores gerados ao fechar repasse", rota: "/admin/a-pagar-fornecedores", icon: "pagar", badge: null, badgeTone: null },
    { title: "Depósitos PIX", desc: "Aprovar depósitos dos sellers", rota: "/admin/depositos-pix", icon: "pix", badge: stats?.depositos_pix_pendentes ? `${stats.depositos_pix_pendentes} aguardando` : null, badgeTone: "sky" },
    { title: "Mensalidades", desc: "Gerar e marcar mensalidades", rota: "/admin/mensalidades", icon: "mensalidades", badge: null, badgeTone: null },
    { title: "Convites calculadora", desc: "Gerar links da DropCore Calculadora", rota: "/admin/calculadora-convites", icon: "mensalidades", badge: null, badgeTone: null },
    { title: "Relatório entrada/saída", desc: "Entradas, repasses e receita", rota: "/admin/relatorio-entrada-saida", icon: "relatorio", badge: null, badgeTone: null },
    { title: "Membros", desc: "Permissões e acesso financeiro", rota: "/org/membros", icon: "membros", badge: null, badgeTone: null },
  ];

  const alertaBgMap: Record<string, string> = {
    amber: "border-[var(--card-border)] bg-[var(--card)]",
    blue: "border-[var(--card-border)] bg-[var(--card)]",
    red: "border-red-200 dark:border-red-900/50 bg-red-100 dark:bg-red-950/30",
  };

  const alertaBtnMap: Record<string, string> = {
    amber: "bg-emerald-600 hover:opacity-90 text-white",
    blue: "bg-emerald-600 hover:opacity-90 text-white",
    red: "bg-red-600 hover:bg-red-700 text-white",
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--background)] app-bg flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 rounded-xl border-2 border-neutral-200 dark:border-neutral-700 border-t-emerald-600 dark:border-t-emerald-500 animate-spin" />
          <p className="text-sm text-neutral-500 dark:text-neutral-400 font-medium">Carregando...</p>
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
          <p className="text-red-700 dark:text-red-300 font-semibold mb-2">Erro ao carregar o dashboard</p>
          <p className="text-neutral-600 dark:text-neutral-400 text-sm mb-6 font-mono break-all">{error}</p>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-4">Se o erro for &quot;Failed to fetch&quot;, execute <code className="bg-neutral-100 dark:bg-neutral-800 px-1.5 py-0.5 rounded">npm run dev</code> na pasta web.</p>
          <button onClick={load} className="rounded-xl bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 px-6 py-2.5 text-sm font-medium hover:opacity-90 transition-opacity">
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`min-h-screen bg-[var(--background)] text-[var(--foreground)] app-bg pt-[calc(3rem+env(safe-area-inset-top,0px))] md:pt-14 ${
        isAdmin
          ? "pb-[calc(6.25rem+env(safe-area-inset-bottom,0px))] md:pb-8"
          : "pb-[max(1.5rem,env(safe-area-inset-bottom,0px))] md:pb-8"
      }`}
    >
      <MobileAppBar logoHref="/dashboard" end={isAdmin ? <></> : undefined} />

      {/* Barra superior — logo DropCore + atalho ativo (como seller) */}
      <nav className="hidden md:flex fixed top-0 left-0 right-0 z-40 h-14 items-center border-b border-neutral-200/80 dark:border-neutral-800/80 bg-white/98 dark:bg-neutral-950/98 backdrop-blur-xl shadow-sm">
        <div className="max-w-4xl mx-auto w-full px-4 sm:px-6 flex items-center gap-6">
          <DropCoreLogo variant="horizontal" href="/dashboard" className="shrink-0" />
          <Link
            href="/dashboard"
            className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium border-b-2 -mb-px text-emerald-600 dark:text-emerald-400 border-emerald-600 hover:bg-emerald-600/10 dark:hover:bg-emerald-500/15 transition-colors"
          >
            <svg className="w-5 h-5 shrink-0 text-emerald-600 dark:text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
            Dashboard
          </Link>
          <ThemeToggle className="ml-auto" />
        </div>
      </nav>

      <div className="dropcore-shell-4xl py-5 md:py-7 space-y-5 md:space-y-6">
        {/* 1. Header — mesmo ritmo visual do fornecedor (card + gradiente) */}
        <header className="rounded-2xl border border-[var(--card-border)] bg-gradient-to-br from-[var(--card)] via-[var(--card)] to-emerald-50/40 dark:to-emerald-950/20 p-4 sm:p-5 shadow-sm overflow-visible">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <div className="flex items-start gap-3 min-w-0 flex-1">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-700 text-white flex items-center justify-center text-lg font-bold shadow-md shadow-emerald-500/25 shrink-0">
                {roleInitial}
              </div>
              <div className="min-w-0 pt-0.5">
                <p className="text-xs font-medium uppercase tracking-wide text-emerald-700/90 dark:text-emerald-400/90">
                  {painelContextoLabel}
                </p>
                <div className="flex flex-wrap items-center gap-2 mt-0.5">
                  <h1 className="text-xl sm:text-2xl font-bold text-neutral-900 dark:text-neutral-50 tracking-tight">
                    {roleLabel}
                  </h1>
                  {stats?.plano && (
                    <span
                      className={`rounded-md px-2 py-0.5 text-[10px] font-semibold ${
                        isPro
                          ? "bg-emerald-600/15 dark:bg-emerald-600/25 text-emerald-800 dark:text-emerald-300"
                          : "bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400"
                      }`}
                    >
                      {stats.plano.toUpperCase()}
                    </span>
                  )}
                </div>
                <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1 capitalize">{dataHojeFmt}</p>
                {stats?.plan_limits && (
                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-1.5">
                    Vendas {stats.plan_limits.vendas_mes}/{stats.plan_limits.vendas_limite} · Produtos{" "}
                    {stats.plan_limits.produto_cor_count}/{stats.plan_limits.produto_cor_limite}
                  </p>
                )}
              </div>
            </div>
            <div className="flex w-full flex-wrap items-center justify-end gap-2 border-t border-neutral-200/70 pt-3 dark:border-neutral-700/60 sm:w-auto sm:border-0 sm:pt-0 sm:shrink-0">
              {!isAdmin && (
                <div className="md:hidden">
                  <ThemeToggle className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center touch-manipulation" />
                </div>
              )}
              <div className={isAdmin ? "hidden md:block" : ""}>
                <NotificationBell context="admin" />
              </div>
              <button
                type="button"
                onClick={load}
                className="rounded-xl border border-[var(--card-border)] bg-[var(--background)]/80 px-3 py-2 min-h-[40px] text-sm font-medium text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 touch-manipulation transition-colors"
              >
                Atualizar
              </button>
              <button
                type="button"
                onClick={sair}
                className="rounded-xl border border-[var(--card-border)] bg-[var(--background)]/80 px-3 py-2 min-h-[40px] text-sm font-medium text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 touch-manipulation transition-colors"
              >
                Sair
              </button>
            </div>
          </div>
        </header>

        {/* 1b. Repasses futuros — alerta no início */}
        {isAdmin && stats && (() => {
          const repasseFuturosValor = Number(stats.repasse_futuros_previstos_total_valor ?? 0);
          const repasseFuturosPedidos = Number(stats.repasse_futuros_previstos_total_pedidos ?? 0);
          const proximoCiclo = stats.repasse_futuros_proximo_ciclo ?? null;
          const deveAlertar = repasseFuturosValor > 0 || repasseFuturosPedidos > 0;

          const cls = deveAlertar
            ? cn(AMBER_PREMIUM_SURFACE, "rounded-2xl shadow-sm overflow-hidden")
            : "rounded-2xl border border-[var(--card-border)] bg-[var(--card)] shadow-sm overflow-hidden";

          const tituloCls = deveAlertar ? AMBER_PREMIUM_TEXT_SOFT : "text-neutral-600 dark:text-neutral-400";

          return (
            <section className={cls}>
              <div className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="min-w-0">
                  <p className={`text-xs font-semibold ${tituloCls}`}>Repasses futuros</p>
                  {deveAlertar ? (
                    <>
                      <p className="text-sm font-bold text-neutral-900 dark:text-neutral-100 mt-0.5 tabular-nums">
                        {BRL.format(repasseFuturosValor)} previsto
                      </p>
                      <p className="text-[11px] text-neutral-600 dark:text-neutral-400 mt-1">
                        {repasseFuturosPedidos} pedido{repasseFuturosPedidos !== 1 ? "s" : ""} pronto(s)
                        {proximoCiclo ? ` · Próximo: ${formatDateBR(proximoCiclo ?? undefined)}` : ""}
                      </p>
                    </>
                  ) : (
                    <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400 mt-0.5">
                      Sem repasses futuros no momento
                    </p>
                  )}
                </div>
                {deveAlertar && (
                  <button
                    type="button"
                    onClick={() => router.push("/admin/repasse-fornecedor")}
                    className="rounded-lg bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 text-sm font-semibold shrink-0"
                  >
                    Ver repasse →
                  </button>
                )}
              </div>
            </section>
          );
        })()}

        {/* Mensalidades: quem está em teste grátis, em dia ou inadimplente */}
        {isAdmin && stats?.mensalidade_portal && (
          <section className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] shadow-sm overflow-hidden">
            <div className="p-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
                <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Mensalidades DropCore</p>
                <button
                  type="button"
                  onClick={() => router.push("/admin/mensalidades")}
                  className="text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:underline shrink-0"
                >
                  Gerenciar mensalidades →
                </button>
              </div>
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mb-3">
                Novos sellers e fornecedores ganham {stats.portal_trial_days ?? 7} dias de teste ao aceitar o convite (como a calculadora). &quot;Pagando&quot; = sem mensalidade inadimplente; &quot;Não pagou&quot; = bloqueio até regularizar.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-lg border border-[var(--card-border)] bg-neutral-100 dark:bg-neutral-900/40 p-3">
                  <p className="text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-2">Sellers</p>
                  <ul className="text-sm space-y-1.5 text-neutral-800 dark:text-neutral-200">
                    <li className="flex justify-between gap-2"><span className="text-neutral-500 dark:text-neutral-400">Em teste grátis</span><span className="font-semibold tabular-nums">{stats.mensalidade_portal.sellers.em_teste}</span></li>
                    <li className="flex justify-between gap-2"><span className="text-neutral-500 dark:text-neutral-400">Pagando (em dia)</span><span className="font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{stats.mensalidade_portal.sellers.adimplentes}</span></li>
                    <li className="flex justify-between gap-2"><span className="text-neutral-500 dark:text-neutral-400">Não pagou (inadimplente)</span><span className="font-semibold tabular-nums text-red-600 dark:text-red-400">{stats.mensalidade_portal.sellers.inadimplentes}</span></li>
                  </ul>
                </div>
                <div className="rounded-lg border border-[var(--card-border)] bg-neutral-100 dark:bg-neutral-900/40 p-3">
                  <p className="text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-2">Fornecedores</p>
                  <ul className="text-sm space-y-1.5 text-neutral-800 dark:text-neutral-200">
                    <li className="flex justify-between gap-2"><span className="text-neutral-500 dark:text-neutral-400">Em teste grátis</span><span className="font-semibold tabular-nums">{stats.mensalidade_portal.fornecedores.em_teste}</span></li>
                    <li className="flex justify-between gap-2"><span className="text-neutral-500 dark:text-neutral-400">Pagando (em dia)</span><span className="font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{stats.mensalidade_portal.fornecedores.adimplentes}</span></li>
                    <li className="flex justify-between gap-2"><span className="text-neutral-500 dark:text-neutral-400">Não pagou (inadimplente)</span><span className="font-semibold tabular-nums text-red-600 dark:text-red-400">{stats.mensalidade_portal.fornecedores.inadimplentes}</span></li>
                  </ul>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* 2. Visão geral — card principal como seller/fornecedor */}
        {isAdmin && stats && (
          <section className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] shadow-sm overflow-hidden">
            <div className="relative p-4 sm:p-5">
              <div className="absolute left-0 top-4 bottom-4 w-1 rounded-r-full bg-gradient-to-b from-emerald-500 to-emerald-600 opacity-90" aria-hidden />
              <div className="pl-4 sm:pl-5">
                <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Saldo em conta</p>
                <p className="mt-1 text-3xl sm:text-4xl font-bold tracking-tight text-emerald-700 dark:text-emerald-400 tabular-nums">
                  {BRL.format(stats.saldo_sellers_total ?? 0)}
                </p>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                  {stats.sellers_ativos ?? 0} sellers ativos
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3 sm:p-4 pt-0 border-t border-[var(--card-border)]/80 bg-neutral-100 dark:bg-neutral-900/30">
                <button
                  type="button"
                  onClick={() => router.push("/admin/pedidos")}
                  className="group rounded-xl border border-[var(--card-border)] bg-[var(--card)] px-3.5 py-3.5 min-h-[5.25rem] text-left transition-all hover:border-emerald-300 dark:hover:border-emerald-700 hover:shadow-sm active:scale-[0.99]"
                >
                  <p className="text-[11px] font-semibold text-neutral-600 dark:text-neutral-300">Aguard. envio</p>
                  <p className="mt-1 text-xl font-bold tabular-nums text-neutral-900 dark:text-neutral-100 group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition-colors">
                    {stats.pedidos_aguardando_envio ?? 0}
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => router.push("/admin/repasse-fornecedor")}
                  className="group rounded-xl border border-[var(--card-border)] bg-[var(--card)] px-3.5 py-3.5 min-h-[5.25rem] text-left transition-all hover:border-emerald-300 dark:hover:border-emerald-700 hover:shadow-sm active:scale-[0.99]"
                >
                  <p className="text-[11px] font-semibold text-neutral-600 dark:text-neutral-300">A repassar</p>
                  <p className="mt-1 text-xl font-bold tabular-nums text-neutral-900 dark:text-neutral-100 group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition-colors">
                    {stats.repasses_pendentes ?? 0}
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => router.push("/admin/pedidos")}
                  className="group rounded-xl border border-[var(--card-border)] bg-[var(--card)] px-3.5 py-3.5 min-h-[5.25rem] text-left transition-all hover:border-emerald-300 dark:hover:border-emerald-700 hover:shadow-sm active:scale-[0.99]"
                >
                  <p className="text-[11px] font-semibold text-neutral-600 dark:text-neutral-300">Pedidos hoje</p>
                  <p className="mt-1 text-xl font-bold tabular-nums text-neutral-900 dark:text-neutral-100 group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition-colors">
                    {stats.pedidos_hoje ?? 0}
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => router.push("/admin/empresas")}
                  className="group rounded-xl border border-[var(--card-border)] bg-[var(--card)] px-3.5 py-3.5 min-h-[5.25rem] text-left transition-all hover:border-emerald-300 dark:hover:border-emerald-700 hover:shadow-sm active:scale-[0.99]"
                >
                  <p className="text-[11px] font-semibold text-neutral-600 dark:text-neutral-300">Entrada mês</p>
                  <p className="mt-1 text-xl font-bold tabular-nums text-neutral-900 dark:text-neutral-100 group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition-colors">
                    {BRL.format(stats.entrada_mes ?? 0)}
                  </p>
                </button>
              </div>
              <div className="space-y-3 px-3 pb-3 sm:px-4 sm:pb-4">
                {(stats.repasse_ledger_pronto_proximo_ciclo ?? 0) > 0 && (
                  <button
                    type="button"
                    onClick={() => router.push("/admin/repasse-fornecedor")}
                    className="w-full rounded-xl border border-sky-200 dark:border-sky-900/60 bg-sky-100 dark:bg-sky-950/20 px-3 py-2.5 text-left hover:bg-sky-100/70 dark:hover:bg-sky-950/35 transition-colors"
                  >
                    <p className="text-[11px] text-sky-800 dark:text-sky-300 font-semibold">Repasse futuro (próximo ciclo)</p>
                    <p className="text-sm font-bold text-neutral-900 dark:text-neutral-100 mt-0.5">
                      {(stats.repasse_ledger_pronto_proximo_ciclo ?? 0)} pedido{(stats.repasse_ledger_pronto_proximo_ciclo ?? 0) !== 1 ? "s" : ""} em {formatDateBR(stats.repasse_proximo_ciclo)}
                    </p>
                  </button>
                )}
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-100/60 dark:bg-neutral-800/40 px-3.5 py-3 sm:px-4">
                  <span className="text-xs font-medium text-neutral-600 dark:text-neutral-300">Receita DropCore (acumulado)</span>
                  <span className="text-base font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">{BRL.format(stats.receita_dropcore ?? 0)}</span>
                </div>
              </div>
          </section>
        )}

        {/* Alerta estoque baixo — estilo fornecedor */}
        {stats && (stats.estoque_baixo ?? 0) > 0 && (
          <button
            type="button"
            onClick={() => router.push("/admin/catalogo?estoqueBaixo=1")}
            className="w-full rounded-2xl border border-[var(--card-border)] bg-[var(--card)] px-4 py-3 flex items-center gap-3 text-left shadow-sm hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            <div className="w-9 h-9 rounded-lg bg-emerald-600/10 dark:bg-emerald-600/15 flex items-center justify-center shrink-0 text-emerald-700 dark:text-emerald-400">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 9v4" />
                <path d="M10.363 3.591 2.257 18.028a1.5 1.5 0 0 0 1.274 2.257h16.938a1.5 1.5 0 0 0 1.274-2.257L13.637 3.59a1.5 1.5 0 0 0-2.274 0z" />
                <path d="M12 16h.01" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                {stats.estoque_baixo} {stats.estoque_baixo === 1 ? "item" : "itens"} com estoque abaixo do mínimo
              </p>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">Clique para ver catálogo e repor estoque</p>
            </div>
            <svg className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6" /></svg>
          </button>
        )}

        {/* Alertas urgentes — estilo fornecedor */}
        {alertas.length > 0 && (
          <div className="space-y-3">
            {alertas.map((a) => (
              <div
                key={a.id}
                className={`rounded-2xl border px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-sm ${alertaBgMap[a.cor] ?? alertaBgMap.amber}`}
              >
                <div>
                  <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{a.texto}</p>
                  {a.sub && <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-0.5">{a.sub}</p>}
                </div>
                <button
                  onClick={() => router.push(a.rota)}
                  className={`rounded-lg px-4 py-2 text-sm font-semibold shrink-0 ${alertaBtnMap[a.cor] ?? alertaBtnMap.amber}`}
                >
                  {a.acao} →
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Painel Owner */}
        {me?.role_base === "owner" && (
          <button
            onClick={() => router.push("/platform")}
            className="w-full rounded-2xl border border-[var(--card-border)] bg-[var(--card)] px-4 py-4 flex items-center gap-3 text-left shadow-sm hover:border-emerald-200/80 dark:hover:border-emerald-800/50 hover:bg-emerald-50/40 dark:hover:bg-emerald-950/20 transition-colors"
          >
            <div className="w-11 h-11 rounded-xl bg-emerald-100 dark:bg-emerald-950/50 flex items-center justify-center shrink-0 text-emerald-700 dark:text-emerald-400">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <p className="text-sm font-bold text-neutral-900 dark:text-neutral-100">Painel da Plataforma</p>
                <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white">OWNER</span>
              </div>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">Receita total, todas as orgs, MRR — visível só para você</p>
            </div>
            <svg className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6" /></svg>
          </button>
        )}

        {/* Analytics Pro — card estilo seller/fornecedor */}
        {isAdmin && stats?.plano === "pro" && proData && (
          <>
            <section className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] shadow-sm overflow-hidden">
              <div className="px-4 py-3 flex items-center justify-between border-b border-neutral-100 dark:border-neutral-800 bg-[var(--card)]">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">Analytics</p>
                  <span className="rounded-full bg-emerald-600 px-2.5 py-0.5 text-[10px] font-bold text-white">PRO · 30 dias</span>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-0 divide-x divide-y sm:divide-y-0 divide-neutral-100 dark:divide-neutral-800">
                <div className="px-4 py-3">
                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400">Pedidos</p>
                  <p className="text-lg font-bold text-neutral-900 dark:text-neutral-100 leading-tight mt-0.5">{proData.total_pedidos}</p>
                </div>
                <div className="px-4 py-3">
                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400">Ticket médio</p>
                  <p className="text-lg font-bold text-neutral-900 dark:text-neutral-100 tabular-nums leading-tight mt-0.5">{BRL.format(proData.ticket_medio ?? 0)}</p>
                </div>
                <div className="px-4 py-3">
                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400">Margem DropCore</p>
                  <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400 tabular-nums leading-tight mt-0.5">{(proData.margem_media_pct ?? 0).toFixed(1)}%</p>
                </div>
                <div className="px-4 py-3">
                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400">Receita DropCore</p>
                  <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400 tabular-nums leading-tight mt-0.5">{BRL.format(proData.volume_dropcore ?? 0)}</p>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] shadow-sm overflow-visible">
              <div className="grid grid-cols-2 divide-x divide-neutral-100 dark:divide-neutral-800 border-b border-neutral-100 dark:border-neutral-800 overflow-hidden rounded-t-2xl">
                <div className="px-4 py-4 bg-[var(--card)]">
                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mb-0.5">Receita confirmada (PAGO)</p>
                  <p className="text-base font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">{BRL.format(proData.receita_pago)}</p>
                </div>
                <div className="px-4 py-4 bg-[var(--card)]">
                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mb-0.5">Pendente (a repassar)</p>
                  <p className="text-base font-bold text-neutral-900 dark:text-neutral-100 tabular-nums">{BRL.format(proData.receita_pendente)}</p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-neutral-100 dark:divide-neutral-800 overflow-hidden">
                <div className="px-4 py-4">
                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mb-2 font-medium">Top sellers</p>
                  {proData.top_sellers.length === 0 ? (
                    <p className="text-sm text-neutral-500 dark:text-neutral-400">—</p>
                  ) : (
                    <div className="space-y-2.5">
                      {proData.top_sellers.slice(0, 5).map((s, i) => (
                        <div key={s.id} className="flex items-center gap-2">
                          <span className="text-[11px] text-neutral-500 dark:text-neutral-400 w-3">{i + 1}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100 truncate">{s.nome}</p>
                            <p className="text-[11px] text-neutral-500 dark:text-neutral-400">{s.pedidos} pedidos</p>
                          </div>
                          <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums shrink-0">{BRL.format(s.total)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="px-4 py-4">
                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mb-2 font-medium">Top fornecedores</p>
                  {proData.top_fornecedores.length === 0 ? (
                    <p className="text-sm text-neutral-500 dark:text-neutral-400">—</p>
                  ) : (
                    <div className="space-y-2.5">
                      {proData.top_fornecedores.slice(0, 5).map((f, i) => (
                        <div key={f.id} className="flex items-center gap-2">
                          <span className="text-[11px] text-neutral-500 dark:text-neutral-400 w-3">{i + 1}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100 truncate">{f.nome}</p>
                            <p className="text-[11px] text-neutral-500 dark:text-neutral-400">{f.pedidos} ped · {BRL.format(f.dropcore)} margem</p>
                          </div>
                          <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums shrink-0">{BRL.format(f.total)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="border-t border-neutral-100 dark:border-neutral-800 px-4 py-4 pb-6 bg-[var(--card)] overflow-visible rounded-b-2xl">
                <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mb-0.5 font-medium">Vendas por dia</p>
                <p className="text-[10px] text-neutral-400 dark:text-neutral-500 mb-3">
                  Período: últimos {proData.vendas_por_dia.length} dias
                </p>
                <VendasPorDiaChartBlock
                  series={proData.vendas_por_dia}
                  chartTooltipHover={chartTooltipHover}
                  setChartTooltipHover={setChartTooltipHover}
                />
              </div>
            </section>
          </>
        )}

        {isAdmin && stats && stats.plano !== "pro" && (
          <section className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] shadow-sm overflow-hidden p-6 text-center">
            <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Analytics avançado</p>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">Margem, ticket médio, top sellers e gráficos disponíveis no <span className="text-emerald-600 dark:text-emerald-400 font-medium">Plano Pro</span>.</p>
          </section>
        )}

        {/* Seções — atalhos (visual alinhado seller/fornecedor) */}
        {isAdmin && (
          <section aria-label="Atalhos">
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400 mb-2 px-0.5">
              Seções
            </p>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-3 px-0.5 -mt-1">
              Atalhos para cada área da operação
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {navItens.map((item) => (
                <button
                  key={item.rota}
                  onClick={() => router.push(item.rota)}
                  className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4 flex items-center gap-3 text-left transition-all hover:border-emerald-300 dark:hover:border-emerald-700 hover:shadow-md group"
                >
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-950/50">
                    <AdminNavIcon id={item.icon} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-bold text-neutral-900 dark:text-neutral-100 truncate group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition-colors">
                        {item.title}
                      </p>
                      {item.badge && item.badgeTone && (
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold shrink-0 ${secoesBadgeClass(item.badgeTone)}`}>
                          {item.badge}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5 truncate">{item.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}
      </div>

      {isAdmin && (
        <>
          <div className="pointer-events-auto md:hidden fixed right-3 z-[110] bottom-[calc(4rem+env(safe-area-inset-bottom,0px))]">
            <NotificationBell context="admin" />
          </div>
          <AdminMobileBottomNav />
        </>
      )}
    </div>
  );
}
