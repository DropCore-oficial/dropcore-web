"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import Link from "next/link";
import { FornecedorNav } from "../FornecedorNav";
import { CorCelulaProduto } from "@/components/fornecedor/CorCelulaProduto";
import { AlteracoesCatalogoInfoBanner } from "@/components/fornecedor/AlteracoesCatalogoInfoBanner";
import { FotoVariacaoCell, type FotoVariacaoCellHandle } from "@/components/FotoVariacaoCell";
import { toTitleCase } from "@/lib/formatText";
import { fornecedorProdutoImagemSrc } from "@/lib/fornecedorProdutoImagemSrc";
import { getResumoRascunhoCriarVariantes, type ResumoRascunhoCriarVariantes } from "@/lib/fornecedorCriarVariantesRascunho";
import { ProdutoResumoListaGrupo } from "@/components/fornecedor/ProdutoResumoListaGrupo";
import { AMBER_PREMIUM_SHELL, AMBER_PREMIUM_TEXT_BODY, AMBER_PREMIUM_TEXT_PRIMARY } from "@/lib/amberPremium";
import { agruparVariantesPorCor } from "@/lib/armazemAgruparCor";
import { cn } from "@/lib/utils";

const BRL_CUSTO_FORNECEDOR = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function closeFornecedorVariantMenu(fromEl: HTMLElement) {
  const d = fromEl.closest("details");
  if (d) d.removeAttribute("open");
}

/** Três pontinhos horizontais (⋯ estilo lista / print). */
function IconTresPontosHorizontais({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden
    >
      <circle cx="5" cy="12" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="19" cy="12" r="2" />
    </svg>
  );
}

/** Só `custo_base` — o que o fornecedor cadastrou (não mostrar taxa DropCore). */
function fmtCustoBaseFornecedor(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v) || v <= 0) return "—";
  return BRL_CUSTO_FORNECEDOR.format(v);
}

type Produto = {
  id: string;
  sku: string;
  nome_produto: string;
  cor: string | null;
  tamanho: string | null;
  status: string;
  estoque_atual: number | null;
  estoque_minimo: number | null;
  custo_base: number | null;
  custo_dropcore: number | null;
  peso_kg: number | null;
  link_fotos: string | null;
  imagem_url: string | null;
  descricao: string | null;
  comprimento_cm: number | null;
  largura_cm: number | null;
  altura_cm: number | null;
  dimensoes_pacote?: string | null;
  categoria?: string | null;
  marca?: string | null;
  data_lancamento?: string | null;
  ncm?: string | null;
  origem?: string | null;
  cest?: string | null;
  cfop?: string | null;
  peso_liquido_kg?: number | null;
  peso_bruto_kg?: number | null;
  criado_em: string;
  /** Despacho deste SKU quando difere do CD padrão do fornecedor (texto livre). */
  expedicao_override_linha?: string | null;
  detalhes_produto_json?: Record<string, unknown> | null;
};

/** Agrupa SKUs por produto (paiKey: XXX001000 = pai, XXX001001+ = filhos; XXX = iniciais do fornecedor) */
function paiKey(sku: string): string {
  const s = (sku || "").trim().toUpperCase();
  const m = s.match(/^([A-Z]+)(\d{3})(\d{3})$/);
  if (!m) return s;
  return `${m[1]}${m[2]}000`;
}

function getLinkFotos(produto: Produto, todos: Produto[]): string | null {
  if (produto.link_fotos) return produto.link_fotos;
  const pk = paiKey(produto.sku);
  if (produto.sku === pk) return null;
  const pai = todos.find((p) => p.sku === pk);
  return pai?.link_fotos ?? null;
}

type GrupoProduto = { paiKey: string; pai: Produto | null; filhos: Produto[] };

/** Primeira variante (menor SKU) que já tem `imagem_url`. */
function primeiraImagemUrlEntreFilhos(filhos: Produto[]): string | null {
  const comFoto = filhos.filter((f) => (f.imagem_url ?? "").trim().length > 0);
  if (comFoto.length === 0) return null;
  comFoto.sort((a, b) => a.sku.localeCompare(b.sku));
  return comFoto[0].imagem_url ?? null;
}

/**
 * URLs a tentar como miniatura (várias falham: proxy, formato, URL sem extensão).
 * Ordem: pai → variantes (SKU) → link principal do pai.
 */
function candidatosMiniaturaGrupo(g: GrupoProduto): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (u: string | null | undefined) => {
    const s = (u ?? "").trim();
    if (!s || seen.has(s)) return;
    seen.add(s);
    out.push(s);
  };
  add(g.pai?.imagem_url);
  const filhos = [...g.filhos].sort((a, b) => a.sku.localeCompare(b.sku));
  for (const f of filhos) add(f.imagem_url);
  add(g.pai?.link_fotos);
  return out;
}

function MiniaturaListaGrupo({
  g,
  todosProdutos,
}: {
  g: GrupoProduto;
  todosProdutos: Produto[];
}) {
  const representante = g.pai ?? g.filhos[0];
  const lfLink =
    representante ? getLinkFotos(representante, todosProdutos) || representante.link_fotos : null;

  const fotoSig = [
    g.pai?.imagem_url ?? "",
    g.pai?.link_fotos ?? "",
    ...g.filhos.map((f) => `${f.id}:${f.imagem_url ?? ""}`),
  ].join("|");

  const candidatos = useMemo(() => candidatosMiniaturaGrupo(g), [g.paiKey, fotoSig]);

  const [failIdx, setFailIdx] = useState(0);

  useEffect(() => {
    setFailIdx(0);
  }, [g.paiKey, fotoSig]);

  if (failIdx >= candidatos.length) {
    if (lfLink) {
      return (
        <a
          href={lfLink}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="flex h-full w-full items-center justify-center bg-[var(--muted)]/20 text-lg text-[var(--muted)] hover:bg-[var(--muted)]/30"
          title="Abrir link da foto"
        >
          📷
        </a>
      );
    }
    return <span className="text-lg text-[var(--muted)]">—</span>;
  }

  const src = candidatos[failIdx];
  return (
    <img
      src={fornecedorProdutoImagemSrc(src)}
      alt=""
      className="h-full w-full object-cover"
      onError={() => setFailIdx((i) => i + 1)}
    />
  );
}

function fallbackImagemSkuPai(row: Produto, g: GrupoProduto): string | null {
  if (row.sku !== g.paiKey) return null;
  if (row.imagem_url) return null;
  return primeiraImagemUrlEntreFilhos(g.filhos);
}

function isEstoqueBaixo(p: Produto): boolean {
  const min = p.estoque_minimo;
  const atual = p.estoque_atual;
  return min != null && atual != null && Number(atual) < Number(min);
}

export default function FornecedorProdutosPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const filtroEstoqueBaixo = searchParams.get("estoqueBaixo") === "1";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [modal, setModal] = useState<"none" | "edit">("none");
  const [editando, setEditando] = useState<Produto | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Edit form
  const [editNome, setEditNome] = useState("");
  const [editCor, setEditCor] = useState("");
  const [editTamanho, setEditTamanho] = useState("");
  const [editLinkFotos, setEditLinkFotos] = useState("");
  const [editDescricao, setEditDescricao] = useState("");
  const [editComp, setEditComp] = useState("");
  const [editLarg, setEditLarg] = useState("");
  const [editAlt, setEditAlt] = useState("");
  const [editPeso, setEditPeso] = useState("");
  const [editEstoque, setEditEstoque] = useState("");
  const [editCusto, setEditCusto] = useState("");
  const [editExpedicao, setEditExpedicao] = useState("");
  const [expandido, setExpandido] = useState<Set<string>>(new Set());
  const [modoListaVariantes, setModoListaVariantes] = useState<"agrupado-cor" | "sku">("agrupado-cor");
  const [mostrarFotosVariantes, setMostrarFotosVariantes] = useState<boolean>(true);
  /** Refs por `gc.key` para menu ⋮ (trocar / excluir foto) nos cartões «agrupado por cor». */
  const fotoPorCorHandleRef = useRef<Record<string, FotoVariacaoCellHandle | null>>({});
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [solicitandoExclusao, setSolicitandoExclusao] = useState<string | null>(null);
  const [alteracoesStatus, setAlteracoesStatus] = useState<{
    pendentes: string[];
    por_sku: Record<string, { status: "aprovado" | "rejeitado"; motivo_rejeicao?: string; analisado_em: string }>;
  }>({ pendentes: [], por_sku: {} });
  const [rascunhoCriarVariantes, setRascunhoCriarVariantes] = useState<ResumoRascunhoCriarVariantes | null>(null);

  function fecharMenusAcoesAbertos() {
    if (typeof document === "undefined") return;
    const menus = document.querySelectorAll("details[data-menu-acoes][open]");
    menus.forEach((el) => el.removeAttribute("open"));
  }

  function toggleExpandido(key: string) {
    setExpandido((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) {
        router.replace("/fornecedor/login");
        return;
      }
      const token = session.access_token;
      const headers = { Authorization: `Bearer ${token}` };
      const resumo = await getResumoRascunhoCriarVariantes(token);
      setRascunhoCriarVariantes(resumo);
      const res = await fetch("/api/fornecedor/produtos", { headers, cache: "no-store" });
      if (!res.ok) {
        if (res.status === 401 || res.status === 404) {
          await supabaseBrowser.auth.signOut();
          router.replace("/fornecedor/login");
          return;
        }
        const j = await res.json();
        throw new Error(j?.error ?? "Erro ao carregar produtos.");
      }
      const data = await res.json();
      setProdutos(data ?? []);
      const statusRes = await fetch("/api/fornecedor/alteracoes-status", { headers, cache: "no-store" });
      if (statusRes.ok) {
        const statusData = await statusRes.json();
        setAlteracoesStatus({
          pendentes: statusData.pendentes ?? [],
          por_sku: statusData.por_sku ?? {},
        });
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro inesperado.");
    } finally {
      setLoading(false);
    }
  }

  const produtosParaGrupos = useMemo(() => {
    if (!filtroEstoqueBaixo) return produtos;
    return produtos.filter(isEstoqueBaixo);
  }, [produtos, filtroEstoqueBaixo]);

  const grupos = useMemo((): GrupoProduto[] => {
    const map = new Map<string, { pai: Produto | null; filhos: Produto[] }>();
    for (const p of produtosParaGrupos) {
      const key = paiKey(p.sku);
      if (!map.has(key)) map.set(key, { pai: null, filhos: [] });
      const g = map.get(key)!;
      if (p.sku.endsWith("000") && p.sku === key) g.pai = p;
      else g.filhos.push(p);
    }
    return Array.from(map.entries())
      .map(([paiKey, g]) => ({
        paiKey,
        pai: g.pai,
        filhos: g.filhos.sort((a, b) => a.sku.localeCompare(b.sku)),
      }))
      .sort((a, b) => a.paiKey.localeCompare(b.paiKey));
  }, [produtosParaGrupos]);

  function statusAlteracaoGrupo(g: GrupoProduto): "pendente" | "aprovado" | "rejeitado" | null {
    const ids = [...(g.pai ? [g.pai.id] : []), ...g.filhos.map((f) => f.id)];
    const temPendente = ids.some((id) => alteracoesStatus.pendentes.includes(id));
    if (temPendente) return "pendente";
    let ultimo: { status: "aprovado" | "rejeitado"; motivo_rejeicao?: string; analisado_em: string } | null = null;
    for (const id of ids) {
      const r = alteracoesStatus.por_sku[id];
      if (r && (!ultimo || (r.analisado_em && r.analisado_em > ultimo.analisado_em))) ultimo = r;
    }
    return ultimo?.status ?? null;
  }

  function motivoRejeicaoGrupo(g: GrupoProduto): string | null {
    const ids = [...(g.pai ? [g.pai.id] : []), ...g.filhos.map((f) => f.id)];
    let ultimo: { motivo_rejeicao?: string; analisado_em: string } | null = null;
    for (const id of ids) {
      const r = alteracoesStatus.por_sku[id];
      if (r?.status === "rejeitado" && (!ultimo || (r.analisado_em && r.analisado_em > ultimo.analisado_em)))
        ultimo = r;
    }
    return ultimo?.motivo_rejeicao ?? null;
  }

  useEffect(() => {
    if (pathname !== "/fornecedor/produtos") return;
    load();
  }, [pathname]);

  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      const target = e.target as HTMLElement | null;
      if (target?.closest("[data-menu-acoes]")) return;
      fecharMenusAcoesAbertos();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") fecharMenusAcoesAbertos();
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  /** Recarrega só o resumo do rascunho ao voltar à aba (evita chip sumido após salvar em outra guia). */
  useEffect(() => {
    if (pathname !== "/fornecedor/produtos") return;
    function onVis() {
      if (document.visibilityState !== "visible") return;
      void (async () => {
        try {
          const {
            data: { session },
          } = await supabaseBrowser.auth.getSession();
          const token = session?.access_token;
          if (!token) return;
          setRascunhoCriarVariantes(await getResumoRascunhoCriarVariantes(token));
        } catch {
          /* ignore */
        }
      })();
    }
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [pathname]);


  function openEdit(p: Produto) {
    const grupo = paiKey(p.sku);
    router.push(`/fornecedor/produtos/criar-variantes?editar=${encodeURIComponent(grupo)}`);
  }

  async function handleSolicitarExclusaoGrupo(g: GrupoProduto) {
    const representante = g.pai ?? g.filhos[0];
    const nome = representante?.nome_produto ?? g.paiKey;
    const n = g.pai ? 1 + g.filhos.length : g.filhos.length;
    if (
      !window.confirm(
        `Pedir à DropCore para excluir "${nome}" (${g.paiKey})?\n\nSerão ${n} SKU(s). Nada é excluído na hora: um admin aprova em Alterações de produtos.`
      )
    ) {
      return;
    }
    setFormError(null);
    setSolicitandoExclusao(g.paiKey);
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) throw new Error("Sessão expirada.");
      const res = await fetch("/api/fornecedor/produtos/solicitar-exclusao-grupo", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ grupoKey: g.paiKey, nome_produto: nome }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error ?? "Erro ao enviar pedido.");
      setSuccessMessage(j?.mensagem ?? "Pedido enviado à DropCore.");
      setTimeout(() => setSuccessMessage(null), 6000);
      await load();
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : "Erro ao enviar pedido.");
    } finally {
      setSolicitandoExclusao(null);
    }
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editando) return;
    setFormError(null);
    setFormLoading(true);
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) throw new Error("Sessão expirada.");
      const res = await fetch(`/api/fornecedor/produtos/${editando.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          nome_produto: editNome.trim(),
          cor: editCor.trim() || null,
          tamanho: editTamanho.trim() || null,
          link_fotos: editLinkFotos.trim() || null,
          descricao: editDescricao.trim() || null,
          comprimento_cm: editComp.trim() || undefined,
          largura_cm: editLarg.trim() || undefined,
          altura_cm: editAlt.trim() || undefined,
          peso_kg: editPeso.trim() || undefined,
          custo_base: editCusto.trim() || undefined,
          estoque_atual: editEstoque.trim() || undefined,
          expedicao_override_linha: editExpedicao.trim() || null,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? "Erro ao salvar.");
      setModal("none");
      setEditando(null);
      setSuccessMessage(j?.mensagem ?? "Enviado para análise. O admin verá em Alterações de produtos.");
      setTimeout(() => setSuccessMessage(null), 4000);
      load();
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setFormLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--background)] app-bg flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-xl border-2 border-[var(--card-border)] border-t-neutral-500 dark:border-t-neutral-400" />
          <p className="text-sm font-medium text-[var(--muted)]">Carregando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] app-bg pt-[calc(3.5rem+env(safe-area-inset-top,0px))] md:pt-14 pb-[calc(6.25rem+env(safe-area-inset-bottom,0px))] md:pb-8">
      <div className="dropcore-shell-4xl py-5 md:py-7 space-y-5 md:space-y-6">
        {/* Header + filtros — mesmo bloco de cartão que o dashboard do fornecedor */}
        <header className="overflow-visible rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
          <div className="min-w-0 space-y-1">
            <Link
              href="/fornecedor/dashboard"
              className="inline-flex items-center gap-2.5 text-sm font-medium text-[var(--muted)] hover:text-[var(--foreground)]"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              Voltar
            </Link>
            <p className="text-sm font-medium uppercase tracking-wide text-emerald-700/90 dark:text-emerald-400/90 leading-snug">
              Catálogo
            </p>
            <h1 className="text-2xl font-bold tracking-tight text-[var(--foreground)] sm:text-3xl">Meus produtos</h1>
          </div>
          <div className="flex w-full min-w-0 flex-col gap-3 sm:w-auto sm:items-end sm:pt-0.5">
            <label className="flex w-full cursor-pointer items-center gap-2 text-sm text-[var(--muted)] sm:w-auto sm:justify-end">
              <input
                type="checkbox"
                checked={filtroEstoqueBaixo}
                onChange={(e) => router.push(e.target.checked ? "/fornecedor/produtos?estoqueBaixo=1" : "/fornecedor/produtos")}
                className="rounded border-[var(--card-border)] bg-[var(--background)] text-emerald-600 focus:ring-emerald-500/40 dark:bg-[var(--surface-subtle)]"
              />
              Só estoque baixo
            </label>
            <div className="flex w-full flex-col gap-2 sm:hidden">
              {rascunhoCriarVariantes && (
                <Link
                  href="/fornecedor/produtos/criar-variantes"
                  className="flex min-h-[3rem] items-center gap-3 rounded-xl border border-[var(--card-border)] bg-[var(--card)] px-3 py-2.5 shadow-sm transition hover:bg-[var(--muted)]/10"
                  title={`${rascunhoCriarVariantes.nomeResumo} — salvo em ${new Date(rascunhoCriarVariantes.savedAt).toLocaleString("pt-BR")}`}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--muted)]/12 text-[var(--muted)]">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                      <line x1="16" y1="13" x2="8" y2="13" />
                      <line x1="16" y1="17" x2="8" y2="17" />
                    </svg>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="text-sm font-semibold text-[var(--foreground)]">Continuar rascunho</span>
                      {rascunhoCriarVariantes.origem === "local" && (
                        <span className="rounded-md bg-[var(--muted)]/20 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                          Só aparelho
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-[var(--muted)]">
                      {rascunhoCriarVariantes.nomeResumo}
                      <span className="text-[var(--muted)]"> · </span>
                      {new Date(rascunhoCriarVariantes.savedAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                    </span>
                  </span>
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-[var(--muted)]" aria-hidden>
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </Link>
              )}
              <Link
                href="/fornecedor/produtos/criar-variantes"
                className="flex h-9 w-full items-center justify-center rounded-md bg-emerald-600 px-3 text-center text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700 active:brightness-[0.92] shadow-emerald-600/20"
              >
                Criar produto
              </Link>
            </div>
            <div className="hidden sm:flex sm:justify-end">
              {rascunhoCriarVariantes ? (
                <div className="inline-flex max-w-full items-stretch overflow-hidden rounded-xl border border-[var(--card-border)] bg-[var(--card)] shadow-sm">
                  <Link
                    href="/fornecedor/produtos/criar-variantes"
                    className="group flex min-h-[2.5rem] max-w-[min(100vw-8rem,17rem)] min-w-0 items-center gap-2.5 border-r border-[var(--card-border)] px-3 py-1.5 text-left transition hover:bg-[var(--muted)]/10"
                    title={`${rascunhoCriarVariantes.nomeResumo} — salvo em ${new Date(rascunhoCriarVariantes.savedAt).toLocaleString("pt-BR")}`}
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--muted)]/12 text-[var(--muted)] transition group-hover:bg-emerald-100 group-hover:text-emerald-700 dark:group-hover:bg-emerald-950/50 dark:group-hover:text-emerald-400">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="16" y1="13" x2="8" y2="13" />
                        <line x1="12" y1="17" x2="8" y2="17" />
                      </svg>
                    </span>
                    <span className="min-w-0 flex-1 py-0.5">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold text-[var(--foreground)]">Continuar rascunho</span>
                        {rascunhoCriarVariantes.origem === "local" && (
                          <span className="shrink-0 rounded bg-[var(--muted)]/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[var(--muted)]">
                            Local
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] leading-tight text-[var(--muted)]">
                        {rascunhoCriarVariantes.nomeResumo}
                        <span className="text-[var(--muted)]"> · </span>
                        {new Date(rascunhoCriarVariantes.savedAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                      </span>
                    </span>
                  </Link>
                  <div className="flex items-stretch gap-1 p-1 pl-0">
                    <Link
                      href="/fornecedor/produtos/criar-variantes"
                      className="flex h-7 items-center rounded-md bg-emerald-600 px-2.5 text-[11px] font-medium text-white shadow-sm transition hover:bg-emerald-700 active:brightness-[0.92] shadow-emerald-600/15"
                    >
                      Criar produto
                    </Link>
                  </div>
                </div>
              ) : (
                <Link
                  href="/fornecedor/produtos/criar-variantes"
                  className="flex h-7 items-center rounded-md bg-emerald-600 px-2.5 text-[11px] font-medium text-white shadow-sm transition hover:bg-emerald-700 active:brightness-[0.92] shadow-emerald-600/15"
                >
                  Criar produto
                </Link>
              )}
            </div>
          </div>
        </div>
        </header>

        {error && (
          <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-100 dark:bg-red-950 p-4 text-sm text-red-800 dark:text-red-300">
            {error}
            <button onClick={load} className="ml-2 underline">Tentar novamente</button>
          </div>
        )}

        {successMessage && (
          <div className="rounded-xl border border-emerald-300 dark:border-emerald-900 bg-emerald-100 dark:bg-emerald-950 p-4 text-sm text-emerald-900 dark:text-emerald-300">
            {successMessage}
          </div>
        )}

        {formError && modal === "none" && (
          <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-100 dark:bg-red-950 p-4 text-sm text-red-800 dark:text-red-300 flex items-start justify-between gap-3">
            <span>{formError}</span>
            <button type="button" onClick={() => setFormError(null)} className="shrink-0 text-red-700 dark:text-red-400 underline text-xs">
              Fechar
            </button>
          </div>
        )}

        {/* Lista — mobile: cartões; desktop largo: tabela */}
        <div className="min-w-0 overflow-visible rounded-2xl border border-[var(--card-border)] bg-[var(--card)] shadow-sm">
          <div className="border-b border-[var(--card-border)] px-3 py-3 sm:px-4">
            <h2 className="text-sm font-semibold text-[var(--foreground)]">Produtos do armazém</h2>
            <p className="mt-0.5 text-sm text-[var(--muted)]">Gerencie seus produtos e links de fotos</p>
          </div>
          <div className="min-w-0 divide-y divide-[var(--card-border)]/60">
            {grupos.length === 0 ? (
              <div className="px-4 py-12 text-center">
                <p className="text-sm text-[var(--muted)]">
                  {filtroEstoqueBaixo ? "Nenhum produto com estoque abaixo do mínimo." : "Nenhum produto cadastrado."}
                </p>
                <p className="mt-1 text-xs text-[var(--muted)]">Use Criar produto acima para cadastrar.</p>
              </div>
            ) : (
              grupos.map((g) => {
                const representante = g.pai ?? g.filhos[0];
                const exp = expandido.has(g.paiKey);
                const linhas = [...(g.pai ? [g.pai] : []), ...g.filhos];
                const baseVariantes = g.filhos.length > 0 ? g.filhos : linhas;
                const gruposCor = agruparVariantesPorCor(baseVariantes);
                const todosInativos = linhas.every((p) => (p.status || "").toLowerCase() !== "ativo");
                return (
                  <div key={g.paiKey} className="bg-[var(--card)]">
                    {/* Cabeçalho do produto — mobile: coluna; sm+: linha */}
                    <div
                      className="flex min-w-0 cursor-pointer flex-col gap-3 px-3 py-3 sm:flex-row sm:flex-nowrap sm:items-center sm:gap-4 sm:px-4 sm:py-3 hover:bg-[var(--muted)]/10"
                      onClick={() => toggleExpandido(g.paiKey)}
                    >
                      <div className="flex min-w-0 flex-1 items-start gap-3 overflow-visible sm:min-w-[0]">
                        <button
                          type="button"
                          className="-ml-1 mt-0.5 shrink-0 p-0.5 text-[var(--muted)] hover:text-[var(--foreground)]"
                          aria-label={exp ? "Recolher" : "Expandir"}
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            className={`transition ${exp ? "rotate-90" : ""}`}
                          >
                            <path d="M9 18l6-6-6-6" />
                          </svg>
                        </button>
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[var(--card-border)] bg-[var(--muted)]/10">
                          <MiniaturaListaGrupo g={g} todosProdutos={produtos} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex min-w-0 items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-base font-semibold text-[var(--foreground)]">
                                <span className="min-w-0 break-words">{representante?.nome_produto}</span>
                                {todosInativos && (
                                  <span
                                    className={cn(
                                      AMBER_PREMIUM_SHELL,
                                      AMBER_PREMIUM_TEXT_PRIMARY,
                                      "shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold shadow-none"
                                    )}
                                  >
                                    Inativo
                                  </span>
                                )}
                                {statusAlteracaoGrupo(g) === "pendente" && (
                                  <span
                                    className={cn(
                                      AMBER_PREMIUM_SHELL,
                                      AMBER_PREMIUM_TEXT_PRIMARY,
                                      "shrink-0 rounded-full px-2.5 py-1 text-xs font-medium shadow-none"
                                    )}
                                    title="Alteração aguardando aprovação do admin"
                                  >
                                    Em análise
                                  </span>
                                )}
                                {statusAlteracaoGrupo(g) === "aprovado" && (
                                  <span className="shrink-0 rounded-full border border-emerald-300 bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
                                    Aprovado
                                  </span>
                                )}
                                {statusAlteracaoGrupo(g) === "rejeitado" && (
                                  <span
                                    className="shrink-0 rounded-full border border-red-200 bg-red-100 px-2.5 py-1 text-xs font-medium text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
                                    title={motivoRejeicaoGrupo(g) ? `Motivo: ${motivoRejeicaoGrupo(g)}` : undefined}
                                  >
                                    Reprovado
                                  </span>
                                )}
                              </p>
                            </div>
                            <div className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
                              <details data-menu-acoes className="group relative open:z-40">
                                <summary
                                  aria-label="Ações do produto"
                                  className="flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-md text-[var(--muted)] transition hover:bg-[var(--muted)]/12 hover:text-[var(--foreground)] [&::-webkit-details-marker]:hidden"
                                >
                                  <IconTresPontosHorizontais size={17} />
                                </summary>
                                <div className="absolute right-0 z-20 mt-1.5 min-w-[10rem] rounded-lg border border-[var(--card-border)] bg-[var(--card)] p-1 shadow-md">
                                  <Link
                                    href={`/fornecedor/produtos/criar-variantes?editar=${encodeURIComponent(g.paiKey)}`}
                                    className="block rounded-md px-3 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--muted)]/12"
                                  >
                                    Editar
                                  </Link>
                                  <Link
                                    href={`/fornecedor/produtos/criar-variantes?editar=${encodeURIComponent(g.paiKey)}#midia`}
                                    className="block rounded-md px-3 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--muted)]/12"
                                  >
                                    Trocar foto
                                  </Link>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (solicitandoExclusao === g.paiKey) return;
                                      if (statusAlteracaoGrupo(g) === "pendente") {
                                        setFormError(
                                          "Não é possível pedir exclusão enquanto houver alterações em análise neste produto. Aguarde a análise da DropCore."
                                        );
                                        return;
                                      }
                                      void handleSolicitarExclusaoGrupo(g);
                                    }}
                                    disabled={solicitandoExclusao === g.paiKey}
                                    className="block w-full rounded-md px-3 py-2 text-left text-sm text-red-600 hover:bg-red-100 dark:text-red-400 dark:hover:bg-red-950/50 disabled:cursor-wait disabled:opacity-80"
                                    title={
                                      statusAlteracaoGrupo(g) === "pendente"
                                        ? "Há alterações em análise neste produto"
                                        : "Pedir exclusão (aprovação DropCore)"
                                    }
                                  >
                                    {solicitandoExclusao === g.paiKey ? "Enviando..." : "Excluir"}
                                  </button>
                                </div>
                              </details>
                            </div>
                          </div>
                          <p className="mt-0.5 break-words text-sm text-[var(--muted)]">
                            <span className="font-mono text-[var(--muted)] break-all">{g.paiKey}</span>
                            {linhas.length > 0 && (
                              <span> · Variantes ({linhas.length})</span>
                            )}
                          </p>
                          {(() => {
                            const custos = linhas
                              .map((p) => p.custo_base)
                              .filter((c): c is number => c != null && Number.isFinite(c) && c > 0);
                            if (custos.length === 0) return null;
                            const min = Math.min(...custos);
                            const max = Math.max(...custos);
                            const txt = min === max ? fmtCustoBaseFornecedor(min) : `${fmtCustoBaseFornecedor(min)} a ${fmtCustoBaseFornecedor(max)}`;
                            return (
                              <p className="mt-1 text-sm text-[var(--muted)]">
                                Custo: <span className="font-semibold tabular-nums text-[var(--foreground)]">{txt}</span>
                                <span className="text-[var(--muted)]"> / un.</span>
                              </p>
                            );
                          })()}
                        </div>
                      </div>
                    </div>

                    {/* Variantes: cartões (sem scroll horizontal) até lg; tabela a partir de lg */}
                    {exp && linhas.length > 0 && (
                      <>
                      <div className="border-t border-[var(--card-border)] bg-[var(--card)] px-3 py-2 sm:px-4 sm:py-2">
                        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-nowrap sm:items-center sm:justify-between sm:gap-2.5">
                        {/* Desktop: altura 28px, texto xs, largura só do conteúdo — não estica pela linha */}
                        <div className="inline-flex h-8 w-full min-w-0 rounded-lg border border-[var(--card-border)] bg-[var(--surface-subtle)] p-px shadow-none ring-1 ring-[var(--foreground)]/[0.04] sm:h-7 sm:w-auto sm:flex-none sm:rounded-md">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setModoListaVariantes("agrupado-cor");
                            }}
                            className={`flex h-full min-h-0 min-w-0 flex-1 items-center justify-center rounded-[6px] px-2.5 text-center text-[11px] font-medium leading-none transition sm:flex-initial sm:rounded-[5px] sm:px-3 sm:text-xs sm:font-normal ${
                              modoListaVariantes === "agrupado-cor"
                                ? "bg-emerald-600 text-white hover:bg-emerald-700 sm:font-medium"
                                : "text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]"
                            }`}
                            title="Agrupado por cor"
                          >
                            <span className="sm:hidden">Por cor</span>
                            <span className="hidden sm:inline">Agrupado por cor</span>
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setModoListaVariantes("sku");
                            }}
                            className={`flex h-full min-h-0 min-w-0 flex-1 items-center justify-center rounded-[6px] px-2.5 text-center text-[11px] font-medium leading-none transition sm:flex-initial sm:rounded-[5px] sm:px-3 sm:text-xs sm:font-normal ${
                              modoListaVariantes === "sku"
                                ? "bg-emerald-600 text-white hover:bg-emerald-700 sm:font-medium"
                                : "text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]"
                            }`}
                            title="Detalhado por SKU"
                          >
                            <span className="sm:hidden">Por SKU</span>
                            <span className="hidden sm:inline">Detalhado por SKU</span>
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setMostrarFotosVariantes((v) => !v);
                          }}
                          className="inline-flex h-8 w-full shrink-0 items-center justify-center rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-3 text-[11px] font-medium text-[var(--foreground)] shadow-none transition hover:bg-[var(--muted)]/10 sm:h-7 sm:w-auto sm:rounded-md sm:px-2.5 sm:text-xs sm:font-normal"
                          title={mostrarFotosVariantes ? "Ocultar fotos das variantes" : "Mostrar fotos das variantes"}
                        >
                          <span className="sm:hidden">{mostrarFotosVariantes ? "Ocultar" : "Fotos"}</span>
                          <span className="hidden sm:inline">{mostrarFotosVariantes ? "Ocultar fotos" : "Mostrar fotos"}</span>
                        </button>
                        </div>
                      </div>
                      {!mostrarFotosVariantes ? (
                        <div className="border-t border-[var(--card-border)] bg-[var(--card)] px-3 py-4 text-sm text-[var(--muted)] sm:px-4">
                          Variantes ocultas nesta visualização.
                        </div>
                      ) : null}
                      {mostrarFotosVariantes && modoListaVariantes === "agrupado-cor" && (
                        <>
                          <div className="min-w-0 border-t border-[var(--card-border)] bg-[var(--card)] p-4">
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-3">
                            {gruposCor.map((gc) => {
                              const rowCor = gc.itens[0];
                              if (!rowCor) return null;
                              const lfCor = getLinkFotos(rowCor, produtos) || rowCor.link_fotos;
                              const fallbackCor =
                                gc.itens
                                  .map((p) => (p.imagem_url ?? "").trim())
                                  .find((u) => u.length > 0) ?? null;
                              const custos = gc.itens
                                .map((p) => p.custo_base)
                                .filter((c): c is number => c != null && Number.isFinite(c) && c > 0);
                              const custoTxt =
                                custos.length === 0
                                  ? "—"
                                  : Math.min(...custos) === Math.max(...custos)
                                    ? fmtCustoBaseFornecedor(custos[0])
                                    : `${fmtCustoBaseFornecedor(Math.min(...custos))} a ${fmtCustoBaseFornecedor(Math.max(...custos))}`;
                              const ordemTamanho: Record<string, number> = {
                                XXPP: 0,
                                XPP: 1,
                                PP: 2,
                                P: 3,
                                M: 4,
                                G: 5,
                                GG: 6,
                                XG: 7,
                                XGG: 8,
                                EXG: 9,
                                EXGG: 10,
                                U: 11,
                                UN: 11,
                                UNICO: 11,
                                "ÚNICO": 11,
                              };
                              const itensOrdenados = [...gc.itens].sort((a, b) => {
                                const ta = (a.tamanho ?? "").trim().toUpperCase();
                                const tb = (b.tamanho ?? "").trim().toUpperCase();
                                const oa = ordemTamanho[ta] ?? 999;
                                const ob = ordemTamanho[tb] ?? 999;
                                if (oa !== ob) return oa - ob;
                                return ta.localeCompare(tb, "pt-BR", { numeric: true });
                              });
                              const estoqueTotal = itensOrdenados.reduce((acc, p) => acc + (p.estoque_atual ?? 0), 0);
                              return (
                                <div
                                  key={`m-${gc.key}`}
                                  className="min-w-0 rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4 shadow-sm transition-colors hover:border-emerald-500/35"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {/* Cabeçalho: linha 1 = cor + ações; linha 2 = preço/estoque em largura total (evita quebra no meio de “Total em estoque”) */}
                                  <div className="min-w-0 space-y-2.5">
                                    <div className="flex min-w-0 flex-nowrap items-center justify-between gap-2">
                                      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
                                        <p className="min-w-0 truncate text-sm font-bold tracking-tight text-[var(--foreground)]">
                                          {gc.corLabel}
                                        </p>
                                        <span className="inline-flex shrink-0 rounded-full bg-[var(--muted)]/12 px-2 py-0.5 text-xs font-medium text-[var(--foreground)]">
                                          {gc.itens.length} SKU(s)
                                        </span>
                                      </div>
                                      <details
                                        className="relative shrink-0"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <summary
                                          className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-lg border border-[var(--card-border)] bg-[var(--card)] text-[var(--muted)] shadow-sm transition hover:bg-[var(--muted)]/10 hover:text-[var(--foreground)] [&::-webkit-details-marker]:hidden"
                                          aria-label="Mais opções desta cor"
                                        >
                                          <IconTresPontosHorizontais size={18} />
                                        </summary>
                                        <div className="absolute right-0 top-[calc(100%+6px)] z-40 min-w-[12.5rem] rounded-xl border border-[var(--card-border)] bg-[var(--card)] py-1 shadow-lg ring-1 ring-[var(--foreground)]/[0.05]">
                                          <button
                                            type="button"
                                            className="block w-full px-3 py-2.5 text-left text-sm text-[var(--foreground)] transition hover:bg-[var(--muted)]/12"
                                            onClick={(e) => {
                                              closeFornecedorVariantMenu(e.currentTarget);
                                              openEdit(rowCor);
                                            }}
                                          >
                                            Editar
                                          </button>
                                          {lfCor ? (
                                            <a
                                              href={lfCor}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="block w-full px-3 py-2.5 text-left text-sm text-[var(--foreground)] transition hover:bg-[var(--muted)]/12"
                                              onClick={(e) => closeFornecedorVariantMenu(e.currentTarget)}
                                            >
                                              Ver fotos
                                            </a>
                                          ) : (
                                            <span className="block cursor-not-allowed px-3 py-2.5 text-left text-sm text-[var(--muted)] opacity-50">
                                              Ver fotos
                                            </span>
                                          )}
                                          <button
                                            type="button"
                                            className="block w-full px-3 py-2.5 text-left text-sm text-[var(--primary-blue)] transition hover:bg-[var(--muted)]/12"
                                            onClick={(e) => {
                                              closeFornecedorVariantMenu(e.currentTarget);
                                              fotoPorCorHandleRef.current[gc.key]?.pickFile();
                                            }}
                                          >
                                            Trocar foto
                                          </button>
                                          <button
                                            type="button"
                                            disabled={!rowCor.imagem_url}
                                            className="block w-full px-3 py-2.5 text-left text-sm text-[var(--danger)] transition hover:bg-[var(--muted)]/12 disabled:cursor-not-allowed disabled:opacity-40"
                                            onClick={(e) => {
                                              closeFornecedorVariantMenu(e.currentTarget);
                                              fotoPorCorHandleRef.current[gc.key]?.deleteImage();
                                            }}
                                          >
                                            Excluir foto
                                          </button>
                                        </div>
                                      </details>
                                    </div>
                                    <div className="flex min-w-0 flex-row items-center justify-between gap-2 rounded-lg bg-[var(--muted)]/8 px-3 py-2 text-xs leading-snug sm:text-sm">
                                      <span className="min-w-0 pr-1 text-[var(--foreground)]">
                                        <span className="font-normal">Preço </span>
                                        <span className="font-semibold tabular-nums">{custoTxt}</span>
                                      </span>
                                      <span
                                        className="h-3.5 w-px shrink-0 bg-[var(--card-border)] opacity-90 sm:h-4"
                                        aria-hidden
                                      />
                                      <span className="shrink-0 whitespace-nowrap pl-1 text-right text-[var(--muted)]">
                                        Total em estoque:{" "}
                                        <span className="font-semibold tabular-nums text-[var(--foreground)]">{estoqueTotal}</span>
                                      </span>
                                    </div>
                                  </div>

                                  {/* Mobile: foto em cima + tabela largura total (sem scroll lateral). md+: igual desktop, foto | tabela com links alinhados à GG. */}
                                  <div className="mt-4 flex min-w-0 flex-col gap-4 md:grid md:grid-cols-[10rem_minmax(0,1fr)] md:items-stretch md:gap-x-4">
                                    <div className="flex w-full min-w-0 max-w-full shrink-0 flex-col md:h-full md:min-h-0 md:max-w-[10rem]">
                                    {mostrarFotosVariantes ? (
                                      <FotoVariacaoCell
                                        ref={(node) => {
                                          if (node) fotoPorCorHandleRef.current[gc.key] = node;
                                          else delete fotoPorCorHandleRef.current[gc.key];
                                        }}
                                        variant="stacked"
                                        stackedSize="large"
                                        stackedHideInlineActions
                                        skuId={rowCor.id}
                                        imagemUrl={rowCor.imagem_url ?? null}
                                        fallbackImagemUrl={fallbackCor || fallbackImagemSkuPai(rowCor, g)}
                                        linkFotosUrl={lfCor}
                                        onUpdate={async (url) => {
                                          setProdutos((prev) =>
                                            prev.map((p) => (p.id === rowCor.id ? { ...p, imagem_url: url } : p))
                                          );
                                          const mesmaCor = linhas.filter((p) => (p.cor ?? "") === (rowCor.cor ?? ""));
                                          const primeiroDaCor = mesmaCor.sort((a, b) => a.sku.localeCompare(b.sku))[0];
                                          if (primeiroDaCor?.id === rowCor.id && url) {
                                            const sibs = mesmaCor.filter((p) => p.id !== rowCor.id);
                                            if (sibs.length > 0) {
                                              const { data } = await supabaseBrowser.auth.getSession();
                                              const token = data.session?.access_token;
                                              if (token) {
                                                await Promise.all(
                                                  sibs.map((p) =>
                                                    fetch(`/api/fornecedor/produtos/${p.id}`, {
                                                      method: "PATCH",
                                                      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                                                      body: JSON.stringify({ imagem_url: url }),
                                                    })
                                                  )
                                                );
                                                setProdutos((prev) =>
                                                  prev.map((p) => (sibs.some((s) => s.id === p.id) ? { ...p, imagem_url: url } : p))
                                                );
                                              }
                                            }
                                          }
                                        }}
                                        getToken={async () => {
                                          const { data } = await supabaseBrowser.auth.getSession();
                                          return data.session?.access_token ?? null;
                                        }}
                                      />
                                    ) : (
                                      <>
                                        <div className="hidden h-full min-h-0 flex-col md:flex">
                                          <div className="flex min-h-0 flex-1 flex-col items-center justify-end pb-0.5">
                                            <div className="h-40 w-40 shrink-0 rounded-xl border border-dashed border-[var(--card-border)] bg-[var(--muted)]/8" />
                                          </div>
                                          <div className="shrink-0 py-2" aria-hidden />
                                        </div>
                                        <div className="w-full md:hidden">
                                          <div className="aspect-square w-full shrink-0 rounded-xl border border-dashed border-[var(--card-border)] bg-[var(--muted)]/8" />
                                        </div>
                                      </>
                                    )}
                                    </div>
                                    <div className="min-w-0 w-full max-w-full overflow-x-visible rounded-xl bg-[var(--card)] max-md:overflow-hidden max-md:border-0 max-md:shadow-none md:border md:border-[var(--card-border)] md:shadow-sm md:overflow-x-auto md:[-webkit-overflow-scrolling:touch] md:overscroll-x-contain">
                                        <div className="grid w-full min-w-0 grid-cols-[4.5rem_minmax(0,1fr)_3rem] rounded-t-xl border-b border-[var(--card-border)] bg-[var(--surface-subtle)] px-2.5 py-2 text-[11px] font-bold text-[var(--muted)] md:rounded-t-none">
                                          <span>Numeração</span>
                                          <span className="min-w-0">SKU</span>
                                          <span className="text-right">Qtd.</span>
                                        </div>
                                        {itensOrdenados.map((p) => (
                                          <div
                                            key={p.id}
                                            className="grid w-full min-w-0 grid-cols-[4.5rem_minmax(0,1fr)_3rem] items-center border-b border-[var(--card-border)]/50 px-2.5 py-2 text-xs last:border-b-0 max-md:last:rounded-b-xl"
                                          >
                                            <span className="font-bold text-[var(--foreground)]">{(p.tamanho ?? "—").toUpperCase()}</span>
                                            <span className="min-w-0 whitespace-nowrap font-mono text-[11px] font-normal leading-snug text-[var(--muted)]">{p.sku}</span>
                                            <span className={`text-right text-xs font-bold tabular-nums ${(p.estoque_atual ?? 0) <= 0 ? "text-[var(--danger)]" : "text-[var(--foreground)]"}`}>
                                              {p.estoque_atual != null ? p.estoque_atual : "—"}
                                            </span>
                                          </div>
                                        ))}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                            </div>
                          </div>
                        </>
                      )}
                      {mostrarFotosVariantes && modoListaVariantes === "sku" && (
                        <>
                      <div className="min-w-0 border-t border-[var(--card-border)] bg-[var(--card)] p-3 lg:hidden">
                        {linhas.map((row) => {
                          const lf = getLinkFotos(row, produtos) || row.link_fotos;
                          return (
                            <div key={row.id} className="mb-3 min-w-0 rounded-2xl border border-[var(--card-border)] bg-[var(--card)] px-3 py-2.5 last:mb-0" onClick={(e) => e.stopPropagation()}>
                              <div className="flex gap-2.5 min-w-0 items-start">
                                <FotoVariacaoCell
                                  variant="table"
                                  skuId={row.id}
                                  imagemUrl={row.imagem_url ?? null}
                                  fallbackImagemUrl={fallbackImagemSkuPai(row, g)}
                                  linkFotosUrl={lf}
                                  onUpdate={async (url) => {
                                      setProdutos((prev) =>
                                        prev.map((p) => (p.id === row.id ? { ...p, imagem_url: url } : p))
                                      );
                                      const mesmaCor = linhas.filter((p) => (p.cor ?? "") === (row.cor ?? ""));
                                      const primeiroDaCor = mesmaCor.sort((a, b) => a.sku.localeCompare(b.sku))[0];
                                      if (primeiroDaCor?.id === row.id && url) {
                                        const sibs = mesmaCor.filter((p) => p.id !== row.id);
                                        if (sibs.length > 0) {
                                          const { data } = await supabaseBrowser.auth.getSession();
                                          const token = data.session?.access_token;
                                          if (token) {
                                            await Promise.all(
                                              sibs.map((p) =>
                                                fetch(`/api/fornecedor/produtos/${p.id}`, {
                                                  method: "PATCH",
                                                  headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                                                  body: JSON.stringify({ imagem_url: url }),
                                                })
                                              )
                                            );
                                            setProdutos((prev) =>
                                              prev.map((p) => (sibs.some((s) => s.id === p.id) ? { ...p, imagem_url: url } : p))
                                            );
                                          }
                                        }
                                      }
                                    }}
                                    getToken={async () => {
                                      const { data } = await supabaseBrowser.auth.getSession();
                                      return data.session?.access_token ?? null;
                                    }}
                                />
                                <div className="min-w-0 flex-1 pt-0.5">
                                  <div className="flex items-start justify-between gap-2 min-w-0">
                                    <div className="min-w-0 flex-1">
                                      <p className="text-sm font-medium leading-snug text-[var(--foreground)]">
                                        <CorCelulaProduto cor={row.cor} />
                                        <span className="mx-1 text-[var(--muted)]">·</span>
                                        <span className="font-normal text-[var(--muted)]">{row.tamanho || "—"}</span>
                                      </p>
                                      <p className="mt-0.5 break-all font-mono text-xs leading-tight text-[var(--muted)]">{row.sku}</p>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => openEdit(row)}
                                      className="-mr-1 shrink-0 rounded-md border border-[var(--card-border)] px-2 py-1.5 text-[11px] font-medium text-[var(--foreground)] transition hover:bg-[var(--muted)]/12 touch-manipulation"
                                    >
                                      Editar
                                    </button>
                                  </div>
                                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-[var(--muted)]">
                                    <span>
                                      Custo{" "}
                                      <span className="tabular-nums font-medium text-[var(--foreground)]">
                                        {fmtCustoBaseFornecedor(row.custo_base)}
                                      </span>
                                    </span>
                                    <span>
                                      Estoque{" "}
                                      <span className={`tabular-nums font-medium ${(row.estoque_atual ?? 0) <= 0 ? "text-[var(--danger)]" : "text-[var(--foreground)]"}`}>
                                        {row.estoque_atual != null ? row.estoque_atual : "—"}
                                      </span>
                                    </span>
                                    {lf ? (
                                      <a
                                        href={lf}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="font-medium text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 underline underline-offset-2 break-all"
                                      >
                                        Link fotos
                                      </a>
                                    ) : null}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <div className="hidden min-w-0 overflow-x-auto border-t border-[var(--card-border)]/60 lg:block">
                        <table className="w-full min-w-[700px] table-fixed text-sm">
                          <thead>
                            <tr className="bg-[var(--muted)]/10 text-left text-xs text-[var(--muted)]">
                              <th className="w-[4.25rem] px-2 py-2 font-medium lg:px-3">
                                <span className="block">Foto</span>
                                <span className="block text-[10px] font-normal text-[var(--muted)]">SKU</span>
                              </th>
                              <th className="w-[18%] px-2 py-2 font-medium lg:px-3">Cor</th>
                              <th className="w-[7%] px-2 py-2 font-medium lg:px-3">Tam.</th>
                              <th className="w-[20%] px-2 py-2 font-medium lg:px-3">SKU</th>
                              <th className="w-[10%] px-2 py-2 text-right font-medium lg:px-3">Custo</th>
                              <th className="w-[6%] px-2 py-2 text-right font-medium lg:px-3">Est.</th>
                              <th className="w-[9%] px-2 py-2 font-medium lg:px-3">
                                <span className="block">Fotos</span>
                                <span className="block text-[10px] font-normal text-[var(--muted)]">Álbum</span>
                              </th>
                              <th className="w-[4.5rem] px-2 py-2 text-right font-medium lg:pl-3 lg:pr-4">Ações</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[var(--card-border)]/60">
                            {linhas.map((row) => {
                              const lf = getLinkFotos(row, produtos) || row.link_fotos;
                              return (
                                <tr key={row.id} className="hover:bg-[var(--muted)]/8">
                                  <td className="px-2 py-1.5 align-top lg:px-3">
                                    <FotoVariacaoCell
                                      skuId={row.id}
                                      imagemUrl={row.imagem_url ?? null}
                                      fallbackImagemUrl={fallbackImagemSkuPai(row, g)}
                                      linkFotosUrl={lf}
                                      onUpdate={async (url) => {
                                        setProdutos((prev) =>
                                          prev.map((p) => (p.id === row.id ? { ...p, imagem_url: url } : p))
                                        );
                                        const mesmaCor = linhas.filter((p) => (p.cor ?? "") === (row.cor ?? ""));
                                        const primeiroDaCor = mesmaCor.sort((a, b) => a.sku.localeCompare(b.sku))[0];
                                        if (primeiroDaCor?.id === row.id && url) {
                                          const sibs = mesmaCor.filter((p) => p.id !== row.id);
                                          if (sibs.length > 0) {
                                            const { data } = await supabaseBrowser.auth.getSession();
                                            const token = data.session?.access_token;
                                            if (token) {
                                              await Promise.all(
                                                sibs.map((p) =>
                                                  fetch(`/api/fornecedor/produtos/${p.id}`, {
                                                    method: "PATCH",
                                                    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                                                    body: JSON.stringify({ imagem_url: url }),
                                                  })
                                                )
                                              );
                                              setProdutos((prev) =>
                                                prev.map((p) => (sibs.some((s) => s.id === p.id) ? { ...p, imagem_url: url } : p))
                                              );
                                            }
                                          }
                                        }
                                      }}
                                      getToken={async () => {
                                        const { data } = await supabaseBrowser.auth.getSession();
                                        return data.session?.access_token ?? null;
                                      }}
                                    />
                                  </td>
                                  <td className="px-2 py-1.5 align-top break-words text-xs text-[var(--foreground)] lg:px-3">
                                    <CorCelulaProduto cor={row.cor} />
                                  </td>
                                  <td className="px-2 py-1.5 align-top text-xs text-[var(--foreground)] lg:px-3">{row.tamanho || "—"}</td>
                                  <td className="px-2 py-1.5 align-top font-mono text-[11px] leading-snug text-[var(--muted)] break-all lg:px-3">{row.sku}</td>
                                  <td className="px-2 py-1.5 align-top text-right text-xs tabular-nums font-medium text-[var(--foreground)] lg:px-3">
                                    {fmtCustoBaseFornecedor(row.custo_base)}
                                  </td>
                                  <td className="px-2 py-1.5 align-top text-right text-xs tabular-nums text-[var(--foreground)] lg:px-3">
                                    {row.estoque_atual != null ? row.estoque_atual : "—"}
                                  </td>
                                  <td className="min-w-0 px-2 py-1.5 align-top lg:px-3">
                                    {lf ? (
                                      <a
                                        href={lf}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 text-xs break-all line-clamp-2 block"
                                      >
                                        Ver
                                      </a>
                                    ) : (
                                      <span className="text-[var(--muted)] text-xs">—</span>
                                    )}
                                  </td>
                                  <td className="px-2 py-1.5 text-right align-top lg:pl-3 lg:pr-4">
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); openEdit(row); }}
                                      className="inline-flex items-center rounded-md px-2 py-1 text-xs font-medium text-emerald-600 hover:bg-emerald-100 dark:text-emerald-400 dark:hover:bg-emerald-950/50 dark:hover:text-emerald-300"
                                    >
                                      Editar
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      </>
                    )}
                      {representante ? (
                        <>
                          <ProdutoResumoListaGrupo
                            grupoKey={g.paiKey}
                            pai={g.pai}
                            filhosVariantes={g.filhos}
                            representante={representante}
                            linkAlbum={getLinkFotos(representante, produtos) || representante.link_fotos}
                            editHref={`/fornecedor/produtos/criar-variantes?editar=${encodeURIComponent(g.paiKey)}`}
                          />
                        </>
                      ) : null}
                      </>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        <AlteracoesCatalogoInfoBanner />

        <p className="text-center text-xs text-[var(--muted)] px-1 break-words">
          <Link href="/fornecedor/dashboard" className="hover:text-[var(--foreground)]">Dashboard</Link>
          {" · "}
          <Link href="/" className="hover:text-[var(--foreground)]">Voltar ao DropCore</Link>
        </p>
      </div>

      {/* Modal Edit */}
      {modal === "edit" && editando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[color-mix(in_srgb,var(--foreground)_32%,transparent)]" onClick={() => !formLoading && setModal("none")}>
          <div
            className="w-full max-w-md max-h-[min(92dvh,40rem)] min-w-0 overflow-y-auto overscroll-contain rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4 shadow-xl sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-4 break-words text-base font-semibold text-[var(--foreground)]">Editar produto · {editando.sku}</h3>
            <form onSubmit={handleEdit} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs text-[var(--muted)]">Nome do produto *</label>
                <input
                  type="text"
                  value={editNome}
                  onChange={(e) => setEditNome(e.target.value)}
                  onBlur={() => setEditNome(toTitleCase(editNome))}
                  placeholder="Ex: Camiseta Básica"
                  className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--surface-subtle)] px-3 py-2.5 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/40"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-xs text-[var(--muted)]">Cor</label>
                  <input
                    type="text"
                    value={editCor}
                    onChange={(e) => setEditCor(e.target.value)}
                    onBlur={() => setEditCor(toTitleCase(editCor))}
                    placeholder="Ex: Preto"
                    className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--surface-subtle)] px-3 py-2.5 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/40"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs text-[var(--muted)]">Tamanho</label>
                  <input
                    type="text"
                    value={editTamanho}
                    onChange={(e) => setEditTamanho(e.target.value)}
                    onBlur={() => setEditTamanho(editTamanho.trim().toUpperCase())}
                    placeholder="Ex: M"
                    className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--surface-subtle)] px-3 py-2.5 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/40"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-xs text-[var(--muted)]">Descrição</label>
                <textarea
                  value={editDescricao}
                  onChange={(e) => setEditDescricao(e.target.value)}
                  onBlur={() => setEditDescricao(toTitleCase(editDescricao))}
                  placeholder="Descrição do produto"
                  rows={2}
                  className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--surface-subtle)] px-3 py-2.5 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/40 resize-none"
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="mb-1.5 block text-xs text-[var(--muted)]">Comp (cm)</label>
                  <input
                    type="text"
                    value={editComp}
                    onChange={(e) => setEditComp(e.target.value)}
                    placeholder="—"
                    className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--surface-subtle)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/40"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs text-[var(--muted)]">Larg (cm)</label>
                  <input
                    type="text"
                    value={editLarg}
                    onChange={(e) => setEditLarg(e.target.value)}
                    placeholder="—"
                    className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--surface-subtle)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/40"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs text-[var(--muted)]">Alt (cm)</label>
                  <input
                    type="text"
                    value={editAlt}
                    onChange={(e) => setEditAlt(e.target.value)}
                    placeholder="—"
                    className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--surface-subtle)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/40"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-xs text-[var(--muted)]">Peso (kg)</label>
                <input type="text" inputMode="decimal" value={editPeso} onChange={(e) => setEditPeso(e.target.value)} placeholder="—" className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--surface-subtle)] px-3 py-2.5 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/40" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-xs text-[var(--muted)]">Custo por unidade (R$)</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={editCusto}
                    onChange={(e) => setEditCusto(e.target.value)}
                    placeholder="0"
                    className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--surface-subtle)] px-3 py-2.5 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/40"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs text-[var(--muted)]">Estoque</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={editEstoque}
                    onChange={(e) => setEditEstoque(e.target.value)}
                    placeholder="0"
                    className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--surface-subtle)] px-3 py-2.5 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/40"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-xs text-[var(--muted)]">Link das fotos (esta variante)</label>
                <input
                  type="url"
                  value={editLinkFotos}
                  onChange={(e) => setEditLinkFotos(e.target.value)}
                  placeholder="https://drive.google.com/... ou link do Dropbox, etc."
                  className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--surface-subtle)] px-3 py-2.5 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/40"
                />
                <p className="text-[11px] text-[var(--muted)] mt-1">Cada variante pode ter seu próprio link de fotos</p>
              </div>
              <div>
                <label className="mb-1.5 block text-xs text-[var(--muted)]">
                  Despacho / CD desta variante (opcional)
                </label>
                <textarea
                  value={editExpedicao}
                  onChange={(e) => setEditExpedicao(e.target.value)}
                  rows={3}
                  placeholder="Só preencha se for diferente do CD padrão no cadastro da empresa. Ex.: CD Santa Catarina + endereço completo."
                  className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--surface-subtle)] px-3 py-2.5 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/40 resize-y min-h-[4rem]"
                />
                <p className={cn("mt-1 text-[10px] leading-snug", AMBER_PREMIUM_TEXT_BODY)}>
                  Alterações seguem para análise da DropCore como os outros campos.
                </p>
              </div>
              {formError && <p className="text-sm text-[var(--danger)]">{formError}</p>}
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => !formLoading && setModal("none")}
                  className="flex-1 rounded-lg border border-[var(--card-border)] px-4 py-2.5 text-sm text-[var(--muted)] hover:bg-[var(--muted)]/10"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={formLoading}
                  className="flex-1 rounded-lg bg-emerald-600 text-white font-semibold px-4 py-2.5 text-sm hover:bg-emerald-700 disabled:opacity-60 shadow-sm shadow-emerald-600/20"
                >
                  {formLoading ? "Salvando..." : "Salvar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      <FornecedorNav active="produtos" />
    </div>
  );
}
