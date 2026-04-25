"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter, useParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import Link from "next/link";
import { DropCoreLogo } from "@/components/DropCoreLogo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AlteracoesCatalogoInfoBanner } from "@/components/fornecedor/AlteracoesCatalogoInfoBanner";
import { FotoVariacaoCell } from "@/components/FotoVariacaoCell";
import { toTitleCase } from "@/lib/formatText";
import { CORES_PREDEFINIDAS, TAMANHOS_PREDEFINIDOS } from "@/lib/fornecedorVariantesUi";
import { VarianteExtrasTagInput } from "@/components/VarianteExtrasTagInput";
import { inferirTipo, getColunasTabelaMedidas } from "@/lib/tipoProduto";

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
  dimensoes_pacote: string | null;
  categoria: string | null;
  ncm?: string | null;
  origem?: string | null;
  cest?: string | null;
  cfop?: string | null;
  peso_liquido_kg?: number | null;
  peso_bruto_kg?: number | null;
  criado_em: string;
};

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

type TabId = "info-basica" | "info-variantes" | "midia" | "info-impostos" | "tabela-medidas";

const TABS: { id: TabId; label: string }[] = [
  { id: "info-basica", label: "Info. Básica" },
  { id: "info-variantes", label: "Info. de Variantes" },
  { id: "midia", label: "Mídia" },
  { id: "info-impostos", label: "Info. de impostos" },
  { id: "tabela-medidas", label: "Tabela de medidas" },
];

const inputVariante =
  "w-full rounded-lg border px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500";

function pairKeyRow(cor: string | null, tam: string | null): string {
  return `${(cor ?? "").trim().toLowerCase()}|${(tam ?? "").trim().toUpperCase()}`;
}

export default function EditarVariantesPage() {
  const router = useRouter();
  const params = useParams();
  const grupoKey = (params?.grupoKey as string) || "";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [tabAtiva, setTabAtiva] = useState<TabId>("info-variantes");
  const [formLoading, setFormLoading] = useState(false);
  const [desativarLoading, setDesativarLoading] = useState(false);
  const [editando, setEditando] = useState<Produto | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [editNome, setEditNome] = useState("");
  const [editCor, setEditCor] = useState("");
  const [editTamanho, setEditTamanho] = useState("");
  const [editLinkFotos, setEditLinkFotos] = useState("");
  const [editDescricao, setEditDescricao] = useState("");
  const [editComp, setEditComp] = useState("");
  const [editLarg, setEditLarg] = useState("");
  const [editAlt, setEditAlt] = useState("");
  const [editEstoque, setEditEstoque] = useState("");
  const [editCusto, setEditCusto] = useState("");
  const [editNomeBasico, setEditNomeBasico] = useState("");
  const [editDescricaoGrupo, setEditDescricaoGrupo] = useState("");
  const [loadingBasico, setLoadingBasico] = useState(false);
  const [editPeso, setEditPeso] = useState("");
  const [editLinkFotosGrupo, setEditLinkFotosGrupo] = useState("");
  const [editNcm, setEditNcm] = useState("");
  const [editOrigem, setEditOrigem] = useState("");
  const [editCest, setEditCest] = useState("");
  const [editCfop, setEditCfop] = useState("");
  const [editPesoLiquido, setEditPesoLiquido] = useState("");
  const [editPesoBruto, setEditPesoBruto] = useState("");
  const [loadingOutros, setLoadingOutros] = useState(false);
  const [massaComp, setMassaComp] = useState("");
  const [massaLarg, setMassaLarg] = useState("");
  const [massaAlt, setMassaAlt] = useState("");
  const [massaPeso, setMassaPeso] = useState("");
  const [massaCusto, setMassaCusto] = useState("");
  const [massaEstoque, setMassaEstoque] = useState("");
  const [loadingMassa, setLoadingMassa] = useState(false);
  const [alteracoesStatus, setAlteracoesStatus] = useState<{
    pendentes: string[];
    por_sku: Record<string, { status: "aprovado" | "rejeitado"; motivo_rejeicao?: string; analisado_em: string }>;
  }>({ pendentes: [], por_sku: {} });
  const [tabelaMedidasApi, setTabelaMedidasApi] = useState<{
    aprovada: { tipo_produto: string; medidas: Record<string, Record<string, number>> } | null;
    pendente: { tipo_produto: string; medidas: Record<string, Record<string, number>> } | null;
  } | null>(null);
  const [tabelaMedidasLoading, setTabelaMedidasLoading] = useState(false);
  const [tabelaMedidasSaving, setTabelaMedidasSaving] = useState(false);
  const [tabelaMedidasLocal, setTabelaMedidasLocal] = useState<Record<string, Record<string, number>>>({});
  const [coresSelecionadas, setCoresSelecionadas] = useState<Set<string>>(new Set());
  const [tamanhosSelecionados, setTamanhosSelecionados] = useState<Set<string>>(new Set());
  const [corCustom, setCorCustom] = useState("");
  const [tamanhoCustom, setTamanhoCustom] = useState("");
  const [loadingAddVar, setLoadingAddVar] = useState(false);
  const [excluindoId, setExcluindoId] = useState<string | null>(null);

  const grupoProdutos = useMemo(() => {
    const linhas: Produto[] = [];
    const pk = grupoKey.toUpperCase();
    for (const p of produtos) {
      if (paiKey(p.sku) === pk || p.sku === pk) linhas.push(p);
    }
    return linhas.sort((a, b) => a.sku.localeCompare(b.sku));
  }, [produtos, grupoKey]);

  const grupoVariantesSignature = useMemo(
    () => grupoProdutos.map((p) => p.id).sort().join(","),
    [grupoProdutos]
  );

  /** 1ª variante (não-pai, menor SKU) com foto — usada como miniatura do SKU pai quando ele não tem imagem. */
  const imagemUrlFallbackPai = useMemo(() => {
    const pk = grupoKey.trim().toUpperCase();
    return (
      [...grupoProdutos]
        .filter((p) => p.sku.trim().toUpperCase() !== pk && p.imagem_url)
        .sort((a, b) => a.sku.localeCompare(b.sku))[0]?.imagem_url ?? null
    );
  }, [grupoProdutos, grupoKey]);

  const coresFinais = useMemo(() => {
    const set = new Set(coresSelecionadas);
    for (const part of corCustom
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter(Boolean)) {
      set.add(toTitleCase(part));
    }
    return Array.from(set);
  }, [coresSelecionadas, corCustom]);

  const tamanhosFinais = useMemo(() => {
    const set = new Set(tamanhosSelecionados);
    for (const part of tamanhoCustom
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter(Boolean)) {
      set.add(part.toUpperCase());
    }
    return Array.from(set);
  }, [tamanhosSelecionados, tamanhoCustom]);

  const combinacoesAnuncio = useMemo(() => {
    const out: { cor: string; tamanho: string }[] = [];
    if (coresFinais.length > 0 && tamanhosFinais.length > 0) {
      for (const cor of coresFinais) {
        for (const tam of tamanhosFinais) {
          out.push({ cor, tamanho: tam });
        }
      }
    } else if (coresFinais.length > 0) {
      for (const cor of coresFinais) {
        out.push({ cor, tamanho: "" });
      }
    } else if (tamanhosFinais.length > 0) {
      for (const tam of tamanhosFinais) {
        out.push({ cor: "", tamanho: tam });
      }
    }
    return out;
  }, [coresFinais, tamanhosFinais]);

  const paresExistentesGrupo = useMemo(() => {
    const set = new Set<string>();
    const pk = grupoKey.toUpperCase();
    for (const p of grupoProdutos) {
      if (p.sku === pk) continue;
      set.add(pairKeyRow(p.cor, p.tamanho));
    }
    return set;
  }, [grupoProdutos, grupoKey]);

  const faltantesAnuncio = useMemo(() => {
    return combinacoesAnuncio.filter((c) => {
      const cor = c.cor.trim() ? toTitleCase(c.cor) : null;
      const tam = c.tamanho.trim() ? c.tamanho.toUpperCase() : null;
      return !paresExistentesGrupo.has(pairKeyRow(cor, tam));
    }).length;
  }, [combinacoesAnuncio, paresExistentesGrupo]);

  useEffect(() => {
    if (grupoProdutos.length === 0 || !grupoVariantesSignature) return;
    const coresUnicas = [...new Set(grupoProdutos.map((p) => (p.cor ?? "").trim()).filter(Boolean))];
    const tamsUnicos = [...new Set(grupoProdutos.map((p) => (p.tamanho ?? "").trim()).filter(Boolean))];
    const newCores = new Set<string>();
    const customC: string[] = [];
    for (const u of coresUnicas) {
      const pre = CORES_PREDEFINIDAS.find((c) => c.toLowerCase() === u.toLowerCase());
      if (pre) newCores.add(pre);
      else customC.push(u);
    }
    setCoresSelecionadas(newCores);
    setCorCustom(customC.join(", "));
    const newTams = new Set<string>();
    const customT: string[] = [];
    for (const u of tamsUnicos) {
      const pre = TAMANHOS_PREDEFINIDOS.find((t) => t.toUpperCase() === u.toUpperCase());
      if (pre) newTams.add(pre);
      else customT.push(u);
    }
    setTamanhosSelecionados(newTams);
    setTamanhoCustom(customT.join(", "));
  }, [grupoVariantesSignature]);

  function toggleCor(cor: string) {
    setCoresSelecionadas((prev) => {
      const next = new Set(prev);
      if (next.has(cor)) next.delete(cor);
      else next.add(cor);
      return next;
    });
  }

  function toggleTamanho(tam: string) {
    setTamanhosSelecionados((prev) => {
      const next = new Set(prev);
      if (next.has(tam)) next.delete(tam);
      else next.add(tam);
      return next;
    });
  }

  /** Remove o chip e coloca o texto no campo de extras para editar (ex.: Verde → Verde militar). */
  function moverCorParaCampoExtras(cor: string) {
    setCoresSelecionadas((prev) => {
      const next = new Set(prev);
      next.delete(cor);
      return next;
    });
    setCorCustom((prev) => {
      const parts = prev
        .split(/[,;]/)
        .map((s) => s.trim())
        .filter(Boolean);
      const lower = new Set(parts.map((p) => p.toLowerCase()));
      if (!lower.has(cor.toLowerCase())) parts.unshift(cor);
      return parts.join(", ");
    });
  }

  function moverTamanhoParaCampoExtras(tam: string) {
    setTamanhosSelecionados((prev) => {
      const next = new Set(prev);
      next.delete(tam);
      return next;
    });
    setTamanhoCustom((prev) => {
      const parts = prev
        .split(/[,;]/)
        .map((s) => s.trim())
        .filter(Boolean);
      const upper = new Set(parts.map((p) => p.toUpperCase()));
      if (!upper.has(tam.toUpperCase())) parts.unshift(tam);
      return parts.join(", ");
    });
  }

  const representante = grupoProdutos[0];
  const nomeProduto = representante?.nome_produto ?? grupoKey;
  const categoriaAtiva = grupoProdutos.some((p) => (p.status || "").toLowerCase() === "ativo");
  const tipoProduto = useMemo(
    () => inferirTipo(nomeProduto, representante?.categoria ?? null),
    [nomeProduto, representante?.categoria]
  );
  const colunasTabelaMedidas = useMemo(() => getColunasTabelaMedidas(tipoProduto), [tipoProduto]);
  const tamanhosOrdenados = useMemo(() => {
    const set = new Set<string>();
    for (const p of grupoProdutos) {
      const t = (p.tamanho ?? "").trim().toUpperCase();
      if (t) set.add(t);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [grupoProdutos]);

  const dirtyBasico = useMemo(() => {
    if (!representante) return false;
    return editNomeBasico !== (representante.nome_produto ?? "") || editDescricaoGrupo !== (representante.descricao ?? "");
  }, [representante?.nome_produto, representante?.descricao, editNomeBasico, editDescricaoGrupo]);

  const dirtyMidia = useMemo(() => {
    if (!representante) return false;
    return editLinkFotosGrupo !== (representante.link_fotos ?? "");
  }, [representante?.link_fotos, editLinkFotosGrupo]);

  const dirtyImpostos = useMemo(() => {
    if (!representante) return false;
    return (
      (editNcm ?? "") !== (representante.ncm ?? "") ||
      (editOrigem ?? "") !== (representante.origem ?? "") ||
      (editCest ?? "") !== (representante.cest ?? "") ||
      (editCfop ?? "") !== (representante.cfop ?? "") ||
      (editPesoLiquido ?? "") !== (representante.peso_liquido_kg != null ? String(representante.peso_liquido_kg) : "") ||
      (editPesoBruto ?? "") !== (representante.peso_bruto_kg != null ? String(representante.peso_bruto_kg) : "")
    );
  }, [representante?.ncm, representante?.origem, representante?.cest, representante?.cfop, representante?.peso_liquido_kg, representante?.peso_bruto_kg, editNcm, editOrigem, editCest, editCfop, editPesoLiquido, editPesoBruto]);

  const dirtyModal = useMemo(() => {
    if (!editando) return false;
    return (
      (editNome ?? "") !== (editando.nome_produto ?? "") ||
      (editCor ?? "") !== (editando.cor ?? "") ||
      (editTamanho ?? "") !== (editando.tamanho ?? "") ||
      (editLinkFotos ?? "") !== (editando.link_fotos ?? "") ||
      (editDescricao ?? "") !== (editando.descricao ?? "") ||
      (editComp ?? "") !== (editando.comprimento_cm != null ? String(editando.comprimento_cm) : "") ||
      (editLarg ?? "") !== (editando.largura_cm != null ? String(editando.largura_cm) : "") ||
      (editAlt ?? "") !== (editando.altura_cm != null ? String(editando.altura_cm) : "") ||
      (editPeso ?? "") !== (editando.peso_kg != null ? String(editando.peso_kg) : "") ||
      (editCusto ?? "") !== (editando.custo_base != null ? String(editando.custo_base) : "") ||
      (editEstoque ?? "") !== (editando.estoque_atual != null ? String(editando.estoque_atual) : "")
    );
  }, [editando, editNome, editCor, editTamanho, editLinkFotos, editDescricao, editComp, editLarg, editAlt, editPeso, editCusto, editEstoque]);

  async function handleDesativarCategoria() {
    setDesativarLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) throw new Error("Sessão expirada.");
      const acao = categoriaAtiva ? "desativar" : "ativar";
      const res = await fetch("/api/fornecedor/produtos/desativar-categoria", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ grupoKey, acao }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? `Erro ao ${acao}.`);
      load();
      if (acao === "desativar") router.push("/fornecedor/produtos");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro inesperado.");
    } finally {
      setDesativarLoading(false);
    }
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
      const headers = { Authorization: `Bearer ${session.access_token}` };
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
        setAlteracoesStatus({ pendentes: statusData.pendentes ?? [], por_sku: statusData.por_sku ?? {} });
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro inesperado.");
    } finally {
      setLoading(false);
    }
  }

  const statusAlteracaoEditar = useMemo((): "pendente" | "aprovado" | "rejeitado" | null => {
    const ids = grupoProdutos.map((p) => p.id);
    if (ids.some((id) => alteracoesStatus.pendentes.includes(id))) return "pendente";
    let ultimo: { status: "aprovado" | "rejeitado"; motivo_rejeicao?: string; analisado_em: string } | null = null;
    for (const id of ids) {
      const r = alteracoesStatus.por_sku[id];
      if (r && (!ultimo || (r.analisado_em && r.analisado_em > ultimo.analisado_em))) ultimo = r;
    }
    return ultimo?.status ?? null;
  }, [grupoProdutos, alteracoesStatus]);

  const motivoRejeicaoEditar = useMemo((): string | null => {
    const ids = grupoProdutos.map((p) => p.id);
    let ultimo: { motivo_rejeicao?: string; analisado_em: string } | null = null;
    for (const id of ids) {
      const r = alteracoesStatus.por_sku[id];
      if (r?.status === "rejeitado" && (!ultimo || (r.analisado_em && r.analisado_em > ultimo.analisado_em)))
        ultimo = r;
    }
    return ultimo?.motivo_rejeicao ?? null;
  }, [grupoProdutos, alteracoesStatus]);

  useEffect(() => {
    if (grupoKey) load();
  }, [grupoKey]);

  async function loadTabelaMedidas() {
    if (!grupoKey) return;
    setTabelaMedidasLoading(true);
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch(
        `/api/fornecedor/produtos/tabela-medidas?grupoKey=${encodeURIComponent(grupoKey)}`,
        { headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store" }
      );
      if (!res.ok) return;
      const data = await res.json();
      setTabelaMedidasApi({
        aprovada: data.aprovada ?? null,
        pendente: data.pendente ?? null,
      });
    } finally {
      setTabelaMedidasLoading(false);
    }
  }

  useEffect(() => {
    if (tabAtiva === "tabela-medidas" && grupoKey) loadTabelaMedidas();
  }, [tabAtiva, grupoKey]);

  useEffect(() => {
    if (tabAtiva !== "tabela-medidas" || !tamanhosOrdenados.length) return;
    const fonte = tabelaMedidasApi?.pendente ?? tabelaMedidasApi?.aprovada ?? null;
    const medidas = fonte?.medidas ?? {};
    const next: Record<string, Record<string, number>> = {};
    for (const tam of tamanhosOrdenados) {
      next[tam] = { ...(medidas[tam] ?? {}) };
    }
    setTabelaMedidasLocal(next);
  }, [tabAtiva, tamanhosOrdenados, tabelaMedidasApi]);

  useEffect(() => {
    if (!representante) return;
    if (tabAtiva === "info-basica") {
      setEditNomeBasico(representante.nome_produto ?? "");
      setEditDescricaoGrupo(representante.descricao ?? "");
    }
    if (tabAtiva === "midia") setEditLinkFotosGrupo(representante.link_fotos ?? "");
    if (tabAtiva === "info-impostos") {
      setEditNcm(representante.ncm ?? "");
      setEditOrigem(representante.origem ?? "");
      setEditCest(representante.cest ?? "");
      setEditCfop(representante.cfop ?? "");
      setEditPesoLiquido(representante.peso_liquido_kg != null ? String(representante.peso_liquido_kg) : "");
      setEditPesoBruto(representante.peso_bruto_kg != null ? String(representante.peso_bruto_kg) : "");
    }
  }, [tabAtiva, representante?.id, representante?.nome_produto, representante?.descricao, representante?.link_fotos, representante?.ncm, representante?.origem, representante?.cest, representante?.cfop, representante?.peso_liquido_kg, representante?.peso_bruto_kg]);

  async function salvarTab(extra: Record<string, unknown>) {
    if (!representante) return;
    setLoadingOutros(true);
    setFormError(null);
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) throw new Error("Sessão expirada.");
      const res = await fetch(`/api/fornecedor/produtos/${representante.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify(extra),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? "Erro ao salvar.");
      setSuccessMessage(j?.mensagem ?? "Enviado para análise. O admin verá em Alterações de produtos.");
      setTimeout(() => setSuccessMessage(null), 4000);
      load();
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setLoadingOutros(false);
    }
  }

  async function salvarTabelaMedidas(e: React.FormEvent) {
    e.preventDefault();
    if (!representante) return;
    setTabelaMedidasSaving(true);
    setFormError(null);
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) throw new Error("Sessão expirada.");
      const res = await fetch(`/api/fornecedor/produtos/${representante.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          tabela_medidas: {
            tipo_produto: tipoProduto,
            medidas: tabelaMedidasLocal,
          },
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? "Erro ao salvar.");
      setSuccessMessage(j?.mensagem ?? "Enviado para análise.");
      setTimeout(() => setSuccessMessage(null), 4000);
      load();
      loadTabelaMedidas();
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setTabelaMedidasSaving(false);
    }
  }

  async function handleSalvarInfoBasica(e: React.FormEvent) {
    e.preventDefault();
    if (!representante) return;
    setLoadingBasico(true);
    setFormError(null);
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) throw new Error("Sessão expirada.");
      const res = await fetch(`/api/fornecedor/produtos/${representante.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
        nome_produto: editNomeBasico.trim() || null,
        descricao: editDescricaoGrupo.trim() || null,
      }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? "Erro ao salvar.");
      setSuccessMessage(j?.mensagem ?? "Enviado para análise. O admin verá em Alterações de produtos.");
      setTimeout(() => setSuccessMessage(null), 4000);
      load();
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setLoadingBasico(false);
    }
  }

  async function handleExcluirVariante(row: Produto) {
    const rotulo = [row.cor, row.tamanho].filter(Boolean).join(" · ") || row.sku;
    if (!window.confirm(`Excluir a variante ${row.sku} (${rotulo})? Esta ação não pode ser desfeita.`)) return;
    setFormError(null);
    setExcluindoId(row.id);
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) throw new Error("Sessão expirada.");
      const res = await fetch(`/api/fornecedor/produtos/${row.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string; mensagem?: string };
      if (!res.ok) throw new Error(j?.error ?? "Erro ao excluir.");
      setSuccessMessage(typeof j?.mensagem === "string" ? j.mensagem : "Variante excluída do catálogo.");
      setTimeout(() => setSuccessMessage(null), 4000);
      if (editando?.id === row.id) setEditando(null);
      await load();
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : "Erro ao excluir.");
    } finally {
      setExcluindoId(null);
    }
  }

  function openEdit(p: Produto) {
    setEditando(p);
    setEditNome(p.nome_produto ?? "");
    setEditCor(p.cor ?? "");
    setEditTamanho(p.tamanho ?? "");
    setEditLinkFotos(p.link_fotos ?? "");
    setEditDescricao(p.descricao ?? "");
    setEditComp(p.comprimento_cm != null ? String(p.comprimento_cm) : "");
    setEditLarg(p.largura_cm != null ? String(p.largura_cm) : "");
    setEditAlt(p.altura_cm != null ? String(p.altura_cm) : "");
    setEditPeso(p.peso_kg != null ? String(p.peso_kg) : "");
    setEditCusto(p.custo_base != null ? String(p.custo_base) : "");
    setEditEstoque(p.estoque_atual != null ? String(p.estoque_atual) : "");
    setFormError(null);
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
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? "Erro ao salvar.");
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

  async function handleMassa() {
    const comp = massaComp.trim();
    const larg = massaLarg.trim();
    const alt = massaAlt.trim();
    const peso = massaPeso.trim();
    const custo = massaCusto.trim();
    const estoque = massaEstoque.trim();
    const temAlgo = comp || larg || alt || peso || custo || estoque;
    if (!temAlgo) {
      setFormError("Preencha pelo menos um campo para aplicar em massa.");
      return;
    }
    setFormError(null);
    setLoadingMassa(true);
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) throw new Error("Sessão expirada.");
      const body: Record<string, unknown> = {};
      if (comp) body.comprimento_cm = comp;
      if (larg) body.largura_cm = larg;
      if (alt) body.altura_cm = alt;
      if (peso) body.peso_kg = peso;
      if (custo) body.custo_base = custo;
      if (estoque) body.estoque_atual = estoque;
      const results = await Promise.all(
        grupoProdutos.map((p) =>
          fetch(`/api/fornecedor/produtos/${p.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
            body: JSON.stringify(body),
          }).then((r) => r.json().then((j) => ({ ok: r.ok, error: j?.error })))
        )
      );
      const failed = results.find((r) => !r.ok);
      if (failed) throw new Error(failed.error ?? "Erro ao aplicar.");
      setSuccessMessage("Alterações enviadas para análise. O admin verá em Alterações de produtos.");
      setTimeout(() => setSuccessMessage(null), 4000);
      load();
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : "Erro ao aplicar em massa.");
    } finally {
      setLoadingMassa(false);
    }
  }

  async function handleAdicionarVariantesFaltantes() {
    if (faltantesAnuncio === 0) return;
    setLoadingAddVar(true);
    setFormError(null);
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) throw new Error("Sessão expirada.");
      const res = await fetch("/api/fornecedor/produtos/grupo-adicionar-variantes", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          grupoKey: grupoKey.toUpperCase(),
          cores: coresFinais,
          tamanhos: tamanhosFinais,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? "Erro ao adicionar variantes.");
      const n = typeof j.adicionados === "number" ? j.adicionados : 0;
      setSuccessMessage(n > 0 ? `${n} variante(s) adicionada(s) ao catálogo.` : (j.message ?? "Nada a adicionar."));
      setTimeout(() => setSuccessMessage(null), 5000);
      await load();
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : "Erro ao adicionar variantes.");
    } finally {
      setLoadingAddVar(false);
    }
  }

  if (loading && grupoProdutos.length === 0) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
        <p className="text-neutral-600 dark:text-neutral-400 text-sm">Carregando...</p>
      </div>
    );
  }

  if (!grupoKey || grupoProdutos.length === 0) {
    return (
      <div className="min-h-screen bg-[var(--background)] p-4">
        <div className="max-w-2xl mx-auto text-center py-12">
          <p className="text-neutral-600 dark:text-neutral-400 text-sm">Produto não encontrado.</p>
          <Link href="/fornecedor/produtos" className="text-blue-600 dark:text-blue-400 hover:underline text-sm mt-2 inline-block">
            Voltar aos produtos
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen min-w-0 max-w-[100%] overflow-x-hidden bg-[var(--background)] text-[var(--foreground)]">
      {/* Header */}
      <div className="bg-[var(--card)] border-b border-[var(--card-border)] sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-3 sm:px-6 py-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 min-w-0">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 min-w-0">
            <DropCoreLogo variant="horizontal" href="/fornecedor/dashboard" className="shrink-0" />
            <ThemeToggle className="shrink-0" />
            <Link
              href="/fornecedor/produtos"
              className="flex items-center gap-2 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white shrink-0"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              <span className="text-sm">Voltar</span>
            </Link>
            <h1 className="text-sm sm:text-base font-semibold text-neutral-900 dark:text-neutral-100 min-w-0 flex-1 basis-full sm:basis-auto flex flex-wrap items-center gap-2">
              <span className="break-words">Produtos do Armazém / Editar Variantes</span>
              {statusAlteracaoEditar === "pendente" && (
                <span className="shrink-0 px-2 py-0.5 rounded text-xs font-medium bg-blue-100 dark:bg-blue-950/40 text-blue-800 dark:text-blue-300" title="Alteração aguardando aprovação do admin">
                  Em análise
                </span>
              )}
              {statusAlteracaoEditar === "aprovado" && (
                <span className="shrink-0 px-2 py-0.5 rounded text-xs font-medium bg-green-100 dark:bg-green-950/40 text-green-800 dark:text-green-300">
                  Aprovado
                </span>
              )}
              {statusAlteracaoEditar === "rejeitado" && (
                <span className="shrink-0 px-2 py-0.5 rounded text-xs font-medium bg-red-100 dark:bg-red-950/40 text-red-800 dark:text-red-300" title={motivoRejeicaoEditar ? `Motivo: ${motivoRejeicaoEditar}` : undefined}>
                  Recusado
                </span>
              )}
            </h1>
          </div>
          <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-stretch sm:justify-end">
            <button
              type="button"
              onClick={handleDesativarCategoria}
              disabled={desativarLoading}
              className={`flex-1 sm:flex-none rounded-lg px-3 sm:px-4 py-2 text-sm font-medium transition touch-manipulation ${
                categoriaAtiva
                  ? "border border-red-300 dark:border-red-700 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/40"
                  : "border border-green-300 dark:border-green-700 text-green-700 dark:text-green-300 hover:bg-green-50 dark:hover:bg-green-950/40"
              } disabled:opacity-60`}
            >
              {desativarLoading ? "..." : categoriaAtiva ? "Desativar categoria" : "Ativar categoria"}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-3 sm:px-6 mt-3">
        <AlteracoesCatalogoInfoBanner />
      </div>

      {error && (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 mt-4">
          <div className="rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/30 p-3 text-sm text-red-800 dark:text-red-300">
            {error}
            <button onClick={load} className="ml-2 underline">Tentar novamente</button>
          </div>
        </div>
      )}
      {successMessage && (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 mt-4">
          <div className="rounded-lg border border-green-300 dark:border-green-800 bg-green-50 dark:bg-green-950/30 p-3 text-sm text-green-800 dark:text-green-300">
            {successMessage}
          </div>
        </div>
      )}

      {statusAlteracaoEditar === "pendente" && (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 mt-4">
          <div className="rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 p-4 text-sm text-amber-900 dark:text-amber-200">
            <strong>Alteração em análise.</strong> O admin ainda não aprovou. O <strong>seller e o ERP</strong> seguem com os dados <strong>já aprovados</strong> até essa análise fechar. Você pode <strong>ajustar e salvar de novo</strong> — a última versão enviada é a que o DropCore analisa em Alterações de produtos.
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto px-3 sm:px-6 py-4 flex flex-col lg:flex-row gap-6 min-w-0">
        {/* Área principal */}
        <div className="flex-1 min-w-0 order-2 lg:order-1">
          {tabAtiva === "info-variantes" && (
            <>
            <div className="bg-[var(--card)] rounded-xl border border-[var(--card-border)] shadow-sm p-6 space-y-6 mb-6">
              <div>
                <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 mb-1">Informações de Variantes</h2>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  Mesmo fluxo do anúncio novo: marque cores e tamanhos, use os campos extras para nomes personalizados. Depois confira a lista — combinações novas podem ser geradas no catálogo.
                </p>
              </div>
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-2">Cor</p>
                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mb-2">
                    Marque a caixa para usar o nome padrão. Para <strong>ajustar um nome já marcado</strong> (ex.: Verde → Verde militar), clique no{" "}
                    <span className="text-neutral-600 dark:text-neutral-300">nome da cor</span> — ele vai para o campo abaixo para você editar.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {CORES_PREDEFINIDAS.map((cor) => (
                      <div
                        key={cor}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-600 hover:bg-neutral-50 dark:hover:bg-neutral-800"
                      >
                        <input
                          id={`edit-pref-cor-${cor}`}
                          type="checkbox"
                          checked={coresSelecionadas.has(cor)}
                          onChange={() => toggleCor(cor)}
                          className="rounded border-neutral-300 dark:border-neutral-600 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            moverCorParaCampoExtras(cor);
                          }}
                          className="text-sm text-neutral-900 dark:text-neutral-100 hover:text-blue-600 dark:hover:text-blue-400 underline decoration-dotted underline-offset-2 cursor-pointer bg-transparent border-0 p-0 font-normal text-left"
                          title="Levar ao campo de extras para editar o nome (ex.: Verde → Verde militar)"
                        >
                          {cor}
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2">
                    <VarianteExtrasTagInput
                      value={corCustom}
                      onChange={setCorCustom}
                      normalize="title"
                      placeholder="Ex.: Azul Royal"
                      aria-label="Cores extras ou personalizadas"
                      showHint={false}
                    />
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-2">Tamanho</p>
                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mb-2">
                    O mesmo vale para tamanho: clique no <span className="text-neutral-600 dark:text-neutral-300">rótulo</span> para levar ao campo e personalizar (ex.: G → GG especial).
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {TAMANHOS_PREDEFINIDOS.map((tam) => (
                      <div
                        key={tam}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-600 hover:bg-neutral-50 dark:hover:bg-neutral-800"
                      >
                        <input
                          id={`edit-pref-tam-${tam}`}
                          type="checkbox"
                          checked={tamanhosSelecionados.has(tam)}
                          onChange={() => toggleTamanho(tam)}
                          className="rounded border-neutral-300 dark:border-neutral-600 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            moverTamanhoParaCampoExtras(tam);
                          }}
                          className="text-sm text-neutral-900 dark:text-neutral-100 hover:text-blue-600 dark:hover:text-blue-400 underline decoration-dotted underline-offset-2 cursor-pointer bg-transparent border-0 p-0 font-normal text-left"
                          title="Levar ao campo de extras para editar o tamanho"
                        >
                          {tam}
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2">
                    <VarianteExtrasTagInput
                      value={tamanhoCustom}
                      onChange={setTamanhoCustom}
                      normalize="upper"
                      placeholder="Ex.: 42"
                      aria-label="Tamanhos extras ou personalizados"
                      showHint={false}
                    />
                  </div>
                </div>
              </div>
              {combinacoesAnuncio.length > 0 && (
                <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 overflow-hidden">
                  <div className="px-3 py-2 bg-neutral-50 dark:bg-neutral-800/50 text-xs font-medium text-neutral-600 dark:text-neutral-400">
                    Lista de combinações ({combinacoesAnuncio.length}) · {faltantesAnuncio > 0 ? `${faltantesAnuncio} nova(s)` : "todas já no catálogo"}
                  </div>
                  <div className="max-h-64 overflow-y-auto min-w-0">
                    <table className="w-full min-w-0 text-sm table-fixed">
                      <thead>
                        <tr className="bg-neutral-50 dark:bg-neutral-800/50 text-left border-b border-neutral-100 dark:border-neutral-700">
                          <th className="px-3 py-2 font-medium">Cor</th>
                          <th className="px-3 py-2 font-medium">Tamanho</th>
                          <th className="px-3 py-2 font-medium">Situação</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                        {combinacoesAnuncio.map((c, i) => {
                          const corN = c.cor.trim() ? toTitleCase(c.cor.trim()) : null;
                          const tamN = c.tamanho.trim() ? c.tamanho.trim().toUpperCase() : null;
                          const jaCad = paresExistentesGrupo.has(pairKeyRow(corN, tamN));
                          return (
                            <tr key={i} className="hover:bg-neutral-50/50 dark:hover:bg-neutral-800/50">
                              <td className="px-3 py-2 text-neutral-700 dark:text-neutral-300">{c.cor || "—"}</td>
                              <td className="px-3 py-2 text-neutral-700 dark:text-neutral-300">{c.tamanho || "—"}</td>
                              <td className="px-3 py-2">
                                {jaCad ? (
                                  <span className="text-emerald-600 dark:text-emerald-400 text-xs font-medium">Já cadastrada</span>
                                ) : (
                                  <span className="text-amber-600 dark:text-amber-400 text-xs font-medium">Nova — será criada ao adicionar</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              {faltantesAnuncio > 0 && (
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={handleAdicionarVariantesFaltantes}
                    disabled={loadingAddVar}
                    className="rounded-lg bg-blue-600 text-white font-medium px-4 py-2 text-sm hover:bg-blue-700 disabled:opacity-60"
                  >
                    {loadingAddVar ? "Adicionando..." : `Adicionar ${faltantesAnuncio} variante(s) ao catálogo`}
                  </button>
                  <span className="text-xs text-neutral-500 dark:text-neutral-400">Novos SKUs são criados com os mesmos dados base do produto (nome, dimensões, etc.).</span>
                </div>
              )}
            </div>
            <div className="bg-[var(--card)] rounded-xl border border-[var(--card-border)] shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-neutral-100 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-800/50 space-y-3">
                <p className="text-xs text-neutral-500 dark:text-neutral-400">Tabela por SKU: dimensões, preço e estoque. Use <strong>Editar</strong> na linha para cor/tamanho (como no anúncio) ou Editar em massa abaixo.</p>
                <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                  O envio vai para <strong>análise</strong>; a tabela passa a mostrar o que você enviou até o admin aprovar no catálogo oficial.
                </p>
                <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap sm:items-end sm:gap-3 min-w-0">
                  <div className="min-w-0 sm:w-16">
                    <label className="block text-[10px] text-neutral-500 dark:text-neutral-400 mb-0.5">Comp</label>
                    <input type="text" inputMode="decimal" value={massaComp} onChange={(e) => setMassaComp(e.target.value)} placeholder="—" className="w-full rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-2 py-1.5 text-sm min-w-0" />
                  </div>
                  <div className="min-w-0 sm:w-16">
                    <label className="block text-[10px] text-neutral-500 dark:text-neutral-400 mb-0.5">Larg</label>
                    <input type="text" inputMode="decimal" value={massaLarg} onChange={(e) => setMassaLarg(e.target.value)} placeholder="—" className="w-full rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-2 py-1.5 text-sm min-w-0" />
                  </div>
                  <div className="min-w-0 sm:w-16">
                    <label className="block text-[10px] text-neutral-500 dark:text-neutral-400 mb-0.5">Alt</label>
                    <input type="text" inputMode="decimal" value={massaAlt} onChange={(e) => setMassaAlt(e.target.value)} placeholder="—" className="w-full rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-2 py-1.5 text-sm min-w-0" />
                  </div>
                  <div className="min-w-0 sm:w-16">
                    <label className="block text-[10px] text-neutral-500 dark:text-neutral-400 mb-0.5">Peso</label>
                    <input type="text" inputMode="decimal" value={massaPeso} onChange={(e) => setMassaPeso(e.target.value)} placeholder="—" className="w-full rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-2 py-1.5 text-sm min-w-0" />
                  </div>
                  <div className="min-w-0 col-span-2 sm:col-span-1 sm:w-20">
                    <label className="block text-[10px] text-neutral-500 dark:text-neutral-400 mb-0.5">Preço (R$)</label>
                    <input type="text" inputMode="decimal" value={massaCusto} onChange={(e) => setMassaCusto(e.target.value)} placeholder="—" className="w-full rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-2 py-1.5 text-sm min-w-0" />
                  </div>
                  <div className="min-w-0 sm:w-20">
                    <label className="block text-[10px] text-neutral-500 dark:text-neutral-400 mb-0.5">Estoque</label>
                    <input type="text" inputMode="numeric" value={massaEstoque} onChange={(e) => setMassaEstoque(e.target.value)} placeholder="—" className="w-full rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-2 py-1.5 text-sm min-w-0" />
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button type="button" onClick={handleMassa} disabled={loadingMassa} className="rounded-lg bg-blue-600 text-white font-medium px-4 py-2 text-sm hover:bg-blue-700 disabled:opacity-60">Editar em massa</button>
                  {formError && <p className="text-sm text-red-400">{formError}</p>}
                </div>
              </div>
              <>
                <div className="lg:hidden divide-y divide-neutral-100 dark:divide-neutral-800 min-w-0 border-t border-neutral-100 dark:border-neutral-800 bg-neutral-50/40 dark:bg-neutral-900/20">
                  {grupoProdutos.map((row) => {
                    const lf = getLinkFotos(row, produtos) || row.link_fotos;
                    const pk = grupoKey.trim().toUpperCase();
                    const ehPai = row.sku.trim().toUpperCase() === pk;
                    const temFilhos = grupoProdutos.some((p) => p.sku.trim().toUpperCase() !== pk);
                    const showExcluir = !(ehPai && temFilhos);
                    return (
                      <div key={row.id} className="px-2.5 py-2 min-w-0">
                        <div className="flex gap-2.5 min-w-0 items-start">
                          <FotoVariacaoCell
                            variant="stacked"
                            skuId={row.id}
                            imagemUrl={row.imagem_url ?? null}
                            fallbackImagemUrl={ehPai && !row.imagem_url ? imagemUrlFallbackPai : null}
                            onUpdate={async (url) => {
                              setProdutos((prev) =>
                                prev.map((p) => (p.id === row.id ? { ...p, imagem_url: url } : p))
                              );
                              const corNorm = (row.cor ?? "").trim().toLowerCase();
                              const mesmaCor = grupoProdutos.filter(
                                (p) => (p.cor ?? "").trim().toLowerCase() === corNorm
                              );
                              const primeiroDaCor = [...mesmaCor].sort((a, b) => a.sku.localeCompare(b.sku))[0];
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
                                    load();
                                  }
                                }
                              }
                            }}
                            getToken={async () => {
                              const { data } = await supabaseBrowser.auth.getSession();
                              return data.session?.access_token ?? null;
                            }}
                          />
                          <div className="min-w-0 flex-1 space-y-1.5 pt-0.5">
                            <div className="flex items-start justify-between gap-2 min-w-0">
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium leading-snug text-neutral-900 dark:text-neutral-100">
                                  <span>{row.cor || "—"}</span>
                                  <span className="text-neutral-400 dark:text-neutral-500 mx-1">·</span>
                                  <span className="text-neutral-600 dark:text-neutral-400 font-normal">{row.tamanho || "—"}</span>
                                </p>
                                <p className="font-mono text-[10px] text-neutral-500 dark:text-neutral-500 break-all leading-tight mt-0.5">{row.sku}</p>
                              </div>
                              <div className="-mr-1 flex shrink-0 items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => openEdit(row)}
                                  className="rounded-md px-2 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/40 touch-manipulation"
                                >
                                  Editar
                                </button>
                                {showExcluir ? (
                                  <button
                                    type="button"
                                    onClick={() => handleExcluirVariante(row)}
                                    disabled={excluindoId === row.id}
                                    className="rounded-md px-2 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30 touch-manipulation disabled:opacity-50"
                                  >
                                    {excluindoId === row.id ? "..." : "Excluir"}
                                  </button>
                                ) : null}
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[11px] text-neutral-600 dark:text-neutral-300">
                              <span>Preço</span>
                              <span className="tabular-nums text-right font-medium">
                                {row.custo_base != null ? `R$ ${Number(row.custo_base).toFixed(2)}` : "—"}
                              </span>
                              <span>Estoque</span>
                              <span className="tabular-nums text-right">{row.estoque_atual != null ? row.estoque_atual : "—"}</span>
                            </div>
                            <div className="grid grid-cols-4 gap-x-1 gap-y-0.5 text-[10px] text-neutral-500 dark:text-neutral-400">
                              <span title="Comprimento">C</span>
                              <span className="tabular-nums text-right">{row.comprimento_cm != null ? row.comprimento_cm : "—"}</span>
                              <span title="Largura">L</span>
                              <span className="tabular-nums text-right">{row.largura_cm != null ? row.largura_cm : "—"}</span>
                              <span title="Altura">A</span>
                              <span className="tabular-nums text-right">{row.altura_cm != null ? row.altura_cm : "—"}</span>
                              <span title="Peso">Kg</span>
                              <span className="tabular-nums text-right">{row.peso_kg != null ? row.peso_kg : "—"}</span>
                            </div>
                            {lf ? (
                              <a
                                href={lf}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-block text-[11px] font-medium text-blue-600 dark:text-blue-400 underline underline-offset-2 break-all"
                              >
                                Link fotos
                              </a>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="hidden min-w-0 overflow-x-auto border-t border-neutral-100 dark:border-neutral-800 lg:block">
                  <table className="w-full min-w-[720px] table-fixed text-sm">
                    <thead>
                      <tr className="border-b border-neutral-100 bg-neutral-50 text-left text-xs text-neutral-600 dark:border-neutral-700 dark:bg-neutral-800/50 dark:text-neutral-400">
                        <th className="w-[5.5rem] px-2 py-2 font-medium align-middle lg:px-3">Foto</th>
                        <th className="w-[16%] px-2 py-2 font-medium align-middle lg:px-3">Cor</th>
                        <th className="w-[8%] px-2 py-2 font-medium lg:px-3">Tam.</th>
                        <th className="w-[18%] px-2 py-2 font-medium lg:px-3">SKU</th>
                        <th className="w-[9%] px-2 py-2 text-right font-medium lg:px-3">Preço</th>
                        <th className="w-[7%] px-2 py-2 text-right font-medium lg:px-3">Est.</th>
                        <th className="w-[6%] px-2 py-2 text-right font-medium lg:px-3" title="Comprimento (cm)">C</th>
                        <th className="w-[6%] px-2 py-2 text-right font-medium lg:px-3" title="Largura (cm)">L</th>
                        <th className="w-[6%] px-2 py-2 text-right font-medium lg:px-3" title="Altura (cm)">A</th>
                        <th className="w-[7%] px-2 py-2 text-right font-medium lg:px-3" title="Peso (kg)">Kg</th>
                        <th className="min-w-0 px-2 py-2 font-medium lg:px-3">Fotos</th>
                        <th className="w-[5.5rem] px-2 py-2 text-right font-medium lg:px-3">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                      {grupoProdutos.map((row) => {
                        const lf = getLinkFotos(row, produtos) || row.link_fotos;
                        const pkTable = grupoKey.trim().toUpperCase();
                        const ehPaiRow = row.sku.trim().toUpperCase() === pkTable;
                        return (
                          <tr key={row.id} className="hover:bg-neutral-50/50 dark:hover:bg-neutral-800/50">
                            <td className="px-2 py-2 align-middle lg:px-3">
                              <FotoVariacaoCell
                                variant="table"
                                skuId={row.id}
                                imagemUrl={row.imagem_url ?? null}
                                fallbackImagemUrl={ehPaiRow && !row.imagem_url ? imagemUrlFallbackPai : null}
                                onUpdate={async (url) => {
                                  setProdutos((prev) =>
                                    prev.map((p) => (p.id === row.id ? { ...p, imagem_url: url } : p))
                                  );
                                  const corNorm = (row.cor ?? "").trim().toLowerCase();
                                  const mesmaCor = grupoProdutos.filter(
                                    (p) => (p.cor ?? "").trim().toLowerCase() === corNorm
                                  );
                                  const primeiroDaCor = [...mesmaCor].sort((a, b) => a.sku.localeCompare(b.sku))[0];
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
                                        load();
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
                            <td className="px-2 py-2 align-middle text-xs leading-snug text-neutral-900 dark:text-neutral-100 lg:px-3">
                              <span className="line-clamp-2 break-words">{row.cor || "—"}</span>
                            </td>
                            <td className="px-2 py-2 align-middle text-xs text-neutral-700 dark:text-neutral-300 lg:px-3">{row.tamanho || "—"}</td>
                            <td className="px-2 py-2 align-top font-mono text-[11px] leading-snug text-neutral-600 break-all dark:text-neutral-500 lg:px-3">{row.sku}</td>
                            <td className="px-2 py-2 align-top text-right text-xs tabular-nums text-neutral-700 dark:text-neutral-300 lg:px-3">
                              {row.custo_base != null ? `R$ ${Number(row.custo_base).toFixed(2)}` : "—"}
                            </td>
                            <td className="px-2 py-2 align-top text-right text-xs tabular-nums text-neutral-700 dark:text-neutral-300 lg:px-3">
                              {row.estoque_atual != null ? row.estoque_atual : "—"}
                            </td>
                            <td className="px-2 py-2 align-top text-right text-[11px] text-neutral-600 dark:text-neutral-400 lg:px-3" title="Comprimento embalagem (cm)">{row.comprimento_cm != null ? row.comprimento_cm : "—"}</td>
                            <td className="px-2 py-2 align-top text-right text-[11px] text-neutral-600 dark:text-neutral-400 lg:px-3" title="Largura embalagem (cm)">{row.largura_cm != null ? row.largura_cm : "—"}</td>
                            <td className="px-2 py-2 align-top text-right text-[11px] text-neutral-600 dark:text-neutral-400 lg:px-3" title="Altura embalagem (cm)">{row.altura_cm != null ? row.altura_cm : "—"}</td>
                            <td className="px-2 py-2 align-top text-right text-[11px] text-neutral-600 dark:text-neutral-400 lg:px-3" title="Peso (kg)">{row.peso_kg != null ? row.peso_kg : "—"}</td>
                            <td className="min-w-0 px-2 py-2 align-top lg:px-3">
                              {lf ? (
                                <a
                                  href={lf}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 text-xs break-all line-clamp-2 block"
                                >
                                  Ver
                                </a>
                              ) : (
                                <span className="text-neutral-400 dark:text-neutral-500 text-xs">—</span>
                              )}
                            </td>
                            <td className="px-2 py-2 text-right align-top lg:px-3">
                              <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1">
                                <button
                                  type="button"
                                  onClick={() => openEdit(row)}
                                  className="text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                                >
                                  Editar
                                </button>
                                {(() => {
                                  const pk = grupoKey.trim().toUpperCase();
                                  const ehPai = row.sku.trim().toUpperCase() === pk;
                                  const temFilhos = grupoProdutos.some((p) => p.sku.trim().toUpperCase() !== pk);
                                  if (ehPai && temFilhos) return null;
                                  return (
                                    <button
                                      type="button"
                                      onClick={() => handleExcluirVariante(row)}
                                      disabled={excluindoId === row.id}
                                      className="text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-50 dark:text-red-400 dark:hover:text-red-300"
                                    >
                                      {excluindoId === row.id ? "..." : "Excluir"}
                                    </button>
                                  );
                                })()}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            </div>
            </>
          )}
          {tabAtiva === "info-basica" && (
            <div className="bg-[var(--card)] rounded-xl border border-[var(--card-border)] shadow-sm p-6">
              <form onSubmit={handleSalvarInfoBasica} className="space-y-4">
                <div>
                  <label className="block text-xs text-neutral-600 dark:text-neutral-400 mb-1.5">Nome do produto *</label>
                  <input
                    type="text"
                    value={editNomeBasico}
                    onChange={(e) => setEditNomeBasico(e.target.value)}
                    onBlur={() => setEditNomeBasico(toTitleCase(editNomeBasico))}
                    placeholder="Ex: Camiseta Básica"
                    className="w-full rounded-lg bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs text-neutral-600 dark:text-neutral-400 mb-1.5">Descrição do produto</label>
                  <textarea
                    value={editDescricaoGrupo}
                    onChange={(e) => setEditDescricaoGrupo(e.target.value)}
                    onBlur={() => setEditDescricaoGrupo(toTitleCase(editDescricaoGrupo))}
                    placeholder="Ex: Camisa manga curta, tecido leve..."
                    rows={4}
                    maxLength={1000}
                    className="w-full rounded-lg bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-y"
                  />
                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-1">{editDescricaoGrupo.length}/1000</p>
                </div>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">SKU base: {grupoKey}</p>
                {formError && <p className="text-sm text-red-400">{formError}</p>}
                <button
                  type="submit"
                  disabled={loadingBasico || !dirtyBasico || statusAlteracaoEditar === "pendente"}
                  className={`rounded-lg font-semibold px-4 py-2.5 text-sm disabled:opacity-60 ${
                    dirtyBasico && statusAlteracaoEditar !== "pendente"
                      ? "bg-blue-600 text-white hover:bg-blue-700"
                      : "bg-neutral-400 dark:bg-neutral-500 text-white cursor-not-allowed"
                  }`}
                >
                  {loadingBasico ? "Salvando..." : statusAlteracaoEditar === "pendente" ? "Bloqueado (em análise)" : "Salvar"}
                </button>
              </form>
            </div>
          )}
          {tabAtiva === "midia" && (
            <div className="bg-[var(--card)] rounded-xl border border-[var(--card-border)] shadow-sm p-6">
              <form onSubmit={(e) => { e.preventDefault(); salvarTab({ link_fotos: editLinkFotosGrupo.trim() || null }); }} className="space-y-4">
                <div>
                  <label className="block text-xs text-neutral-600 dark:text-neutral-400 mb-1.5">Link das fotos (Drive, Dropbox, etc.)</label>
                  <input type="url" value={editLinkFotosGrupo} onChange={(e) => setEditLinkFotosGrupo(e.target.value)} placeholder="https://..." className="w-full rounded-lg bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 text-neutral-900 dark:text-neutral-100 px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
                </div>
                <p className="text-[11px] text-neutral-500 dark:text-neutral-400">As fotos por variação ficam na tabela de variantes.</p>
                {formError && <p className="text-sm text-red-400">{formError}</p>}
                <button type="submit" disabled={loadingOutros || !dirtyMidia} className={`rounded-lg font-semibold px-4 py-2.5 text-sm disabled:opacity-60 ${dirtyMidia ? "bg-blue-600 text-white hover:bg-blue-700" : "bg-neutral-400 dark:bg-neutral-500 text-white cursor-not-allowed"}`}>{loadingOutros ? "Salvando..." : "Salvar"}</button>
              </form>
            </div>
          )}
          {tabAtiva === "info-impostos" && (
            <div className="bg-[var(--card)] rounded-xl border border-[var(--card-border)] shadow-sm p-6">
              <form onSubmit={(e) => {
                e.preventDefault();
                const body: Record<string, unknown> = {};
                if (editNcm.trim()) body.ncm = editNcm.trim();
                if (editOrigem.trim()) body.origem = editOrigem.trim();
                if (editCest.trim()) body.cest = editCest.trim();
                if (editCfop.trim()) body.cfop = editCfop.trim();
                if (editPesoLiquido.trim()) body.peso_liquido_kg = editPesoLiquido.trim();
                if (editPesoBruto.trim()) body.peso_bruto_kg = editPesoBruto.trim();
                if (Object.keys(body).length === 0) { setFormError("Preencha pelo menos um campo."); return; }
                salvarTab(body);
              }} className="space-y-4">
                <div>
                  <label className="block text-xs text-neutral-600 dark:text-neutral-400 mb-1.5">NCM (Nomenclatura Comum do Mercosul)</label>
                  <input type="text" value={editNcm} onChange={(e) => setEditNcm(e.target.value)} placeholder="Ex: 6109.10.00" className="w-full rounded-lg bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 text-neutral-900 dark:text-neutral-100 px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs text-neutral-600 dark:text-neutral-400 mb-1.5">Origem</label>
                  <select value={editOrigem} onChange={(e) => setEditOrigem(e.target.value)} className="w-full rounded-lg bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 text-neutral-900 dark:text-neutral-100 px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500">
                    <option value="">Selecione...</option>
                    <option value="0">0 - Nacional</option>
                    <option value="1">1 - Estrangeira (importação direta)</option>
                    <option value="2">2 - Estrangeira (adquirida no mercado interno)</option>
                    <option value="3">3 - Nacional (conteúdo importado &gt; 40%)</option>
                    <option value="4">4 - Nacional (conforme processos produtivos)</option>
                    <option value="5">5 - Nacional (conteúdo importado &lt; 40%)</option>
                    <option value="6">6 - Estrangeira (importação direta, sem similar)</option>
                    <option value="7">7 - Estrangeira (adquirida no mercado interno, sem similar)</option>
                    <option value="8">8 - Nacional (conteúdo importado &gt; 70%)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-neutral-600 dark:text-neutral-400 mb-1.5">CEST (opcional)</label>
                  <input type="text" value={editCest} onChange={(e) => setEditCest(e.target.value)} placeholder="Ex: 01.001.00" className="w-full rounded-lg bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 text-neutral-900 dark:text-neutral-100 px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs text-neutral-600 dark:text-neutral-400 mb-1.5">CFOP (opcional)</label>
                  <input type="text" value={editCfop} onChange={(e) => setEditCfop(e.target.value)} placeholder="Ex: 5102" className="w-full rounded-lg bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 text-neutral-900 dark:text-neutral-100 px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-neutral-600 dark:text-neutral-400 mb-1.5">Peso líquido (kg)</label>
                    <input type="text" inputMode="decimal" value={editPesoLiquido} onChange={(e) => setEditPesoLiquido(e.target.value)} placeholder="0" className="w-full rounded-lg bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 text-neutral-900 dark:text-neutral-100 px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-xs text-neutral-600 dark:text-neutral-400 mb-1.5">Peso bruto (kg)</label>
                    <input type="text" inputMode="decimal" value={editPesoBruto} onChange={(e) => setEditPesoBruto(e.target.value)} placeholder="0" className="w-full rounded-lg bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 text-neutral-900 dark:text-neutral-100 px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
                  </div>
                </div>
                {formError && <p className="text-sm text-red-400">{formError}</p>}
                <button type="submit" disabled={loadingOutros || !dirtyImpostos} className={`rounded-lg font-semibold px-4 py-2.5 text-sm disabled:opacity-60 ${dirtyImpostos ? "bg-blue-600 text-white hover:bg-blue-700" : "bg-neutral-400 dark:bg-neutral-500 text-white cursor-not-allowed"}`}>{loadingOutros ? "Salvando..." : "Salvar"}</button>
              </form>
            </div>
          )}
          {tabAtiva === "tabela-medidas" && (
            <div className="bg-[var(--card)] rounded-2xl border border-[var(--card-border)] shadow-md overflow-hidden">
              <div className="bg-gradient-to-r from-neutral-50 to-neutral-100 dark:from-neutral-800/80 dark:to-neutral-800/40 border-b border-[var(--card-border)] px-6 py-4">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className="inline-flex items-center rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 px-3 py-1 text-xs font-medium">
                    Tipo inferido: {tipoProduto}
                  </span>
                  <span className="text-xs text-neutral-500 dark:text-neutral-400">
                    Alterações passam por aprovação do admin
                  </span>
                </div>
                <p className="text-xs text-neutral-600 dark:text-neutral-400">
                  Linhas preenchidas com os tamanhos do produto. Preencha as medidas em centímetros e envie para análise.
                </p>
              </div>
              <div className="p-6">
                {tabelaMedidasLoading ? (
                  <div className="flex items-center gap-2 text-sm text-neutral-500 dark:text-neutral-400 py-8">
                    <span className="inline-block w-5 h-5 border-2 border-neutral-300 dark:border-neutral-600 border-t-blue-500 rounded-full animate-spin" />
                    Carregando tabela...
                  </div>
                ) : (
                  <form onSubmit={salvarTabelaMedidas} className="space-y-5">
                    <div className="overflow-x-auto rounded-xl border border-neutral-200 dark:border-neutral-700 shadow-inner bg-neutral-50/50 dark:bg-neutral-900/50">
                      <table className="w-full text-sm border-collapse">
                        <thead>
                          <tr className="bg-neutral-100 dark:bg-neutral-800/80">
                            <th className="px-4 py-3 text-left font-semibold text-neutral-700 dark:text-neutral-300 w-24 rounded-tl-xl border-b border-r border-neutral-200 dark:border-neutral-700">
                              Tamanho
                            </th>
                            {colunasTabelaMedidas.map((col, i) => (
                              <th
                                key={col.key}
                                className="px-3 py-3 text-left font-semibold text-neutral-600 dark:text-neutral-400 whitespace-nowrap border-b border-neutral-200 dark:border-neutral-700 last:rounded-tr-xl"
                              >
                                {col.label}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {tamanhosOrdenados.map((tam, rowIndex) => (
                            <tr
                              key={tam}
                              className={`border-b border-neutral-200/80 dark:border-neutral-700/80 last:border-b-0 ${
                                rowIndex % 2 === 0 ? "bg-white dark:bg-[var(--card)]" : "bg-neutral-50/70 dark:bg-neutral-800/30"
                              } hover:bg-blue-50/50 dark:hover:bg-blue-950/20 transition-colors`}
                            >
                              <td className="px-4 py-2.5 font-medium text-neutral-800 dark:text-neutral-200 border-r border-neutral-200 dark:border-neutral-700 bg-neutral-50/80 dark:bg-neutral-800/50">
                                {tam}
                              </td>
                              {colunasTabelaMedidas.map((col) => (
                                <td key={col.key} className="px-2 py-2">
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    placeholder="—"
                                    value={tabelaMedidasLocal[tam]?.[col.key] ?? ""}
                                    onChange={(e) => {
                                      const v = e.target.value.trim();
                                      const num = v === "" ? undefined : parseFloat(v.replace(",", "."));
                                      setTabelaMedidasLocal((prev) => {
                                        const row = { ...(prev[tam] ?? {}) };
                                        if (num !== undefined && Number.isFinite(num)) row[col.key] = num;
                                        else delete row[col.key];
                                        return { ...prev, [tam]: row };
                                      });
                                    }}
                                    className="w-14 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-2 py-1.5 text-center text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-shadow"
                                  />
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {tamanhosOrdenados.length === 0 && (
                      <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
                        Adicione tamanhos nas variantes do produto para preencher as linhas aqui.
                      </div>
                    )}
                    {formError && <p className="text-sm text-red-500 dark:text-red-400">{formError}</p>}
                    <button
                      type="submit"
                      disabled={tabelaMedidasSaving || tamanhosOrdenados.length === 0}
                      className={`inline-flex items-center gap-2 rounded-xl font-semibold px-5 py-3 text-sm transition-all disabled:opacity-60 ${
                        tamanhosOrdenados.length > 0
                          ? "bg-blue-600 text-white hover:bg-blue-700 shadow-md hover:shadow-lg"
                          : "bg-neutral-400 dark:bg-neutral-500 text-white cursor-not-allowed"
                      }`}
                    >
                      {tabelaMedidasSaving ? (
                        <>
                          <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          Salvando...
                        </>
                      ) : (
                        "Enviar para análise"
                      )}
                    </button>
                  </form>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Menu lateral direito — estilo UpSeller */}
        <aside className="w-full shrink-0 order-1 lg:order-2 lg:w-56">
          <nav className="bg-[var(--card)] rounded-xl border border-[var(--card-border)] shadow-sm overflow-hidden">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setTabAtiva(tab.id)}
                className={`block w-full text-left px-4 py-2.5 text-sm transition ${
                  tabAtiva === tab.id
                    ? "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-medium border-l-2 border-blue-600 dark:border-blue-500"
                    : "text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-neutral-100"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </aside>
      </div>

      {/* Modal Editar — uma variante (SKU); não é edição em massa */}
      {editando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => !formLoading && setEditando(null)}>
          <div
            className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-xl overflow-hidden min-h-0"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="shrink-0 px-5 pt-5 pb-3 border-b border-neutral-100 dark:border-neutral-800">
              <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">Editar variante · {editando.sku}</h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                Esta janela altera <strong>só esta linha</strong>. Para várias de uma vez, use <strong>Editar em massa</strong> na tabela abaixo.
              </p>
            </div>
            <form onSubmit={handleEdit} className="flex flex-col min-h-0 flex-1 overflow-hidden">
              <div className="overflow-y-auto overscroll-contain px-5 py-4 space-y-4 flex-1 min-h-0 max-h-[calc(90vh-11rem)]">
                <div>
                  <label className="block text-xs text-neutral-600 dark:text-neutral-400 mb-1.5">Nome do produto *</label>
                  <input
                    type="text"
                    value={editNome}
                    onChange={(e) => setEditNome(e.target.value)}
                    onBlur={() => setEditNome(toTitleCase(editNome))}
                    placeholder="Ex: Camiseta Básica"
                    className="w-full rounded-lg bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    required
                  />
                </div>
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <label className="block text-xs text-neutral-600 dark:text-neutral-400 mb-1.5">Cor</label>
                    <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mb-2">
                      Clique em uma cor para preencher; depois pode editar no campo (ex.: Verde → Verde militar).
                    </p>
                    <div className="flex flex-wrap gap-1.5 mb-2 max-h-28 overflow-y-auto pr-1">
                      {CORES_PREDEFINIDAS.map((cor) => (
                        <button
                          key={cor}
                          type="button"
                          onClick={() => setEditCor((prev) => (prev.trim().toLowerCase() === cor.toLowerCase() ? "" : cor))}
                          className={`px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors shrink-0 ${
                            editCor.trim().toLowerCase() === cor.toLowerCase()
                              ? "border-blue-500 dark:border-blue-500 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300"
                              : "border-neutral-200 dark:border-neutral-600 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800"
                          }`}
                        >
                          {cor}
                        </button>
                      ))}
                    </div>
                    <input
                      type="text"
                      value={editCor}
                      onChange={(e) => setEditCor(e.target.value)}
                      onBlur={() => setEditCor(toTitleCase(editCor))}
                      placeholder="Ou digite outra cor (ex.: Verde militar)"
                      className="w-full rounded-lg bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-neutral-600 dark:text-neutral-400 mb-1.5">Tamanho</label>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {TAMANHOS_PREDEFINIDOS.map((tam) => (
                        <button
                          key={tam}
                          type="button"
                          onClick={() =>
                            setEditTamanho((prev) => (prev.trim().toUpperCase() === tam.toUpperCase() ? "" : tam))
                          }
                          className={`px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors ${
                            editTamanho.trim().toUpperCase() === tam.toUpperCase()
                              ? "border-blue-500 dark:border-blue-500 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300"
                              : "border-neutral-200 dark:border-neutral-600 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800"
                          }`}
                        >
                          {tam}
                        </button>
                      ))}
                    </div>
                    <input
                      type="text"
                      value={editTamanho}
                      onChange={(e) => setEditTamanho(e.target.value)}
                      onBlur={() => setEditTamanho(editTamanho.trim().toUpperCase())}
                      placeholder="Ou digite outro tamanho"
                      className="w-full rounded-lg bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-neutral-600 dark:text-neutral-400 mb-1.5">Descrição</label>
                  <textarea
                    value={editDescricao}
                    onChange={(e) => setEditDescricao(e.target.value)}
                    placeholder="Descrição do produto"
                    rows={4}
                    className="w-full rounded-lg bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-y min-h-[5rem]"
                  />
                </div>
                <p className="text-[11px] text-neutral-500 dark:text-neutral-400">Dimensões da embalagem (cm)</p>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-xs text-neutral-600 dark:text-neutral-400 mb-1.5">Comprimento</label>
                    <input
                      type="text"
                      value={editComp}
                      onChange={(e) => setEditComp(e.target.value)}
                      placeholder="—"
                      className="w-full rounded-lg bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 text-neutral-900 dark:text-neutral-100 px-3 py-2 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-neutral-600 dark:text-neutral-400 mb-1.5">Largura</label>
                    <input
                      type="text"
                      value={editLarg}
                      onChange={(e) => setEditLarg(e.target.value)}
                      placeholder="—"
                      className="w-full rounded-lg bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 text-neutral-900 dark:text-neutral-100 px-3 py-2 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-neutral-600 dark:text-neutral-400 mb-1.5">Altura</label>
                    <input
                      type="text"
                      value={editAlt}
                      onChange={(e) => setEditAlt(e.target.value)}
                      placeholder="—"
                      className="w-full rounded-lg bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 text-neutral-900 dark:text-neutral-100 px-3 py-2 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-neutral-600 dark:text-neutral-400 mb-1.5">Peso (kg)</label>
                  <p className="text-[10px] text-neutral-500 dark:text-neutral-400 mb-1">Quilogramas. Ex.: 250 g → 0,25</p>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={editPeso}
                    onChange={(e) => setEditPeso(e.target.value)}
                    placeholder="—"
                    className="w-full rounded-lg bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 text-neutral-900 dark:text-neutral-100 px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-neutral-600 dark:text-neutral-400 mb-1.5">Preço / Custo fornecedor (R$)</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={editCusto}
                      onChange={(e) => setEditCusto(e.target.value)}
                      placeholder="0"
                      className="w-full rounded-lg bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 text-neutral-900 dark:text-neutral-100 px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
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
                      className="w-full rounded-lg bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 text-neutral-900 dark:text-neutral-100 px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-neutral-600 dark:text-neutral-400 mb-1.5">Link das fotos</label>
                  <input
                    type="url"
                    value={editLinkFotos}
                    onChange={(e) => setEditLinkFotos(e.target.value)}
                    placeholder="https://..."
                    className="w-full rounded-lg bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 text-neutral-900 dark:text-neutral-100 px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                {formError && <p className="text-sm text-red-400">{formError}</p>}
              </div>
              <div className="shrink-0 flex flex-col sm:flex-row sm:items-center gap-2 px-5 py-4 border-t border-neutral-100 dark:border-neutral-800 bg-neutral-50/90 dark:bg-neutral-950/50">
                <p className="text-[11px] text-neutral-500 dark:text-neutral-400 flex-1 sm:order-first">
                  {dirtyModal ? "Salvar envia para análise do admin." : "Altere algum campo para habilitar Salvar."}
                </p>
                <div className="flex gap-2 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => !formLoading && setEditando(null)}
                    className="flex-1 sm:flex-initial rounded-lg border border-neutral-300 dark:border-neutral-600 px-4 py-2.5 text-sm text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={formLoading || !dirtyModal}
                    title={!dirtyModal ? "Nenhuma alteração nesta variante" : undefined}
                    className={`flex-1 sm:flex-initial rounded-lg font-semibold px-4 py-2.5 text-sm min-w-[7rem] disabled:opacity-60 ${
                      dirtyModal
                        ? "bg-blue-600 text-white hover:bg-blue-700"
                        : "bg-neutral-400 dark:bg-neutral-500 text-white cursor-not-allowed"
                    }`}
                  >
                    {formLoading ? "Salvando..." : "Salvar"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
