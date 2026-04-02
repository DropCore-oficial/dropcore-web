/**
 * GET /api/fornecedor/produtos/tabela-medidas?grupoKey=DJU100000
 * Retorna tabela de medidas aprovada do grupo e, se houver, a proposta pendente.
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

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

function paiKey(sku: string): string {
  const s = (sku || "").trim().toUpperCase();
  const m = s.match(/^([A-Z]+)(\d{3})(\d{3})$/);
  return m ? `${m[1]}${m[2]}000` : s;
}

export async function GET(req: Request) {
  try {
    const ctx = await getFornecedorFromToken(req);
    if (!ctx) return NextResponse.json({ error: "Não autenticado como fornecedor." }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const grupoKey = (searchParams.get("grupoKey") ?? "").trim().toUpperCase();
    if (!grupoKey) return NextResponse.json({ error: "grupoKey é obrigatório." }, { status: 400 });

    const { data: aprovada } = await supabaseAdmin
      .from("produto_tabela_medidas")
      .select("tipo_produto, medidas")
      .eq("org_id", ctx.org_id)
      .eq("fornecedor_id", ctx.fornecedor_id)
      .eq("grupo_sku", grupoKey)
      .maybeSingle();

    let pendente: { tipo_produto: string; medidas: Record<string, Record<string, number>> } | null = null;
    const prefix = grupoKey.length >= 6 ? grupoKey.slice(0, -3) : grupoKey;
    const { data: skus } = await supabaseAdmin
      .from("skus")
      .select("id, sku")
      .eq("org_id", ctx.org_id)
      .eq("fornecedor_id", ctx.fornecedor_id)
      .ilike("sku", `${prefix}%`);
    const skuIds = (skus ?? []).filter((s) => paiKey(String(s.sku ?? "")) === grupoKey).map((s) => s.id);
    if (skuIds.length > 0) {
      const { data: alt } = await supabaseAdmin
        .from("sku_alteracoes_pendentes")
        .select("dados_propostos")
        .eq("fornecedor_id", ctx.fornecedor_id)
        .eq("org_id", ctx.org_id)
        .eq("status", "pendente")
        .in("sku_id", skuIds)
        .limit(1)
        .maybeSingle();
      const dp = alt?.dados_propostos as Record<string, unknown> | null;
      if (dp?.tabela_medidas != null && typeof dp.tabela_medidas === "object") {
        const tm = dp.tabela_medidas as { tipo_produto?: string; medidas?: Record<string, Record<string, number>> };
        pendente = {
          tipo_produto: typeof tm.tipo_produto === "string" ? tm.tipo_produto : "generico",
          medidas: (tm.medidas && typeof tm.medidas === "object") ? tm.medidas : {},
        };
      }
    }

    return NextResponse.json({
      aprovada: aprovada
        ? { tipo_produto: aprovada.tipo_produto ?? "generico", medidas: aprovada.medidas ?? {} }
        : null,
      pendente,
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro inesperado" }, { status: 500 });
  }
}
