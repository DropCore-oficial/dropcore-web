import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAdmin } from "@/lib/apiOrgAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: Request) {
  try {
    const { org_id } = await requireAdmin(req);

    const body = await req.json();
    const skus: string[] = Array.isArray(body?.skus) ? body.skus : [];
    const patch = body?.patch || null;

    const clean = skus.map((s) => String(s || "").trim().toUpperCase()).filter(Boolean);
    if (!clean.length) return NextResponse.json({ error: "skus obrigatório" }, { status: 400 });
    if (!patch || typeof patch !== "object") return NextResponse.json({ error: "patch inválido" }, { status: 400 });

    const allowed = new Set([
      "nome_produto",
      "cor",
      "tamanho",
      "estoque_atual",
      "custo_base",
      "custo_dropcore",
      "peso_kg",
      "status",
      "estoque_minimo",
    ]);

    const safePatch: Record<string, unknown> = {};
    for (const k of Object.keys(patch)) {
      if (allowed.has(k)) safePatch[k] = patch[k];
    }

    if (!Object.keys(safePatch).length) {
      return NextResponse.json({ error: "Nenhum campo permitido no patch" }, { status: 400 });
    }

    // Filtra apenas SKUs da org do usuário autenticado
    const { error } = await supabaseAdmin
      .from("skus")
      .update(safePatch)
      .in("sku", clean)
      .eq("org_id", org_id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, count: clean.length });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro no bulk-update";
    const status = msg === "Unauthorized" || msg === "Usuário sem organização." ? 401 : msg === "Sem permissão." ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
