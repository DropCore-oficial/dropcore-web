"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { isPortalTrialAtivo } from "@/lib/portalTrial";

type Mensalidade = {
  id: string;
  tipo: string;
  entidade_id: string;
  ciclo: string;
  valor: number;
  status: string;
  vencimento_em: string | null;
  pago_em: string | null;
  entidade_nome?: string;
  em_teste_gratis?: boolean;
  /** Fim do teste grátis do portal (seller/fornecedor), ISO */
  trial_valido_ate?: string | null;
};

const btnPrimary: React.CSSProperties = {
  padding: "8px 16px",
  background: "#16a34a",
  color: "#fff",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 14,
};
const btnSecondary: React.CSSProperties = {
  padding: "8px 16px",
  border: "1px solid #d1d5db",
  borderRadius: 6,
  background: "#fff",
  cursor: "pointer",
  fontSize: 14,
};
/** Botão destrutivo: fundo vermelho sólido */
const btnDangerSolid: React.CSSProperties = {
  padding: "8px 16px",
  background: "#dc2626",
  color: "#fff",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 14,
  fontWeight: 600,
};
/** Conceder teste grátis — azul sólido (leitura boa em claro/escuro) */
const btnTrialBlue: React.CSSProperties = {
  padding: "8px 16px",
  background: "#0284c7",
  color: "#fff",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 14,
  fontWeight: 600,
};
const modalOverlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.4)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 50,
  padding: 16,
};
const modalBox: React.CSSProperties = {
  background: "var(--card, #fff)",
  padding: 24,
  borderRadius: 8,
  maxWidth: 420,
  width: "100%",
  maxHeight: "min(90vh, 640px)",
  overflowY: "auto",
  boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
  border: "1px solid var(--border-subtle, #e5e7eb)",
};
/** Largura extra no desktop: três botões na mesma linha sem quebrar. */
const trialModalBox: React.CSSProperties = {
  ...modalBox,
  maxWidth: 580,
};
type EntidadeTrial = { id: string; nome: string; trial_valido_ate: string | null };

function formatMoney(n: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
}

/** Evita exibir véspera do dia por UTC (ex.: ciclo 2026-04-01 → 01/04, não 31/03). */
function formatDateLocalYmd(s: string) {
  if (!s) return "—";
  const iso = s.length >= 10 ? `${s.slice(0, 10)}T12:00:00` : s;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString("pt-BR", { dateStyle: "short" });
}

/** Dias completos até o fim do trial (0 se já passou). */
function diasRestantesTrial(trialValidoAte: string | null | undefined): number | null {
  if (!trialValidoAte) return null;
  const end = new Date(trialValidoAte).getTime();
  if (Number.isNaN(end)) return null;
  const diff = end - Date.now();
  if (diff <= 0) return 0;
  return Math.ceil(diff / (24 * 60 * 60 * 1000));
}

/** Primeira palavra da razão social (listagem compacta); nome completo no `title`. */
function primeiraPalavraRazaoSocial(nome: string | null | undefined): string {
  const t = String(nome ?? "").trim();
  if (!t) return "—";
  const first = t.split(/\s+/)[0];
  return first || "—";
}

/** Texto único do badge: "30 dias grátis" (número = dias restantes do trial). */
function badgeDiasGratisTexto(r: Mensalidade): string | null {
  if (!r.em_teste_gratis || !r.trial_valido_ate) return null;
  const d = diasRestantesTrial(r.trial_valido_ate);
  if (d === null) return "Dias grátis";
  if (d === 0) return "Último dia grátis";
  return `${d} dias grátis`;
}

/** BD pode ainda dizer inadimplente antes de sincronizar; em trial ativo não é inadimplência efetiva — mostrar como pendente. */
function statusExibicaoAdmin(r: Mensalidade): string {
  if (r.status === "inadimplente" && r.em_teste_gratis && isPortalTrialAtivo(r.trial_valido_ate)) {
    return "pendente";
  }
  return r.status;
}

/** Enquanto o trial do portal está ativo, não há cobrança — não faz sentido «Marcar pago». */
function podeMarcarPagoManual(r: Mensalidade): boolean {
  if (statusExibicaoAdmin(r) !== "pendente") return false;
  if (r.em_teste_gratis && isPortalTrialAtivo(r.trial_valido_ate)) return false;
  return true;
}

/** Em trial ativo: data fim do trial; senão vencimento da mensalidade (ex. dia 10 do ciclo). */
function vencimentoExibicaoAdmin(r: Mensalidade): string {
  if (r.em_teste_gratis && r.trial_valido_ate && isPortalTrialAtivo(r.trial_valido_ate)) {
    return formatDateLocalYmd(r.trial_valido_ate);
  }
  if (r.vencimento_em) return formatDateLocalYmd(r.vencimento_em);
  return "—";
}

function cicloAtual(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function proximoCiclo(ciclo: string): string {
  const [y, m] = ciclo.split("-").map(Number);
  if (m === 12) return `${y + 1}-01`;
  return `${y}-${String(m + 1).padStart(2, "0")}`;
}

export default function MensalidadesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const destaqueId = searchParams.get("destaque");
  const rowRefs = useRef<Record<string, HTMLElement | null>>({});
  const [rows, setRows] = useState<Mensalidade[]>([]);
  const [loading, setLoading] = useState(true);
  const [gerando, setGerando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [ciclo, setCiclo] = useState(cicloAtual());
  const [tipoFilter, setTipoFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [trialModal, setTrialModal] = useState(false);
  const [trialSellers, setTrialSellers] = useState<EntidadeTrial[]>([]);
  const [trialFornecedores, setTrialFornecedores] = useState<EntidadeTrial[]>([]);
  const [trialTipo, setTrialTipo] = useState<"seller" | "fornecedor">("seller");
  const [trialEntidadeId, setTrialEntidadeId] = useState("");
  const [trialDias, setTrialDias] = useState(7);
  const [trialLoadingOpts, setTrialLoadingOpts] = useState(false);
  /** `add` = conceder dias; `remove` = limpar trial */
  const [trialBusy, setTrialBusy] = useState<false | "add" | "remove">(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) {
        router.replace("/login");
        return;
      }
      const params = new URLSearchParams();
      if (ciclo && !destaqueId) params.set("ciclo", ciclo);
      if (tipoFilter) params.set("tipo", tipoFilter);
      if (statusFilter) params.set("status", statusFilter);
      const res = await fetch(`/api/org/mensalidades?${params}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Erro");
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [ciclo, tipoFilter, statusFilter, destaqueId]);

  useEffect(() => {
    if (!destaqueId || rows.length === 0) return;
    const row = rows.find((r) => r.id === destaqueId);
    if (!row) return;
    const el = rowRefs.current[destaqueId];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [destaqueId, rows]);

  async function gerar() {
    setGerando(true);
    setError(null);
    setSuccess(null);
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) {
        setError("Faça login novamente.");
        return;
      }
      const res = await fetch("/api/org/mensalidades/gerar", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ ciclo }),
        cache: "no-store",
      });
      let json: { geradas?: number; message?: string; error?: string } = {};
      try {
        json = await res.json();
      } catch {
        throw new Error(res.status === 401 ? "Sessão expirada. Faça login novamente." : "Erro ao processar resposta.");
      }
      if (!res.ok) throw new Error(json?.error || `Erro ${res.status}`);
      const n = json.geradas ?? 0;
      setSuccess(
        n > 0
          ? `Geradas ${n} mensalidades para ${ciclo}.`
          : json.message ?? `Nenhuma mensalidade nova. Já existem para ${ciclo} ou não há sellers/fornecedores ativos.`
      );
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    } finally {
      setGerando(false);
    }
  }

  async function abrirModalTrial() {
    setTrialModal(true);
    setTrialLoadingOpts(true);
    setError(null);
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) {
        setError("Faça login novamente.");
        setTrialModal(false);
        return;
      }
      const res = await fetch("/api/org/portal-trial", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Erro ao carregar entidades.");
      const sellers = Array.isArray(data.sellers) ? data.sellers : [];
      const fornecedores = Array.isArray(data.fornecedores) ? data.fornecedores : [];
      setTrialSellers(sellers);
      setTrialFornecedores(fornecedores);
      if (sellers.length > 0) {
        setTrialTipo("seller");
        setTrialEntidadeId(sellers[0].id);
      } else if (fornecedores.length > 0) {
        setTrialTipo("fornecedor");
        setTrialEntidadeId(fornecedores[0].id);
      } else {
        setTrialTipo("seller");
        setTrialEntidadeId("");
      }
      setTrialDias(7);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
      setTrialModal(false);
    } finally {
      setTrialLoadingOpts(false);
    }
  }

  async function concederTrial() {
    if (!trialEntidadeId) {
      setError("Selecione um seller ou fornecedor.");
      return;
    }
    setTrialBusy("add");
    setError(null);
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) {
        setError("Faça login novamente.");
        return;
      }
      const res = await fetch("/api/org/portal-trial", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ tipo: trialTipo, entidade_id: trialEntidadeId, dias: trialDias }),
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Erro ao conceder teste.");
      setSuccess("Teste grátis atualizado. O portal não bloqueia por mensalidade até a nova data.");
      setTrialModal(false);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    } finally {
      setTrialBusy(false);
    }
  }

  async function removerTrial() {
    if (!trialEntidadeId) {
      setError("Selecione um seller ou fornecedor.");
      return;
    }
    if (
      !window.confirm(
        "Tem certeza que deseja excluir o teste grátis desta entidade? O portal voltará a aplicar bloqueio por mensalidade conforme as regras normais."
      )
    ) {
      return;
    }
    setTrialBusy("remove");
    setError(null);
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) {
        setError("Faça login novamente.");
        return;
      }
      const res = await fetch("/api/org/portal-trial", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ tipo: trialTipo, entidade_id: trialEntidadeId }),
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Erro ao excluir teste.");
      setSuccess("Excluído com sucesso.");
      setTrialModal(false);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    } finally {
      setTrialBusy(false);
    }
  }

  function labelEntidadeOpt(e: EntidadeTrial) {
    const nome = e.nome?.trim() || e.id.slice(0, 8);
    if (isPortalTrialAtivo(e.trial_valido_ate)) {
      return `${nome} (trial até ${formatDateLocalYmd(String(e.trial_valido_ate))})`;
    }
    return `${nome} (sem trial)`;
  }

  async function marcarPago(id: string) {
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch(`/api/org/mensalidades/${id}/pagar`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Erro");
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    }
  }

  async function excluirMensalidade(id: string) {
    if (!window.confirm("Excluir esta mensalidade pendente?")) return;
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch(`/api/org/mensalidades/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Erro");
      setSuccess("Mensalidade excluída.");
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    }
  }

  function statusLabel(s: string) {
    const map: Record<string, string> = {
      pendente: "Pendente",
      pago: "Pago",
      inadimplente: "Inadimplente",
      cancelado: "Cancelado",
    };
    return map[s] ?? s;
  }

  function statusBadgeClass(s: string) {
    switch (s) {
      case "pago":
        return "bg-emerald-100 text-emerald-900 ring-1 ring-emerald-600/15 dark:bg-emerald-950/70 dark:text-emerald-100 dark:ring-emerald-500/25";
      case "inadimplente":
        return "bg-red-100 text-red-900 ring-1 ring-red-600/15 dark:bg-red-950/60 dark:text-red-100 dark:ring-red-500/30";
      case "pendente":
        return "bg-neutral-200/90 text-neutral-900 ring-1 ring-neutral-400/30 dark:bg-neutral-700 dark:text-neutral-100 dark:ring-neutral-500/40";
      case "cancelado":
        return "bg-neutral-200 text-neutral-800 ring-1 ring-neutral-400/25 dark:bg-neutral-700 dark:text-neutral-100 dark:ring-neutral-500/30";
      default:
        return "bg-neutral-200 text-neutral-800 dark:bg-neutral-700 dark:text-neutral-200";
    }
  }

  /** Chips da linha da tabela: mesma altura que botões de ação (32px). */
  const tableChip =
    "inline-flex h-8 min-h-8 items-center justify-center whitespace-nowrap rounded-md px-2.5 text-xs font-semibold leading-none";
  const trialChipClass =
    `${tableChip} shrink-0 bg-sky-500/15 text-sky-800 ring-1 ring-inset ring-sky-500/25 dark:bg-sky-500/20 dark:text-sky-100 dark:ring-sky-400/35`;
  /** Grid tabela (padrão): 1 botão em Ações — manter como referência visual. */
  const MENSALIDADES_TABLE_GRID_PADRAO =
    "grid w-full min-w-0 grid-cols-[90px_118px_minmax(180px,1fr)_90px_100px_110px_88px] items-center gap-x-3 gap-y-2 px-4 py-3";
  /** Grid 2 ações: colunas afinadas para caber no card; Ações com min. ~196px para padding interno confortável. */
  const MENSALIDADES_TABLE_GRID_COM_DUAS_ACOES =
    "grid w-full min-w-0 grid-cols-[82px_104px_minmax(100px,1fr)_80px_84px_106px_minmax(0,196px)] items-center gap-x-3 gap-y-2 px-4 py-3";
  /** Mesma caixa (32px) para botões sólidos e outline na coluna Ações — evita um mais alto que o outro. */
  const tableActionBtnBase =
    "box-border inline-flex h-8 min-h-8 shrink-0 items-center justify-center whitespace-nowrap rounded-md border-0 px-3 text-xs font-semibold leading-none tracking-normal touch-manipulation transition-[filter]";
  /** Versão mais estreita (só tabela, 2 botões) para caber na coluna sem estourar o card. */
  const tableActionBtnBaseCompact =
    "box-border inline-flex h-8 min-h-8 shrink-0 items-center justify-center whitespace-nowrap rounded-md border-0 px-2 text-xs font-semibold leading-none tracking-normal touch-manipulation transition-[filter]";
  const tableActionBtnOutlineInadimplenteCompact = `${tableActionBtnBaseCompact} border border-red-300 bg-red-50 text-red-900 shadow-sm hover:bg-red-100 dark:border-red-800 dark:bg-red-950/50 dark:text-red-100 dark:hover:bg-red-950/70`;

  const pendentes = rows.filter((r) => statusExibicaoAdmin(r) === "pendente");
  const totalPendente = pendentes.reduce((s, r) => s + r.valor, 0);
  const pendenteEmTeste = pendentes.filter((r) => r.em_teste_gratis).reduce((s, r) => s + r.valor, 0);
  const pendenteCobravelPortal = totalPendente - pendenteEmTeste;

  function linhaComDuasAcoesMensalidade(r: Mensalidade): boolean {
    const st = statusExibicaoAdmin(r);
    return st === "inadimplente" || (st === "pendente" && podeMarcarPagoManual(r));
  }
  const tabelaUsaGridDuasAcoes = rows.some(linhaComDuasAcoesMensalidade);
  const mensalidadesTableGridClass = tabelaUsaGridDuasAcoes
    ? MENSALIDADES_TABLE_GRID_COM_DUAS_ACOES
    : MENSALIDADES_TABLE_GRID_PADRAO;

  const acoesLinha = (r: Mensalidade, layout: "card" | "table") => {
    const st = statusExibicaoAdmin(r);
    const doisBotoesTable =
      layout === "table" &&
      ((st === "pendente" && podeMarcarPagoManual(r)) || st === "inadimplente");
    return (
    <div
      className={
        layout === "card"
          ? "mt-4 flex w-full flex-row flex-wrap items-stretch justify-stretch gap-3 border-t border-neutral-200 pt-4 dark:border-neutral-600"
          : doisBotoesTable
            ? "flex min-w-0 flex-row flex-nowrap items-center gap-2"
            : "flex flex-row flex-nowrap items-center gap-2"
      }
    >
      {st === "pendente" && (
        <>
          {podeMarcarPagoManual(r) && (
            <button
              type="button"
              onClick={() => marcarPago(r.id)}
              className={
                layout === "card"
                  ? "min-h-[44px] min-w-0 flex-1 touch-manipulation rounded-md px-3 text-sm font-semibold text-white hover:brightness-105 active:brightness-95"
                  : `${doisBotoesTable ? tableActionBtnBaseCompact : tableActionBtnBase} bg-green-600 text-white hover:brightness-105 active:brightness-95`
              }
              style={layout === "card" ? { ...btnPrimary, padding: "10px 14px" } : undefined}
            >
              Marcar pago
            </button>
          )}
          <button
            type="button"
            title="Excluir esta linha (mensalidade não paga)"
            onClick={() => excluirMensalidade(r.id)}
            className={
              layout === "card"
                ? "min-h-[44px] min-w-0 flex-1 touch-manipulation rounded-md px-3 text-sm font-semibold text-white hover:brightness-110 active:brightness-95"
                : `${doisBotoesTable ? tableActionBtnBaseCompact : tableActionBtnBase} bg-red-600 text-white hover:brightness-110 active:brightness-95`
            }
            style={layout === "card" ? { ...btnDangerSolid, padding: "10px 14px" } : undefined}
          >
            {layout === "table" ? "Excluir" : "Excluir linha"}
          </button>
        </>
      )}
      {st === "inadimplente" &&
        (layout === "card" ? (
          <div className="flex w-full flex-col gap-2">
            <button
              type="button"
              onClick={() => marcarPago(r.id)}
              className="w-full min-h-[44px] touch-manipulation rounded-md px-3 text-sm font-semibold"
              style={{
                border: "1px solid #dc2626",
                background: "#fef2f2",
                color: "#991b1b",
                cursor: "pointer",
                width: "100%",
                padding: "10px 14px",
              }}
            >
              Regularizar
            </button>
            <button
              type="button"
              title="Excluir a linha (não paga)"
              onClick={() => excluirMensalidade(r.id)}
              className="w-full min-h-[44px] touch-manipulation rounded-md px-3 text-sm font-semibold text-white"
              style={{ ...btnDangerSolid, padding: "10px 14px" }}
            >
              Excluir linha
            </button>
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={() => marcarPago(r.id)}
              className={tableActionBtnOutlineInadimplenteCompact}
            >
              Regularizar
            </button>
            <button
              type="button"
              title="Excluir a linha (não paga)"
              onClick={() => excluirMensalidade(r.id)}
              className={`${tableActionBtnBaseCompact} bg-red-600 text-white shadow-sm hover:brightness-110 active:brightness-95`}
            >
              Excluir
            </button>
          </>
        ))}
    </div>
  );
  };

  const listaTrialAtual = trialTipo === "seller" ? trialSellers : trialFornecedores;
  const selectedTrialEntidade = listaTrialAtual.find((e) => e.id === trialEntidadeId);
  const temTrialAtivoPortal =
    !!selectedTrialEntidade && isPortalTrialAtivo(selectedTrialEntidade.trial_valido_ate);

  return (
    <div className="dropcore-safe-x mx-auto min-w-0 max-w-4xl px-3 sm:px-6 py-4 sm:py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <header className="mb-6">
        <h1 className="text-xl sm:text-2xl font-semibold mb-1">Mensalidades</h1>
        <p className="text-sm text-neutral-500 max-w-prose leading-relaxed">
          Mensalidades de sellers e fornecedores. Gere para o mês e marque como pago quando receber.
        </p>
      </header>

      <div className="flex min-w-0 flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <button
          type="button"
          onClick={gerar}
          disabled={gerando}
          className="w-full min-h-[44px] touch-manipulation sm:min-h-0 sm:w-auto sm:min-w-0"
          style={{ ...btnPrimary, opacity: gerando ? 0.7 : 1, cursor: gerando ? "not-allowed" : "pointer" }}
        >
          {gerando ? "Gerando..." : `Gerar mensalidades de ${ciclo}`}
        </button>
        <button
          type="button"
          onClick={abrirModalTrial}
          disabled={trialLoadingOpts}
          className="w-full min-h-[44px] touch-manipulation sm:min-h-0 sm:w-auto sm:min-w-0 hover:brightness-110 active:brightness-95 transition-[filter] disabled:opacity-60 disabled:cursor-not-allowed"
          style={{
            ...btnTrialBlue,
            cursor: trialLoadingOpts ? "not-allowed" : "pointer",
          }}
        >
          {trialLoadingOpts ? "Carregando..." : "Teste grátis do portal"}
        </button>
      </div>

      {trialModal && (
        <div
          style={modalOverlay}
          role="dialog"
          aria-modal="true"
          aria-labelledby="trial-modal-title"
          onClick={(ev) => {
            if (ev.target === ev.currentTarget) setTrialModal(false);
          }}
        >
          <div style={trialModalBox} onClick={(e) => e.stopPropagation()}>
            <h2 id="trial-modal-title" style={{ fontSize: 18, fontWeight: 600, marginTop: 0, marginBottom: 12 }}>
              Teste grátis do portal
            </h2>
            <p style={{ color: "#6b7280", fontSize: 13, marginBottom: 16 }}>
              Conceda dias extras (somam ao fim do trial atual, se houver) ou exclua o teste para o painel voltar a
              respeitar bloqueio por mensalidade.
            </p>
            {trialLoadingOpts ? (
              <p>Carregando entidades...</p>
            ) : (
              <>
                <label className="flex flex-col gap-1.5 mb-3 text-sm w-full">
                  <span className="text-neutral-600 dark:text-neutral-400">Tipo</span>
                  <select
                    value={trialTipo}
                    onChange={(e) => {
                      const t = e.target.value as "seller" | "fornecedor";
                      setTrialTipo(t);
                      const list = t === "seller" ? trialSellers : trialFornecedores;
                      setTrialEntidadeId(list[0]?.id ?? "");
                    }}
                    className="w-full min-h-[44px] rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 px-3 py-2 text-base sm:text-sm"
                  >
                    <option value="seller">Seller</option>
                    <option value="fornecedor">Fornecedor</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1.5 mb-3 text-sm w-full min-w-0">
                  <span className="text-neutral-600 dark:text-neutral-400">Entidade</span>
                  <select
                    value={trialEntidadeId}
                    onChange={(e) => setTrialEntidadeId(e.target.value)}
                    className="w-full min-h-[44px] max-w-full rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 px-3 py-2 text-base sm:text-sm"
                  >
                    {(trialTipo === "seller" ? trialSellers : trialFornecedores).map((row) => (
                      <option key={row.id} value={row.id}>
                        {labelEntidadeOpt(row)}
                      </option>
                    ))}
                  </select>
                </label>
                {(trialTipo === "seller" ? trialSellers : trialFornecedores).length === 0 && (
                  <p style={{ color: "#991b1b", fontSize: 13 }}>Nenhum {trialTipo === "seller" ? "seller" : "fornecedor"} ativo.</p>
                )}
                {trialEntidadeId && selectedTrialEntidade && listaTrialAtual.length > 0 && (
                  <p style={{ fontSize: 13, marginBottom: 12, color: "var(--foreground-muted, #6b7280)" }}>
                    {temTrialAtivoPortal
                      ? `Trial ativo até ${formatDateLocalYmd(String(selectedTrialEntidade.trial_valido_ate))}.`
                      : "Sem trial ativo no portal."}
                  </p>
                )}
                <label className="flex flex-col gap-1.5 mb-4 text-sm sm:flex-row sm:items-center sm:gap-3">
                  <span className="text-neutral-600 dark:text-neutral-400 sm:shrink-0">Dias a conceder</span>
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={trialDias}
                    onChange={(e) => setTrialDias(Math.max(1, Math.min(365, Number(e.target.value) || 1)))}
                    className="w-full sm:w-24 min-h-[44px] rounded-md border border-neutral-300 dark:border-neutral-600 px-3 py-2 text-base sm:text-sm"
                  />
                </label>
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:flex-nowrap sm:justify-end sm:items-center sm:gap-2">
                  <button
                    type="button"
                    onClick={() => setTrialModal(false)}
                    className="w-full min-h-[44px] shrink-0 sm:w-auto"
                    style={btnSecondary}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={removerTrial}
                    disabled={
                      !!trialBusy ||
                      listaTrialAtual.length === 0 ||
                      !trialEntidadeId ||
                      !temTrialAtivoPortal
                    }
                    className="w-full min-h-[44px] shrink-0 whitespace-nowrap sm:w-auto hover:brightness-110 active:brightness-95 disabled:opacity-60 disabled:cursor-not-allowed"
                    style={btnDangerSolid}
                  >
                    {trialBusy === "remove" ? "Excluindo..." : "Excluir teste grátis"}
                  </button>
                  <button
                    type="button"
                    onClick={concederTrial}
                    disabled={
                      !!trialBusy ||
                      listaTrialAtual.length === 0 ||
                      !trialEntidadeId
                    }
                    className="w-full min-h-[44px] shrink-0 whitespace-nowrap sm:w-auto"
                    style={{
                      ...btnPrimary,
                      opacity: trialBusy === "add" ? 0.7 : 1,
                      cursor: trialBusy ? "not-allowed" : "pointer",
                    }}
                  >
                    {trialBusy === "add" ? "Salvando..." : "Adicionar dias"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {error && (
        <div
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-100"
          role="alert"
        >
          {error}
        </div>
      )}
      {success && (
        <div
          className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-100"
          role="status"
        >
          {success}
        </div>
      )}

      <div className="rounded-xl border border-neutral-200 bg-neutral-50/90 p-4 sm:p-5 dark:border-neutral-700 dark:bg-neutral-900/40">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-12 lg:items-start lg:gap-x-6 lg:gap-y-4">
          <div className="sm:col-span-2 lg:col-span-5">
            <div className="grid grid-cols-1 gap-y-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-x-3 sm:gap-y-2">
              <span className="text-sm font-medium leading-5 text-neutral-700 dark:text-neutral-300 sm:col-span-2">
                Ciclo (mês)
              </span>
              <input
                type="month"
                value={ciclo}
                onChange={(e) => setCiclo(e.target.value)}
                className="h-11 w-full min-w-0 rounded-lg border border-neutral-300 bg-white px-3 text-sm text-neutral-900 shadow-sm dark:border-neutral-600 dark:bg-neutral-950 dark:text-neutral-100 dark:shadow-none"
              />
              <button
                type="button"
                onClick={() => setCiclo(proximoCiclo(ciclo))}
                className="h-11 w-full shrink-0 touch-manipulation rounded-lg border border-neutral-300 bg-white px-3 text-sm font-medium text-neutral-800 shadow-sm hover:bg-neutral-100 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100 dark:hover:bg-neutral-700 sm:w-auto sm:min-w-[152px]"
              >
                Próximo mês →
              </button>
            </div>
          </div>
          <label className="flex min-w-0 flex-col gap-2 sm:col-span-1 lg:col-span-3">
            <span className="text-sm font-medium leading-5 text-neutral-700 dark:text-neutral-300">Tipo</span>
            <select
              value={tipoFilter}
              onChange={(e) => setTipoFilter(e.target.value)}
              className="h-11 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm text-neutral-900 shadow-sm dark:border-neutral-600 dark:bg-neutral-950 dark:text-neutral-100 dark:shadow-none"
            >
              <option value="">Todos</option>
              <option value="seller">Sellers</option>
              <option value="fornecedor">Fornecedores</option>
            </select>
          </label>
          <label className="flex min-w-0 flex-col gap-2 sm:col-span-1 lg:col-span-4">
            <span className="text-sm font-medium leading-5 text-neutral-700 dark:text-neutral-300">Status</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-11 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm text-neutral-900 shadow-sm dark:border-neutral-600 dark:bg-neutral-950 dark:text-neutral-100 dark:shadow-none"
            >
              <option value="">Todos</option>
              <option value="pendente">Pendente</option>
              <option value="pago">Pago</option>
              <option value="inadimplente">Inadimplente</option>
            </select>
          </label>
        </div>
      </div>

      {totalPendente > 0 && (
        <div className="rounded-xl border border-neutral-200 bg-white p-4 sm:p-5 shadow-sm dark:border-neutral-700 dark:bg-neutral-900/50">
          <p className="m-0 text-sm text-neutral-800 dark:text-neutral-100">
            <strong>Total pendente (lista):</strong> {formatMoney(totalPendente)}
          </p>
          {pendenteEmTeste > 0 && (
            <p className="m-0 mt-3 text-xs leading-relaxed text-neutral-600 dark:text-neutral-400 sm:text-sm">
              <strong className="text-neutral-700 dark:text-neutral-300">Teste grátis</strong>{" "}
              <span>({formatMoney(pendenteEmTeste)})</span>
              <span className="mx-1.5 text-neutral-400 dark:text-neutral-500">·</span>
              cobrança efetiva no portal: <strong className="text-neutral-800 dark:text-neutral-200">{formatMoney(pendenteCobravelPortal)}</strong>
            </p>
          )}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-neutral-500">Carregando...</p>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-10 text-center text-sm text-neutral-500 dark:border-neutral-700 dark:bg-neutral-900/50">
          Nenhuma mensalidade encontrada. Clique em &quot;Gerar mensalidades&quot; para criar.
        </div>
      ) : (
        <>
          <ul className="md:hidden m-0 list-none space-y-4 p-0">
            {rows.map((r) => (
              <li
                key={r.id}
                ref={(el) => {
                  rowRefs.current[r.id] = el;
                }}
                className={`rounded-xl border p-4 shadow-sm ${
                  destaqueId === r.id
                    ? "border-green-500 bg-green-50/90 dark:bg-green-950/30 ring-2 ring-green-500/40"
                    : "border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900/40"
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex max-w-full flex-wrap items-center gap-2">
                      <span
                        className="min-w-0 max-w-full truncate font-semibold text-base"
                        title={r.entidade_nome?.trim() || undefined}
                      >
                        {primeiraPalavraRazaoSocial(r.entidade_nome)}
                      </span>
                      {badgeDiasGratisTexto(r) && (
                        <span className={trialChipClass}>{badgeDiasGratisTexto(r)}</span>
                      )}
                    </div>
                    <p className="mt-2 text-xs text-neutral-500">
                      {formatDateLocalYmd(r.ciclo)} · {r.tipo === "seller" ? "Seller" : "Fornecedor"}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-semibold tabular-nums">{formatMoney(r.valor)}</p>
                    <span className={`mt-1 inline-flex ${tableChip} ${statusBadgeClass(statusExibicaoAdmin(r))}`}>
                      {statusLabel(statusExibicaoAdmin(r))}
                    </span>
                  </div>
                </div>
                <dl className="mt-4 border-t border-neutral-100 pt-4 text-sm dark:border-neutral-700">
                  <div className="flex justify-between gap-3">
                    <dt className="text-neutral-500">Vencimento</dt>
                    <dd className="font-medium">{vencimentoExibicaoAdmin(r)}</dd>
                  </div>
                </dl>
                {acoesLinha(r, "card")}
              </li>
            ))}
          </ul>

          <div className="hidden md:block w-full min-w-0 overflow-x-auto rounded-xl border border-neutral-200 dark:border-neutral-700">
            <div className="w-full min-w-0" role="table" aria-label="Mensalidades">
              <div role="rowgroup">
                <div
                  className={`${mensalidadesTableGridClass} border-b border-neutral-200 dark:border-neutral-700`}
                  role="row"
                >
                  <div className="min-w-0 text-left text-sm font-semibold text-neutral-600 dark:text-neutral-400" role="columnheader">
                    Ciclo
                  </div>
                  <div className="min-w-0 text-left text-sm font-semibold text-neutral-600 dark:text-neutral-400" role="columnheader">
                    Tipo
                  </div>
                  <div className="min-w-0 text-left text-sm font-semibold text-neutral-600 dark:text-neutral-400" role="columnheader">
                    Entidade
                  </div>
                  <div
                    className="min-w-0 pl-2 text-right text-sm font-semibold text-neutral-600 dark:text-neutral-400"
                    role="columnheader"
                  >
                    Valor
                  </div>
                  <div
                    className="min-w-0 pl-1 text-left text-sm font-semibold text-neutral-600 dark:text-neutral-400"
                    role="columnheader"
                  >
                    Status
                  </div>
                  <div
                    className={
                      tabelaUsaGridDuasAcoes
                        ? "min-w-0 pl-2 pr-5 text-left text-sm font-semibold text-neutral-600 dark:text-neutral-400"
                        : "min-w-0 pl-2 pr-3 text-left text-sm font-semibold text-neutral-600 dark:text-neutral-400"
                    }
                    role="columnheader"
                  >
                    Vencimento
                  </div>
                  <div
                    className={
                      tabelaUsaGridDuasAcoes
                        ? "min-w-0 pl-2 pr-6 text-right text-sm font-semibold text-neutral-600 dark:text-neutral-400"
                        : "min-w-0 pl-1 text-left text-sm font-semibold text-neutral-600 dark:text-neutral-400"
                    }
                    role="columnheader"
                  >
                    Ações
                  </div>
                </div>
              </div>
              <div role="rowgroup">
                {rows.map((r) => (
                  <div
                    key={r.id}
                    className={`${mensalidadesTableGridClass} border-b border-neutral-100 dark:border-neutral-800`}
                    role="row"
                    style={
                      destaqueId === r.id
                        ? { background: "#f0fdf4", boxShadow: "inset 0 0 0 2px #22c55e" }
                        : undefined
                    }
                  >
                    <div className="min-w-0 text-sm text-neutral-800 dark:text-neutral-200">
                      {formatDateLocalYmd(r.ciclo)}
                    </div>
                    <div className="min-w-0 truncate text-sm text-neutral-800 dark:text-neutral-200">
                      {r.tipo === "seller" ? "Seller" : "Fornecedor"}
                    </div>
                    <div className="min-w-0 w-full overflow-hidden">
                      <div className="flex w-full min-w-0 items-center gap-2">
                        <span
                          className="min-w-0 flex-1 truncate text-sm font-medium"
                          title={r.entidade_nome?.trim() || undefined}
                        >
                          {primeiraPalavraRazaoSocial(r.entidade_nome)}
                        </span>
                        {badgeDiasGratisTexto(r) && (
                          <span className="inline-flex h-7 shrink-0 items-center justify-center whitespace-nowrap rounded-md px-1 text-xs font-semibold leading-none ring-1 ring-inset bg-sky-500/15 text-sky-800 ring-sky-500/25 dark:bg-sky-500/20 dark:text-sky-100 dark:ring-sky-400/35">
                            {badgeDiasGratisTexto(r)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="min-w-0 truncate pl-2 text-right text-sm font-medium tabular-nums text-neutral-800 dark:text-neutral-200">
                      {formatMoney(r.valor)}
                    </div>
                    <div className="flex min-w-0 items-center overflow-hidden pl-1">
                      <span
                        className={`inline-flex h-7 max-w-full items-center justify-center whitespace-nowrap rounded-md px-1.5 text-xs font-semibold leading-none ${statusBadgeClass(statusExibicaoAdmin(r))}`}
                      >
                        {statusLabel(statusExibicaoAdmin(r))}
                      </span>
                    </div>
                    <div
                      className={
                        tabelaUsaGridDuasAcoes
                          ? "min-w-0 whitespace-nowrap pl-2 pr-5 text-sm text-neutral-800 dark:text-neutral-200"
                          : "min-w-0 whitespace-nowrap pl-2 pr-3 text-sm text-neutral-800 dark:text-neutral-200"
                      }
                    >
                      {vencimentoExibicaoAdmin(r)}
                    </div>
                    <div
                      className={
                        tabelaUsaGridDuasAcoes
                          ? "min-w-0 w-full overflow-hidden pl-3 pr-6"
                          : "min-w-0 w-full overflow-hidden pl-1"
                      }
                    >
                      {linhaComDuasAcoesMensalidade(r) ? (
                        <div className="flex w-full min-w-0 max-w-full justify-end">
                          {acoesLinha(r, "table")}
                        </div>
                      ) : (
                        <div className="flex w-full min-w-0 items-center justify-start">
                          {acoesLinha(r, "table")}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
      </div>
    </div>
  );
}
