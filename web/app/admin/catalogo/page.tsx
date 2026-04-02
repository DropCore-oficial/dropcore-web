"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { toTitleCase } from "@/lib/formatText";
import { PlanLimitsBadge, PLAN_LIMITS_REFRESH_EVENT } from "@/components/PlanLimitsBadge";
import { DashboardHeader } from "@/components/DashboardHeader";
import { PageLayout, Card, Button, Badge } from "@/components/ui";

type ItemSKU = {
  id: string;
  sku: string;
  nome_produto: string;
  cor: string;
  tamanho: string;
  status: string;
  custo_base: number | null;
  custo_dropcore: number | null;
  categoria: string | null;
  dimensoes_pacote: string | null;
  comprimento_cm: number | null;
  largura_cm: number | null;
  altura_cm: number | null;
  peso_kg: number | null;
  estoque_atual: number | null;
  estoque_minimo: number | null;
};

/** Mapeia cabeçalho do CSV exportado para chaves da API */
const CSV_HEADER_TO_KEY: Record<string, string> = {
  "SKU": "sku",
  "Nome": "nome_produto",
  "Categoria": "categoria",
  "Cor": "cor",
  "Tamanho": "tamanho",
  "Comprimento (cm)": "comprimento_cm",
  "Largura (cm)": "largura_cm",
  "Altura (cm)": "altura_cm",
  "Peso (kg)": "peso_kg",
  "Estoque atual": "estoque_atual",
  "Est. mínimo": "estoque_minimo",
  "Custo fornecedor (R$)": "custo_base",
  "Custo DropCore (R$)": "custo_dropcore",
  "Status": "status",
};

/** Parse CSV com ; e campos entre aspas */
function parseCSV(text: string): Record<string, unknown>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headerLine = lines[0];
  const headers: string[] = [];
  let i = 0;
  while (i < headerLine.length) {
    if (headerLine[i] === '"') {
      let end = i + 1;
      while (end < headerLine.length) {
        if (headerLine[end] === '"' && headerLine[end + 1] !== '"') break;
        if (headerLine[end] === '"') end += 2;
        else end++;
      }
      headers.push(headerLine.slice(i + 1, end).replace(/""/g, '"'));
      i = end + 1;
      if (headerLine[i] === ";") i++;
    } else {
      const semi = headerLine.indexOf(";", i);
      const end = semi === -1 ? headerLine.length : semi;
      headers.push(headerLine.slice(i, end).trim());
      i = semi === -1 ? headerLine.length : semi + 1;
    }
  }
  const keys = headers.map((h) => CSV_HEADER_TO_KEY[h.trim()] || h.trim());
  const rows: Record<string, unknown>[] = [];
  for (let L = 1; L < lines.length; L++) {
    const line = lines[L];
    const values: string[] = [];
    let j = 0;
    while (j < line.length) {
      if (line[j] === '"') {
        let end = j + 1;
        while (end < line.length) {
          if (line[end] === '"' && line[end + 1] !== '"') break;
          if (line[end] === '"') end += 2;
          else end++;
        }
        values.push(line.slice(j + 1, end).replace(/""/g, '"'));
        j = end + 1;
        if (line[j] === ";") j++;
      } else {
        const semi = line.indexOf(";", j);
        const end = semi === -1 ? line.length : semi;
        values.push(line.slice(j, end).trim());
        j = semi === -1 ? line.length : semi + 1;
      }
    }
    const row: Record<string, unknown> = {};
    keys.forEach((k, idx) => {
      if (k && values[idx] !== undefined) row[k] = values[idx] === "" ? null : values[idx];
    });
    if (row.sku) rows.push(row);
  }
  return rows;
}

/** Escapa um campo para CSV (separador ; para Excel pt-BR) */
function csvCampo(val: string | number | null | undefined): string {
  const s = val == null ? "" : String(val);
  if (s.includes(";") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** Garante string (API às vezes devolve número/objeto em tamanho/cor/sku) — nunca lança */
function str(v: unknown): string {
  try {
    if (v == null || v === undefined) return "";
    if (typeof v === "string") return v;
    if (typeof v === "number" || typeof v === "boolean") return String(v);
    if (typeof v === "object") return "";
    return String(v);
  } catch {
    return "";
  }
}

/** Esconde SKU semente: 000 sem cor/tamanho, nome com "semente", ou DJU999000 */
function isSemente(item: ItemSKU): boolean {
  const sku = str(item.sku);
  const sufixo = sku.slice(-3);
  const nome = str(item.nome_produto).toLowerCase();
  const cor = str(item.cor).trim();
  const tamanho = str(item.tamanho).trim();
  if (sku === "DJU999000") return true;
  if (sufixo !== "000") return false;
  if (nome.includes("semente")) return true;
  if (!cor && !tamanho) return true;
  return false;
}

/** Chave do grupo: SKU Pai (termina em 000) */
function paiKey(sku: unknown): string {
  const s = str(sku);
  return s.length >= 3 ? s.slice(0, -3) + "000" : s;
}

/** Grupos (SKU Pai) ocultos em todos os locais — não apagar, só não exibir */
const GRUPOS_OCULTOS = new Set<string>(["DJU999000"]);
function isGrupoOculto(sku: unknown): boolean {
  const key = paiKey(sku).toUpperCase();
  return GRUPOS_OCULTOS.has(key);
}

/** Normaliza itens da API: sku, cor, tamanho, nome_produto sempre string (evita erro se virem número) */
function normalizarItems(raw: unknown): ItemSKU[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((row: any) => {
    try {
      return {
        ...row,
        id: row?.id ?? "",
        sku: str(row?.sku),
        nome_produto: str(row?.nome_produto),
        cor: str(row?.cor),
        tamanho: str(row?.tamanho),
        status: str(row?.status),
        categoria: row?.categoria != null ? str(row.categoria) : null,
        dimensoes_pacote: row?.dimensoes_pacote != null ? str(row.dimensoes_pacote) : null,
        comprimento_cm: typeof row?.comprimento_cm === "number" ? row.comprimento_cm : row?.comprimento_cm != null ? Number(row.comprimento_cm) : null,
        largura_cm: typeof row?.largura_cm === "number" ? row.largura_cm : row?.largura_cm != null ? Number(row.largura_cm) : null,
        altura_cm: typeof row?.altura_cm === "number" ? row.altura_cm : row?.altura_cm != null ? Number(row.altura_cm) : null,
        custo_base: typeof row?.custo_base === "number" ? row.custo_base : null,
        custo_dropcore: typeof row?.custo_dropcore === "number" ? row.custo_dropcore : null,
        peso_kg: typeof row?.peso_kg === "number" ? row.peso_kg : null,
        estoque_atual: typeof row?.estoque_atual === "number" ? row.estoque_atual : null,
        estoque_minimo: typeof row?.estoque_minimo === "number" ? row.estoque_minimo : null,
      } as ItemSKU;
    } catch {
      return null;
    }
  }).filter(Boolean) as ItemSKU[];
}

/** Agrupa por Pai; cada grupo tem pai (opcional) e filhos (001–999). Itens já vêm filtrados pela busca. */
function agruparPaiFilhos(items: ItemSKU[]): { paiKey: string; pai: ItemSKU | null; filhos: ItemSKU[] }[] {
  const list = Array.isArray(items) ? items : [];
  const filtrados = list.filter((i) => {
    try {
      if (isSemente(i)) return false;
      if (isGrupoOculto(i.sku)) return false;
      return true;
    } catch {
      return true;
    }
  });
  const porPai = new Map<string, { pai: ItemSKU | null; filhos: ItemSKU[] }>();
  for (const item of filtrados) {
    try {
      const skuStr = str(item?.sku);
      const key = paiKey(skuStr);
      if (!porPai.has(key)) porPai.set(key, { pai: null, filhos: [] });
      const g = porPai.get(key)!;
      if (skuStr.endsWith("000")) {
        g.pai = item;
      } else {
        g.filhos.push(item);
      }
    } catch {
      // ignora item problemático
    }
  }
  return Array.from(porPai.entries())
    .map(([key, g]) => ({
      paiKey: key,
      pai: g.pai,
      filhos: g.filhos.sort((a, b) => str(a?.sku).localeCompare(str(b?.sku))),
    }))
    .sort((a, b) => a.paiKey.localeCompare(b.paiKey));
}

export default function AdminCatalogoPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fornecedorId = searchParams.get("fornecedorId") || "";
  const fornecedorNome = searchParams.get("fornecedorNome") || "";

  const [orgId, setOrgId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [filtroEstoqueBaixo, setFiltroEstoqueBaixo] = useState(() => searchParams.get("estoqueBaixo") === "1");
  const [items, setItems] = useState<ItemSKU[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{
    nome_produto: string;
    cor: string;
    tamanho: string;
    categoria: string;
    dimensoes_pacote: string;
    comprimento_cm: string;
    largura_cm: string;
    altura_cm: string;
    peso_kg: string;
    estoque_atual: string;
    estoque_minimo: string;
    custo_base: string;
    custo_dropcore: string;
  }>({
    nome_produto: "",
    cor: "",
    tamanho: "",
    categoria: "",
    dimensoes_pacote: "",
    comprimento_cm: "",
    largura_cm: "",
    altura_cm: "",
    peso_kg: "",
    estoque_atual: "",
    estoque_minimo: "",
    custo_base: "",
    custo_dropcore: "",
  });
  const [gruposExpandidos, setGruposExpandidos] = useState<Set<string>>(new Set());
  const [editingGrupoPaiKey, setEditingGrupoPaiKey] = useState<string | null>(null);
  const [editGrupoForm, setEditGrupoForm] = useState<{
    categoria: string;
    dimensoes_pacote: string;
    nome_produto: string;
    comprimento_cm: string;
    largura_cm: string;
    altura_cm: string;
    peso_kg: string;
    estoque_atual: string;
    estoque_minimo: string;
    custo_base: string;
    custo_dropcore: string;
  }>({
    categoria: "",
    dimensoes_pacote: "",
    nome_produto: "",
    comprimento_cm: "",
    largura_cm: "",
    altura_cm: "",
    peso_kg: "",
    estoque_atual: "",
    estoque_minimo: "",
    custo_base: "",
    custo_dropcore: "",
  });
  const [actingGrupo, setActingGrupo] = useState<string | null>(null);
  const [importRows, setImportRows] = useState<Record<string, unknown>[] | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importResult, setImportResult] = useState<{ updated: number; created: number; total: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 🔹 busca orgId via API (não depende de RLS)
  useEffect(() => {
    async function loadOrg() {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) {
        setError("Faça login para acessar.");
        router.replace("/login");
        return;
      }

      const res = await fetch("/api/org/me", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json();

      if (!res.ok) {
        setError(json?.error || "Erro ao carregar organização.");
        return;
      }
      if (!json?.org_id) {
        setError("Usuário não pertence a nenhuma organização.");
        return;
      }

      setOrgId(json.org_id);
    }

    loadOrg();
  }, [router]);

  // 🔹 carrega catálogo ao ter orgId (e ao mudar fornecedorId) para filtrar em tempo real ao digitar
  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { data: { session } } = await supabaseBrowser.auth.getSession();
        if (!session?.access_token || cancelled) return;
        const params = new URLSearchParams({ orgId, q: "" });
        if (fornecedorId) params.set("fornecedorId", fornecedorId);
        const res = await fetch(
          `/api/org/catalogo/search?${params.toString()}`,
          { headers: { Authorization: `Bearer ${session.access_token}` } }
        );
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(json.error || "Erro ao buscar catálogo");
        setItems(normalizarItems(json.items));
      } catch (err: any) {
        if (!cancelled) setError(err.message);
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [orgId, fornecedorId]);

  // 🔹 busca catálogo (overrideQ = use outro termo; se não passar, usa estado q)
  async function buscar(overrideQ?: string) {
    if (!orgId) return;

    setLoading(true);
    setError(null);
    const termo = overrideQ ?? q;

    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) {
        setError("Sessão expirada. Faça login novamente.");
        setLoading(false);
        return;
      }

      const params = new URLSearchParams({
        orgId,
        q: termo,
      });
      if (fornecedorId) params.set("fornecedorId", fornecedorId);

      const res = await fetch(
        `/api/org/catalogo/search?${params.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      );

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || "Erro ao buscar catálogo");
      }

      setItems(normalizarItems(json.items));
    } catch (err: any) {
      setError(err.message);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  async function getAuthHeaders(): Promise<HeadersInit> {
    const { data: { session } } = await supabaseBrowser.auth.getSession();
    if (!session?.access_token) throw new Error("Sessão expirada.");
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    };
  }

  async function handleAtivar(id: string) {
    setActingId(id);
    setError(null);
    try {
      const res = await fetch("/api/org/catalogo/search/ativar", {
        method: "PATCH",
        headers: await getAuthHeaders(),
        body: JSON.stringify({ id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erro ao ativar");
      window.dispatchEvent(new Event(PLAN_LIMITS_REFRESH_EVENT));
      await buscar("");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActingId(null);
    }
  }

  async function handleInativar(id: string) {
    setActingId(id);
    setError(null);
    try {
      const res = await fetch("/api/org/catalogo/search/inativar", {
        method: "PATCH",
        headers: await getAuthHeaders(),
        body: JSON.stringify({ id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erro ao inativar");
      await buscar("");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActingId(null);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Apagar este SKU? Esta ação pode ser irreversível.")) return;
    setActingId(id);
    setError(null);
    try {
      const res = await fetch("/api/org/catalogo/search/delete", {
        method: "DELETE",
        headers: await getAuthHeaders(),
        body: JSON.stringify({ id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erro ao apagar");
      await buscar("");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActingId(null);
    }
  }

  // Ações em grupo (Pai + todos os filhos)
  async function handleAtivarGrupo(grupo: { pai: ItemSKU | null; filhos: ItemSKU[] }) {
    const ids = [...(grupo.pai ? [grupo.pai.id] : []), ...grupo.filhos.map((f) => f.id)];
    setError(null);
    for (const id of ids) {
      try {
        const res = await fetch("/api/org/catalogo/search/ativar", {
          method: "PATCH",
          headers: await getAuthHeaders(),
          body: JSON.stringify({ id }),
        });
        if (!res.ok) {
          const json = await res.json();
          throw new Error(json.error || "Erro ao ativar");
        }
      } catch (err: any) {
        setError(err.message);
        return;
      }
    }
    window.dispatchEvent(new Event(PLAN_LIMITS_REFRESH_EVENT));
    await buscar("");
  }

  async function handleInativarGrupo(grupo: { pai: ItemSKU | null; filhos: ItemSKU[] }) {
    const ids = [...(grupo.pai ? [grupo.pai.id] : []), ...grupo.filhos.map((f) => f.id)];
    setError(null);
    for (const id of ids) {
      try {
        const res = await fetch("/api/org/catalogo/search/inativar", {
          method: "PATCH",
          headers: await getAuthHeaders(),
          body: JSON.stringify({ id }),
        });
        if (!res.ok) {
          const json = await res.json();
          throw new Error(json.error || "Erro ao inativar");
        }
      } catch (err: any) {
        setError(err.message);
        return;
      }
    }
    await buscar("");
  }

  async function handleExcluirGrupo(grupo: { pai: ItemSKU | null; filhos: ItemSKU[] }) {
    const ids = [...(grupo.pai ? [grupo.pai.id] : []), ...grupo.filhos.map((f) => f.id)];
    if (!confirm(`Apagar o grupo inteiro (${ids.length} SKU(s))? Esta ação pode ser irreversível.`)) return;
    setError(null);
    for (const id of ids) {
      try {
        const res = await fetch("/api/org/catalogo/search/delete", {
          method: "DELETE",
          headers: await getAuthHeaders(),
          body: JSON.stringify({ id }),
        });
        if (!res.ok) {
          const json = await res.json();
          throw new Error(json.error || "Erro ao apagar");
        }
      } catch (err: any) {
        setError(err.message);
        return;
      }
    }
    await buscar("");
  }

  function startEdit(item: ItemSKU) {
    setEditingId(item.id);
    setEditForm({
      nome_produto: str(item.nome_produto),
      cor: str(item.cor),
      tamanho: str(item.tamanho),
      categoria: str(item.categoria),
      dimensoes_pacote: str(item.dimensoes_pacote),
      comprimento_cm: item.comprimento_cm != null ? String(item.comprimento_cm) : "",
      largura_cm: item.largura_cm != null ? String(item.largura_cm) : "",
      altura_cm: item.altura_cm != null ? String(item.altura_cm) : "",
      peso_kg: item.peso_kg != null ? String(item.peso_kg) : "",
      estoque_atual: item.estoque_atual != null ? String(item.estoque_atual) : "",
      estoque_minimo: item.estoque_minimo != null ? String(item.estoque_minimo) : "",
      custo_base: item.custo_base != null ? String(item.custo_base) : "",
      custo_dropcore: item.custo_dropcore != null ? String(item.custo_dropcore) : "",
    });
  }

  function parseNum(v: string): number | null {
    const s = (v || "").trim();
    if (s === "") return null;
    const n = parseFloat(s.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }

  async function handleUpdate(id: string) {
    setActingId(id);
    setError(null);
    try {
      const patch: Record<string, unknown> = {
        nome_produto: editForm.nome_produto ? toTitleCase(editForm.nome_produto) : null,
        cor: editForm.cor ? toTitleCase(editForm.cor) : null,
        tamanho: editForm.tamanho ? toTitleCase(editForm.tamanho) : null,
        categoria: editForm.categoria ? toTitleCase(editForm.categoria) : null,
        dimensoes_pacote: editForm.dimensoes_pacote ? toTitleCase(editForm.dimensoes_pacote) : null,
        comprimento_cm: parseNum(editForm.comprimento_cm),
        largura_cm: parseNum(editForm.largura_cm),
        altura_cm: parseNum(editForm.altura_cm),
      };
      const peso = parseNum(editForm.peso_kg);
      if (peso !== null) patch.peso_kg = peso;
      const estAtual = parseNum(editForm.estoque_atual);
      if (estAtual !== null) patch.estoque_atual = Math.round(estAtual);
      const estMin = parseNum(editForm.estoque_minimo);
      if (estMin !== null) patch.estoque_minimo = Math.round(estMin);
      const custoBase = parseNum(editForm.custo_base);
      if (custoBase !== null) patch.custo_base = custoBase;
      const custoDc = parseNum(editForm.custo_dropcore);
      if (custoDc !== null) patch.custo_dropcore = custoDc;

      const res = await fetch("/api/org/catalogo/search/update", {
        method: "PATCH",
        headers: await getAuthHeaders(),
        body: JSON.stringify({ id, patch }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erro ao salvar");
      setEditingId(null);
      await buscar("");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActingId(null);
    }
  }

  function cancelEdit() {
    setEditingId(null);
  }

  function startEditGrupo(grupo: { paiKey: string; pai: ItemSKU | null; filhos: ItemSKU[] }) {
    const primeiro = grupo.pai || grupo.filhos[0];
    const cat = primeiro ? str(primeiro.categoria) : "";
    const dim = primeiro ? str(primeiro.dimensoes_pacote) : "";
    const nome = primeiro ? str(primeiro.nome_produto) : "";
    const comp = primeiro && primeiro.comprimento_cm != null ? String(primeiro.comprimento_cm) : "";
    const larg = primeiro && primeiro.largura_cm != null ? String(primeiro.largura_cm) : "";
    const alt = primeiro && primeiro.altura_cm != null ? String(primeiro.altura_cm) : "";
    const peso = primeiro && primeiro.peso_kg != null ? String(primeiro.peso_kg) : "";
    const est = primeiro && primeiro.estoque_atual != null ? String(primeiro.estoque_atual) : "";
    const estMin = primeiro && primeiro.estoque_minimo != null ? String(primeiro.estoque_minimo) : "";
    const custoB = primeiro && primeiro.custo_base != null ? String(primeiro.custo_base) : "";
    const custoDc = primeiro && primeiro.custo_dropcore != null ? String(primeiro.custo_dropcore) : "";
    setEditingGrupoPaiKey(grupo.paiKey);
    setEditGrupoForm({
      categoria: cat, dimensoes_pacote: dim, nome_produto: nome,
      comprimento_cm: comp, largura_cm: larg, altura_cm: alt,
      peso_kg: peso, estoque_atual: est, estoque_minimo: estMin, custo_base: custoB, custo_dropcore: custoDc,
    });
  }

  function cancelEditGrupo() {
    setEditingGrupoPaiKey(null);
    setActingGrupo(null);
  }

  async function handleUpdateGrupo(skuPai: string) {
    setActingGrupo(skuPai);
    setError(null);
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) {
        setError("Sessão expirada.");
        return;
      }
      const patch: Record<string, string | number | null> = {};
      if (editGrupoForm.categoria.trim() !== "") patch.categoria = editGrupoForm.categoria.trim();
      else patch.categoria = null;
      if (editGrupoForm.dimensoes_pacote.trim() !== "") patch.dimensoes_pacote = editGrupoForm.dimensoes_pacote.trim();
      else patch.dimensoes_pacote = null;
      if (editGrupoForm.nome_produto.trim() !== "") patch.nome_produto = editGrupoForm.nome_produto.trim();
      else patch.nome_produto = null;
      const comp = parseFloat(editGrupoForm.comprimento_cm.replace(",", "."));
      const larg = parseFloat(editGrupoForm.largura_cm.replace(",", "."));
      const alt = parseFloat(editGrupoForm.altura_cm.replace(",", "."));
      patch.comprimento_cm = Number.isFinite(comp) ? comp : null;
      patch.largura_cm = Number.isFinite(larg) ? larg : null;
      patch.altura_cm = Number.isFinite(alt) ? alt : null;
      const peso = parseFloat(editGrupoForm.peso_kg.replace(",", "."));
      const est = parseFloat(editGrupoForm.estoque_atual.replace(",", "."));
      const estMin = parseFloat(editGrupoForm.estoque_minimo.replace(",", "."));
      const custoB = parseFloat(editGrupoForm.custo_base.replace(",", "."));
      const custoDc = parseFloat(editGrupoForm.custo_dropcore.replace(",", "."));
      patch.peso_kg = Number.isFinite(peso) ? peso : null;
      patch.estoque_atual = Number.isFinite(est) ? est : null;
      patch.estoque_minimo = Number.isFinite(estMin) ? estMin : null;
      patch.custo_base = Number.isFinite(custoB) ? custoB : null;
      patch.custo_dropcore = Number.isFinite(custoDc) ? custoDc : null;

      const res = await fetch("/api/org/catalogo/search/update-grupo", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ skuPai, patch }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erro ao atualizar grupo");
      setEditingGrupoPaiKey(null);
      await buscar("");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActingGrupo(null);
    }
  }

  // Uma só barra: busca + filtro. Se digitar só tamanho (P, M, G, GG etc.), filtra APENAS por tamanho exato.
  const itemsFiltradosPorQ = useMemo(() => {
    try {
      const termo = (q || "").trim().toLowerCase();
      if (!termo) return items;
      const list = Array.isArray(items) ? items : [];
      // Tamanho: 1 ou 2 letras → filtrar só por tamanho exato (senão "P" pega "Padre" no nome)
      const pareceTamanho = termo.length <= 2 && /^[a-záàâãéêíóôõúç]+$/i.test(termo);
      return list.filter((i) => {
        try {
          if (!i || typeof i !== "object") return false;
          const sku = str((i as ItemSKU).sku).toLowerCase();
          const nome = str((i as ItemSKU).nome_produto).toLowerCase();
          const cor = str((i as ItemSKU).cor).toLowerCase();
          const tamanho = str((i as ItemSKU).tamanho).toLowerCase();
          if (pareceTamanho && tamanho === termo) return true; // ex: "p" → só tamanho P
          if (pareceTamanho) return false; // é busca por tamanho mas não bateu → não incluir
          return sku.includes(termo) || nome.includes(termo) || cor.includes(termo) || tamanho.includes(termo);
        } catch {
          return false;
        }
      });
    } catch {
      return items;
    }
  }, [items, q]);

  function isEstoqueBaixo(i: ItemSKU): boolean {
    const min = i.estoque_minimo;
    const atual = i.estoque_atual;
    return min != null && atual != null && Number(atual) < Number(min);
  }

  /** Itens com estoque baixo que pertencem a grupos visíveis (exclui DJU999 etc.) */
  const estoqueBaixoCount = useMemo(() => {
    const list = itemsFiltradosPorQ as ItemSKU[];
    return list.filter((i) => !isGrupoOculto(i.sku) && isEstoqueBaixo(i)).length;
  }, [itemsFiltradosPorQ]);

  const itemsParaGrupos = useMemo(() => {
    if (!filtroEstoqueBaixo || estoqueBaixoCount === 0) return itemsFiltradosPorQ;
    const list = itemsFiltradosPorQ as ItemSKU[];
    const lowKeys = new Set(
      list.filter((i) => !isGrupoOculto(i.sku) && isEstoqueBaixo(i)).map((i) => paiKey(i.sku))
    );
    return list.filter((i) => lowKeys.has(paiKey(i.sku)));
  }, [itemsFiltradosPorQ, filtroEstoqueBaixo, estoqueBaixoCount]);

  const grupos = useMemo(() => {
    try {
      return agruparPaiFilhos(itemsParaGrupos);
    } catch {
      return [];
    }
  }, [itemsParaGrupos]);

  // Quando há busca ativa, expande todos os grupos
  useEffect(() => {
    if (q.trim() && grupos.length > 0) setGruposExpandidos(new Set());
  }, [q, grupos.length]);

  function toggleGrupo(paiKey: string) {
    setGruposExpandidos((prev) => {
      const novo = new Set(prev);
      // Se está no Set, significa que foi colapsado manualmente
      // Remove = expande, Adiciona = colapsa
      if (novo.has(paiKey)) {
        novo.delete(paiKey);
      } else {
        novo.add(paiKey); // Adiciona = colapsa
      }
      return novo;
    });
  }

  function renderItem(item: ItemSKU) {
    const baixo = isEstoqueBaixo(item);
    return (
      <div
        key={item.id}
        className="p-5 rounded-[var(--radius)] border border-[var(--border-subtle)] bg-[var(--card)] flex flex-wrap justify-between items-center gap-2 shadow-[var(--shadow)]"
      >
        {editingId === item.id ? (
          <>
            <div style={{ flex: "1 1 320px", display: "flex", flexDirection: "column", gap: 10 }}>
              <strong style={{ marginBottom: 4 }}>SKU: {str(item.sku)}</strong>
              <div>
                <label style={{ display: "block", fontSize: 12, color: "var(--muted)", marginBottom: 2 }}>Nome do produto</label>
                <input
                  value={editForm.nome_produto}
                  onChange={(e) => setEditForm((f) => ({ ...f, nome_produto: e.target.value }))}
                  onBlur={() => setEditForm((f) => ({ ...f, nome_produto: toTitleCase(f.nome_produto) }))}
                  placeholder="Nome do produto"
                  style={{ width: "100%", maxWidth: 420, padding: 8, borderRadius: 4, border: "1px solid var(--card-border)", background: "var(--card)" }}
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 12, color: "var(--muted)", marginBottom: 2 }}>Categoria</label>
                <input
                  value={editForm.categoria}
                  onChange={(e) => setEditForm((f) => ({ ...f, categoria: e.target.value }))}
                  onBlur={() => setEditForm((f) => ({ ...f, categoria: toTitleCase(f.categoria) }))}
                  placeholder="Ex: Camiseta, Calça"
                  style={{ width: "100%", maxWidth: 280, padding: 8, borderRadius: 4, border: "1px solid var(--card-border)", background: "var(--card)" }}
                />
              </div>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <label style={{ display: "block", fontSize: 12, color: "var(--muted)", marginBottom: 2 }}>Cor</label>
                  <input
                    value={editForm.cor}
                    onChange={(e) => setEditForm((f) => ({ ...f, cor: e.target.value }))}
                    onBlur={() => setEditForm((f) => ({ ...f, cor: toTitleCase(f.cor) }))}
                    placeholder="Cor"
                    style={{ padding: 8, borderRadius: 4, border: "1px solid var(--card-border)", background: "var(--card)", width: 120 }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 12, color: "var(--muted)", marginBottom: 2 }}>Tamanho</label>
                  <input
                    value={editForm.tamanho}
                    onChange={(e) => setEditForm((f) => ({ ...f, tamanho: e.target.value }))}
                    onBlur={() => setEditForm((f) => ({ ...f, tamanho: toTitleCase(f.tamanho) }))}
                    placeholder="Tamanho"
                    style={{ padding: 8, borderRadius: 4, border: "1px solid var(--card-border)", background: "var(--card)", width: 90 }}
                  />
                </div>
              </div>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <label style={{ display: "block", fontSize: 12, color: "var(--muted)", marginBottom: 2 }}>Comprimento (cm)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={editForm.comprimento_cm}
                    onChange={(e) => setEditForm((f) => ({ ...f, comprimento_cm: e.target.value }))}
                    placeholder="Ex: 15"
                    style={{ width: 100, padding: 8, borderRadius: 4, border: "1px solid var(--card-border)", background: "var(--card)" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 12, color: "var(--muted)", marginBottom: 2 }}>Largura (cm)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={editForm.largura_cm}
                    onChange={(e) => setEditForm((f) => ({ ...f, largura_cm: e.target.value }))}
                    placeholder="Ex: 20"
                    style={{ width: 100, padding: 8, borderRadius: 4, border: "1px solid var(--card-border)", background: "var(--card)" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 12, color: "var(--muted)", marginBottom: 2 }}>Altura (cm)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={editForm.altura_cm}
                    onChange={(e) => setEditForm((f) => ({ ...f, altura_cm: e.target.value }))}
                    placeholder="Ex: 5"
                    style={{ width: 100, padding: 8, borderRadius: 4, border: "1px solid var(--card-border)", background: "var(--card)" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 12, color: "var(--muted)", marginBottom: 2 }}>Peso (kg)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={editForm.peso_kg}
                    onChange={(e) => setEditForm((f) => ({ ...f, peso_kg: e.target.value }))}
                    placeholder="0.3"
                    style={{ width: 90, padding: 8, borderRadius: 4, border: "1px solid var(--card-border)", background: "var(--card)" }}
                  />
                </div>
              </div>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <label style={{ display: "block", fontSize: 12, color: "var(--muted)", marginBottom: 2 }}>Estoque atual</label>
                  <input
                    type="number"
                    value={editForm.estoque_atual}
                    onChange={(e) => setEditForm((f) => ({ ...f, estoque_atual: e.target.value }))}
                    placeholder="0"
                    style={{ padding: 8, borderRadius: 4, border: "1px solid var(--card-border)", background: "var(--card)", width: 100 }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 12, color: "var(--muted)", marginBottom: 2 }}>Est. mínimo</label>
                  <input
                    type="number"
                    value={editForm.estoque_minimo}
                    onChange={(e) => setEditForm((f) => ({ ...f, estoque_minimo: e.target.value }))}
                    placeholder="0"
                    style={{ padding: 8, borderRadius: 4, border: "1px solid var(--card-border)", background: "var(--card)", width: 90 }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 12, color: "var(--muted)", marginBottom: 2 }}>Custo fornecedor (R$)</label>
                  <input
                    value={editForm.custo_base}
                    onChange={(e) => setEditForm((f) => ({ ...f, custo_base: e.target.value }))}
                    placeholder="0.00"
                    style={{ padding: 8, borderRadius: 4, border: "1px solid var(--card-border)", background: "var(--card)", width: 110 }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 12, color: "var(--muted)", marginBottom: 2 }}>Custo DropCore (R$)</label>
                  <input
                    value={editForm.custo_dropcore}
                    onChange={(e) => setEditForm((f) => ({ ...f, custo_dropcore: e.target.value }))}
                    placeholder="0.00"
                    style={{ padding: 8, borderRadius: 4, border: "1px solid var(--card-border)", background: "var(--card)", width: 110 }}
                  />
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, alignSelf: "flex-start" }}>
              <button
                onClick={() => handleUpdate(item.id)}
                disabled={actingId === item.id}
                className="u-btn u-btn-success"
              >
                {actingId === item.id ? "..." : "Salvar"}
              </button>
              <button
                onClick={cancelEdit}
                className="u-btn u-btn-secondary"
              >
                Cancelar
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <strong>{str(item.sku)}</strong>
                {baixo && (
                  <span style={{ fontSize: 11, padding: "2px 6px", borderRadius: 4, background: "var(--card)", color: "var(--foreground)", border: "1px solid var(--card-border)", fontWeight: 600 }}>
                    Estoque baixo
                  </span>
                )}
              </div>
              <div style={{ fontSize: 14, opacity: 0.8 }}>
                {str(item.nome_produto)} · {str(item.cor)} · {str(item.tamanho)}
              </div>
              {str(item.categoria) && (
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>Categoria: {str(item.categoria)}</div>
              )}
              {(str(item.dimensoes_pacote) || (item.comprimento_cm != null && item.largura_cm != null && item.altura_cm != null) || (item.peso_kg != null && item.peso_kg !== 0)) && (
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                  Envio: {[
                    item.comprimento_cm != null && item.largura_cm != null && item.altura_cm != null
                      ? `${item.comprimento_cm} × ${item.largura_cm} × ${item.altura_cm} cm`
                      : str(item.dimensoes_pacote),
                    item.peso_kg != null && item.peso_kg !== 0 ? `${item.peso_kg} kg` : "",
                  ].filter(Boolean).join(" · ")}
                </div>
              )}
              {(item.custo_base !== null || item.custo_dropcore !== null) && (
                <div style={{ fontSize: 13, marginTop: 4, display: "flex", gap: 12, color: "var(--foreground)" }}>
                  {item.custo_base !== null && (
                    <span>
                      <strong>Fornecedor:</strong> R$ {item.custo_base.toFixed(2)}
                    </span>
                  )}
                  {item.custo_dropcore !== null && (
                    <span>
                      <strong>DropCore:</strong> R$ {item.custo_dropcore.toFixed(2)}
                    </span>
                  )}
                </div>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span
                style={{
                  fontSize: 12,
                  padding: "4px 8px",
                  borderRadius: 999,
                  background: str(item.status).toLowerCase() === "ativo" ? "#dcfce7" : "#fee2e2",
                  color: str(item.status).toLowerCase() === "ativo" ? "#166534" : "#991b1b",
                }}
              >
                {str(item.status)}
              </span>
              <button
                onClick={() => startEdit(item)}
                style={{ padding: "4px 10px", fontSize: 12, border: "1px solid var(--card-border)", borderRadius: 6, cursor: "pointer", background: "var(--card)" }}
              >
                Editar
              </button>
              {str(item.status).toLowerCase() === "ativo" ? (
                <button
                  onClick={() => handleInativar(item.id)}
                  disabled={actingId !== null}
                  className="u-btn u-btn-warning text-xs py-1 px-2.5"
                >
                  {actingId === item.id ? "..." : "Inativar"}
                </button>
              ) : (
                <button
                  onClick={() => handleAtivar(item.id)}
                  disabled={actingId !== null}
                  className="u-btn u-btn-success text-xs py-1 px-2.5"
                >
                  {actingId === item.id ? "..." : "Ativar"}
                </button>
              )}
              <button
                onClick={() => handleDelete(item.id)}
                disabled={actingId !== null}
                className="u-btn u-btn-danger text-xs py-1 px-2.5"
              >
                {actingId === item.id ? "..." : "Apagar"}
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <PageLayout maxWidth="sm">
      <DashboardHeader href="/dashboard" onRefresh={() => buscar("")} onLogout={() => router.push("/login")} />
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>
            {fornecedorNome ? `Catálogo — ${fornecedorNome}` : "Catálogo (Admin)"}
          </h1>
          <PlanLimitsBadge />
        </div>
        <div style={{ marginTop: 8, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => router.push("/admin/empresas")}
            style={{ padding: "6px 12px", fontSize: 13, borderRadius: 6, border: "1px solid var(--card-border)", background: "var(--card)", cursor: "pointer", color: "var(--foreground)" }}
          >
            {fornecedorId ? "Trocar empresa" : "Ver empresas"}
          </button>
          {fornecedorId && (
            <button
              type="button"
              onClick={() => router.push("/admin/catalogo")}
              style={{ padding: "6px 12px", fontSize: 13, borderRadius: 6, border: "1px solid var(--card-border)", background: "var(--card)", color: "var(--foreground)", cursor: "pointer" }}
            >
              Catálogo (todas as empresas)
            </button>
          )}
        </div>
      </div>

      {estoqueBaixoCount > 0 && (
        <div
          style={{
            marginBottom: 16,
            padding: 12,
            borderRadius: 8,
            background: "var(--card)",
            border: "1px solid var(--card-border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 10,
          }}
        >
          <span style={{ fontSize: 14, color: "var(--foreground)" }}>
            <strong>{estoqueBaixoCount}</strong> {estoqueBaixoCount === 1 ? "item com" : "itens com"} estoque abaixo do mínimo
          </span>
          <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13, color: "var(--foreground)" }}>
            <input
              type="checkbox"
              checked={filtroEstoqueBaixo}
              onChange={(e) => setFiltroEstoqueBaixo(e.target.checked)}
            />
            Só estoque baixo
          </label>
        </div>
      )}

      {/* Uma só barra: pesquisa + filtro (nome, SKU, cor, tamanho) — filtra ao digitar */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onBlur={() => setQ(toTitleCase(q))}
          placeholder="Pesquisar ou filtrar por nome, SKU, cor, tamanho..."
          style={{
            flex: 1,
            minWidth: 260,
            padding: "10px 12px",
            borderRadius: 6,
            border: "1px solid var(--card-border)", background: "var(--card)",
          }}
        />
        {q && (
          <button
            type="button"
            onClick={() => setQ("")}
                className="u-btn u-btn-secondary text-xs py-2 px-3.5"
          >
            Limpar
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            const list = (itemsParaGrupos as ItemSKU[]).filter((i) => !isGrupoOculto(i.sku));
            if (list.length === 0) return;
            const sep = ";";
            const header = [
              "SKU", "Nome", "Categoria", "Cor", "Tamanho",
              "Comprimento (cm)", "Largura (cm)", "Altura (cm)", "Peso (kg)",
              "Estoque atual", "Est. mínimo", "Custo fornecedor (R$)", "Custo DropCore (R$)", "Status",
            ].join(sep);
            const linhas = list.map((i) => [
              csvCampo(str(i.sku)),
              csvCampo(str(i.nome_produto)),
              csvCampo(str(i.categoria)),
              csvCampo(str(i.cor)),
              csvCampo(str(i.tamanho)),
              csvCampo(i.comprimento_cm),
              csvCampo(i.largura_cm),
              csvCampo(i.altura_cm),
              csvCampo(i.peso_kg),
              csvCampo(i.estoque_atual),
              csvCampo(i.estoque_minimo),
              csvCampo(i.custo_base),
              csvCampo(i.custo_dropcore),
              csvCampo(str(i.status)),
            ].join(sep));
            const csv = "\uFEFF" + header + "\n" + linhas.join("\n");
            const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `catalogo-${new Date().toISOString().slice(0, 10)}.csv`;
            a.click();
            URL.revokeObjectURL(url);
          }}
          disabled={(itemsParaGrupos as ItemSKU[]).filter((i) => !isGrupoOculto(i.sku)).length === 0}
          style={{
            padding: "8px 14px",
            borderRadius: 6,
            background: "var(--success)",
            color: "#fff",
            border: "none",
            cursor: itemsParaGrupos.length === 0 ? "not-allowed" : "pointer",
            fontSize: 12,
          }}
        >
          Exportar CSV
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          style={{ display: "none" }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
              const text = String(reader.result ?? "");
              const rows = parseCSV(text);
              setImportResult(null);
              setImportRows(rows.length > 0 ? rows : null);
            };
            reader.readAsText(file, "utf-8");
          }}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          style={{
            padding: "8px 14px",
            borderRadius: 6,
            background: "var(--info)",
            color: "#fff",
            border: "none",
            cursor: "pointer",
            fontSize: 12,
          }}
        >
          Importar CSV
        </button>
      </div>

      {importRows != null && (
        <div
          style={{
            marginBottom: 16,
            padding: 12,
            borderRadius: 8,
            background: "var(--card)",
            border: "1px solid var(--card-border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 10,
          }}
        >
          {importResult ? (
            <>
              <span style={{ fontSize: 14, color: "var(--foreground)" }}>
                Importação concluída: <strong>{importResult.updated}</strong> atualizados, <strong>{importResult.created}</strong> criados.
              </span>
              <button
                type="button"
                onClick={() => { setImportRows(null); setImportResult(null); buscar(""); }}
                className="u-btn u-btn-info text-xs"
              >
                Fechar e atualizar lista
              </button>
            </>
          ) : !fornecedorId ? (
            <>
              <span style={{ fontSize: 14, color: "var(--foreground)" }}>
                <strong>{importRows.length}</strong> linhas no arquivo. Selecione uma empresa (Trocar empresa) para importar.
              </span>
              <button
                type="button"
                onClick={() => setImportRows(null)}
                className="u-btn u-btn-secondary text-xs"
              >
                Cancelar
              </button>
            </>
          ) : (
            <>
              <span style={{ fontSize: 14, color: "var(--foreground)" }}>
                <strong>{importRows.length}</strong> linhas para importar em <strong>{fornecedorNome || "esta empresa"}</strong>. Itens existentes serão atualizados; novos serão criados.
              </span>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  disabled={importLoading}
                  onClick={async () => {
                    setImportLoading(true);
                    setError(null);
                    try {
                      const { data: { session } } = await supabaseBrowser.auth.getSession();
                      if (!session?.access_token) throw new Error("Sessão expirada.");
                      const res = await fetch("/api/org/catalogo/import", {
                        method: "POST",
                        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
                        body: JSON.stringify({ fornecedorId, rows: importRows }),
                      });
                      const json = await res.json();
                      if (!res.ok) throw new Error(json?.error || "Erro na importação");
                      setImportResult({ updated: json.updated ?? 0, created: json.created ?? 0, total: json.total ?? 0 });
                      window.dispatchEvent(new Event(PLAN_LIMITS_REFRESH_EVENT));
                      await buscar("");
                    } catch (err: unknown) {
                      setError(err instanceof Error ? err.message : "Erro na importação");
                    } finally {
                      setImportLoading(false);
                    }
                  }}
                  className="u-btn u-btn-info text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {importLoading ? "Importando…" : "Confirmar importação"}
                </button>
                <button
                  type="button"
                  onClick={() => setImportRows(null)}
                  disabled={importLoading}
                  className="u-btn u-btn-secondary text-xs"
                >
                  Cancelar
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* STATUS */}
      {loading && <div>Carregando...</div>}
      {error && <div style={{ color: "red" }}>{error}</div>}

      {/* LISTA (agrupada por SKU Pai, semente oculta) */}
      {!loading && grupos.length === 0 && !error && (
        <div>Nenhum SKU encontrado.</div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {grupos.map((grupo) => {
          // Por padrão expandido. Se está no Set, foi colapsado manualmente.
          const estaExpandido = !gruposExpandidos.has(grupo.paiKey);
          const totalItens = (grupo.pai ? 1 : 0) + grupo.filhos.length;
          
          return (
            <div key={grupo.paiKey} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: "var(--foreground)",
                  padding: "8px 12px",
                  borderBottom: "1px solid var(--card-border)",
                  background: "var(--card)",
                  borderRadius: 6,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: 8,
                }}
              >
                <span
                  onClick={() => toggleGrupo(grupo.paiKey)}
                  style={{ cursor: "pointer", userSelect: "none", display: "flex", alignItems: "center", gap: 6 }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.opacity = "0.8";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.opacity = "1";
                  }}
                >
                  SKU Pai: {grupo.paiKey} ({totalItens} {totalItens === 1 ? "item" : "itens"})
                  <span style={{ fontSize: 18, color: "var(--muted)" }}>
                    {estaExpandido ? "▼" : "▶"}
                  </span>
                </span>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }} onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    onClick={() => startEditGrupo(grupo)}
                    style={{ padding: "4px 10px", fontSize: 12, border: "1px solid var(--card-border)", background: "var(--card)", color: "var(--foreground)", borderRadius: 6, cursor: "pointer" }}
                  >
                    Editar grupo
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAtivarGrupo(grupo)}
                    className="u-btn u-btn-success text-xs py-1 px-2.5"
                  >
                    Ativar grupo
                  </button>
                  <button
                    type="button"
                    onClick={() => handleInativarGrupo(grupo)}
                    className="u-btn u-btn-warning text-xs py-1 px-2.5"
                  >
                    Inativar grupo
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExcluirGrupo(grupo)}
                    className="u-btn u-btn-danger text-xs py-1 px-2.5"
                  >
                    Excluir grupo
                  </button>
                </div>
              </div>
              {editingGrupoPaiKey === grupo.paiKey && (
                <div
                  style={{
                    padding: 12,
                    background: "var(--card)",
                    border: "1px solid var(--card-border)",
                    borderRadius: 8,
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <strong style={{ fontSize: 13 }}>Aplicar a todo o grupo (pai + filhos)</strong>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>
                    <div>
                      <label style={{ display: "block", fontSize: 12, color: "var(--foreground)", marginBottom: 2 }}>Categoria</label>
                      <input
                        value={editGrupoForm.categoria}
                        onChange={(e) => setEditGrupoForm((f) => ({ ...f, categoria: e.target.value }))}
                        onBlur={() => setEditGrupoForm((f) => ({ ...f, categoria: toTitleCase(f.categoria) }))}
                        placeholder="Ex: Camisa Manga Curta"
                        style={{ width: 200, padding: 6, borderRadius: 4, border: "1px solid var(--card-border)", background: "var(--card)" }}
                      />
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: 12, color: "var(--foreground)", marginBottom: 2 }}>Comprimento (cm)</label>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        value={editGrupoForm.comprimento_cm}
                        onChange={(e) => setEditGrupoForm((f) => ({ ...f, comprimento_cm: e.target.value }))}
                        placeholder="15"
                        style={{ width: 80, padding: 6, borderRadius: 4, border: "1px solid var(--card-border)", background: "var(--card)" }}
                      />
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: 12, color: "var(--foreground)", marginBottom: 2 }}>Largura (cm)</label>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        value={editGrupoForm.largura_cm}
                        onChange={(e) => setEditGrupoForm((f) => ({ ...f, largura_cm: e.target.value }))}
                        placeholder="20"
                        style={{ width: 80, padding: 6, borderRadius: 4, border: "1px solid var(--card-border)", background: "var(--card)" }}
                      />
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: 12, color: "var(--foreground)", marginBottom: 2 }}>Altura (cm)</label>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        value={editGrupoForm.altura_cm}
                        onChange={(e) => setEditGrupoForm((f) => ({ ...f, altura_cm: e.target.value }))}
                        placeholder="5"
                        style={{ width: 80, padding: 6, borderRadius: 4, border: "1px solid var(--card-border)", background: "var(--card)" }}
                      />
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: 12, color: "var(--foreground)", marginBottom: 2 }}>Peso (kg)</label>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        value={editGrupoForm.peso_kg}
                        onChange={(e) => setEditGrupoForm((f) => ({ ...f, peso_kg: e.target.value }))}
                        placeholder="0.3"
                        style={{ width: 70, padding: 6, borderRadius: 4, border: "1px solid var(--card-border)", background: "var(--card)" }}
                      />
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: 12, color: "var(--foreground)", marginBottom: 2 }}>Nome do produto</label>
                      <input
                        value={editGrupoForm.nome_produto}
                        onChange={(e) => setEditGrupoForm((f) => ({ ...f, nome_produto: e.target.value }))}
                        onBlur={() => setEditGrupoForm((f) => ({ ...f, nome_produto: toTitleCase(f.nome_produto) }))}
                        placeholder="Nome base (aplicado a todos)"
                        style={{ width: 260, padding: 6, borderRadius: 4, border: "1px solid var(--card-border)", background: "var(--card)" }}
                      />
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: 12, color: "var(--foreground)", marginBottom: 2 }}>Estoque atual</label>
                      <input
                        type="number"
                        min="0"
                        value={editGrupoForm.estoque_atual}
                        onChange={(e) => setEditGrupoForm((f) => ({ ...f, estoque_atual: e.target.value }))}
                        placeholder="0"
                        style={{ width: 90, padding: 6, borderRadius: 4, border: "1px solid var(--card-border)", background: "var(--card)" }}
                      />
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: 12, color: "var(--foreground)", marginBottom: 2 }}>Est. mínimo</label>
                      <input
                        type="number"
                        min="0"
                        value={editGrupoForm.estoque_minimo}
                        onChange={(e) => setEditGrupoForm((f) => ({ ...f, estoque_minimo: e.target.value }))}
                        placeholder="0"
                        style={{ width: 80, padding: 6, borderRadius: 4, border: "1px solid var(--card-border)", background: "var(--card)" }}
                      />
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: 12, color: "var(--foreground)", marginBottom: 2 }}>Custo fornecedor (R$)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={editGrupoForm.custo_base}
                        onChange={(e) => setEditGrupoForm((f) => ({ ...f, custo_base: e.target.value }))}
                        placeholder="0.00"
                        style={{ width: 100, padding: 6, borderRadius: 4, border: "1px solid var(--card-border)", background: "var(--card)" }}
                      />
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: 12, color: "var(--foreground)", marginBottom: 2 }}>Custo DropCore (R$)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={editGrupoForm.custo_dropcore}
                        onChange={(e) => setEditGrupoForm((f) => ({ ...f, custo_dropcore: e.target.value }))}
                        placeholder="0.00"
                        style={{ width: 100, padding: 6, borderRadius: 4, border: "1px solid var(--card-border)", background: "var(--card)" }}
                      />
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        type="button"
                        onClick={() => handleUpdateGrupo(grupo.paiKey)}
                        disabled={actingGrupo !== null}
                        className="u-btn u-btn-info disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {actingGrupo === grupo.paiKey ? "Salvando…" : "Salvar no grupo"}
                      </button>
                      <button
                        type="button"
                        onClick={cancelEditGrupo}
                        className="u-btn u-btn-secondary"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingLeft: 8 }}>
                {grupo.pai && renderItem(grupo.pai)}
                {estaExpandido && grupo.filhos.map((item) => renderItem(item))}
              </div>
            </div>
          );
        })}
      </div>

      {/* AÇÕES */}
      <div style={{ marginTop: 24, display: "flex", gap: 8 }}>
        <button
          onClick={() => router.push("/dashboard")}
          style={{ padding: "8px 14px" }}
        >
          Voltar
        </button>

        <button
          onClick={async () => {
            await supabaseBrowser.auth.signOut();
            router.push("/login");
          }}
          style={{
            padding: "8px 14px",
            background: "var(--danger)",
            color: "#fff",
            border: "none",
            borderRadius: 6,
          }}
        >
          Sair
        </button>
      </div>
    </PageLayout>
  );
}
