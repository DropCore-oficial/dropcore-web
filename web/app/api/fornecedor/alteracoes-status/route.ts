/**
 * GET /api/fornecedor/alteracoes-status — status das alterações por SKU (pendente / último aprovado ou rejeitado)
 * Usado na lista de produtos e na edição para mostrar badge "Em análise", "Aprovado" ou "Recusado".
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

export async function GET(req: Request) {
  try {
    const ctx = await getFornecedorFromToken(req);
    if (!ctx) {
      return NextResponse.json({ error: "Não autenticado como fornecedor." }, { status: 401 });
    }

    const { data: pendentes, error: errPend } = await supabaseAdmin
      .from("sku_alteracoes_pendentes")
      .select("sku_id")
      .eq("fornecedor_id", ctx.fornecedor_id)
      .eq("org_id", ctx.org_id)
      .eq("status", "pendente");

    if (errPend) return NextResponse.json({ error: errPend.message }, { status: 500 });

    const pendentesIds = (pendentes ?? []).map((r) => r.sku_id);

    const { data: analisadas, error: errAnal } = await supabaseAdmin
      .from("sku_alteracoes_pendentes")
      .select("sku_id, status, motivo_rejeicao, analisado_em")
      .eq("fornecedor_id", ctx.fornecedor_id)
      .eq("org_id", ctx.org_id)
      .in("status", ["aprovado", "rejeitado"])
      .not("analisado_em", "is", null)
      .order("analisado_em", { ascending: false });

    if (errAnal) return NextResponse.json({ error: errAnal.message }, { status: 500 });

    const porSku: Record<string, { status: "aprovado" | "rejeitado"; motivo_rejeicao?: string | null; analisado_em: string }> = {};
    for (const row of analisadas ?? []) {
      if (row.sku_id && !(row.sku_id in porSku)) {
        porSku[row.sku_id] = {
          status: row.status as "aprovado" | "rejeitado",
          motivo_rejeicao: row.motivo_rejeicao ?? undefined,
          analisado_em: row.analisado_em ?? "",
        };
      }
    }

    return NextResponse.json({ pendentes: pendentesIds, por_sku: porSku });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
