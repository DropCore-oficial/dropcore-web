import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAdmin } from "@/lib/apiOrgAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { org_id } = await requireAdmin(req);
    const body = await req.json();
    const sku = body?.sku ? String(body.sku).trim().toUpperCase() : null;
    const skuPai = body?.skuPai ? String(body.skuPai).trim().toUpperCase() : null;
    const mode: "delete" | "soft" = body?.mode === "soft" ? "soft" : "delete";

    if (!sku && !skuPai) {
      return NextResponse.json({ error: "sku ou skuPai obrigatório" }, { status: 400 });
    }

    // se vier skuPai, deleta/inativa todos os filhos (mesmo prefixo+bloco)
    if (skuPai) {
      const prefix = skuPai.slice(0, skuPai.length - 3);
      const { data, error: listErr } = await supabaseAdmin
        .from("skus")
        .select("sku")
        .like("sku", `${prefix}%`)
        .eq("org_id", org_id);

      if (listErr) return NextResponse.json({ error: listErr.message }, { status: 500 });

      const skus = (data || []).map((x: { sku: string }) => x.sku).filter(Boolean);
      if (!skus.length) return NextResponse.json({ ok: true, count: 0 });

      if (mode === "soft") {
        const { error } = await supabaseAdmin.from("skus").update({ status: "inativo" }).in("sku", skus).eq("org_id", org_id);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ ok: true, mode, count: skus.length });
      }

      const { error } = await supabaseAdmin.from("skus").delete().in("sku", skus).eq("org_id", org_id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, mode, count: skus.length });
    }

    if (mode === "soft") {
      const { error } = await supabaseAdmin.from("skus").update({ status: "inativo" }).eq("sku", sku).eq("org_id", org_id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, mode, sku });
    }

    const { error } = await supabaseAdmin.from("skus").delete().eq("sku", sku).eq("org_id", org_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, mode, sku });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro no delete";
    const status = msg === "Unauthorized" || msg === "Usuário sem organização." ? 401 : msg === "Sem permissão." ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
