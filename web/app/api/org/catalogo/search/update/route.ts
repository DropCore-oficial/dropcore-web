import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { toTitleCase } from "@/lib/formatText";
import { orgErrorHttpStatus, requireAdmin } from "@/lib/apiOrgAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function supabaseService() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Faltou SUPABASE env (URL ou SERVICE_ROLE).");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function PATCH(req: Request) {
  try {
    const { org_id } = await requireAdmin(req);

    const { id, patch } = await req.json();
    if (!id) return NextResponse.json({ error: "Faltou id." }, { status: 400 });
    if (!patch || typeof patch !== "object") {
      return NextResponse.json({ error: "Faltou patch." }, { status: 400 });
    }

    // whitelist: só campos editáveis
    const allowed = [
      "nome_produto",
      "cor",
      "tamanho",
      "peso_kg",
      "estoque_atual",
      "estoque_minimo",
      "custo_base",
      "custo_dropcore",
      "categoria",
      "dimensoes_pacote",
      "comprimento_cm",
      "largura_cm",
      "altura_cm",
    ] as const;

    const clean: any = {};
    const textFields = ["nome_produto", "categoria", "cor", "tamanho", "dimensoes_pacote"] as const;
    const numFields = ["comprimento_cm", "largura_cm", "altura_cm"] as const;
    for (const k of allowed) {
      if (!(k in patch)) continue;
      const v = patch[k];
      if (textFields.includes(k as typeof textFields[number]) && (typeof v === "string" || v == null)) {
        clean[k] = v == null || v === "" ? null : toTitleCase(v);
      } else if (numFields.includes(k as typeof numFields[number])) {
        if (v == null || v === "") clean[k] = null;
        else if (typeof v === "number" && Number.isFinite(v)) clean[k] = v;
        else if (typeof v === "string") { const n = parseFloat(v.replace(",", ".")); clean[k] = Number.isFinite(n) ? n : null; }
        else clean[k] = null;
      } else {
        clean[k] = v;
      }
    }

    const supabase = supabaseService();

    const { error } = await supabase
      .from("skus")
      .update(clean)
      .eq("id", id)
      .eq("org_id", org_id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    const status = orgErrorHttpStatus(e);
    return NextResponse.json({ error: msg }, { status });
  }
}
