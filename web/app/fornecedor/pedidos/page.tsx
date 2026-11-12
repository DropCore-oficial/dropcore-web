"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { FornecedorNav } from "../FornecedorNav";
import { AMBER_PREMIUM_TEXT_PRIMARY } from "@/lib/amberPremium";
import {
  DANGER_PREMIUM_SURFACE,
  DANGER_PREMIUM_TEXT_PRIMARY,
} from "@/lib/semanticPremium";
import { IconClipboard, IconBox, IconArrowRight, IconDevolucao, IconCheck, IconX, IconClock, IconAjuste, IconPackage, IconEstoqueVazio, IconLock } from "@/components/seller/Icons";
import { AmberPremiumCallout } from "@/components/ui/AmberPremiumCallout";
import { PedidoCardSkeleton } from "@/components/ui/Skeleton";
import { ModalOverlay } from "@/components/ui/ModalOverlay";
import { MODAL_PANEL_BODY_CLASS } from "@/lib/modalOverlay";
import { FornecedorDevolucaoAcoes } from "@/components/fornecedor/FornecedorDevolucaoAcoes";
import { PeriodoPersonalizadoModal } from "@/components/fornecedor/PeriodoPersonalizadoModal";
import { useDragScroll } from "@/lib/useDragScroll";
import { cn } from "@/lib/utils";

/** Grupo de abas da tela — cada uma pode cobrir vários status reais de uma vez (ex:
 * "Devolução" junta em_devolucao + devolvido + devolucao_sem_fornecedor). `null` = sem
 * filtro (Todos). Consolida o que antes era /fornecedor/devolucoes numa aba só aqui. */
const ABAS = [
  { key: "todos", label: "Todos", statuses: null as string[] | null, Icon: IconClipboard, bufferMl: null as "somente" | "excluir" | null, etiquetaImpressa: null as "somente" | "excluir" | null },
  { key: "buffer", label: "Buffer", statuses: ["enviado"], Icon: IconClock, bufferMl: "somente" as "somente" | "excluir" | null, etiquetaImpressa: null as "somente" | "excluir" | null },
  { key: "erro", label: "Erro", statuses: ["erro_saldo"], Icon: IconAjuste, bufferMl: null as "somente" | "excluir" | null, etiquetaImpressa: null as "somente" | "excluir" | null },
  { key: "sem_estoque", label: "Sem estoque", statuses: ["pendente_estoque"], Icon: IconEstoqueVazio, bufferMl: null as "somente" | "excluir" | null, etiquetaImpressa: null as "somente" | "excluir" | null },
  { key: "bloqueado", label: "Bloqueado", statuses: ["bloqueado"], Icon: IconLock, bufferMl: null as "somente" | "excluir" | null, etiquetaImpressa: null as "somente" | "excluir" | null },
  { key: "pra_enviar", label: "Pra enviar", statuses: ["enviado"], Icon: IconBox, bufferMl: "excluir" as "somente" | "excluir" | null, etiquetaImpressa: "excluir" as "somente" | "excluir" | null },
  { key: "retirada", label: "Para retirar", statuses: ["enviado"], Icon: IconPackage, bufferMl: null as "somente" | "excluir" | null, etiquetaImpressa: "somente" as "somente" | "excluir" | null },
  { key: "enviados", label: "Enviados", statuses: ["aguardando_repasse"], Icon: IconArrowRight, bufferMl: null as "somente" | "excluir" | null, etiquetaImpressa: null as "somente" | "excluir" | null },
  { key: "devolucao", label: "Devolução", statuses: ["em_devolucao", "devolvido", "devolucao_sem_fornecedor"], Icon: IconDevolucao, bufferMl: null as "somente" | "excluir" | null, etiquetaImpressa: null as "somente" | "excluir" | null },
  { key: "concluidos", label: "Concluídos", statuses: ["entregue"], Icon: IconCheck, bufferMl: null as "somente" | "excluir" | null, etiquetaImpressa: null as "somente" | "excluir" | null },
  { key: "cancelados", label: "Cancelados", statuses: ["cancelado"], Icon: IconX, bufferMl: null as "somente" | "excluir" | null, etiquetaImpressa: null as "somente" | "excluir" | null },
] as const;
type AbaKey = (typeof ABAS)[number]["key"];

function abaFromStatusParam(raw: string | null): AbaKey {
  if (!raw) return "todos";
  const exata = ABAS.find((a) => a.key === raw);
  if (exata) return exata.key;
  const porStatus = ABAS.find((a) => (a.statuses as readonly string[] | null)?.includes(raw));
  return porStatus?.key ?? "todos";
}

type Devolucao = {
  id: string;
  valor_total: number;
  data_evento: string;
  entrega_confirmada_em: string | null;
  prazo_final: string | null;
  contestado: boolean;
  fornecedor_contestacao_texto: string | null;
};

// Padrão compacto de toolbar/badge — mesmo teste de web/app/admin/pedidos/page.tsx
// (ver skill dropcore-layout, seções "Botão de ação compacto" e "Badge de status").
const btnSecondaryCompactClass =
  "rounded-md border border-[var(--card-border)] bg-[var(--card)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--foreground)] transition-colors hover:bg-[var(--muted)]/10";
const btnPrimaryCompactClass =
  "rounded-md bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60";

// Status = informação, não ação: sem borda, fundo suave + bolinha (bg-current) em vez de
// pílula com contorno.
const STATUS_PILL: Record<string, string> = {
  bloqueado: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300",
  pendente_estoque: "bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300",
  enviado: cn(AMBER_PREMIUM_TEXT_PRIMARY, "bg-[#fffbeb] dark:bg-amber-950/50"),
  aguardando_repasse: "bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300",
  entregue: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300",
  em_devolucao: "bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300",
  devolvido: "bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300",
  devolucao_sem_fornecedor: "bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300",
  erro_saldo: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300",
  cancelado: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300",
};

// Mesma cor (roxo) e mesmo racional de web/app/seller/pedidos/page.tsx: etiqueta em buffer
// do próprio ML não é uma pendência real, não faz sentido usar âmbar ("precisa agir") pra ela.
const ML_BUFFER_BADGE_CLASS = "bg-violet-100 text-violet-900 dark:bg-violet-950/40 dark:text-violet-300";
const ML_BUFFER_TEXT_PRIMARY = "text-violet-900 dark:text-violet-300";

// Selo de "etiqueta recém-liberada, ainda não impressa" — mesmo pedido que acabou de sair
// do buffer (ou chegou agora por qualquer caminho) priorizado no topo da lista
// (fn_fornecedor_pedidos_lista); emerald porque é notícia boa, já pode imprimir.
const ETIQUETA_LIBERADA_BADGE_CLASS = "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300";

type PedidoItem = {
  sku: string;
  quantidade: number;
  nome_produto: string | null;
  cor: string | null;
  tamanho: string | null;
  categoria: string | null;
  linha_despacho: string | null;
};

type Pedido = {
  id: string;
  seller_id: string;
  seller_nome: string;
  nome_produto: string | null;
  cor?: string | null;
  tamanho?: string | null;
  categoria?: string | null;
  linha_despacho?: string | null;
  metodo_envio?: string | null;
  tracking_codigo?: string | null;
  marketplace_numero?: string | null;
  comprador_nome?: string | null;
  comprador_cidade?: string | null;
  comprador_uf?: string | null;
  comprador_fone?: string | null;
  itens: PedidoItem[];
  valor_fornecedor: number;
  status: string;
  motivo_bloqueio?: string | null;
  cancelado_motivo?: string | null;
  criado_em: string;
  tem_etiqueta_oficial?: boolean;
  etiqueta_impressa_em?: string | null;
  etiqueta_liberada_em?: string | null;
  canal_venda?: string | null;
  etiqueta_ml_previsao?: string | null;
  ledger_id?: string | null;
  /** Vários order_id do ML podem ser o mesmo pacote/etiqueta — este card representa todos
   * esses ids (ver pedidos.marketplace_pack_id em docs/SCHEMA.md). Sem pack, é só `[id]`. */
  pack_pedido_ids: string[];
};

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function formatDate(s: string) {
  return new Date(s).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** Números de página com reticências pra não estourar a barra quando há muitas páginas. */
function getPageNumbers(current: number, total: number): (number | "...")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | "...")[] = [1];
  if (current > 3) pages.push("...");
  for (let p = Math.max(2, current - 1); p <= Math.min(total - 1, current + 1); p++) pages.push(p);
  if (current < total - 2) pages.push("...");
  pages.push(total);
  return pages;
}

/**
 * Título do card sem repetir "- Cor - Tamanho" (já tem campo próprio) nem o nome do
 * produto uma vez por variante — usa o nome base do item (não o `nome_produto` do
 * pedido, que já vem com o sufixo de cor/tamanho concatenado do Olist).
 */
function tituloPedido(p: Pedido): string {
  const itens = p.itens ?? [];
  if (itens.length === 0) return p.nome_produto ?? "Pedido";
  const nomesUnicos = [...new Set(itens.map((it) => (it.nome_produto ?? "").trim()).filter(Boolean))];
  if (nomesUnicos.length <= 1) {
    const base = nomesUnicos[0] ?? p.nome_produto ?? "Pedido";
    return itens.length > 1 ? `${base} · ${itens.length} itens` : base;
  }
  const outros = nomesUnicos.length - 1;
  return `${nomesUnicos[0]} + ${outros} outro${outros > 1 ? "s" : ""}`;
}

/** Etiqueta em buffer do próprio ML (capacidade de transportadora) — ainda não existe
 * etiqueta real pra imprimir nem pra marcar como postado, então não entra em nenhuma
 * seleção em lote (checkbox individual e "selecionar todos"). */
function emBufferMl(p: Pedido): boolean {
  return p.status === "enviado" && !p.tem_etiqueta_oficial && p.canal_venda === "mercado_livre";
}

/** Etiqueta já saiu do buffer (ou chegou de qualquer outro jeito) mas ainda não foi
 * impressa — fica priorizado no topo da lista (ver fn_fornecedor_pedidos_lista) e ganha
 * este selo pra ficar óbvio por que ele subiu. */
function etiquetaRecemLiberada(p: Pedido): boolean {
  return p.status === "enviado" && Boolean(p.tem_etiqueta_oficial) && !p.etiqueta_impressa_em && Boolean(p.etiqueta_liberada_em);
}

const statusLabel: Record<string, string> = {
  pendente_estoque: "Aguardando estoque",
  bloqueado: "Bloqueado",
  enviado: "Aguardando postagem",
  aguardando_repasse: "Postado",
  entregue: "Entregue",
  em_devolucao: "Em devolução",
  devolvido: "Devolvido",
  devolucao_sem_fornecedor: "Devolução — fornecedor não confirmado",
  cancelado: "Cancelado",
  erro_saldo: "Erro saldo",
};

export default function FornecedorPedidosPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [abaAtiva, setAbaAtiva] = useState<AbaKey>(() => abaFromStatusParam(searchParams.get("status")));
  const [abaContagens, setAbaContagens] = useState<Record<AbaKey, number>>({
    todos: 0, buffer: 0, erro: 0, sem_estoque: 0, bloqueado: 0, pra_enviar: 0, retirada: 0, enviados: 0, devolucao: 0, concluidos: 0, cancelados: 0,
  });
  const [devolucoesPendentes, setDevolucoesPendentes] = useState<Devolucao[]>([]);
  const [confirmandoDevolucaoId, setConfirmandoDevolucaoId] = useState<string | null>(null);
  const [mensagemDevolucao, setMensagemDevolucao] = useState<string | null>(null);
  const [buscaSellerInput, setBuscaSellerInput] = useState("");
  const [buscaSellerAplicada, setBuscaSellerAplicada] = useState("");
  const [periodo, setPeriodo] = useState<"todos" | "hoje" | "7d" | "30d" | "custom">("todos");
  const [customDe, setCustomDe] = useState("");
  const [customAte, setCustomAte] = useState("");
  const [modalPeriodoAberto, setModalPeriodoAberto] = useState(false);

  // Debounce da busca por seller — só dispara o fetch 400ms depois de parar de digitar.
  useEffect(() => {
    const t = setTimeout(() => setBuscaSellerAplicada(buscaSellerInput.trim()), 400);
    return () => clearTimeout(t);
  }, [buscaSellerInput]);

  function periodoParaIntervalo(p: typeof periodo): { desde: string | null; ate: string | null } {
    if (p === "todos") return { desde: null, ate: null };
    if (p === "custom") {
      const desde = customDe ? new Date(`${customDe}T00:00:00`).toISOString() : null;
      const ate = customAte ? new Date(`${customAte}T23:59:59.999`).toISOString() : null;
      return { desde, ate };
    }
    const agora = new Date();
    if (p === "hoje") {
      const inicioHoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
      return { desde: inicioHoje.toISOString(), ate: null };
    }
    const dias = p === "7d" ? 7 : 30;
    return { desde: new Date(agora.getTime() - dias * 24 * 60 * 60 * 1000).toISOString(), ate: null };
  }
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [imprimindoLote, setImprimindoLote] = useState(false);
  const [marcandoLote, setMarcandoLote] = useState(false);
  const [avisoLote, setAvisoLote] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalPedidos, setTotalPedidos] = useState(0);
  const [expedicaoPadrao, setExpedicaoPadrao] = useState<string | null>(null);
  const destaqueId = searchParams.get("destaque");
  const pedidoCardRefs = useRef<Record<string, HTMLElement | null>>({});
  const printMenuRef = useRef<HTMLDetailsElement>(null);
  const abasDrag = useDragScroll<HTMLDivElement>();

  useEffect(() => {
    function onPointerDown(e: MouseEvent) {
      if (printMenuRef.current && !printMenuRef.current.contains(e.target as Node)) {
        printMenuRef.current.removeAttribute("open");
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  async function load(opts?: { preserveSelection?: boolean }) {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) {
        router.replace("/fornecedor/login");
        return;
      }
      const abaDef = ABAS.find((a) => a.key === abaAtiva);
      const statuses = abaDef?.statuses ?? null;
      const params = new URLSearchParams();
      if (statuses) params.set("status", statuses.join(","));
      if (abaDef?.bufferMl) params.set("buffer_ml", abaDef.bufferMl);
      if (abaDef?.etiquetaImpressa) params.set("etiqueta_impressa", abaDef.etiquetaImpressa);
      if (buscaSellerAplicada) params.set("seller_nome", buscaSellerAplicada);
      const { desde, ate } = periodoParaIntervalo(periodo);
      if (desde) params.set("desde", desde);
      if (ate) params.set("ate", ate);
      // Com destaque (link de notificação), busca uma janela maior em vez de só a
      // página atual — o pedido notificado pode não estar entre os `pageSize` mais
      // recentes.
      params.set("page", destaqueId ? "1" : String(page));
      params.set("limit", destaqueId ? "300" : String(pageSize));
      const res = await fetch(`/api/fornecedor/pedidos?${params.toString()}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error ?? "Erro ao carregar pedidos.");
      }
      const json = await res.json();
      setPedidos(json.items ?? []);
      setTotalPedidos(typeof json.total === "number" ? json.total : (json.items ?? []).length);
      if (json.abas) {
        setAbaContagens({
          todos: json.abas.todos ?? 0,
          buffer: json.abas.buffer ?? 0,
          erro: json.abas.erro ?? 0,
          sem_estoque: json.abas.sem_estoque ?? 0,
          bloqueado: json.abas.bloqueado ?? 0,
          pra_enviar: json.abas.pra_enviar ?? 0,
          retirada: json.abas.retirada ?? 0,
          enviados: json.abas.enviados ?? 0,
          devolucao: json.abas.devolucao ?? 0,
          concluidos: json.abas.concluidos ?? 0,
          cancelados: json.abas.cancelados ?? 0,
        });
      }
      if (typeof json.expedicao_padrao === "string" || json.expedicao_padrao === null) {
        setExpedicaoPadrao(json.expedicao_padrao);
      }
      if (!opts?.preserveSelection) {
        setSelectedIds(new Set());
        setAvisoLote(null);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro inesperado.");
    } finally {
      setLoading(false);
    }
  }

  async function loadDevolucoesPendentes() {
    const { data: { session } } = await supabaseBrowser.auth.getSession();
    if (!session?.access_token) return;
    const res = await fetch("/api/fornecedor/devolucoes", {
      headers: { Authorization: `Bearer ${session.access_token}` },
      cache: "no-store",
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok) setDevolucoesPendentes(json.devolucoes ?? []);
  }

  async function confirmarDevolucao(ledgerId: string) {
    setConfirmandoDevolucaoId(null);
    const { data: { session } } = await supabaseBrowser.auth.getSession();
    if (!session?.access_token) return;
    const res = await fetch(`/api/fornecedor/devolucoes/${ledgerId}/confirmar`, {
      method: "POST",
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const json = await res.json().catch(() => ({}));
    setMensagemDevolucao(res.ok ? (json.mensagem ?? "Confirmado.") : (json.error ?? "Erro ao confirmar."));
    await Promise.all([load({ preserveSelection: true }), loadDevolucoesPendentes()]);
  }

  useEffect(() => {
    // No período customizado, só busca quando pelo menos uma das duas datas está preenchida
    // — evita disparar fetch a cada tecla antes do usuário terminar de escolher.
    if (periodo === "custom" && !customDe && !customAte) return;
    load();
    if (abaAtiva === "devolucao") void loadDevolucoesPendentes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abaAtiva, page, pageSize, buscaSellerAplicada, periodo, customDe, customAte]);

  // Busca/período mudou — volta pra página 1 (resultado antigo pode não ter mais tantas páginas).
  useEffect(() => {
    setPage(1);
  }, [buscaSellerAplicada, periodo, customDe, customAte]);

  useEffect(() => {
    if (destaqueId && pedidos.length > 0 && !loading) {
      pedidoCardRefs.current[destaqueId]?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [destaqueId, pedidos, loading]);

  const [lembrandoId, setLembrandoId] = useState<string | null>(null);
  const [lembrarMsg, setLembrarMsg] = useState<Record<string, { tipo: "ok" | "erro"; texto: string } | undefined>>({});

  async function lembrarSeller(id: string) {
    setLembrandoId(id);
    setLembrarMsg((prev) => ({ ...prev, [id]: undefined }));
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch(`/api/fornecedor/pedidos/${id}/lembrar-etiqueta`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? "Erro ao avisar o seller.");
      setLembrarMsg((prev) => ({ ...prev, [id]: { tipo: "ok", texto: "Seller avisado agora." } }));
    } catch (e: unknown) {
      setLembrarMsg((prev) => ({
        ...prev,
        [id]: { tipo: "erro", texto: e instanceof Error ? e.message : "Erro inesperado." },
      }));
    } finally {
      setLembrandoId(null);
    }
  }

  const [reportandoId, setReportandoId] = useState<string | null>(null);
  const [confirmacao, setConfirmacao] = useState<{ titulo: string; mensagem: string; onConfirmar: () => void } | null>(
    null
  );

  function confirmarReportarEtiquetaErrada(id: string) {
    setConfirmacao({
      titulo: "Etiqueta errada?",
      mensagem: "Confirma que a etiqueta desse pedido está errada? Isso remove a etiqueta e avisa o seller de novo.",
      onConfirmar: () => {
        setConfirmacao(null);
        void reportarEtiquetaErrada(id);
      },
    });
  }

  async function reportarEtiquetaErrada(id: string) {
    setReportandoId(id);
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch(`/api/fornecedor/pedidos/${id}/reportar-etiqueta-errada`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? "Erro ao reportar etiqueta.");
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao reportar etiqueta.");
    } finally {
      setReportandoId(null);
    }
  }

  const idsEnviados = pedidos.filter((p) => p.status === "enviado" && !emBufferMl(p)).flatMap((p) => p.pack_pedido_ids);
  const selecionadosParaSeparacao = [...selectedIds].filter((id) => idsEnviados.includes(id));
  const pedidosSelecionadosParaSeparacao = pedidos.filter((p) =>
    p.pack_pedido_ids.some((id) => selecionadosParaSeparacao.includes(id))
  );

  function imprimirListaSeparacaoEmLote() {
    if (selecionadosParaSeparacao.length === 0) {
      setError("Selecione pelo menos um pedido aguardando postagem.");
      return;
    }
    setError(null);
    window.print();
  }

  const todosMarcadosEnviados = idsEnviados.length > 0 && idsEnviados.every((id) => selectedIds.has(id));
  const algumMarcadoEnviados = idsEnviados.some((id) => selectedIds.has(id));

  function toggleSelecionarTodosEnviados() {
    setSelectedIds(() => (todosMarcadosEnviados ? new Set() : new Set(idsEnviados)));
  }

  const selecionadosComEtiqueta = [...selectedIds].filter((id) =>
    pedidos.some((p) => p.pack_pedido_ids.includes(id) && p.tem_etiqueta_oficial)
  );

  const selecionadosProntosParaPostar = [...selectedIds].filter((id) =>
    pedidos.some(
      (p) => p.pack_pedido_ids.includes(id) && p.status === "enviado" && p.tem_etiqueta_oficial && p.etiqueta_impressa_em
    )
  );

  // Card pode representar vários pedidos (mesmo pack do ML, mesma etiqueta/envio) —
  // marcar/desmarcar o checkbox afeta todos os ids do grupo de uma vez, nunca só 1.
  function toggleSelecionar(ids: string[]) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const todosMarcados = ids.every((id) => next.has(id));
      for (const id of ids) {
        if (todosMarcados) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }

  async function imprimirEtiquetasOficiaisEmLote() {
    if (selecionadosComEtiqueta.length === 0) {
      setError("Selecione pelo menos um pedido que tenha etiqueta oficial (marketplace).");
      return;
    }
    setImprimindoLote(true);
    setError(null);
    setAvisoLote(null);
    try {
      const {
        data: { session },
      } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) {
        router.replace("/fornecedor/login");
        return;
      }
      const res = await fetch("/api/fornecedor/pedidos/etiquetas-combinadas", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ids: selecionadosComEtiqueta }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string })?.error ?? "Erro ao gerar PDF combinado.");
      }
      const avisoHdr = res.headers.get("X-Dropcore-Etiquetas-Aviso");
      if (avisoHdr) {
        try {
          const parsed = JSON.parse(decodeURIComponent(avisoHdr)) as { omitidos?: string[] };
          if (parsed.omitidos?.length) {
            setAvisoLote(
              `Alguns pedidos foram omitidos do PDF (sem etiqueta ou download falhou): ${parsed.omitidos.slice(0, 8).join(", ")}${parsed.omitidos.length > 8 ? "..." : ""}.`
            );
          }
        } catch {
          /* ignore */
        }
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const w = window.open(url, "_blank", "noopener,noreferrer");
      if (!w) setError("Permita pop-ups para abrir o PDF ou use o botão de baixar no navegador.");
      setTimeout(() => URL.revokeObjectURL(url), 120_000);
      // A API já marcou etiqueta_impressa_em no banco — recarrega pra habilitar
      // "Marcar como postado" na hora, sem o fornecedor precisar dar F5.
      await load({ preserveSelection: true });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao imprimir em lote.");
    } finally {
      setImprimindoLote(false);
    }
  }

  async function marcarPostadoEmLote() {
    if (selecionadosProntosParaPostar.length === 0) {
      setError("Selecione pelo menos um pedido com etiqueta já impressa.");
      return;
    }
    setMarcandoLote(true);
    setError(null);
    setAvisoLote(null);
    try {
      const {
        data: { session },
      } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) {
        router.replace("/fornecedor/login");
        return;
      }
      let sucesso = 0;
      const falhas: string[] = [];
      for (const id of selecionadosProntosParaPostar) {
        try {
          const res = await fetch(`/api/fornecedor/pedidos/${id}/marcar-postado`, {
            method: "PATCH",
            headers: { Authorization: `Bearer ${session.access_token}` },
          });
          const json = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(json?.error ?? "Erro.");
          sucesso += 1;
        } catch {
          falhas.push(id);
        }
      }
      await load();
      if (falhas.length > 0) {
        setAvisoLote(
          `${sucesso} pedido(s) marcado(s) como postado. ${falhas.length} não puderam ser marcados — tente novamente.`
        );
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao marcar em lote.");
    } finally {
      setMarcandoLote(false);
    }
  }

  if (loading && pedidos.length === 0) {
    return (
      <div className="bg-[var(--background)] text-[var(--foreground)] app-bg pt-[calc(3.5rem+env(safe-area-inset-top,0px))] md:pt-14 pb-5">
        <div className="dropcore-shell-6xl space-y-5 py-5 md:space-y-6 md:py-7">
          <header className="overflow-visible rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4 shadow-sm sm:p-5">
            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-2 sm:gap-3">
                <h1 className="min-w-0 truncate text-2xl font-bold tracking-tight text-[var(--foreground)] sm:text-3xl">Pedidos para atender</h1>
                <span
                  className="h-1 w-14 shrink-0 self-center rounded-full bg-gradient-to-r from-emerald-500 via-emerald-400 to-emerald-300/70 sm:w-20"
                  aria-hidden
                />
              </div>
              <p className="max-w-xl text-sm leading-snug text-[var(--muted)]">Lista enviada pelos sellers para postagem e acompanhamento.</p>
            </div>
          </header>
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <PedidoCardSkeleton key={i} withCheckbox />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Dentro da aba Devolução, pedido com prazo rodando (entrega já confirmada pelo ML) vem
  // antes dos que ainda estão "aguardando" (sem prazo nenhum correndo ainda) — senão o
  // fornecedor precisa procurar no meio da lista pra achar o que realmente é urgente.
  // Ordenado pelo prazo mais próximo de vencer primeiro; o resto mantém a ordem do servidor.
  const pedidosExibidos =
    abaAtiva === "devolucao"
      ? [...pedidos].sort((a, b) => {
          const da = a.ledger_id ? devolucoesPendentes.find((d) => d.id === a.ledger_id) : undefined;
          const db = b.ledger_id ? devolucoesPendentes.find((d) => d.id === b.ledger_id) : undefined;
          const prioridadeA = da?.entrega_confirmada_em ? 0 : 1;
          const prioridadeB = db?.entrega_confirmada_em ? 0 : 1;
          if (prioridadeA !== prioridadeB) return prioridadeA - prioridadeB;
          if (prioridadeA === 0) {
            return (da!.prazo_final ?? "").localeCompare(db!.prazo_final ?? "");
          }
          return 0;
        })
      : pedidos;

  return (
    <div className="bg-[var(--background)] text-[var(--foreground)] app-bg pt-[calc(3.5rem+env(safe-area-inset-top,0px))] md:pt-14 pb-5">
      <style>{`
        @media print {
          @page { size: 80mm auto; margin: 0; }
          body * { visibility: hidden; }
          .print-lista-separacao, .print-lista-separacao * { visibility: visible; }
          .print-lista-separacao {
            display: block !important;
            position: absolute;
            left: 0;
            top: 0;
            width: 80mm;
          }
        }
      `}</style>

      {/* Só existe pra impressão em lote — escondido na tela normal, visível só no print (ver <style> acima). */}
      <div className="print-lista-separacao hidden">
        {pedidosSelecionadosParaSeparacao.map((p, idx) => (
          <div
            key={p.id}
            className="bg-white text-black"
            style={{ pageBreakAfter: idx === pedidosSelecionadosParaSeparacao.length - 1 ? "auto" : "always" }}
          >
            <div style={{ width: "80mm", margin: "0 auto", padding: "6px 8px" }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>LISTA DE SEPARAÇÃO</div>
              <div style={{ fontSize: 12, lineHeight: 1.35 }}>
                <div><b>Pedido:</b> {p.marketplace_numero || p.id}</div>
                <div><b>Seller:</b> {p.seller_nome}</div>
                <div><b>Data:</b> {formatDate(p.criado_em)}</div>
                {p.comprador_nome && (
                  <div><b>Cliente:</b> {p.comprador_nome}{p.comprador_cidade ? ` · ${p.comprador_cidade}` : ""}{p.comprador_uf ? `/${p.comprador_uf}` : ""}</div>
                )}
              </div>
              <div style={{ height: 8 }} />
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>ITENS</div>
              <div style={{ fontSize: 12, lineHeight: 1.35 }}>
                {p.itens.map((it, itIdx) => (
                  <div
                    key={`${p.id}-${it.sku}-${itIdx}`}
                    style={{
                      marginBottom: 8,
                      paddingBottom: 8,
                      borderBottom: itIdx === p.itens.length - 1 ? "none" : "1px dashed #ccc",
                    }}
                  >
                    <div><b>Produto:</b> {it.nome_produto ?? p.nome_produto ?? "—"}</div>
                    <div>{it.cor ? `Cor: ${it.cor}` : "Cor: —"} · {it.tamanho ? `Tamanho: ${it.tamanho}` : "Tamanho: —"}</div>
                    <div><b>Qtd:</b> {it.quantidade}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="dropcore-shell-6xl space-y-5 py-5 md:space-y-6 md:py-7">
        <header className="overflow-visible rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4 shadow-sm sm:p-5">
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2 sm:gap-3">
              <h1 className="min-w-0 truncate text-2xl font-bold tracking-tight text-[var(--foreground)] sm:text-3xl">Pedidos para atender</h1>
              <span
                className="h-1 w-14 shrink-0 self-center rounded-full bg-gradient-to-r from-emerald-500 via-emerald-400 to-emerald-300/70 sm:w-20"
                aria-hidden
              />
            </div>
            <p className="max-w-xl text-sm leading-snug text-[var(--muted)]">Lista enviada pelos sellers para postagem e acompanhamento.</p>
          </div>
        </header>

        {error && (
          <div className={cn(DANGER_PREMIUM_SURFACE, DANGER_PREMIUM_TEXT_PRIMARY, "rounded-2xl px-4 py-3 text-sm")}>
            {error}
          </div>
        )}

        {avisoLote && (
          <AmberPremiumCallout title="Aviso" className="items-start rounded-2xl px-4 py-3 text-sm">
            {avisoLote}
          </AmberPremiumCallout>
        )}

        {mensagemDevolucao && (
          <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
            {mensagemDevolucao}
          </div>
        )}

        <div
          ref={abasDrag.ref}
          onPointerDown={abasDrag.onPointerDown}
          onClickCapture={abasDrag.onClickCapture}
          className="dropcore-tabs-scroll flex items-center gap-5 overflow-x-auto border-b border-[var(--card-border)] px-1"
        >
          {ABAS.map((aba) => {
            const ativo = abaAtiva === aba.key;
            return (
              <button
                key={aba.key}
                type="button"
                onClick={() => {
                  setPage(1);
                  setAbaAtiva(aba.key);
                }}
                className={cn(
                  "-mb-px flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 pb-2.5 pt-1 text-sm font-medium transition-colors",
                  ativo
                    ? "border-emerald-500 text-emerald-600 dark:text-emerald-400"
                    : "border-transparent text-[var(--muted)] hover:text-[var(--foreground)]"
                )}
              >
                <aba.Icon className="h-4 w-4 shrink-0" />
                {aba.label}{" "}
                <span className="whitespace-nowrap">
                  (<span className="inline-block min-w-[2ch] text-right tabular-nums">{abaContagens[aba.key]}</span>)
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 sm:max-w-xs">
            <svg className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              type="text"
              value={buscaSellerInput}
              onChange={(e) => setBuscaSellerInput(e.target.value)}
              placeholder="Buscar por seller..."
              aria-label="Buscar por seller"
              className="w-full rounded-md border border-[var(--card-border)] bg-[var(--card)] py-1.5 pl-8 pr-2.5 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            />
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-1">
            {([
              { key: "todos", label: "Tudo" },
              { key: "hoje", label: "Hoje" },
              { key: "7d", label: "7 dias" },
              { key: "30d", label: "30 dias" },
            ] as const).map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setPeriodo(opt.key)}
                className={cn(
                  "rounded-md px-2.5 py-1.5 text-[11px] font-semibold transition-colors",
                  periodo === opt.key
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "border border-[var(--card-border)] bg-[var(--card)] text-[var(--foreground)] hover:bg-[var(--muted)]/10"
                )}
              >
                {opt.label}
              </button>
            ))}
            <div className="relative">
              <button
                type="button"
                onClick={() => setModalPeriodoAberto((v) => !v)}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] font-semibold transition-colors",
                  periodo === "custom"
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "border border-[var(--card-border)] bg-[var(--card)] text-[var(--foreground)] hover:bg-[var(--muted)]/10"
                )}
              >
                <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <rect width="18" height="18" x="3" y="4" rx="2" />
                  <path d="M3 10h18M8 2v4M16 2v4" />
                </svg>
                {periodo === "custom" && customDe
                  ? `${customDe.split("-").slice(1).reverse().join("/")}${customAte && customAte !== customDe ? ` - ${customAte.split("-").slice(1).reverse().join("/")}` : ""}`
                  : "Personalizado"}
                <svg className={cn("h-3 w-3 shrink-0 opacity-70 transition-transform", modalPeriodoAberto && "rotate-180")} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>
              {modalPeriodoAberto ? (
                <PeriodoPersonalizadoModal
                  deInicial={customDe}
                  ateInicial={customAte}
                  onFechar={() => setModalPeriodoAberto(false)}
                  onAplicar={(de, ate) => {
                    setCustomDe(de);
                    setCustomAte(ate);
                    setPeriodo("custom");
                    setModalPeriodoAberto(false);
                  }}
                />
              ) : null}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] px-4 py-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
              {pedidos.length > 0 && (
              <div className="order-2 flex items-center gap-2 sm:order-none sm:contents">
              <input
                type="checkbox"
                ref={(el) => {
                  if (el) el.indeterminate = algumMarcadoEnviados && !todosMarcadosEnviados;
                }}
                checked={todosMarcadosEnviados}
                onChange={toggleSelecionarTodosEnviados}
                aria-label="Selecionar todos"
                title="Selecionar todos"
                className="shrink-0 self-center rounded border-neutral-300 dark:border-neutral-600"
              />
              <details ref={printMenuRef} className="group relative flex-1 sm:flex-none sm:shrink-0">
                <summary
                  className={cn(
                    btnSecondaryCompactClass,
                    "flex w-full cursor-pointer list-none items-center justify-center gap-1.5 [&::-webkit-details-marker]:hidden"
                  )}
                >
                  Imprimir etiqueta
                  <svg
                    className="h-3.5 w-3.5 shrink-0 opacity-70 transition-transform duration-200 group-open:rotate-180"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </summary>
                <div className="absolute left-0 z-20 mt-1.5 min-w-[13rem] rounded-lg border border-[var(--card-border)] bg-[var(--card)] p-1 shadow-md">
                  <button
                    type="button"
                    disabled={selecionadosParaSeparacao.length === 0}
                    onClick={() => {
                      printMenuRef.current?.removeAttribute("open");
                      imprimirListaSeparacaoEmLote();
                    }}
                    className="block w-full rounded-md px-3 py-2 text-left text-sm text-[var(--foreground)] hover:bg-[var(--muted)]/12 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Lista de separação
                  </button>
                  <button
                    type="button"
                    disabled={imprimindoLote || selecionadosComEtiqueta.length === 0}
                    onClick={() => {
                      printMenuRef.current?.removeAttribute("open");
                      void imprimirEtiquetasOficiaisEmLote();
                    }}
                    className="block w-full rounded-md px-3 py-2 text-left text-sm text-[var(--foreground)] hover:bg-[var(--muted)]/12 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {imprimindoLote ? "Gerando PDF..." : "Etiquetas de envio"}
                  </button>
                </div>
              </details>
              <button
                type="button"
                onClick={() => void marcarPostadoEmLote()}
                disabled={marcandoLote || selecionadosProntosParaPostar.length === 0}
                title={
                  selecionadosProntosParaPostar.length === 0
                    ? "Selecione pedidos com etiqueta já impressa"
                    : undefined
                }
                className={cn(btnPrimaryCompactClass, "flex-1 sm:flex-none sm:shrink-0")}
              >
                {marcandoLote
                  ? "Marcando..."
                  : `Marcar como postado${selecionadosProntosParaPostar.length > 0 ? ` (${selecionadosProntosParaPostar.length})` : ""}`}
              </button>
              </div>
              )}
              <div className="order-1 flex items-center gap-2 sm:order-none sm:ml-auto sm:contents">
              <button
                type="button"
                onClick={() => void load()}
                disabled={loading}
                className={cn(btnSecondaryCompactClass, "flex-1 sm:ml-auto sm:flex-none sm:shrink-0")}
              >
                {loading ? "Carregando..." : "Atualizar Pedidos"}
              </button>
              </div>
            </div>
        </div>

        {pedidos.length === 0 ? (
          <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] py-16 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-neutral-100 text-neutral-400 dark:bg-neutral-800 dark:text-neutral-500">
              <IconClipboard className="h-7 w-7" />
            </div>
            <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Nenhum pedido encontrado</p>
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-500">Os pedidos aparecem aqui quando forem enviados para você atender.</p>
          </div>
        ) : (
          <>
            {/* Cards em todas as larguras — padrão de web/app/seller/pedidos/page.tsx (article + dt/dd) */}
            <div className="space-y-3">
              {pedidosExibidos.map((p) => (
                <article
                  key={p.id}
                  ref={(el) => { pedidoCardRefs.current[p.id] = el; }}
                  className={cn(
                    "rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4 transition-shadow",
                    destaqueId === p.id ? "ring-2 ring-emerald-500 ring-offset-2 ring-offset-[var(--background)]" : ""
                  )}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-2.5">
                      <input
                        type="checkbox"
                        checked={p.pack_pedido_ids.every((id) => selectedIds.has(id))}
                        onChange={() => toggleSelecionar(p.pack_pedido_ids)}
                        disabled={p.status !== "enviado" || emBufferMl(p)}
                        aria-label={`Incluir pedido ${p.id} no lote`}
                        title={
                          p.status !== "enviado"
                            ? "Só pedidos aguardando postagem entram no lote"
                            : emBufferMl(p)
                              ? "Etiqueta ainda em buffer do Mercado Livre — não dá pra incluir no lote"
                              : "Incluir no lote"
                        }
                        className="mt-1 shrink-0 rounded border-neutral-300 disabled:cursor-not-allowed dark:border-neutral-600"
                      />
                      <div className="min-w-0">
                        <p className="font-medium text-[var(--foreground)]">{tituloPedido(p)}</p>
                        <p className="mt-1 text-sm text-neutral-500">{formatDate(p.criado_em)}</p>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <span
                        className={cn(
                          "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-medium",
                          emBufferMl(p)
                            ? ML_BUFFER_BADGE_CLASS
                            : STATUS_PILL[p.status] ?? "bg-neutral-100 text-[var(--muted)] dark:bg-neutral-800"
                        )}
                      >
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden />
                        {emBufferMl(p) ? "Etiqueta em buffer (ML)" : statusLabel[p.status] ?? p.status}
                      </span>
                      {etiquetaRecemLiberada(p) ? (
                        <span
                          className={cn(
                            "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-medium",
                            ETIQUETA_LIBERADA_BADGE_CLASS
                          )}
                          title="Etiqueta ficou pronta — já dá pra imprimir e despachar."
                        >
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden />
                          Etiqueta liberada
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <dt className="text-neutral-500">Seller</dt>
                      <dd className="font-medium">{p.seller_nome}</dd>
                    </div>
                    <div>
                      <dt className="text-neutral-500">Custo total</dt>
                      <dd className="font-medium">{BRL.format(p.valor_fornecedor ?? 0)}</dd>
                    </div>
                    <div>
                      <dt className="text-neutral-500">Cor / Tamanho</dt>
                      <dd>
                        {p.itens.length > 1
                          ? `${p.itens.length} variantes`
                          : `${p.cor ?? "—"} · ${p.tamanho ?? "—"}`}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-neutral-500">Categoria</dt>
                      <dd>{p.categoria ?? "—"}</dd>
                    </div>
                    {p.linha_despacho && p.linha_despacho !== expedicaoPadrao ? (
                      <div className="col-span-2">
                        <dt className="text-neutral-500">Onde despachar (diferente do padrão)</dt>
                        <dd>{p.linha_despacho}</dd>
                      </div>
                    ) : null}
                    {p.tracking_codigo ? (
                      <div>
                        <dt className="text-neutral-500">Rastreio</dt>
                        <dd className="font-mono text-xs">{p.tracking_codigo}</dd>
                      </div>
                    ) : null}
                    {p.marketplace_numero ? (
                      <div>
                        <dt className="text-neutral-500">Pedido marketplace</dt>
                        <dd className="font-mono text-xs sm:text-sm">{p.marketplace_numero}</dd>
                      </div>
                    ) : null}
                    {[p.comprador_nome, p.comprador_cidade, p.comprador_uf].some(Boolean) ? (
                      <div className="col-span-2">
                        <dt className="text-neutral-500">Cliente / Destino</dt>
                        <dd>
                          {[p.comprador_nome, [p.comprador_cidade, p.comprador_uf].filter(Boolean).join(" / ")]
                            .filter(Boolean)
                            .join(" · ") || "—"}
                        </dd>
                      </div>
                    ) : null}
                  </dl>

                  {p.itens.length > 1 ? (
                    <ul className="mt-3 flex flex-wrap gap-2">
                      {p.itens.map((item, idx) => (
                        <li
                          key={`${p.id}-${item.sku}-${idx}`}
                          title={item.sku}
                          className="rounded-lg bg-neutral-100 px-2 py-1 text-xs font-medium text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
                        >
                          {[item.cor, item.tamanho].filter(Boolean).join(" · ") || item.sku} × {item.quantidade}
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  {p.status === "bloqueado" && p.motivo_bloqueio ? (
                    <p className={cn("mt-3 text-sm", DANGER_PREMIUM_TEXT_PRIMARY)}>{p.motivo_bloqueio}</p>
                  ) : null}

                  {p.status === "em_devolucao" && p.ledger_id && (() => {
                    const devolucao = devolucoesPendentes.find((d) => d.id === p.ledger_id);
                    if (!devolucao) return null;
                    return (
                      <FornecedorDevolucaoAcoes
                        ledgerId={devolucao.id}
                        contestado={devolucao.contestado}
                        contestacaoTexto={devolucao.fornecedor_contestacao_texto}
                        prazoFinal={devolucao.prazo_final}
                        entregaConfirmadaEm={devolucao.entrega_confirmada_em}
                        onAtualizar={() => void Promise.all([load({ preserveSelection: true }), loadDevolucoesPendentes()])}
                        pedirConfirmacao={setConfirmandoDevolucaoId}
                      />
                    );
                  })()}

                  {p.status === "cancelado" && p.cancelado_motivo === "ml_sem_sync" && (
                    <div
                      role="status"
                      className="relative mt-3 overflow-hidden rounded-xl border border-[var(--danger)]/55 bg-transparent shadow-sm shadow-red-500/10 dark:border-red-400/55 dark:bg-transparent dark:shadow-none"
                    >
                      <div
                        aria-hidden
                        className="pointer-events-none absolute left-0 top-4 bottom-4 w-1 rounded-r-full bg-gradient-to-b from-[var(--danger)] to-red-600 opacity-95 dark:from-red-400 dark:to-red-500 dark:opacity-100"
                      />
                      <div className="pl-4 pr-3 py-3 sm:pl-5 sm:pr-4 sm:py-3.5">
                        <div className="flex min-w-0 items-start gap-2.5">
                          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[var(--danger)]/35 bg-[var(--danger)]/10 dark:border-red-400/55 dark:bg-transparent">
                            <svg
                              className="h-5 w-5 text-[var(--danger)] dark:text-red-300"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-hidden
                            >
                              <circle cx="12" cy="12" r="10" />
                              <line x1="15" y1="9" x2="9" y2="15" />
                              <line x1="9" y1="9" x2="15" y2="15" />
                            </svg>
                          </span>
                          <div className="min-w-0">
                            <p className="text-base font-bold leading-snug tracking-tight text-[var(--danger)] dark:text-red-300">
                              Cancelado pelo Mercado Livre
                            </p>
                            <p className="mt-1 text-xs leading-relaxed text-neutral-600 dark:text-neutral-300">
                              Cancelado automaticamente antes da postagem (etiqueta nunca liberada — geralmente nota
                              fiscal não emitida a tempo pelo seller). Não é necessário separar nem despachar.
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {emBufferMl(p) && (
                    <div
                      role="status"
                      className="relative mt-3 overflow-hidden rounded-xl border border-violet-500/40 bg-transparent dark:border-violet-400/45"
                    >
                      <div
                        aria-hidden
                        className="pointer-events-none absolute left-0 top-4 bottom-4 w-1 rounded-r-full bg-violet-500/70 dark:bg-violet-400/70"
                      />
                      <div className="pl-4 pr-3 py-3 sm:pl-5 sm:pr-4 sm:py-3.5">
                        <div className="flex min-w-0 items-start gap-2.5">
                          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-violet-500/35 bg-violet-500/10 dark:border-violet-400/40 dark:bg-violet-500/12">
                            <svg
                              className={cn(ML_BUFFER_TEXT_PRIMARY, "h-5 w-5")}
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-hidden
                            >
                              <circle cx="12" cy="12" r="10" />
                              <line x1="12" y1="8" x2="12" y2="12" />
                              <line x1="12" y1="16" x2="12.01" y2="16" />
                            </svg>
                          </span>
                          <div className="min-w-0">
                            <p className={cn(ML_BUFFER_TEXT_PRIMARY, "text-base font-bold leading-snug tracking-tight")}>
                              Aguardando o Mercado Livre liberar a etiqueta
                            </p>
                            <p className="mt-1 text-xs leading-relaxed text-neutral-600 dark:text-neutral-300">
                              {p.etiqueta_ml_previsao
                                ? `Previsão: ${formatDate(p.etiqueta_ml_previsao)}. `
                                : ""}
                              Buffer automático do próprio ML (capacidade de transportadora) — não conta
                              como atraso do fornecedor, nem depende do seller.
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {p.status === "enviado" && !p.tem_etiqueta_oficial && p.canal_venda !== "mercado_livre" && (
                    <div
                      role="status"
                      className="relative mt-3 overflow-hidden rounded-xl border border-[var(--danger)]/55 bg-transparent shadow-sm shadow-red-500/10 dark:border-red-400/55 dark:bg-transparent dark:shadow-none"
                    >
                      <div
                        aria-hidden
                        className="pointer-events-none absolute left-0 top-4 bottom-4 w-1 rounded-r-full bg-gradient-to-b from-[var(--danger)] to-red-600 opacity-95 dark:from-red-400 dark:to-red-500 dark:opacity-100"
                      />
                      <div className="pl-4 pr-3 py-3 sm:pl-5 sm:pr-4 sm:py-3.5">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="flex min-w-0 items-start gap-2.5">
                            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[var(--danger)]/35 bg-[var(--danger)]/10 dark:border-red-400/55 dark:bg-transparent">
                              <svg
                                className="h-5 w-5 text-[var(--danger)] dark:text-red-300"
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
                            <div className="min-w-0">
                              <p className="text-base font-bold leading-snug tracking-tight text-[var(--danger)] dark:text-red-300">
                                Sem etiqueta
                              </p>
                              <p className="mt-1 text-xs leading-relaxed text-neutral-600 dark:text-neutral-300">
                                A Olist ainda não gerou a etiqueta real desse pedido — depende do
                                seller (só ele acessa a Olist). Não é um problema seu.
                              </p>
                            </div>
                          </div>
                          <div className="flex w-full flex-col items-stretch gap-1.5 sm:w-auto sm:items-end">
                            <button
                              type="button"
                              onClick={() => void lembrarSeller(p.id)}
                              disabled={lembrandoId === p.id}
                              className="w-full shrink-0 rounded-md bg-[var(--danger)] px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-red-500 dark:hover:bg-red-400 dark:ring-1 dark:ring-inset dark:ring-white/20 sm:w-auto"
                            >
                              {lembrandoId === p.id ? "Avisando..." : "Lembrar seller"}
                            </button>
                            {(() => {
                              const msg = lembrarMsg[p.id];
                              if (!msg) return null;
                              return (
                                <span
                                  className={
                                    msg.tipo === "ok"
                                      ? "text-[11px] text-emerald-600 dark:text-emerald-400"
                                      : "text-[11px] text-[var(--danger)]"
                                  }
                                >
                                  {msg.texto}
                                </span>
                              );
                            })()}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {p.status === "enviado" && p.tem_etiqueta_oficial && (
                    <div className="mt-3 flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:justify-end">
                      <button
                        type="button"
                        onClick={() => confirmarReportarEtiquetaErrada(p.id)}
                        disabled={reportandoId === p.id}
                        title="A etiqueta não é do pedido certo (endereço/produto não bate)"
                        className="w-full rounded-md bg-[var(--danger)] px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-red-500 dark:hover:bg-red-400 dark:ring-1 dark:ring-inset dark:ring-white/20 sm:w-auto"
                      >
                        {reportandoId === p.id ? "Reportando..." : "Etiqueta errada?"}
                      </button>
                    </div>
                  )}
                </article>
              ))}
            </div>

            <div className="flex flex-col items-center gap-3 pt-1 sm:flex-row sm:justify-between">
              <p className="text-xs text-[var(--muted)]">
                Total <span className="font-semibold text-[var(--foreground)]">{totalPedidos}</span> pedido{totalPedidos !== 1 ? "s" : ""}
              </p>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  aria-label="Página anterior"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[var(--card-border)] bg-[var(--card)] text-[var(--foreground)] transition-colors hover:bg-[var(--muted)]/10 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="m15 18-6-6 6-6" />
                  </svg>
                </button>
                {getPageNumbers(page, Math.max(1, Math.ceil(totalPedidos / pageSize))).map((p, idx) =>
                  p === "..." ? (
                    <span key={`ellipsis-${idx}`} className="px-1 text-xs text-[var(--muted)]">
                      …
                    </span>
                  ) : (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPage(p)}
                      aria-current={p === page ? "page" : undefined}
                      className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[11px] font-semibold transition-colors",
                        p === page
                          ? "bg-emerald-600 text-white"
                          : "border border-[var(--card-border)] bg-[var(--card)] text-[var(--foreground)] hover:bg-[var(--muted)]/10"
                      )}
                    >
                      {p}
                    </button>
                  )
                )}
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(Math.max(1, Math.ceil(totalPedidos / pageSize)), p + 1))}
                  disabled={page >= Math.max(1, Math.ceil(totalPedidos / pageSize))}
                  aria-label="Próxima página"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[var(--card-border)] bg-[var(--card)] text-[var(--foreground)] transition-colors hover:bg-[var(--muted)]/10 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="m9 18 6-6-6-6" />
                  </svg>
                </button>
                <div className="relative ml-1.5 shrink-0">
                  <div
                    aria-hidden
                    className="pointer-events-none flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-[var(--card-border)] bg-[var(--card)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--foreground)]"
                  >
                    {pageSize}/página
                    <svg className="h-3.5 w-3.5 shrink-0 opacity-70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </div>
                  <select
                    aria-label="Itens por página"
                    value={pageSize}
                    onChange={(e) => {
                      setPage(1);
                      setPageSize(Number(e.target.value));
                    }}
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  >
                    <option value={20}>20/página</option>
                    <option value={50}>50/página</option>
                    <option value={100}>100/página</option>
                    <option value={300}>300/página</option>
                  </select>
                </div>
              </div>
            </div>
          </>
        )}

      </div>

      {confirmacao ? (
        <ModalOverlay onBackdropClick={() => setConfirmacao(null)}>
          <div className={cn(MODAL_PANEL_BODY_CLASS, "p-5")}>
            <p className="font-semibold text-[var(--foreground)]">{confirmacao.titulo}</p>
            <p className="mt-1.5 text-sm text-[var(--muted)]">{confirmacao.mensagem}</p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmacao(null)}
                className="rounded-md border border-[var(--card-border)] bg-[var(--card)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--foreground)] hover:bg-[var(--muted)]/10"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmacao.onConfirmar}
                className="rounded-md bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-emerald-700"
              >
                Confirmar
              </button>
            </div>
          </div>
        </ModalOverlay>
      ) : null}

      {confirmandoDevolucaoId ? (
        <ModalOverlay onBackdropClick={() => setConfirmandoDevolucaoId(null)}>
          <div className={cn(MODAL_PANEL_BODY_CLASS, "p-5")}>
            <p className="font-semibold text-[var(--foreground)]">Confirmar recebimento?</p>
            <p className="mt-1.5 text-sm text-[var(--muted)]">
              Isso libera o valor pro saldo do seller na hora. Só confirme depois de ter recebido a mercadoria de
              volta e conferido que está tudo certo.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmandoDevolucaoId(null)}
                className="rounded-md border border-[var(--card-border)] bg-[var(--card)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--foreground)] hover:bg-[var(--muted)]/10"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void confirmarDevolucao(confirmandoDevolucaoId)}
                className="rounded-md bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-emerald-700"
              >
                Confirmar
              </button>
            </div>
          </div>
        </ModalOverlay>
      ) : null}

      <FornecedorNav active="pedidos" wide />
    </div>
  );
}
