import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { toTitleCase } from "@/lib/formatText";
import { orgErrorHttpStatus, requireAdmin } from "@/lib/apiOrgAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function supabaseService() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Faltou SUPABASE env.");
  return createClient(url, key, { auth: { persistSession: false } });
}

/** Campos permitidos para edição em massa (aplicados ao pai e todos os filhos) */
const ALLOWED_KEYS = [
  "categoria", "dimensoes_pacote", "nome_produto",
  "comprimento_cm", "largura_cm", "altura_cm",
  "peso_kg", "estoque_atual", "estoque_minimo", "custo_base", "custo_dropcore",
] as const;

export async function PATCH(req: Request) {
  try {
    const { org_id } = await requireAdmin(req);

    const { skuPai, patch } = await req.json();
    const pai = typeof skuPai === "string" ? skuPai.trim().toUpperCase() : "";
    if (!pai || !pai.endsWith("000") || pai.length < 4) {
      return NextResponse.json(
        { error: "skuPai inválido. Ex: DJU100000" },
        { status: 400 }
      );
    }
    if (!patch || typeof patch !== "object") {
      return NextResponse.json({ error: "Faltou patch (ex.: categoria, comprimento_cm, largura_cm, altura_cm, nome_produto)." }, { status: 400 });
    }

    const prefix = pai.slice(0, -3);
    const clean: Record<string, unknown> = {};
    const textKeys = ["categoria", "dimensoes_pacote", "nome_produto"] as const;
    const numKeys = ["comprimento_cm", "largura_cm", "altura_cm", "peso_kg", "estoque_atual", "estoque_minimo", "custo_base", "custo_dropcore"] as const;
    for (const k of ALLOWED_KEYS) {
      if (!(k in patch)) continue;
      const v = patch[k];
      if (v == null || v === "") {
        clean[k] = null;
      } else if (textKeys.includes(k as typeof textKeys[number]) && typeof v === "string") {
        clean[k] = toTitleCase(v);
      } else if (numKeys.includes(k as typeof numKeys[number])) {
        if (typeof v === "number" && Number.isFinite(v)) clean[k] = v;
        else if (typeof v === "string") { const n = parseFloat(v.replace(",", ".")); clean[k] = Number.isFinite(n) ? n : null; }
        else clean[k] = null;
      } else if (typeof v === "string") {
        clean[k] = toTitleCase(v);
      }
    }
    if (Object.keys(clean).length === 0) {
      return NextResponse.json({ error: "Nenhum campo permitido no patch." }, { status: 400 });
    }

    const supabase = supabaseService();

    const { data: rows, error: fetchErr } = await supabase
      .from("skus")
      .select("id")
      .eq("org_id", org_id)
      .like("sku", `${prefix}%`);

    if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    if (!rows?.length) {
      return NextResponse.json({ error: "Nenhum SKU encontrado neste grupo." }, { status: 404 });
    }

    const { error: updateErr } = await supabase
      .from("skus")
      .update(clean)
      .eq("org_id", org_id)
      .like("sku", `${prefix}%`);

    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

    return NextResponse.json({ ok: true, updated: rows.length });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    const status = orgErrorHttpStatus(e);
    return NextResponse.json({ error: msg }, { status });
  }
}
