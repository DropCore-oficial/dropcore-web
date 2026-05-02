"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import Link from "next/link";
import { FornecedorNav } from "../FornecedorNav";
import { AlteracoesCatalogoInfoBanner } from "@/components/fornecedor/AlteracoesCatalogoInfoBanner";
import { FotoVariacaoCell } from "@/components/FotoVariacaoCell";
import { toTitleCase } from "@/lib/formatText";
import { fornecedorProdutoImagemSrc } from "@/lib/fornecedorProdutoImagemSrc";
import { getResumoRascunhoCriarVariantes, type ResumoRascunhoCriarVariantes } from "@/lib/fornecedorCriarVariantesRascunho";
import { ProdutoResumoListaGrupo } from "@/components/fornecedor/ProdutoResumoListaGrupo";
import { AMBER_PREMIUM_SURFACE_TRANSPARENT, AMBER_PREMIUM_TEXT_PRIMARY } from "@/lib/amberPremium";
import { cn } from "@/lib/utils";

const BRL_CUSTO_FORNECEDOR = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

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

/** Se `cor` tiver vários valores numa string (dados antigos com vírgulas), mostra em chips em vez de um bloco único. */
function CorCelulaProduto({ cor }: { cor: string | null }) {
  const raw = (cor ?? "").trim();
  if (!raw) return <>—</>;
  const parts = raw.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  if (parts.length <= 1) {
    return <span className="break-words">{raw}</span>;
  }
  return (
    <span className="flex flex-wrap gap-1">
      {parts.map((p, i) => (
        <span
          key={`${i}-${p}`}
          className="inline-flex max-w-full rounded-md bg-neutral-100 px-1.5 py-0.5 text-[11px] font-medium text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200"
        >
          {p}
        </span>
      ))}
    </span>
  );
}

type GrupoProduto = { paiKey: string; pai: Produto | null; filhos: Produto[] };
type GrupoPorCor = { key: string; corLabel: string; itens: Produto[] };

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
          className="flex h-full w-full items-center justify-center bg-neutral-200 text-lg text-neutral-500 hover:bg-neutral-300 dark:bg-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-600"
          title="Abrir link da foto"
        >
          📷
        </a>
      );
    }
    return <span className="text-lg text-neutral-400 dark:text-neutral-500">—</span>;
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

function agruparVariantesPorCor(rows: Produto[]): GrupoPorCor[] {
  const porCor = new Map<string, GrupoPorCor>();
  const ordenadas = [...rows].sort((a, b) => a.sku.localeCompare(b.sku));
  for (const row of ordenadas) {
    const cor = (row.cor ?? "").trim();
    const corLabel = cor || "Sem cor";
    const key = cor.toLowerCase() || "__sem_cor__";
    const atual = porCor.get(key);
    if (atual) {
      atual.itens.push(row);
    } else {
      porCor.set(key, { key, corLabel, itens: [row] });
    }
  }
  return Array.from(porCor.values()).sort((a, b) => {
    const skuA = a.itens[0]?.sku ?? "";
    const skuB = b.itens[0]?.sku ?? "";
    const bySku = skuA.localeCompare(skuB, "pt-BR", { numeric: true });
    if (bySku !== 0) return bySku;
    return a.corLabel.localeCompare(b.corLabel, "pt-BR");
  });
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
          <div className="w-10 h-10 rounded-xl border-2 border-neutral-200 dark:border-neutral-700 border-t-emerald-500 dark:border-t-emerald-500 animate-spin" />
          <p className="text-sm text-neutral-500 dark:text-neutral-400 font-medium">Carregando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen min-w-0 max-w-[100%] overflow-x-hidden bg-[var(--background)] text-[var(--foreground)] app-bg pt-[calc(3rem+env(safe-area-inset-top,0px))] md:pt-14 pb-[calc(6.25rem+env(safe-area-inset-bottom,0px))] md:pb-8">
      <div className="mx-auto w-full min-w-0 max-w-6xl space-y-6 py-5 dropcore-px-content">
        {/* Header + filtros (desktop: título à esquerda, ações à direita) */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
          <div className="min-w-0 space-y-1">
            <Link
              href="/fornecedor/dashboard"
              className="inline-flex items-center gap-2.5 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              Voltar
            </Link>
            <h1 className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-neutral-100">Meus produtos</h1>
          </div>
          <div className="flex w-full min-w-0 flex-col gap-3 sm:w-auto sm:items-end sm:pt-0.5">
            <label className="flex w-full cursor-pointer items-center gap-2 text-sm text-[var(--muted)] sm:w-auto sm:justify-end">
              <input
                type="checkbox"
                checked={filtroEstoqueBaixo}
                onChange={(e) => router.push(e.target.checked ? "/fornecedor/produtos?estoqueBaixo=1" : "/fornecedor/produtos")}
                className="rounded border-[var(--card-border)]"
              />
              Só estoque baixo
            </label>
            <div className="flex w-full flex-col gap-2 sm:hidden">
              {rascunhoCriarVariantes && (
                <Link
                  href="/fornecedor/produtos/criar-variantes"
                  className="flex min-h-[3rem] items-center gap-3 rounded-xl border border-neutral-200 bg-[var(--card)] px-3 py-2.5 shadow-sm transition hover:border-neutral-300 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:border-neutral-600 dark:hover:bg-neutral-800"
                  title={`${rascunhoCriarVariantes.nomeResumo} — salvo em ${new Date(rascunhoCriarVariantes.savedAt).toLocaleString("pt-BR")}`}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                      <line x1="16" y1="13" x2="8" y2="13" />
                      <line x1="16" y1="17" x2="8" y2="17" />
                    </svg>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Continuar rascunho</span>
                      {rascunhoCriarVariantes.origem === "local" && (
                        <span className="rounded-md bg-neutral-200 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300">
                          Só aparelho
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-neutral-500 dark:text-neutral-400">
                      {rascunhoCriarVariantes.nomeResumo}
                      <span className="text-neutral-400 dark:text-neutral-500"> · </span>
                      {new Date(rascunhoCriarVariantes.savedAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                    </span>
                  </span>
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-neutral-400" aria-hidden>
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
                <div className="inline-flex max-w-full items-stretch overflow-hidden rounded-xl border border-neutral-200 bg-[var(--card)] shadow-sm dark:border-neutral-700 dark:bg-neutral-900">
                  <Link
                    href="/fornecedor/produtos/criar-variantes"
                    className="group flex min-h-[2.5rem] max-w-[min(100vw-8rem,17rem)] min-w-0 items-center gap-2.5 border-r border-neutral-200 px-3 py-1.5 text-left transition hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
                    title={`${rascunhoCriarVariantes.nomeResumo} — salvo em ${new Date(rascunhoCriarVariantes.savedAt).toLocaleString("pt-BR")}`}
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-500 transition group-hover:bg-emerald-100 group-hover:text-emerald-700 dark:bg-neutral-800 dark:text-neutral-400 dark:group-hover:bg-emerald-950/50 dark:group-hover:text-emerald-400">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="16" y1="13" x2="8" y2="13" />
                        <line x1="12" y1="17" x2="8" y2="17" />
                      </svg>
                    </span>
                    <span className="min-w-0 flex-1 py-0.5">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold text-neutral-900 dark:text-neutral-100">Continuar rascunho</span>
                        {rascunhoCriarVariantes.origem === "local" && (
                          <span className="shrink-0 rounded bg-neutral-200 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300">
                            Local
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] leading-tight text-neutral-500 dark:text-neutral-400">
                        {rascunhoCriarVariantes.nomeResumo}
                        <span className="text-neutral-400 dark:text-neutral-500"> · </span>
                        {new Date(rascunhoCriarVariantes.savedAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                      </span>
                    </span>
                  </Link>
                  <div className="flex items-stretch gap-1 p-1 pl-0">
                    <Link
                      href="/fornecedor/produtos/criar-variantes"
                      className="flex h-8 items-center rounded-md bg-emerald-600 px-3 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700 active:brightness-[0.92] shadow-emerald-600/20"
                    >
                      Criar produto
                    </Link>
                  </div>
                </div>
              ) : (
                <Link
                  href="/fornecedor/produtos/criar-variantes"
                  className="flex h-8 items-center rounded-md bg-emerald-600 px-3 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700 active:brightness-[0.92] shadow-emerald-600/20"
                >
                  Criar produto
                </Link>
              )}
            </div>
          </div>
        </div>

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

        <AlteracoesCatalogoInfoBanner />

        {formError && modal === "none" && (
          <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-100 dark:bg-red-950 p-4 text-sm text-red-800 dark:text-red-300 flex items-start justify-between gap-3">
            <span>{formError}</span>
            <button type="button" onClick={() => setFormError(null)} className="shrink-0 text-red-700 dark:text-red-400 underline text-xs">
              Fechar
            </button>
          </div>
        )}

        {/* Lista — mobile: cartões; desktop largo: tabela */}
        <div className="min-w-0 overflow-visible rounded-xl border border-gray-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <div className="px-3 py-3 sm:px-4 border-b border-neutral-200 dark:border-neutral-800">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-neutral-100">Produtos do armazém</h2>
            <p className="mt-0.5 text-sm text-gray-500 dark:text-neutral-400">Gerencie seus produtos e links de fotos</p>
          </div>
          <div className="divide-y divide-neutral-100 dark:divide-neutral-800 min-w-0">
            {grupos.length === 0 ? (
              <div className="px-4 py-12 text-center">
                <p className="text-neutral-500 dark:text-neutral-400 text-sm">
                  {filtroEstoqueBaixo ? "Nenhum produto com estoque abaixo do mínimo." : "Nenhum produto cadastrado."}
                </p>
                <p className="text-neutral-500 dark:text-neutral-400 text-xs mt-1">Use Criar produto acima para cadastrar.</p>
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
                  <div key={g.paiKey} className="bg-white dark:bg-transparent">
                    {/* Cabeçalho do produto — mobile: coluna; sm+: linha */}
                    <div
                      className="flex min-w-0 cursor-pointer flex-col gap-3 px-3 py-3 sm:flex-row sm:flex-nowrap sm:items-center sm:gap-4 sm:px-4 sm:py-3 hover:bg-gray-100 dark:hover:bg-neutral-800"
                      onClick={() => toggleExpandido(g.paiKey)}
                    >
                      <div className="flex min-w-0 flex-1 items-start gap-3 overflow-visible sm:min-w-[0]">
                        <button
                          type="button"
                          className="text-neutral-400 dark:text-neutral-500 hover:text-neutral-600 dark:hover:text-neutral-400 p-0.5 -ml-1 shrink-0 mt-0.5"
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
                        <div className="w-12 h-12 rounded-lg bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 flex items-center justify-center shrink-0 overflow-hidden">
                          <MiniaturaListaGrupo g={g} todosProdutos={produtos} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex min-w-0 items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-base font-semibold text-gray-900 dark:text-neutral-100">
                                <span className="min-w-0 break-words">{representante?.nome_produto}</span>
                                {todosInativos && (
                                  <span
                                    className={cn(
                                      AMBER_PREMIUM_SURFACE_TRANSPARENT,
                                      AMBER_PREMIUM_TEXT_PRIMARY,
                                      "shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold"
                                    )}
                                  >
                                    Inativo
                                  </span>
                                )}
                                {statusAlteracaoGrupo(g) === "pendente" && (
                                  <span
                                    className={cn(
                                      AMBER_PREMIUM_SURFACE_TRANSPARENT,
                                      AMBER_PREMIUM_TEXT_PRIMARY,
                                      "shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium"
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
                                  className="flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-md text-base font-semibold text-gray-700 transition hover:bg-gray-100 [&::-webkit-details-marker]:hidden dark:text-neutral-200 dark:hover:bg-neutral-800"
                                >
                                  ⋯
                                </summary>
                                <div className="absolute right-0 z-20 mt-1.5 min-w-[10rem] rounded-lg border border-gray-200 bg-white p-1 shadow-md dark:border-neutral-700 dark:bg-neutral-900">
                                  <Link
                                    href={`/fornecedor/produtos/criar-variantes?editar=${encodeURIComponent(g.paiKey)}`}
                                    className="block rounded-md px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
                                  >
                                    Editar
                                  </Link>
                                  <Link
                                    href={`/fornecedor/produtos/criar-variantes?editar=${encodeURIComponent(g.paiKey)}#midia`}
                                    className="block rounded-md px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
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
                                    className="block w-full rounded-md px-3 py-2 text-left text-sm text-red-600 hover:bg-red-100 disabled:cursor-wait disabled:opacity-80"
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
                          <p className="mt-0.5 break-words text-sm text-gray-500 dark:text-neutral-400">
                            <span className="font-mono text-neutral-600 dark:text-neutral-500 break-all">{g.paiKey}</span>
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
                              <p className="mt-1 text-sm text-gray-500 dark:text-neutral-300">
                                Custo: <span className="font-semibold tabular-nums text-neutral-900 dark:text-neutral-100">{txt}</span>
                                <span className="text-neutral-400 dark:text-neutral-500"> / un.</span>
                              </p>
                            );
                          })()}
                        </div>
                      </div>
                    </div>

                    {/* Variantes: cartões (sem scroll horizontal) até lg; tabela a partir de lg */}
                    {exp && linhas.length > 0 && (
                      <>
                      <div className="border-t border-gray-200 bg-white px-3 py-2.5 dark:border-neutral-800 dark:bg-neutral-900 sm:px-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="inline-flex rounded-xl border border-gray-200 bg-gray-100 p-0.5 shadow-sm dark:border-neutral-700 dark:bg-neutral-800">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setModoListaVariantes("agrupado-cor");
                            }}
                            className={`h-8 min-w-[8.5rem] rounded-lg px-3 text-[13px] font-medium transition ${
                              modoListaVariantes === "agrupado-cor"
                                ? "bg-emerald-600 text-white shadow-sm hover:bg-emerald-700"
                                : "text-gray-600 hover:bg-white hover:text-gray-800 dark:text-neutral-400 dark:hover:bg-neutral-900 dark:hover:text-neutral-200"
                            }`}
                          >
                            Agrupado por cor
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setModoListaVariantes("sku");
                            }}
                            className={`h-8 min-w-[8.5rem] rounded-lg px-3 text-[13px] font-medium transition ${
                              modoListaVariantes === "sku"
                                ? "bg-emerald-600 text-white shadow-sm hover:bg-emerald-700"
                                : "text-gray-600 hover:bg-white hover:text-gray-800 dark:text-neutral-400 dark:hover:bg-neutral-900 dark:hover:text-neutral-200"
                            }`}
                          >
                            Detalhado por SKU
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setMostrarFotosVariantes((v) => !v);
                          }}
                          className="inline-flex h-8 items-center justify-center rounded-xl border border-gray-300 bg-white px-4 text-[13px] font-medium text-gray-700 shadow-sm transition hover:bg-gray-100 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
                        >
                          {mostrarFotosVariantes ? "Ocultar fotos" : "Mostrar fotos"}
                        </button>
                        </div>
                      </div>
                      {!mostrarFotosVariantes ? (
                        <div className="border-t border-gray-200 bg-gray-100 px-3 py-4 text-sm text-gray-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300 sm:px-4">
                          Variantes ocultas nesta visualização.
                        </div>
                      ) : null}
                      {mostrarFotosVariantes && modoListaVariantes === "agrupado-cor" && (
                        <>
                          <div className="min-w-0 border-t border-gray-200 bg-gray-100 p-2 dark:border-neutral-800 dark:bg-neutral-900 sm:p-3">
                            <div className="grid grid-cols-1 gap-2 lg:grid-cols-2 lg:gap-3">
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
                                  className="min-w-0 rounded-xl border border-gray-200 bg-white px-2.5 py-2.5 shadow-sm transition-colors hover:border-gray-300 dark:border-neutral-700 dark:bg-neutral-900 sm:px-4 sm:py-3"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <div className="flex min-w-0 items-start justify-between gap-2">
                                    <div className="min-w-0">
                                      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                                        <p className="text-sm font-semibold leading-snug text-neutral-900 dark:text-neutral-100">
                                          {gc.corLabel}
                                        </p>
                                        <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 dark:bg-neutral-800 dark:text-neutral-300">
                                          {gc.itens.length} SKU(s)
                                        </span>
                                        <span className="text-sm font-medium text-gray-700 dark:text-neutral-300">
                                          Preço {custoTxt}
                                        </span>
                                        <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 dark:bg-neutral-800 dark:text-neutral-300">
                                          Total: {estoqueTotal}
                                        </span>
                                      </div>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-2">
                                      {lfCor ? (
                                        <a
                                          href={lfCor}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="inline-flex h-7 items-center rounded-md border border-gray-300 bg-white px-2.5 text-[11px] font-medium text-gray-700 shadow-sm transition hover:bg-gray-100 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
                                        >
                                          Ver fotos
                                        </a>
                                      ) : null}
                                      <button
                                        type="button"
                                        onClick={() => openEdit(rowCor)}
                                        className="inline-flex h-7 shrink-0 items-center rounded-md border border-gray-300 bg-white px-3 text-[11px] font-medium text-gray-700 shadow-sm transition hover:bg-gray-100 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800 touch-manipulation"
                                      >
                                        Editar
                                      </button>
                                    </div>
                                  </div>

                                  <div className="mt-2 grid min-w-0 grid-cols-[auto_1fr] items-start gap-3">
                                    {mostrarFotosVariantes ? (
                                      <FotoVariacaoCell
                                        variant="stacked"
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
                                      <div className="h-24 w-24 shrink-0 rounded-lg border border-dashed border-gray-300 bg-gray-100 dark:border-neutral-700 dark:bg-neutral-800" />
                                    )}
                                    <div className="min-w-0">
                                        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-neutral-700 dark:bg-neutral-900">
                                        <div className="grid grid-cols-[5.25rem_minmax(0,1fr)_5rem] border-b border-gray-200 bg-gray-100 px-2 py-1 text-[11px] font-semibold text-gray-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400">
                                          <span>Numeração</span>
                                          <span>SKU</span>
                                          <span className="text-right">Qtd.</span>
                                        </div>
                                        {itensOrdenados.map((p, idx) => (
                                          <div key={p.id} className={`grid grid-cols-[5.25rem_minmax(0,1fr)_5rem] items-center border-b border-gray-100 px-2 py-1 text-xs last:border-b-0 dark:border-neutral-800 ${idx % 2 === 1 ? "bg-gray-100 dark:bg-neutral-800/60" : ""}`}>
                                            <span className="font-semibold text-gray-700 dark:text-neutral-300">{(p.tamanho ?? "—").toUpperCase()}</span>
                                            <span className="truncate font-mono text-gray-600 dark:text-neutral-400">{p.sku}</span>
                                            <span className={`text-right font-semibold tabular-nums ${(p.estoque_atual ?? 0) <= 0 ? "text-red-500" : "text-gray-700 dark:text-neutral-300"}`}>
                                              {p.estoque_atual != null ? p.estoque_atual : "—"}
                                            </span>
                                          </div>
                                        ))}
                                      </div>
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
                      <div className="min-w-0 border-t border-gray-200 bg-gray-100 p-2 dark:border-neutral-800 dark:bg-neutral-900 lg:hidden">
                        {linhas.map((row) => {
                          const lf = getLinkFotos(row, produtos) || row.link_fotos;
                          return (
                            <div key={row.id} className="mb-2 min-w-0 rounded-xl border border-gray-200 bg-white px-2.5 py-2 dark:border-neutral-700 dark:bg-neutral-900" onClick={(e) => e.stopPropagation()}>
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
                                      <p className="text-sm font-medium leading-snug text-gray-900 dark:text-neutral-100">
                                        <CorCelulaProduto cor={row.cor} />
                                        <span className="mx-1 text-neutral-400 dark:text-neutral-500">·</span>
                                        <span className="font-normal text-gray-500 dark:text-neutral-400">{row.tamanho || "—"}</span>
                                      </p>
                                      <p className="mt-0.5 break-all font-mono text-xs leading-tight text-gray-500 dark:text-neutral-500">{row.sku}</p>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => openEdit(row)}
                                      className="shrink-0 rounded-md border border-gray-300 px-2 py-1.5 text-[11px] font-medium text-gray-700 transition hover:bg-gray-100 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800 touch-manipulation -mr-1"
                                    >
                                      Editar
                                    </button>
                                  </div>
                                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-500 dark:text-neutral-400">
                                    <span>
                                      Custo{" "}
                                      <span className="tabular-nums font-medium text-gray-800 dark:text-neutral-200">
                                        {fmtCustoBaseFornecedor(row.custo_base)}
                                      </span>
                                    </span>
                                    <span>
                                      Estoque{" "}
                                      <span className={`tabular-nums font-medium ${(row.estoque_atual ?? 0) <= 0 ? "text-red-500" : "text-gray-800 dark:text-neutral-200"}`}>
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
                      <div className="hidden lg:block min-w-0 overflow-x-auto border-t border-neutral-100 dark:border-neutral-800">
                        <table className="w-full min-w-[700px] table-fixed text-sm">
                          <thead>
                            <tr className="bg-neutral-100 text-left text-xs text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
                              <th className="w-[4.25rem] px-2 py-2 font-medium lg:px-3">
                                <span className="block">Foto</span>
                                <span className="block text-[10px] font-normal text-neutral-400 dark:text-neutral-500">SKU</span>
                              </th>
                              <th className="w-[18%] px-2 py-2 font-medium lg:px-3">Cor</th>
                              <th className="w-[7%] px-2 py-2 font-medium lg:px-3">Tam.</th>
                              <th className="w-[20%] px-2 py-2 font-medium lg:px-3">SKU</th>
                              <th className="w-[10%] px-2 py-2 text-right font-medium lg:px-3">Custo</th>
                              <th className="w-[6%] px-2 py-2 text-right font-medium lg:px-3">Est.</th>
                              <th className="w-[9%] px-2 py-2 font-medium lg:px-3">
                                <span className="block">Fotos</span>
                                <span className="block text-[10px] font-normal text-neutral-400 dark:text-neutral-500">Álbum</span>
                              </th>
                              <th className="w-[4.5rem] px-2 py-2 text-right font-medium lg:pl-3 lg:pr-4">Ações</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                            {linhas.map((row) => {
                              const lf = getLinkFotos(row, produtos) || row.link_fotos;
                              return (
                                <tr key={row.id} className="hover:bg-neutral-100 dark:hover:bg-neutral-800">
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
                                  <td className="px-2 py-1.5 align-top break-words text-xs text-neutral-700 dark:text-neutral-300 lg:px-3">
                                    <CorCelulaProduto cor={row.cor} />
                                  </td>
                                  <td className="px-2 py-1.5 align-top text-xs text-neutral-700 dark:text-neutral-300 lg:px-3">{row.tamanho || "—"}</td>
                                  <td className="px-2 py-1.5 align-top font-mono text-[11px] leading-snug text-neutral-600 break-all dark:text-neutral-500 lg:px-3">{row.sku}</td>
                                  <td className="px-2 py-1.5 align-top text-right text-xs tabular-nums font-medium text-neutral-800 dark:text-neutral-200 lg:px-3">
                                    {fmtCustoBaseFornecedor(row.custo_base)}
                                  </td>
                                  <td className="px-2 py-1.5 align-top text-right text-xs tabular-nums text-neutral-700 dark:text-neutral-300 lg:px-3">
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
                                      <span className="text-neutral-400 dark:text-neutral-500 text-xs">—</span>
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
                          <div className="border-t border-gray-200 bg-gray-100 px-3 py-2 dark:border-neutral-800 dark:bg-neutral-900 sm:px-4">
                            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-neutral-400">
                              Resumo do cadastro
                            </p>
                          </div>
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

        <p className="text-center text-xs text-neutral-500 dark:text-neutral-400 px-1 break-words">
          <Link href="/fornecedor/dashboard" className="hover:text-neutral-600 dark:hover:text-neutral-300">Dashboard</Link>
          {" · "}
          <Link href="/" className="hover:text-neutral-600 dark:hover:text-neutral-300">Voltar ao DropCore</Link>
        </p>
      </div>

      {/* Modal Edit */}
      {modal === "edit" && editando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/50" onClick={() => !formLoading && setModal("none")}>
          <div
            className="w-full max-w-md max-h-[min(92dvh,40rem)] overflow-y-auto overscroll-contain rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-4 sm:p-6 shadow-xl min-w-0"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100 mb-4 break-words">Editar produto · {editando.sku}</h3>
            <form onSubmit={handleEdit} className="space-y-4">
              <div>
                <label className="block text-xs text-neutral-600 dark:text-neutral-400 mb-1.5">Nome do produto *</label>
                <input
                  type="text"
                  value={editNome}
                  onChange={(e) => setEditNome(e.target.value)}
                  onBlur={() => setEditNome(toTitleCase(editNome))}
                  placeholder="Ex: Camiseta Básica"
                  className="w-full rounded-lg bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-neutral-600 dark:text-neutral-400 mb-1.5">Cor</label>
                  <input
                    type="text"
                    value={editCor}
                    onChange={(e) => setEditCor(e.target.value)}
                    onBlur={() => setEditCor(toTitleCase(editCor))}
                    placeholder="Ex: Preto"
                    className="w-full rounded-lg bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-neutral-600 dark:text-neutral-400 mb-1.5">Tamanho</label>
                  <input
                    type="text"
                    value={editTamanho}
                    onChange={(e) => setEditTamanho(e.target.value)}
                    onBlur={() => setEditTamanho(editTamanho.trim().toUpperCase())}
                    placeholder="Ex: M"
                    className="w-full rounded-lg bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-neutral-600 dark:text-neutral-400 mb-1.5">Descrição</label>
                <textarea
                  value={editDescricao}
                  onChange={(e) => setEditDescricao(e.target.value)}
                  onBlur={() => setEditDescricao(toTitleCase(editDescricao))}
                  placeholder="Descrição do produto"
                  rows={2}
                  className="w-full rounded-lg bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 resize-none"
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs text-neutral-600 dark:text-neutral-400 mb-1.5">Comp (cm)</label>
                  <input
                    type="text"
                    value={editComp}
                    onChange={(e) => setEditComp(e.target.value)}
                    placeholder="—"
                    className="w-full rounded-lg bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 px-3 py-2 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-neutral-600 dark:text-neutral-400 mb-1.5">Larg (cm)</label>
                  <input
                    type="text"
                    value={editLarg}
                    onChange={(e) => setEditLarg(e.target.value)}
                    placeholder="—"
                    className="w-full rounded-lg bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 px-3 py-2 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-neutral-600 dark:text-neutral-400 mb-1.5">Alt (cm)</label>
                  <input
                    type="text"
                    value={editAlt}
                    onChange={(e) => setEditAlt(e.target.value)}
                    placeholder="—"
                    className="w-full rounded-lg bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 px-3 py-2 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-neutral-600 dark:text-neutral-400 mb-1.5">Peso (kg)</label>
                <input type="text" inputMode="decimal" value={editPeso} onChange={(e) => setEditPeso(e.target.value)} placeholder="—" className="w-full rounded-lg bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-neutral-600 dark:text-neutral-400 mb-1.5">Custo por unidade (R$)</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={editCusto}
                    onChange={(e) => setEditCusto(e.target.value)}
                    placeholder="0"
                    className="w-full rounded-lg bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-neutral-600 dark:text-neutral-400 mb-1.5">Estoque</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={editEstoque}
                    onChange={(e) => setEditEstoque(e.target.value)}
                    placeholder="0"
                    className="w-full rounded-lg bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-neutral-600 dark:text-neutral-400 mb-1.5">Link das fotos (esta variante)</label>
                <input
                  type="url"
                  value={editLinkFotos}
                  onChange={(e) => setEditLinkFotos(e.target.value)}
                  placeholder="https://drive.google.com/... ou link do Dropbox, etc."
                  className="w-full rounded-lg bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                />
                <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-1">Cada variante pode ter seu próprio link de fotos</p>
              </div>
              <div>
                <label className="block text-xs text-neutral-600 dark:text-neutral-400 mb-1.5">
                  Despacho / CD desta variante (opcional)
                </label>
                <textarea
                  value={editExpedicao}
                  onChange={(e) => setEditExpedicao(e.target.value)}
                  rows={3}
                  placeholder="Só preencha se for diferente do CD padrão no cadastro da empresa. Ex.: CD Santa Catarina + endereço completo."
                  className="w-full rounded-lg bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 resize-y min-h-[4rem]"
                />
                <p className="text-[10px] text-neutral-500 dark:text-neutral-400 mt-1 leading-snug">
                  Alterações seguem para análise da DropCore como os outros campos.
                </p>
              </div>
              {formError && <p className="text-sm text-red-400">{formError}</p>}
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => !formLoading && setModal("none")}
                  className="flex-1 rounded-lg border border-neutral-300 dark:border-neutral-600 px-4 py-2.5 text-sm text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
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
