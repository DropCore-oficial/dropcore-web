/**
 * POST /api/fornecedor/cd/remessa — fornecedor declara que está enviando N unidades de um
 * SKU pro Centro de Distribuição DropCore. Não altera estoque_atual (só a conferência física
 * do operador faz isso) — ver fn_cd_conferencia_confirmar.
 * body: { sku_id, quantidade, observacao? }
 */
import { NextResponse } from "next/server";
import { getFornecedorContextFromBearer } from "@/lib/fornecedorAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { notifyAdminsCdRemessaDeclarada } from "@/lib/notifyAdminsCdRemessaDeclarada";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const ctx = await getFornecedorContextFromBearer(req);
    if (!ctx) return NextResponse.json({ error: "Não autenticado como fornecedor." }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const skuId = typeof body?.sku_id === "string" ? body.sku_id.trim() : "";
    const quantidade = Number(body?.quantidade);
    if (!skuId) return NextResponse.json({ error: "sku_id é obrigatório." }, { status: 400 });
    if (!Number.isFinite(quantidade) || quantidade <= 0) {
      return NextResponse.json({ error: "quantidade deve ser um número positivo." }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin.rpc("fn_cd_remessa_declarar", {
      p_fornecedor_id: ctx.fornecedor_id,
      p_sku_id: skuId,
      p_quantidade: quantidade,
      p_org_id: ctx.org_id,
      p_criado_por_user_id: ctx.user_id,
      p_observacao: typeof body?.observacao === "string" ? body.observacao.trim() || null : null,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const result = data as { ok: boolean; error_code?: string };
    if (!result.ok) {
      const mensagens: Record<string, string> = {
        QUANTIDADE_INVALIDA: "Quantidade inválida.",
        SKU_NAO_PERTENCE_AO_FORNECEDOR: "Esse SKU não é seu.",
        FORNECEDOR_NAO_OPERA_NO_CD: "Seu catálogo não está no Centro de Distribuição.",
      };
      return NextResponse.json({ error: mensagens[result.error_code ?? ""] ?? "Erro ao declarar remessa." }, { status: 400 });
    }

    const [{ data: skuRow }, { data: fornecedorRow }] = await Promise.all([
      supabaseAdmin.from("skus").select("sku, nome_produto").eq("id", skuId).maybeSingle(),
      supabaseAdmin.from("fornecedores").select("nome").eq("id", ctx.fornecedor_id).maybeSingle(),
    ]);
    await notifyAdminsCdRemessaDeclarada({
      org_id: ctx.org_id,
      fornecedor_id: ctx.fornecedor_id,
      fornecedor_nome: fornecedorRow?.nome ?? "Fornecedor",
      sku: skuRow?.sku ?? "SKU",
      nome_produto: skuRow?.nome_produto ?? null,
      quantidade,
    });

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
