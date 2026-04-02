import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/apiOrgAuth";
import { toTitleCase } from "@/lib/formatText";
import { assertPodeAtivarMaisSkus } from "@/lib/planos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PREFIXO_OCULTO = "DJU999";

function supabaseService() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Faltou SUPABASE env.");
  return createClient(url, key, { auth: { persistSession: false } });
}

const ALLOWED_KEYS = [
  "nome_produto", "categoria", "cor", "tamanho",
  "comprimento_cm", "largura_cm", "altura_cm", "peso_kg",
  "estoque_atual", "estoque_minimo", "custo_base", "custo_dropcore",
  "dimensoes_pacote", "status",
] as const;

function parseNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = parseFloat(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function normalizeRow(row: Record<string, unknown>): Record<string, unknown> | null {
  const sku = typeof row.sku === "string" ? row.sku.trim().toUpperCase() : "";
  if (!sku) return null;
  if (sku.toUpperCase().startsWith(PREFIXO_OCULTO)) return null;

  const out: Record<string, unknown> = { sku };
  const textKeys = ["nome_produto", "categoria", "cor", "tamanho", "dimensoes_pacote", "status"] as const;
  const numKeys = ["comprimento_cm", "largura_cm", "altura_cm", "peso_kg", "estoque_atual", "estoque_minimo", "custo_base", "custo_dropcore"] as const;

  for (const k of ALLOWED_KEYS) {
    if (!(k in row)) continue;
    const v = row[k];
    if (textKeys.includes(k as typeof textKeys[number])) {
      if (v == null || v === "") out[k] = null;
      else out[k] = toTitleCase(String(v));
    } else if (numKeys.includes(k as typeof numKeys[number])) {
      out[k] = parseNum(v);
    }
  }
  return out;
}

export async function POST(req: Request) {
  try {
    const { org_id, plano } = await requireAdmin(req);
    const body = await req.json();
    const fornecedorId = typeof body?.fornecedorId === "string" ? body.fornecedorId.trim() : "";
    const rows = Array.isArray(body?.rows) ? body.rows : [];

    if (!fornecedorId) {
      return NextResponse.json(
        { error: "fornecedorId é obrigatório (importe pelo catálogo de uma empresa)." },
        { status: 400 }
      );
    }
    if (rows.length === 0) {
      return NextResponse.json({ error: "Nenhuma linha para importar." }, { status: 400 });
    }

    const supabase = supabaseService();

    const normalized = rows
      .map((r: unknown) => (typeof r === "object" && r != null ? normalizeRow(r as Record<string, unknown>) : null))
      .filter(Boolean) as Record<string, unknown>[];

    if (normalized.length === 0) {
      return NextResponse.json({ error: "Nenhuma linha válida (SKU obrigatório; linhas do grupo oculto são ignoradas)." }, { status: 400 });
    }

    const skus = normalized.map((r) => r.sku as string);
    const { data: existingRows, error: fetchErr } = await supabase
      .from("skus")
      .select("id, sku")
      .eq("org_id", org_id)
      .eq("fornecedor_id", fornecedorId)
      .in("sku", skus);

    if (fetchErr) {
      return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    }

    const bySku = new Map<string, string>();
    for (const r of existingRows ?? []) {
      bySku.set(String(r.sku).toUpperCase(), r.id);
    }

    const novosAtivos = normalized.filter((row) => {
      const id = bySku.get((row.sku as string).toUpperCase());
      if (id) return false;
      const st = String(row.status ?? "ativo").toLowerCase();
      return st !== "inativo";
    });
    if (novosAtivos.length > 0) {
      const newItems = novosAtivos.map((row) => ({
        nome_produto: (row.nome_produto as string) ?? null,
        cor: (row.cor as string) ?? null,
      }));
      const check = await assertPodeAtivarMaisSkus(supabase, org_id, plano ?? null, newItems);
      if (!check.ok) {
        return NextResponse.json({ error: check.error }, { status: 403 });
      }
    }

    let updated = 0;
    let created = 0;

    for (const row of normalized) {
      const sku = row.sku as string;
      const id = bySku.get(sku.toUpperCase());

      if (id) {
        const patch: Record<string, unknown> = {};
        for (const k of ALLOWED_KEYS) {
          if (k in row) patch[k] = row[k];
        }
        if (Object.keys(patch).length === 0) continue;
        const { error: upErr } = await supabase
          .from("skus")
          .update(patch)
          .eq("id", id)
          .eq("org_id", org_id);
        if (!upErr) updated++;
      } else {
        const insert: Record<string, unknown> = {
          org_id,
          fornecedor_id: fornecedorId,
          fornecedor_org_id: org_id,
          sku,
          status: (row.status as string) || "ativo",
        };
        for (const k of ALLOWED_KEYS) {
          if (k !== "status" && k in row) insert[k] = row[k];
        }
        const { error: inErr } = await supabase.from("skus").insert(insert);
        if (!inErr) created++;
      }
    }

    return NextResponse.json({
      ok: true,
      updated,
      created,
      total: normalized.length,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    const status = msg === "Unauthorized" || msg === "Usuário sem organização." ? 401 : msg === "Sem permissão." ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
