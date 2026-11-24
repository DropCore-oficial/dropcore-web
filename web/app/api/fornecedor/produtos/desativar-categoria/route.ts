/**
 * POST /api/fornecedor/produtos/desativar-categoria
 * Desativa ou reativa toda a categoria (grupo de variantes) pelo paiKey.
 * Body: { grupoKey: string, acao: "desativar" | "ativar" }
 */
import { NextResponse } from "next/server";
import { resolverFornecedorContexto } from "@/lib/fornecedorAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function paiKey(sku: string): string {
  const s = (sku || "").trim().toUpperCase();
  const m = s.match(/^([A-Z]+)(\d{3})(\d{3})$/);
  if (!m) return s;
  return `${m[1]}${m[2]}000`;
}

export async function POST(req: Request) {
  try {
    const ctx = await resolverFornecedorContexto(req);
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
