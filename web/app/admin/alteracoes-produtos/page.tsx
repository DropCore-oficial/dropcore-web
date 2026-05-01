"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { DashboardHeader } from "@/components/DashboardHeader";
import { toTitleCase } from "@/lib/formatText";

type Alteracao = {
  id: string;
  sku_id: string;
  fornecedor_id: string;
  org_id: string;
  dados_propostos: Record<string, unknown>;
  status: string;
  motivo_rejeicao: string | null;
  analisado_em: string | null;
  criado_em: string;
  sku: { id: string; sku: string; nome_produto: string | null; cor: string | null; tamanho: string | null; custo_base: number | null; custo_dropcore: number | null; estoque_atual: number | null } | null;
  fornecedor_nome: string;
};

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function formatDate(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("pt-BR") + " " + new Date(s).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

const LABEL: Record<string, string> = {
  nome_produto: "Nome",
  cor: "Cor",
  tamanho: "Tamanho",
  descricao: "Descrição",
  peso_kg: "Peso (kg)",
  peso_liquido_kg: "Peso líquido (kg)",
  peso_bruto_kg: "Peso bruto (kg)",
  estoque_atual: "Estoque atual",
  estoque_minimo: "Est. mínimo",
  custo_base: "Custo fornecedor",
  custo_dropcore: "Custo DropCore",
  categoria: "Categoria",
  dimensoes_pacote: "Dimensões pacote",
  comprimento_cm: "Comp (cm)",
  largura_cm: "Larg (cm)",
  altura_cm: "Alt (cm)",
  link_fotos: "Link fotos",
  imagem_url: "Foto URL",
  ncm: "NCM",
  origem: "Origem",
  cest: "CEST",
  cfop: "CFOP",
  detalhes_produto_json: "Detalhes do formulário",
};

function formatValor(k: string, v: unknown): string {
  if (v == null || v === "") return "—";
  if (k === "detalhes_produto_json") {
    if (typeof v === "object" && v != null) return "Atualizado";
    return "—";
  }
  if (k === "custo_base" || k === "custo_dropcore" || k === "peso_kg") {
    const n = typeof v === "number" ? v : parseFloat(String(v));
    if (Number.isFinite(n) && (k === "custo_base" || k === "custo_dropcore")) return BRL.format(n);
    return String(v);
  }
  return String(v);
}

function normalizarComparacaoCampo(k: string, v: unknown): unknown {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return null;
    if (["nome_produto", "categoria", "cor", "tamanho", "dimensoes_pacote", "descricao"].includes(k)) {
      return toTitleCase(s);
    }
    return s;
  }
  return v;
}

export default function AdminAlteracoesProdutosPage() {
  const router = useRouter();
  const [list, setList] = useState<Alteracao[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);
  /** Em massa: qual operação está em execução (evita mostrar «Rejeitando» durante aprovações). */
  const [bulkAction, setBulkAction] = useState<null | "approve" | "reject">(null);
  const actingBulk = bulkAction !== null;
  const [rejeitarId, setRejeitarId] = useState<string | null>(null);
  const [motivoRejeicao, setMotivoRejeicao] = useState("");
  const [fornecedorSelecionado, setFornecedorSelecionado] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  /** Motivo único aplicado a cada item em rejeição em massa (opcional) */
  const [motivoRejeicaoMassa, setMotivoRejeicaoMassa] = useState("");

  const fornecedoresOpcoes = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of list) map.set(a.fornecedor_id, a.fornecedor_nome);
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], "pt-BR"));
  }, [list]);

  /** Fornecedor efetivo: escolha do admin ou o primeiro da lista (nunca mistura fornecedores na tela). */
  const fornecedorAtivo = useMemo(() => {
    if (list.length === 0) return null;
    if (fornecedorSelecionado && list.some((a) => a.fornecedor_id === fornecedorSelecionado)) {
      return fornecedorSelecionado;
    }
    return fornecedoresOpcoes[0]?.[0] ?? null;
  }, [list, fornecedorSelecionado, fornecedoresOpcoes]);

  const filtradas = useMemo(
    () => (fornecedorAtivo ? list.filter((a) => a.fornecedor_id === fornecedorAtivo) : []),
    [list, fornecedorAtivo]
  );

  useEffect(() => {
    setSelectedIds(new Set());
    setMotivoRejeicaoMassa("");
  }, [fornecedorAtivo]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) {
        router.replace("/login");
        return;
      }
      const res = await fetch("/api/org/alteracoes-pendentes", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Erro ao carregar");
      setList(Array.isArray(data) ? data : []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro");
      setList([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function aprovar(id: string) {
    const { data: { session } } = await supabaseBrowser.auth.getSession();
    if (!session?.access_token) return;
    setActingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/org/alteracoes-pendentes/${id}/aprovar`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Erro ao aprovar");
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao aprovar");
    } finally {
      setActingId(null);
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selecionarTodasDoFornecedor() {
    setSelectedIds(new Set(filtradas.map((a) => a.id)));
  }

  function limparSelecao() {
    setSelectedIds(new Set());
  }

  async function aprovarEmMassa(ids: string[]) {
    if (ids.length === 0) return;
    const { data: { session } } = await supabaseBrowser.auth.getSession();
    if (!session?.access_token) return;
    setBulkAction("approve");
    setError(null);
    let ok = 0;
    const falhas: string[] = [];
    try {
      for (const id of ids) {
        const res = await fetch(`/api/org/alteracoes-pendentes/${id}/aprovar`, {
          method: "POST",
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) falhas.push(`${id.slice(0, 8)}...: ${json?.error ?? res.statusText}`);
        else ok += 1;
      }
      if (falhas.length > 0) {
        setError(
          `Aprovadas ${ok} de ${ids.length}. Falhas: ${falhas.slice(0, 3).join("; ")}${falhas.length > 3 ? "..." : ""}`
        );
      }
      setSelectedIds(new Set());
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao aprovar em massa");
    } finally {
      setBulkAction(null);
    }
  }

  async function rejeitarEmMassa(ids: string[]) {
    if (ids.length === 0) return;
    const { data: { session } } = await supabaseBrowser.auth.getSession();
    if (!session?.access_token) return;
    setBulkAction("reject");
    setError(null);
    let ok = 0;
    const falhas: string[] = [];
    const motivo = motivoRejeicaoMassa.trim() || undefined;
    try {
      for (const id of ids) {
        const res = await fetch(`/api/org/alteracoes-pendentes/${id}/rejeitar`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ motivo }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) falhas.push(`${id.slice(0, 8)}...: ${json?.error ?? res.statusText}`);
        else ok += 1;
      }
      if (falhas.length > 0) {
        setError(
          `Rejeitadas ${ok} de ${ids.length}. Falhas: ${falhas.slice(0, 3).join("; ")}${falhas.length > 3 ? "..." : ""}`
        );
      }
      setSelectedIds(new Set());
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao rejeitar em massa");
    } finally {
      setBulkAction(null);
    }
  }

  async function rejeitar(id: string) {
    const { data: { session } } = await supabaseBrowser.auth.getSession();
    if (!session?.access_token) return;
    setActingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/org/alteracoes-pendentes/${id}/rejeitar`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ motivo: motivoRejeicao || undefined }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Erro ao rejeitar");
      setRejeitarId(null);
      setMotivoRejeicao("");
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao rejeitar");
    } finally {
      setActingId(null);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <DashboardHeader href="/dashboard" onRefresh={load} onLogout={() => router.push("/login")} />
      <div className="mx-auto w-full min-w-0 max-w-3xl px-4 py-4 sm:px-6 sm:py-6 lg:max-w-6xl lg:px-8 lg:py-8">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold tracking-tight text-[var(--foreground)] lg:text-2xl">
              Alterações de produtos em análise
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-[var(--muted)] lg:text-[15px] lg:leading-relaxed">
              Os fornecedores enviam alterações que ficam em análise. Aprove ou rejeite para aplicar ou descartar as mudanças.
            </p>
          </div>
          <button
            type="button"
            onClick={() => router.push("/admin/empresas")}
            className="shrink-0 rounded-xl border border-[var(--card-border)] bg-[var(--card)] px-4 py-2.5 text-sm font-medium text-[var(--muted)] shadow-sm transition-colors hover:border-neutral-300 hover:bg-neutral-100 hover:text-[var(--foreground)] dark:hover:border-neutral-600 dark:hover:bg-neutral-800/90 dark:hover:text-neutral-100"
          >
            ← Voltar às Empresas
          </button>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-lg border border-red-200 dark:border-red-800 bg-red-100 dark:bg-red-950/30 text-red-800 dark:text-red-300 text-sm">
            {error}
          </div>
        )}

        {loading && <div className="text-sm text-[var(--muted)]">Carregando...</div>}

        {!loading && list.length === 0 && (
          <div className="p-8 rounded-xl border border-[var(--card-border)] bg-[var(--card)] text-center text-[var(--muted)]">
            Nenhuma alteração pendente.
          </div>
        )}

        {!loading && list.length > 0 && fornecedoresOpcoes.length > 0 && (
          <div className="mb-8 overflow-hidden rounded-2xl border border-[var(--card-border)] bg-[var(--card)] shadow-sm">
            <div className="border-b border-[var(--card-border)] bg-gradient-to-r from-neutral-50/90 via-neutral-50/20 to-transparent px-4 py-4 dark:from-neutral-800/50 dark:via-neutral-900/30 dark:to-transparent sm:px-5 lg:flex lg:items-center lg:justify-between lg:gap-6 lg:px-6 lg:py-4">
              <label className="block min-w-0 flex-1 lg:max-w-xl">
                <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                  Fornecedor
                </span>
                <select
                  value={fornecedorAtivo ?? ""}
                  onChange={(e) => setFornecedorSelecionado(e.target.value || null)}
                  className="mt-1.5 w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5 text-sm font-medium text-[var(--foreground)] shadow-sm focus:border-emerald-500/80 focus:outline-none focus:ring-2 focus:ring-emerald-500/25 dark:border-neutral-600 dark:focus:border-emerald-500 dark:focus:ring-emerald-400/20"
                >
                  {fornecedoresOpcoes.map(([id, nome]) => (
                    <option key={id} value={id}>
                      {nome} ({list.filter((x) => x.fornecedor_id === id).length} pendente(s))
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-[11px] text-neutral-500 dark:text-neutral-500">Analise um fornecedor de cada vez.</span>
              </label>
              {filtradas.length > 0 && (
                <div className="mt-3 flex shrink-0 flex-wrap gap-2 lg:mt-0">
                  <button
                    type="button"
                    onClick={selecionarTodasDoFornecedor}
                    disabled={actingBulk}
                    className="rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-xs font-medium text-[var(--foreground)] hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-100 dark:hover:bg-neutral-800/80"
                  >
                    Selecionar todas
                  </button>
                  <button
                    type="button"
                    onClick={limparSelecao}
                    disabled={actingBulk || selectedIds.size === 0}
                    className="rounded-lg border border-transparent px-3 py-2 text-xs font-medium text-[var(--muted)] hover:bg-[var(--background)] disabled:cursor-not-allowed disabled:opacity-100"
                  >
                    Limpar seleção
                  </button>
                </div>
              )}
            </div>

            {filtradas.length > 0 && (
              <div className="p-4 sm:p-5 lg:p-6">
                <div className="flex flex-col gap-6 lg:flex-row lg:items-stretch lg:gap-0">
                  <div className="min-w-0 flex-1 lg:pr-8">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">Aprovar</p>
                    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                      <button
                        type="button"
                        onClick={() => void aprovarEmMassa([...selectedIds])}
                        disabled={selectedIds.size === 0 || actingBulk}
                        className="inline-flex min-h-[42px] flex-1 items-center justify-center rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-100 disabled:ring-2 disabled:ring-inset disabled:ring-neutral-900/10 dark:disabled:ring-white/15 sm:min-w-[200px] sm:flex-none"
                      >
                        {bulkAction === "approve" ? "Aprovando..." : `Aprovar selecionadas (${selectedIds.size})`}
                      </button>
                      <button
                        type="button"
                        onClick={() => void aprovarEmMassa(filtradas.map((x) => x.id))}
                        disabled={actingBulk}
                        className="inline-flex min-h-[42px] flex-1 items-center justify-center rounded-xl border-2 border-emerald-600 bg-emerald-100 px-4 py-2.5 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100/80 disabled:cursor-not-allowed disabled:opacity-100 disabled:ring-2 disabled:ring-inset disabled:ring-neutral-900/10 dark:border-emerald-500/70 dark:bg-emerald-950/25 dark:text-emerald-200 dark:hover:bg-emerald-950/45 dark:disabled:ring-white/15 sm:min-w-[240px] sm:flex-none"
                      >
                        {bulkAction === "approve" ? "..." : `Aprovar todas (${filtradas.length})`}
                      </button>
                    </div>
                  </div>

                  <div
                    className="hidden shrink-0 lg:block lg:w-px lg:self-stretch lg:bg-[var(--card-border)]"
                    aria-hidden
                  />

                  <div className="min-w-0 flex-1 lg:pl-8">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-red-700 dark:text-red-400">Rejeitar</p>
                    <label className="mb-3 block">
                      <span className="sr-only">Motivo opcional para rejeições em massa</span>
                      <input
                        type="text"
                        value={motivoRejeicaoMassa}
                        onChange={(e) => setMotivoRejeicaoMassa(e.target.value)}
                        disabled={actingBulk}
                        placeholder="Motivo opcional (rejeições em massa)"
                        className="w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)]/60 disabled:cursor-not-allowed disabled:opacity-100"
                      />
                    </label>
                    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                      <button
                        type="button"
                        onClick={() => {
                          if (selectedIds.size === 0) return;
                          if (
                            !window.confirm(
                              `Rejeitar ${selectedIds.size} alteração(ões) selecionada(s)? Os fornecedores serão notificados.`
                            )
                          ) {
                            return;
                          }
                          void rejeitarEmMassa([...selectedIds]);
                        }}
                        disabled={selectedIds.size === 0 || actingBulk}
                        className="inline-flex min-h-[42px] flex-1 items-center justify-center rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-100 disabled:ring-2 disabled:ring-inset disabled:ring-neutral-900/10 dark:disabled:ring-white/15 sm:min-w-[200px] sm:flex-none"
                      >
                        {bulkAction === "reject" ? "Rejeitando..." : `Rejeitar selecionadas (${selectedIds.size})`}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (
                            !window.confirm(
                              `Rejeitar todas as ${filtradas.length} alterações pendentes deste fornecedor? Esta ação não pode ser desfeita.`
                            )
                          ) {
                            return;
                          }
                          void rejeitarEmMassa(filtradas.map((x) => x.id));
                        }}
                        disabled={actingBulk || filtradas.length === 0}
                        className="inline-flex min-h-[42px] flex-1 items-center justify-center rounded-xl border-2 border-red-600 bg-red-100 px-4 py-2.5 text-sm font-semibold text-red-800 transition hover:bg-red-100/60 disabled:cursor-not-allowed disabled:opacity-100 disabled:ring-2 disabled:ring-inset disabled:ring-neutral-900/10 dark:border-red-500/80 dark:bg-red-950/30 dark:text-red-200 dark:hover:bg-red-950/50 dark:disabled:ring-white/15 sm:min-w-[240px] sm:flex-none"
                      >
                        {bulkAction === "reject" ? "..." : `Rejeitar todas (${filtradas.length})`}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {!loading && list.length > 0 && filtradas.length > 0 && (
          <div className="space-y-4 lg:space-y-4">
            {filtradas.map((a) => {
              const dp = a.dados_propostos as Record<string, unknown>;
              const isExclusao =
                dp?._solicitacao_dropcore === "exclusao_grupo" && typeof dp.grupo_key === "string";
              return (
              <div
                key={a.id}
                className={`overflow-hidden rounded-2xl border bg-[var(--card)] shadow-sm ${
                  isExclusao
                    ? "border-l-[5px] border-l-red-500 border-[var(--card-border)]"
                    : "border-[var(--card-border)] border-l-[5px] border-l-neutral-400 dark:border-l-neutral-500"
                }`}
              >
                <div className="flex flex-col gap-4 p-4 sm:p-5 lg:flex-row lg:items-start lg:justify-between lg:gap-8 lg:p-6">
                  <div className="flex min-w-0 flex-1 gap-3 lg:gap-4">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(a.id)}
                      onChange={() => toggleSelect(a.id)}
                      disabled={actingBulk || actingId === a.id}
                      className="mt-1.5 h-4 w-4 shrink-0 rounded border-neutral-400 text-emerald-600 accent-emerald-600 dark:border-neutral-500"
                      aria-label={`Selecionar alteração ${a.sku?.sku ?? a.id}`}
                    />
                    <div className="min-w-0">
                      <div className="text-base font-semibold leading-snug text-[var(--foreground)] break-words lg:text-lg lg:leading-tight">
                        {a.sku?.nome_produto ?? "—"}
                      </div>
                      <div className="mt-1 font-mono text-xs text-[var(--muted)] lg:text-sm">{a.sku?.sku ?? "—"}</div>
                      <div className="mt-2 text-sm text-[var(--muted)]">
                        <span className="text-[var(--foreground)]/80">{a.fornecedor_nome}</span>
                        <span className="mx-2 text-[var(--card-border)]">·</span>
                        {formatDate(a.criado_em)}
                      </div>
                    </div>
                  </div>
                  {rejeitarId !== a.id ? (
                    <div className="flex w-full min-w-0 flex-col gap-2 sm:flex-row sm:justify-end lg:w-auto lg:min-w-[220px] lg:flex-col lg:justify-start lg:gap-2.5">
                      <button
                        type="button"
                        onClick={() => aprovar(a.id)}
                        disabled={actingId === a.id || actingBulk}
                        className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-100 lg:min-h-[46px] lg:w-full"
                      >
                        {actingId === a.id ? "..." : "Aprovar"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setRejeitarId(a.id)}
                        disabled={actingId === a.id || actingBulk}
                        className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl border-2 border-red-600 bg-red-100 px-5 py-2.5 text-sm font-semibold text-red-800 transition hover:bg-red-100/80 disabled:cursor-not-allowed disabled:opacity-100 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-950/50 lg:min-h-[46px] lg:w-full"
                      >
                        Rejeitar
                      </button>
                    </div>
                  ) : (
                    <div className="flex w-full min-w-0 flex-col gap-2 sm:max-w-md sm:shrink-0">
                      <input
                        type="text"
                        placeholder="Motivo (opcional)"
                        value={motivoRejeicao}
                        onChange={(e) => setMotivoRejeicao(e.target.value)}
                        onBlur={() => setMotivoRejeicao(toTitleCase(motivoRejeicao))}
                        className="w-full min-w-0 rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5 text-sm text-[var(--foreground)]"
                      />
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => rejeitar(a.id)}
                          disabled={actingId === a.id || actingBulk}
                          className="rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-100"
                        >
                          Confirmar rejeição
                        </button>
                        <button
                          type="button"
                          onClick={() => { setRejeitarId(null); setMotivoRejeicao(""); }}
                          className="rounded-lg border border-[var(--card-border)] px-4 py-2.5 text-sm font-medium text-[var(--muted)] hover:bg-[var(--background)] hover:text-[var(--foreground)]"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="border-t border-[var(--card-border)] bg-neutral-100 px-4 py-4 dark:bg-neutral-950/80 sm:px-5 lg:px-6 lg:py-5">
                  {(() => {
                    const { tabela_medidas: tm, ...rest } = a.dados_propostos as Record<string, unknown> & { tabela_medidas?: { tipo_produto?: string; medidas?: Record<string, Record<string, number>> } };
                    const isExclusaoGrupo =
                      rest._solicitacao_dropcore === "exclusao_grupo" && typeof rest.grupo_key === "string";
                    const chavesInternas = new Set(["_solicitacao_dropcore", "grupo_key", "nome_produto_exclusao"]);
                    const entries = Object.entries(rest)
                      .filter(([k]) => !chavesInternas.has(k))
                      .filter(([k, v]) => {
                        const atualBruto = a.sku && (k in a.sku) ? (a.sku as Record<string, unknown>)[k] : null;
                        return normalizarComparacaoCampo(k, atualBruto) !== normalizarComparacaoCampo(k, v);
                      });
                    return (
                      <>
                        {isExclusaoGrupo && (
                          <div className="mb-4 rounded-xl border border-red-200 bg-red-100 px-4 py-3.5 text-sm text-red-900 dark:border-red-700/70 dark:bg-red-950/70 dark:text-red-50">
                            <p className="font-semibold text-red-950 dark:text-red-100">Pedido de exclusão (DropCore)</p>
                            <p className="mt-1.5 text-xs leading-relaxed text-red-900 dark:text-red-100/95">
                              O fornecedor pediu para excluir o produto inteiro{" "}
                              <span className="font-mono font-medium">{String(rest.grupo_key)}</span>
                              {typeof rest.nome_produto_exclusao === "string" && rest.nome_produto_exclusao
                                ? ` — ${rest.nome_produto_exclusao}`
                                : ""}
                              . <strong>Aprovar</strong> apaga todas as variantes do grupo; <strong>Rejeitar</strong> mantém o catálogo.
                            </p>
                          </div>
                        )}
                        {entries.length > 0 && (
                          <div className="text-xs font-medium text-[var(--muted)] mb-2">Campos alterados (atual → proposto):</div>
                        )}
                        {entries.length > 0 && (
                          <div className="mb-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3 lg:grid-cols-4 lg:gap-3">
                            {entries.map(([k, v]) => {
                              const skuVal = a.sku && (k in a.sku) ? (a.sku as Record<string, unknown>)[k] : undefined;
                              const atual = formatValor(k, skuVal ?? null);
                              const proposto = formatValor(k, v);
                              return (
                                <div key={k} className="flex flex-col">
                                  <span className="text-[var(--muted)]">{LABEL[k] ?? k}</span>
                                  <span className="font-medium">
                                    {atual} → {proposto}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                        {tm != null && typeof tm === "object" && tm.medidas != null && typeof tm.medidas === "object" && (() => {
                            const medidasObj = (tm as { medidas: Record<string, Record<string, number>> }).medidas;
                            const firstRow = Object.values(medidasObj)[0];
                            const colKeys = firstRow ? Object.keys(firstRow) : [];
                            return (
                              <div className="mt-3 pt-3 border-t border-[var(--card-border)]">
                                <div className="text-xs font-medium text-[var(--muted)] mb-2">Tabela de medidas (proposta)</div>
                                <p className="text-xs text-[var(--muted)] mb-2">Tipo: {(tm as { tipo_produto?: string }).tipo_produto ?? "genérico"}</p>
                                <div className="overflow-x-auto rounded-lg border border-[var(--card-border)]">
                                  <table className="w-full text-xs border-collapse">
                                    <thead>
                                      <tr className="bg-[var(--card)] border-b border-[var(--card-border)]">
                                        <th className="px-2 py-1.5 text-left font-medium text-[var(--muted)]">Tamanho</th>
                                        {colKeys.map((col) => (
                                          <th key={col} className="px-2 py-1.5 text-left font-medium text-[var(--muted)] capitalize">{col.replace(/_/g, " ")} (cm)</th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {Object.entries(medidasObj).map(([tam, row]) => (
                                        <tr key={tam} className="border-b border-[var(--card-border)]/60">
                                          <td className="px-2 py-1.5 font-medium">{tam}</td>
                                          {colKeys.map((col) => (
                                            <td key={col} className="px-2 py-1.5">{row && Number.isFinite(row[col]) ? row[col] : "—"}</td>
                                          ))}
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            );
                          })()}
                      </>
                    );
                  })()}
                </div>
              </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
