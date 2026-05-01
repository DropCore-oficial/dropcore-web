"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { DropCoreLogo } from "@/components/DropCoreLogo";
import { Badge, Card, Button, PageLayout, Alert } from "@/components/ui";
import { toTitleCase } from "@/lib/formatText";

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

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

function str(v: unknown): string {
  try {
    if (v == null) return "";
    if (typeof v === "string") return v;
    if (typeof v === "number" || typeof v === "boolean") return String(v);
    return "";
  } catch {
    return "";
  }
}

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

function paiKey(sku: unknown): string {
  const s = str(sku);
  return s.length >= 3 ? s.slice(0, -3) + "000" : s;
}

const GRUPOS_OCULTOS = new Set<string>(["DJU999000"]);
function isGrupoOculto(sku: unknown): boolean {
  return GRUPOS_OCULTOS.has(paiKey(sku));
}

function normalizarItems(raw: unknown): ItemSKU[] {
  if (!Array.isArray(raw)) return [];
  return (raw as any[]).map((row) => {
    try {
      return {
        id: row?.id ?? "",
        sku: str(row?.sku),
        nome_produto: str(row?.nome_produto),
        cor: str(row?.cor),
        tamanho: str(row?.tamanho),
        status: str(row?.status),
        categoria: row?.categoria != null ? str(row.categoria) : null,
        dimensoes_pacote: row?.dimensoes_pacote != null ? str(row.dimensoes_pacote) : null,
        comprimento_cm: typeof row?.comprimento_cm === "number" ? row.comprimento_cm : null,
        largura_cm: typeof row?.largura_cm === "number" ? row.largura_cm : null,
        altura_cm: typeof row?.altura_cm === "number" ? row.altura_cm : null,
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

function agruparPaiFilhos(items: ItemSKU[]): { paiKey: string; pai: ItemSKU | null; filhos: ItemSKU[] }[] {
  const filtrados = items.filter((i) => !isSemente(i) && !isGrupoOculto(i.sku));
  const porPai = new Map<string, { pai: ItemSKU | null; filhos: ItemSKU[] }>();
  for (const item of filtrados) {
    const key = paiKey(item.sku);
    if (!porPai.has(key)) porPai.set(key, { pai: null, filhos: [] });
    const g = porPai.get(key)!;
    if (str(item.sku).endsWith("000")) g.pai = item;
    else g.filhos.push(item);
  }
  return Array.from(porPai.entries())
    .map(([key, g]) => ({
      paiKey: key,
      pai: g.pai,
      filhos: g.filhos.sort((a, b) => str(a.sku).localeCompare(str(b.sku))),
    }))
    .sort((a, b) => a.paiKey.localeCompare(b.paiKey));
}

function BadgeStatus({ status }: { status: string }) {
  const ativo = status.toLowerCase() === "ativo";
  return <Badge variant={ativo ? "success" : "danger"}>{ativo ? "Ativo" : "Inativo"}</Badge>;
}

function BadgeEstoque({ atual, minimo }: { atual: number | null; minimo: number | null }) {
  if (atual == null) return null;
  const baixo = minimo != null && atual <= minimo;
  return (
    <Badge variant={baixo ? "warning" : "neutral"}>
      Estoque: {atual}{minimo != null ? ` / mín ${minimo}` : ""}
    </Badge>
  );
}

function ItemCard({ item }: { item: ItemSKU }) {
  const cb = item.custo_base ?? 0;
  const cd = item.custo_dropcore ?? 0;
  const total = cd > 0 ? cd : cb > 0 ? Math.round(cb * 1.15 * 100) / 100 : 0;

  const dimensoes = [
    item.comprimento_cm != null && item.largura_cm != null && item.altura_cm != null
      ? `${item.comprimento_cm}×${item.largura_cm}×${item.altura_cm} cm`
      : str(item.dimensoes_pacote),
    item.peso_kg ? `${item.peso_kg} kg` : "",
  ].filter(Boolean).join(" · ");

  return (
    <div className="rounded-[var(--radius)] border border-[var(--border-subtle)] bg-[var(--card)] px-5 py-4 flex flex-wrap justify-between items-start gap-3 shadow-[var(--shadow)]">
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-xs font-semibold text-[var(--foreground)] bg-[var(--background)] rounded px-1.5 py-0.5">{str(item.sku)}</span>
          {str(item.cor) && <span className="text-xs text-[var(--muted)]">{str(item.cor)}</span>}
          {str(item.tamanho) && (
            <Badge variant="neutral">{str(item.tamanho)}</Badge>
          )}
        </div>
        <div className="text-sm text-[var(--foreground)] font-medium truncate">{str(item.nome_produto)}</div>
        {str(item.categoria) && (
          <div className="text-xs text-[var(--muted)]">{str(item.categoria)}</div>
        )}
        {dimensoes && (
          <div className="text-xs text-[var(--muted)]">📦 {dimensoes}</div>
        )}
        {total > 0 && (
          <div className="flex flex-wrap gap-3 text-xs mt-1">
            {cb > 0 && <span className="text-[var(--muted)]">Ref. fornecedor: <span className="text-[var(--foreground)]">{BRL.format(cb)}</span></span>}
            <span className="text-[var(--muted)] font-medium">Você paga: <span className="text-[var(--foreground)]">{BRL.format(total)}</span></span>
          </div>
        )}
      </div>
      <div className="flex flex-col items-end gap-1.5">
        <BadgeStatus status={str(item.status)} />
        <BadgeEstoque atual={item.estoque_atual} minimo={item.estoque_minimo} />
      </div>
    </div>
  );
}

export default function CatalogoPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fornecedorId = searchParams.get("fornecedorId") || "";
  const fornecedorNome = searchParams.get("fornecedorNome") || "";

  const [orgId, setOrgId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [items, setItems] = useState<ItemSKU[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gruposExpandidos, setGruposExpandidos] = useState<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) { router.replace("/login"); return; }
      const res = await fetch("/api/org/me", { headers: { Authorization: `Bearer ${session.access_token}` } });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error || "Erro ao carregar organização.");
        return;
      }
      if (json.fornecedor_id) {
        router.replace("/fornecedor/dashboard");
        return;
      }
      if (json.seller_id) {
        router.replace("/seller/dashboard");
        return;
      }
      if (!json?.org_id) {
        setError("Organização não encontrada para este usuário.");
        return;
      }
      setOrgId(json.org_id);
    })();
  }, [router]);

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
        const res = await fetch(`/api/org/catalogo/search?${params}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(json.error || "Erro ao buscar catálogo");
        setItems(normalizarItems(json.items));
      } catch (err: unknown) {
        if (!cancelled) { setError(err instanceof Error ? err.message : "Erro inesperado"); setItems([]); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [orgId, fornecedorId]);

  const itemsFiltrados = useMemo(() => {
    const termo = q.trim().toLowerCase();
    if (!termo) return items;
    const pareceTamanho = termo.length <= 2 && /^[a-záàâãéêíóôõúç]+$/i.test(termo);
    return items.filter((i) => {
      const sku = str(i.sku).toLowerCase();
      const nome = str(i.nome_produto).toLowerCase();
      const cor = str(i.cor).toLowerCase();
      const tam = str(i.tamanho).toLowerCase();
      if (pareceTamanho) return tam === termo;
      return sku.includes(termo) || nome.includes(termo) || cor.includes(termo) || tam.includes(termo);
    });
  }, [items, q]);

  const grupos = useMemo(() => agruparPaiFilhos(itemsFiltrados), [itemsFiltrados]);

  // Expande todos os grupos quando há busca ativa
  useEffect(() => {
    if (q.trim()) {
      setGruposExpandidos(new Set(grupos.map((g) => g.paiKey)));
    }
  }, [q, grupos.length]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggleGrupo(key: string) {
    setGruposExpandidos((prev) => {
      const novo = new Set(prev);
      if (novo.has(key)) novo.delete(key);
      else novo.add(key);
      return novo;
    });
  }

  const totalSkus = itemsFiltrados.filter((i) => !isSemente(i) && !isGrupoOculto(i.sku)).length;

  return (
    <PageLayout maxWidth="md">
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border-subtle)] pb-4">
          <div className="flex items-center gap-3 shrink-0">
            <DropCoreLogo variant="horizontal" href="/dashboard" />
            <button
              onClick={() => router.push("/dashboard")}
              className="text-[var(--muted)] hover:text-[var(--foreground)] text-sm"
            >
              ← Voltar
            </button>
          </div>
          <h1 className="text-lg font-semibold text-[var(--foreground)]">
            {fornecedorNome ? `Catálogo — ${fornecedorNome}` : "Catálogo"}
          </h1>
          <Button variant="danger" size="sm" onClick={async () => { await supabaseBrowser.auth.signOut(); router.push("/login"); }}>
            Sair
          </Button>
        </div>

        {/* Filtro por fornecedor */}
        {fornecedorId && (
          <button
            type="button"
            onClick={() => router.push("/catalogo")}
            className="rounded-[var(--radius)] border border-[var(--border-subtle)] bg-[var(--card)] px-3 py-1.5 text-sm text-[var(--muted)] hover:text-[var(--foreground)]"
          >
            Ver catálogo completo
          </button>
        )}

        {/* Busca */}
        <div className="flex gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onBlur={() => setQ(toTitleCase(q))}
            placeholder="Buscar por nome, SKU, cor ou tamanho..."
            className="flex-1 rounded-[var(--radius)] bg-[var(--card)] border border-[var(--border-subtle)] px-3 py-2.5 text-[var(--foreground)] text-sm focus:outline-none focus:ring-1 focus:ring-[var(--accent)]/50 placeholder-[var(--muted)]"
          />
          {q && (
            <button
              type="button"
              onClick={() => setQ("")}
              className="rounded-[var(--radius)] border border-[var(--border-subtle)] bg-[var(--card)] px-3 py-2.5 text-sm text-[var(--muted)] hover:text-[var(--foreground)]"
            >
              Limpar
            </button>
          )}
        </div>

        {/* Contagem */}
        {!loading && !error && items.length > 0 && (
          <p className="text-xs text-[var(--muted)]">
            {q ? `${totalSkus} SKU${totalSkus !== 1 ? "s" : ""} encontrado${totalSkus !== 1 ? "s" : ""}` : `${totalSkus} SKU${totalSkus !== 1 ? "s" : ""} no catálogo`}
            {" · "}{grupos.length} grupo{grupos.length !== 1 ? "s" : ""}
          </p>
        )}

        {/* Estados */}
        {loading && (
          <Card padding="lg" className="p-8 text-center text-sm text-[var(--muted)]">
            Carregando catálogo...
          </Card>
        )}
        {error && (
          <Alert variant="danger">{error}</Alert>
        )}
        {!loading && !error && grupos.length === 0 && (
          <Card padding="lg" className="p-8 text-center text-sm text-[var(--muted)]">
            {q ? "Nenhum SKU encontrado para essa busca." : "Catálogo vazio."}
          </Card>
        )}

        {/* Lista de grupos */}
        <div className="space-y-4">
          {grupos.map((grupo) => {
            const expandido = gruposExpandidos.has(grupo.paiKey);
            const total = (grupo.pai ? 1 : 0) + grupo.filhos.length;

            return (
              <div key={grupo.paiKey} className="rounded-[var(--radius)] border border-[var(--border-subtle)] bg-[var(--card)] shadow-[var(--shadow-card)] overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleGrupo(grupo.paiKey)}
                  className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-[var(--background)]/50 transition"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs font-semibold text-[var(--muted)] bg-[var(--background)] rounded px-2 py-0.5">
                      {grupo.paiKey}
                    </span>
                    {grupo.pai && (
                      <span className="text-sm font-medium text-[var(--foreground)] truncate max-w-[200px] sm:max-w-none">
                        {str(grupo.pai.nome_produto)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-[var(--muted)]">{total} {total === 1 ? "item" : "itens"}</span>
                    <span className="text-[var(--muted)] text-sm">{expandido ? "▼" : "▶"}</span>
                  </div>
                </button>

                {expandido && (
                  <div className="px-4 pb-4 space-y-2 border-t border-[var(--border-subtle)]">
                    {grupo.pai && (
                      <div className="pt-2">
                        <ItemCard item={grupo.pai} />
                      </div>
                    )}
                    {grupo.filhos.map((item) => (
                      <div key={item.id} className={grupo.pai ? "" : "pt-2"}>
                        <ItemCard item={item} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </PageLayout>
  );
}
