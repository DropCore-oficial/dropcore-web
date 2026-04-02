import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { assertPodeAtivarMaisSkus } from "@/lib/planos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function supabaseService() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Faltou SUPABASE env (URL ou SERVICE_ROLE).");
  return createClient(url, key, { auth: { persistSession: false } });
}

async function getMe(req: Request) {
  const headers: Record<string, string> = {
    cookie: req.headers.get("cookie") || "",
  };
  const auth = req.headers.get("authorization");
  if (auth) headers["Authorization"] = auth;

  const r = await fetch(new URL("/api/org/me", req.url), {
    headers,
    cache: "no-store",
  });
  const j = await r.json();
  if (!r.ok || !j?.ok) throw new Error(j?.error || "Unauthorized");
  return j as { org_id: string; role_base: "owner" | "admin" | "operacional"; plano?: string };
}

export async function PATCH(req: Request) {
  try {
    const { org_id, role_base, plano } = await getMe(req);
    if (role_base !== "owner" && role_base !== "admin") {
      return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
    }

    const body = await req.json();
    const id = body?.id;
    if (!id) return NextResponse.json({ error: "Faltou id." }, { status: 400 });

    const supabase = supabaseService();

    const { data: skuRow } = await supabase
      .from("skus")
      .select("nome_produto, cor")
      .eq("id", id)
      .eq("org_id", org_id)
      .maybeSingle();

    const check = await assertPodeAtivarMaisSkus(supabase, org_id, plano ?? null, [
      { nome_produto: skuRow?.nome_produto ?? null, cor: skuRow?.cor ?? null },
    ]);
    if (!check.ok) {
      return NextResponse.json({ error: check.error }, { status: 403 });
    }

    const { error } = await supabase
      .from("skus")
      .update({ status: "ativo" })
      .eq("id", id)
      .eq("org_id", org_id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    const status = msg === "Unauthorized" || msg === "Token inválido ou expirado." ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
