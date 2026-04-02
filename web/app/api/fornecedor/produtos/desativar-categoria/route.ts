/**
 * POST /api/fornecedor/produtos/desativar-categoria
 * Desativa ou reativa toda a categoria (grupo de variantes) pelo paiKey.
 * Body: { grupoKey: string, acao: "desativar" | "ativar" }
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function paiKey(sku: string): string {
  const s = (sku || "").trim().toUpperCase();
  const m = s.match(/^([A-Z]+)(\d{3})(\d{3})$/);
  if (!m) return s;
  return `${m[1]}${m[2]}000`;
}

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

export async function POST(req: Request) {
  try {
    const ctx = await getFornecedorFromToken(req);
    if (!ctx) {
      return NextResponse.json({ error: "Não autenticado como fornecedor." }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const grupoKey = typeof body?.grupoKey === "string" ? body.grupoKey.trim().toUpperCase() : "";
    const acao = body?.acao === "ativar" ? "ativar" : "desativar";

    if (!grupoKey) {
      return NextResponse.json({ error: "grupoKey é obrigatório." }, { status: 400 });
    }

    // Buscar todos os SKUs do grupo que pertencem ao fornecedor
    const { data: skus } = await supabaseAdmin
      .from("skus")
      .select("id, sku")
      .eq("org_id", ctx.org_id)
      .eq("fornecedor_id", ctx.fornecedor_id);

    if (!skus || skus.length === 0) {
      return NextResponse.json({ error: "Nenhum produto encontrado." }, { status: 404 });
    }

    const idsNoGrupo = skus.filter((s) => paiKey(s.sku) === grupoKey || s.sku === grupoKey).map((s) => s.id);

    if (idsNoGrupo.length === 0) {
      return NextResponse.json({ error: "Categoria não encontrada ou não pertence a você." }, { status: 404 });
    }

    const novoStatus = acao === "ativar" ? "ativo" : "inativo";

    const { error } = await supabaseAdmin
      .from("skus")
      .update({ status: novoStatus })
      .in("id", idsNoGrupo)
      .eq("org_id", ctx.org_id)
      .eq("fornecedor_id", ctx.fornecedor_id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, count: idsNoGrupo.length, status: novoStatus });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
