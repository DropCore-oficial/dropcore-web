/**
 * GET /api/fornecedor/ml-sync-log — histórico recente de push de estoque pro Mercado Livre
 * (sucesso ou falha), pra fornecedor confirmar que um ajuste chegou no anúncio do seller
 * sem precisar acesso à conta ML dele. Ver web/lib/mlSyncLog.ts.
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { listarMlSyncLogPorFornecedor } from "@/lib/mlSyncLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getFornecedorFromToken(req: Request): Promise<{ fornecedor_id: string; org_id: string } | null> {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return null;

  const sbAnon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );
  const { data: userData, error: userErr } = await sbAnon.auth.getUser(token);
  if (userErr || !userData?.user) return null;

  const { data: member } = await supabaseAdmin
    .from("org_members")
    .select("org_id, fornecedor_id")
    .eq("user_id", userData.user.id)
    .not("fornecedor_id", "is", null)
    .limit(1)
    .maybeSingle();

  if (!member?.fornecedor_id) return null;
  return { fornecedor_id: member.fornecedor_id, org_id: member.org_id };
}

export async function GET(req: Request) {
  const ctx = await getFornecedorFromToken(req);
  if (!ctx) {
    return NextResponse.json({ error: "Não autenticado como fornecedor." }, { status: 401 });
  }
  const sku = new URL(req.url).searchParams.get("sku")?.trim().toUpperCase() || undefined;
  const itens = await listarMlSyncLogPorFornecedor(ctx.fornecedor_id, { sku, limit: 20 });
  return NextResponse.json({ itens });
}
