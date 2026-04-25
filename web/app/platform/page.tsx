"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { DropCoreLogo } from "@/components/DropCoreLogo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { PageLayout, Card, Alert, Button, Badge } from "@/components/ui";

type PlatformStats = {
  sellers_total: number;
  sellers_ativos: number;
  sellers_pro: number;
  sellers_starter: number;
  sellers_novos_30d: number;
  sellers_lista: { id: string; nome: string; plano: string; status: string; criado_em: string }[];
  fornecedores_ativos: number;
  fornecedores_lista: { id: string; nome: string; status: string; criado_em: string }[];
  skus_ativos: number;
  pedidos_mes: number;
  pedidos_mes_anterior: number;
  pedidos_crescimento_pct: number | null;
  volume_mes: number;
  receita_dropcore_mes_pedidos: number;
  mrr_realizado: number;
  mrr_pendente: number;
  receita_dropcore_total: number;
  receita_dropcore_mes: number;
  pix_pendentes_count: number;
  pix_pendentes_valor: number;
  pedidos_aguardando_envio: number;
};

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function formatDate(s: string) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

export default function PlatformPage() {
  const router = useRouter();
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) { router.replace("/login"); return; }
      const res = await fetch("/api/platform/stats", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) {
        if (res.status === 403) { router.replace("/dashboard"); return; }
        throw new Error(json?.error || "Erro ao carregar.");
      }
      setStats(json as PlatformStats);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro inesperado");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <PageLayout maxWidth="lg">
      <div className="space-y-8">

        {/* Header */}
        <header className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <DropCoreLogo variant="horizontal" href="/dashboard" />
              <h1 className="text-xl font-bold text-[var(--foreground)]">Plataforma</h1>
              <Badge variant="info">OWNER</Badge>
            </div>
            <p className="text-xs text-[var(--muted)] mt-1">Visão exclusiva do dono da DropCore</p>
          </div>
          <div className="flex gap-2 items-center shrink-0">
            <ThemeToggle />
            <Button variant="secondary" onClick={() => router.push("/dashboard")}>
              ← Dashboard
            </Button>
            <Button variant="secondary" onClick={load}>
              Atualizar
            </Button>
          </div>
        </header>

        {loading ? (
          <Card padding="lg" className="p-12 text-center text-sm text-[var(--muted)]">
            Carregando...
          </Card>
        ) : error ? (
          <Alert variant="danger" title="Erro">
            {error}
          </Alert>
        ) : stats ? (
          <>
            {/* Alertas urgentes */}
            {(stats.pix_pendentes_count > 0 || stats.pedidos_aguardando_envio > 0) && (
              <div className="space-y-3">
                {stats.pedidos_aguardando_envio > 0 && (
                  <Alert variant="warning" title={`${stats.pedidos_aguardando_envio} pedido${stats.pedidos_aguardando_envio !== 1 ? "s" : ""} aguardando confirmação de envio`} action={<Button variant="warning" size="sm" onClick={() => router.push("/admin/pedidos")}>Ver pedidos →</Button>}>
                    Na plataforma toda
                  </Alert>
                )}
                {stats.pix_pendentes_count > 0 && (
                  <Alert variant="info" title={`${stats.pix_pendentes_count} depósito${stats.pix_pendentes_count !== 1 ? "s" : ""} PIX pendentes — ${BRL.format(stats.pix_pendentes_valor)}`} action={<Button variant="info" size="sm" onClick={() => router.push("/admin/depositos-pix")}>Aprovar →</Button>}>
                    Sellers aguardando crédito em conta
                  </Alert>
                )}
              </div>
            )}

            {/* Receita DropCore */}
            <section className="rounded-[var(--radius)] border border-[var(--border-subtle)] bg-[var(--card)] overflow-hidden shadow-[var(--shadow-card)]">
              <div className="px-6 pt-6 pb-4 border-b border-[var(--border-subtle)]">
                <h2 className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider">Receita DropCore</h2>
              </div>
              <div className="grid grid-cols-3 divide-x divide-[var(--border-subtle)]">
                <div className="px-6 py-5">
                  <p className="text-xs text-[var(--muted)] mb-1">Total acumulado</p>
                  <p className="text-2xl font-bold text-[var(--accent)] tabular-nums">{BRL.format(stats.receita_dropcore_total)}</p>
                  <p className="text-[11px] text-[var(--muted)] mt-1">todos os repasses fechados</p>
                </div>
                <div className="px-6 py-5">
                  <p className="text-xs text-[var(--muted)] mb-1">Este mês (repasses)</p>
                  <p className="text-xl font-bold text-[var(--accent)] tabular-nums">{BRL.format(stats.receita_dropcore_mes)}</p>
                  <p className="text-[11px] text-[var(--muted)] mt-1">ciclos fechados no mês</p>
                </div>
                <div className="px-6 py-5">
                  <p className="text-xs text-[var(--muted)] mb-1">MRR (mensalidades)</p>
                  <p className="text-xl font-bold text-[var(--foreground)] tabular-nums">{BRL.format(stats.mrr_realizado)}</p>
                  <p className="text-[11px] mt-1 text-[var(--muted)]">
                    {BRL.format(stats.mrr_pendente)} pendente
                  </p>
                </div>
              </div>
            </section>

            {/* Sellers */}
            <section className="rounded-[var(--radius)] border border-[var(--border-subtle)] bg-[var(--card)] overflow-hidden shadow-[var(--shadow-card)]">
              <div className="px-6 pt-6 pb-4 flex items-center justify-between border-b border-[var(--border-subtle)]">
                <h2 className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider">Sellers</h2>
                <span className="text-xs text-[var(--muted)]">{stats.sellers_novos_30d} novo{stats.sellers_novos_30d !== 1 ? "s" : ""} nos últimos 30 dias</span>
              </div>
              <div className="grid grid-cols-3 divide-x divide-[var(--border-subtle)] border-b border-[var(--border-subtle)]">
                <div className="px-6 py-5 text-center">
                  <p className="text-2xl font-bold text-[var(--foreground)]">{stats.sellers_total}</p>
                  <p className="text-xs text-[var(--muted)] mt-0.5">Total</p>
                </div>
                <div className="px-6 py-5 text-center">
                  <p className="text-2xl font-bold text-[var(--accent)]">{stats.sellers_pro}</p>
                  <p className="text-xs text-[var(--muted)] mt-0.5">Pro</p>
                </div>
                <div className="px-6 py-5 text-center">
                  <p className="text-2xl font-bold text-[var(--muted)]">{stats.sellers_starter}</p>
                  <p className="text-xs text-[var(--muted)] mt-0.5">Starter</p>
                </div>
              </div>

              <div className="divide-y divide-[var(--border-subtle)]">
                {stats.sellers_lista.map((s) => (
                  <div key={s.id} className="px-6 py-4 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[var(--foreground)] truncate">{s.nome}</p>
                      <p className="text-[11px] text-[var(--muted)] mt-0.5">Desde {formatDate(s.criado_em)}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {s.status?.toLowerCase() !== "ativo" && (
                        <Badge variant="danger">{s.status}</Badge>
                      )}
                      <Badge variant={s.plano === "pro" ? "success" : "neutral"}>{s.plano.toUpperCase()}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Fornecedores */}
            <section className="rounded-[var(--radius)] border border-[var(--border-subtle)] bg-[var(--card)] overflow-hidden shadow-[var(--shadow-card)]">
              <div className="px-6 pt-6 pb-4 flex items-center justify-between border-b border-[var(--border-subtle)]">
                <h2 className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider">Fornecedores</h2>
                <span className="text-xs text-[var(--muted)]">{stats.fornecedores_ativos} ativos</span>
              </div>
              <div className="divide-y divide-[var(--border-subtle)]">
                {stats.fornecedores_lista.length === 0 ? (
                  <p className="px-6 py-5 text-sm text-[var(--muted)]">Nenhum fornecedor cadastrado.</p>
                ) : (
                  stats.fornecedores_lista.map((f) => (
                    <div key={f.id} className="px-6 py-4 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[var(--foreground)] truncate">{f.nome}</p>
                        <p className="text-[11px] text-[var(--muted)] mt-0.5">Desde {formatDate(f.criado_em)}</p>
                      </div>
                      {f.status?.toLowerCase() !== "ativo" && <Badge variant="danger">{f.status}</Badge>}
                    </div>
                  ))
                )}
              </div>
            </section>

            {/* Pedidos do mês */}
            <section className="rounded-[var(--radius)] border border-[var(--border-subtle)] bg-[var(--card)] overflow-hidden shadow-[var(--shadow-card)]">
              <div className="px-6 pt-6 pb-4 border-b border-[var(--border-subtle)]">
                <h2 className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider">Pedidos — mês atual</h2>
              </div>
              <div className="grid grid-cols-3 divide-x divide-[var(--border-subtle)]">
                <div className="px-6 py-5">
                  <p className="text-xs text-[var(--muted)] mb-1">Total de pedidos</p>
                  <p className="text-xl font-bold text-[var(--foreground)]">{stats.pedidos_mes}</p>
                  {stats.pedidos_crescimento_pct !== null && (
                    <p className={`text-[11px] mt-0.5 ${stats.pedidos_crescimento_pct >= 0 ? "text-[var(--success)]" : "text-[var(--danger)]"}`}>
                      {stats.pedidos_crescimento_pct >= 0 ? "+" : ""}{stats.pedidos_crescimento_pct.toFixed(0)}% vs mês anterior
                    </p>
                  )}
                </div>
                <div className="px-6 py-5">
                  <p className="text-xs text-[var(--muted)] mb-1">Volume total</p>
                  <p className="text-xl font-bold text-[var(--foreground)] tabular-nums">{BRL.format(stats.volume_mes)}</p>
                  <p className="text-[11px] text-[var(--muted)] mt-0.5">valor bruto dos pedidos</p>
                </div>
                <div className="px-6 py-5">
                  <p className="text-xs text-[var(--muted)] mb-1">Receita DropCore</p>
                  <p className="text-xl font-bold text-[var(--accent)] tabular-nums">{BRL.format(stats.receita_dropcore_mes_pedidos)}</p>
                  <p className="text-[11px] text-[var(--muted)] mt-0.5">margem nos pedidos do mês</p>
                </div>
              </div>
            </section>

            {/* Plataforma */}
            <section className="rounded-[var(--radius)] border border-[var(--border-subtle)] bg-[var(--card)] overflow-hidden shadow-[var(--shadow-card)]">
              <div className="px-6 pt-6 pb-4 border-b border-[var(--border-subtle)]">
                <h2 className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider">Plataforma</h2>
              </div>
              <div className="grid grid-cols-3 divide-x divide-[var(--border-subtle)]">
                <div className="px-6 py-5 text-center">
                  <p className="text-2xl font-bold text-[var(--foreground)]">{stats.sellers_ativos}</p>
                  <p className="text-xs text-[var(--muted)] mt-0.5">Sellers ativos</p>
                </div>
                <div className="px-6 py-5 text-center">
                  <p className="text-2xl font-bold text-[var(--foreground)]">{stats.fornecedores_ativos}</p>
                  <p className="text-xs text-[var(--muted)] mt-0.5">Fornecedores ativos</p>
                </div>
                <div className="px-6 py-5 text-center">
                  <p className="text-2xl font-bold text-[var(--foreground)]">{stats.skus_ativos}</p>
                  <p className="text-xs text-[var(--muted)] mt-0.5">SKUs ativos</p>
                </div>
              </div>
            </section>
          </>
        ) : null}
      </div>
    </PageLayout>
  );
}
