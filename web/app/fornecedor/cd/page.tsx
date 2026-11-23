"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { FornecedorNav } from "../FornecedorNav";
import { DANGER_PREMIUM_SURFACE, DANGER_PREMIUM_TEXT_PRIMARY, SUCCESS_PREMIUM_SURFACE, SUCCESS_PREMIUM_TEXT_PRIMARY } from "@/lib/semanticPremium";
import { cdBaixaMotivoLabel } from "@/lib/cdBaixaMotivos";
import { cn } from "@/lib/utils";

type SkuBusca = { id: string; sku: string; nome_produto: string | null; cor: string | null; tamanho: string | null };
type EstoqueSku = { sku_id: string; sku: string; nome_produto: string | null; cor: string | null; tamanho: string | null; estoque_atual: number; conferido: number };
type RemessaPendente = { remessa_id: string; sku: string; nome_produto: string | null; cor: string | null; tamanho: string | null; quantidade: number; observacao: string | null; criado_em: string };
type Movimento = {
  id: string;
  tipo: "remessa_declarada" | "conferencia_entrada" | "baixa_manual";
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

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("pt-BR");
  } catch {
    return iso;
  }
}

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

const ABAS = [
  { key: "remessas", label: "Remessas pendentes" },
  { key: "estoque", label: "Estoque conferido" },
  { key: "historico", label: "Histórico" },
] as const;
type Aba = (typeof ABAS)[number]["key"];

export default function FornecedorCdPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);
  const [aba, setAba] = useState<Aba>("remessas");

  const [skus, setSkus] = useState<EstoqueSku[]>([]);
  const [remessasPendentes, setRemessasPendentes] = useState<RemessaPendente[]>([]);
  const [cdFulfillmentTaxa, setCdFulfillmentTaxa] = useState<number | null>(null);
  const [historico, setHistorico] = useState<Movimento[]>([]);
  const [historicoLoading, setHistoricoLoading] = useState(true);

  const [skuQuery, setSkuQuery] = useState("");
  const [skuOpcoes, setSkuOpcoes] = useState<SkuBusca[]>([]);
  const [skuSelecionado, setSkuSelecionado] = useState<SkuBusca | null>(null);
  const [quantidade, setQuantidade] = useState("");
  const [observacao, setObservacao] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function authHeaders(): Promise<Record<string, string>> {
    const { data: { session } } = await supabaseBrowser.auth.getSession();
    if (!session?.access_token) {
      router.replace("/fornecedor/login");
      throw new Error("Sessão expirada.");
    }
    return { Authorization: `Bearer ${session.access_token}` };
  }

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const headers = await authHeaders();
      const res = await fetch("/api/fornecedor/cd/estoque", { headers, cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Erro ao carregar estoque do CD.");
      setSkus(Array.isArray(data.skus) ? data.skus : []);
      setRemessasPendentes(Array.isArray(data.remessas_pendentes) ? data.remessas_pendentes : []);
      setCdFulfillmentTaxa(typeof data.cd_fulfillment_taxa_valor === "number" ? data.cd_fulfillment_taxa_valor : null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao carregar estoque do CD.");
    } finally {
      setLoading(false);
    }
  }

  async function loadHistorico() {
    setHistoricoLoading(true);
    try {
      const headers = await authHeaders();
      const res = await fetch("/api/fornecedor/cd/historico", { headers, cache: "no-store" });
      const data = await res.json();
      if (res.ok) setHistorico(Array.isArray(data.movimentos) ? data.movimentos : []);
    } finally {
      setHistoricoLoading(false);
    }
  }

  useEffect(() => {
    load();
    loadHistorico();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function buscarSkus() {
    if (!skuQuery.trim()) {
      setSkuOpcoes([]);
      return;
    }
    const headers = await authHeaders();
    const res = await fetch(`/api/fornecedor/produtos?include_alteracoes_status=1`, { headers });
    const data = await res.json();
    const lista: SkuBusca[] = Array.isArray(data.produtos) ? data.produtos : [];
    const termo = skuQuery.trim().toLowerCase();
    setSkuOpcoes(
      lista
        .filter((p) => p.sku.toLowerCase().includes(termo) || (p.nome_produto ?? "").toLowerCase().includes(termo))
        .slice(0, 20)
    );
  }

  async function declararRemessa() {
    setError(null);
    setSucesso(null);
    if (!skuSelecionado) {
      setError("Selecione um SKU.");
      return;
    }
    const qtd = parseFloat(quantidade.replace(",", "."));
    if (!Number.isFinite(qtd) || qtd <= 0) {
      setError("Quantidade inválida.");
      return;
    }
    setEnviando(true);
    try {
      const headers = await authHeaders();
      const res = await fetch("/api/fornecedor/cd/remessa", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ sku_id: skuSelecionado.id, quantidade: qtd, observacao: observacao.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Erro ao declarar remessa.");
      setSucesso(`Remessa de ${qtd} unidade(s) de ${skuSelecionado.sku} declarada — aguarde a conferência do operador.`);
      setSkuSelecionado(null);
      setSkuQuery("");
      setSkuOpcoes([]);
      setQuantidade("");
      setObservacao("");
      await load();
      await loadHistorico();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao declarar remessa.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="bg-[var(--background)] text-[var(--foreground)] app-bg pt-[calc(3.5rem+env(safe-area-inset-top,0px))] md:pt-14 pb-5">
      <div className="dropcore-shell-6xl py-5 md:py-7 space-y-5 md:space-y-6">
        <header className="overflow-visible rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4 shadow-sm sm:p-5">
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2 sm:gap-3">
              <h1 className="min-w-0 truncate text-2xl font-bold tracking-tight text-[var(--foreground)] sm:text-3xl">
                Centro de Distribuição
              </h1>
              <span className="h-1 w-14 shrink-0 self-center rounded-full bg-gradient-to-r from-emerald-500 via-emerald-400 to-emerald-300/70 sm:w-20" aria-hidden />
            </div>
            <p className="max-w-xl text-sm leading-relaxed text-[var(--muted)]">
              Declare remessa quando enviar estoque pro CD DropCore.{" "}
              <span className="font-medium text-[var(--foreground)]">
                O número que vale pra vender só muda depois da conferência física do operador.
              </span>
            </p>
            {cdFulfillmentTaxa != null && (
              <p className="max-w-xl text-sm leading-relaxed text-[var(--muted)]">
                Taxa de fulfillment por pedido:{" "}
                <strong className="text-[var(--foreground)]">
                  {cdFulfillmentTaxa > 0 ? BRL.format(cdFulfillmentTaxa) : `${BRL.format(0)} (isento)`}
                </strong>
              </p>
            )}
          </div>
        </header>

        {error && (
          <div className={cn(DANGER_PREMIUM_SURFACE, DANGER_PREMIUM_TEXT_PRIMARY, "rounded-2xl px-4 py-3 text-sm")}>{error}</div>
        )}
        {sucesso && (
          <div className={cn(SUCCESS_PREMIUM_SURFACE, SUCCESS_PREMIUM_TEXT_PRIMARY, "rounded-2xl px-4 py-3 text-sm")}>{sucesso}</div>
        )}

        <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4 shadow-sm sm:p-5 space-y-3">
          <h2 className="text-sm font-semibold text-[var(--foreground)]">Declarar remessa</h2>

          {skuSelecionado ? (
            <div className="flex items-center justify-between gap-2 rounded-md border border-[var(--card-border)] bg-[var(--muted)]/10 px-3 py-2">
              <span className="text-sm text-[var(--foreground)]">{skuSelecionado.sku} — {skuSelecionado.nome_produto ?? "—"}</span>
              <button type="button" onClick={() => setSkuSelecionado(null)} className="text-[11px] text-[var(--muted)] hover:text-[var(--foreground)]">trocar</button>
            </div>
          ) : (
            <>
              <div className="flex gap-2">
                <input
                  value={skuQuery}
                  onChange={(e) => setSkuQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && buscarSkus()}
                  placeholder="Buscar SKU por código ou nome"
                  className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--surface-subtle)] px-3 py-2.5 text-sm text-[var(--foreground)] focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/40"
                />
                <button type="button" onClick={buscarSkus} className="rounded-md bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-emerald-700 shrink-0">
                  Buscar
                </button>
              </div>
              {skuOpcoes.length > 0 && (
                <div className="max-h-48 overflow-y-auto rounded-md border border-[var(--card-border)]">
                  {skuOpcoes.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => { setSkuSelecionado(s); setSkuOpcoes([]); }}
                      className="block w-full px-3 py-2 text-left text-sm hover:bg-[var(--muted)]/10"
                    >
                      {s.sku} — {s.nome_produto ?? "—"} ({s.cor ?? "—"}/{s.tamanho ?? "—"})
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="w-full sm:max-w-[10rem]">
              <label className="mb-1.5 block text-xs text-[var(--muted)]">Quantidade</label>
              <input
                type="text"
                inputMode="numeric"
                value={quantidade}
                onChange={(e) => setQuantidade(e.target.value)}
                className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--surface-subtle)] px-3 py-2.5 text-sm text-[var(--foreground)] focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/40"
              />
            </div>
            <div className="w-full flex-1">
              <label className="mb-1.5 block text-xs text-[var(--muted)]">Observação (opcional)</label>
              <input
                type="text"
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--surface-subtle)] px-3 py-2.5 text-sm text-[var(--foreground)] focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/40"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={declararRemessa}
            disabled={enviando}
            className="w-full rounded-md bg-emerald-600 px-2.5 py-2 text-[12px] font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60 sm:w-auto"
          >
            {enviando ? "Enviando..." : "Declarar remessa"}
          </button>
        </div>

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

        {aba === "remessas" && (
          <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4 shadow-sm sm:p-5 space-y-3">
            <h2 className="text-sm font-semibold text-[var(--foreground)]">Remessas aguardando conferência</h2>
            {loading ? (
              <p className="text-sm text-[var(--muted)]">Carregando...</p>
            ) : remessasPendentes.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">Nenhuma remessa pendente.</p>
            ) : (
              <div className="space-y-2">
                {remessasPendentes.map((r) => (
                  <article key={r.remessa_id} className="rounded-xl border border-[var(--card-border)] p-3">
                    <p className="text-sm font-medium text-[var(--foreground)]">{r.sku} — {r.nome_produto ?? "—"}</p>
                    <p className="text-[12px] text-[var(--muted)]">{r.quantidade} unidade(s) declaradas em {formatDate(r.criado_em)}</p>
                  </article>
                ))}
              </div>
            )}
          </div>
        )}

        {aba === "estoque" && (
          <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4 shadow-sm sm:p-5 space-y-3">
            <h2 className="text-sm font-semibold text-[var(--foreground)]">Estoque conferido</h2>
            {loading ? (
              <p className="text-sm text-[var(--muted)]">Carregando...</p>
            ) : skus.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">Nenhum SKU no CD ainda.</p>
            ) : (
              <div className="space-y-2">
                {skus.map((s) => (
                  <article key={s.sku_id} className="rounded-xl border border-[var(--card-border)] p-3 flex items-center justify-between gap-2 flex-wrap">
                    <div>
                      <p className="text-sm font-medium text-[var(--foreground)]">{s.sku} — {s.nome_produto ?? "—"}</p>
                      <p className="text-[12px] text-[var(--muted)]">{s.cor ?? "—"}/{s.tamanho ?? "—"}</p>
                    </div>
                    <p className="text-sm font-semibold text-[var(--foreground)]">{s.estoque_atual} unid.</p>
                  </article>
                ))}
              </div>
            )}
          </div>
        )}

        {aba === "historico" && (
          <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4 shadow-sm sm:p-5 space-y-3">
            <h2 className="text-sm font-semibold text-[var(--foreground)]">Histórico</h2>
            {historicoLoading ? (
              <p className="text-sm text-[var(--muted)]">Carregando...</p>
            ) : historico.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">Nenhuma movimentação ainda.</p>
            ) : (
              <div className="space-y-2">
                {historico.map((m) => {
                  const { titulo, tagTexto, tagTone } = movimentoTituloETag(m);
                  const tagClass =
                    tagTone === "success"
                      ? "text-emerald-600 dark:text-emerald-400"
                      : tagTone === "danger"
                        ? "text-[var(--danger)]"
                        : "text-[var(--muted)]";
                  return (
                    <article key={m.id} className="rounded-xl border border-[var(--card-border)] p-3">
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div>
                          <p className="text-sm font-medium text-[var(--foreground)]">
                            {titulo} — {m.sku} ({m.nome_produto ?? "—"})
                          </p>
                          <p className="text-[12px] text-[var(--muted)]">
                            {m.cor ?? "—"}/{m.tamanho ?? "—"} · {formatDateTime(m.criado_em)}
                            {m.tipo === "baixa_manual" && m.motivo && <> · {cdBaixaMotivoLabel(m.motivo)}</>}
                            {m.observacao && <> · {m.observacao}</>}
                          </p>
                        </div>
                        <span className={cn("inline-flex items-center gap-1.5 text-[12px] font-medium shrink-0", tagClass)}>
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden />
                          {tagTexto}
                        </span>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <FornecedorNav active="cd" wide />
      </div>
    </div>
  );
}
