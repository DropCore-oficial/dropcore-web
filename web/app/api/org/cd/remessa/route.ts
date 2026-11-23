/**
 * POST /api/org/cd/remessa?orgId=... — admin/operador declara remessa em nome do fornecedor
 * (ex: fornecedor ligou avisando que já despachou, sem acesso ao painel no momento).
 * body: { fornecedor_id, sku_id, quantidade, observacao? }
 */
import { NextResponse } from "next/server";
import { OrgAuthError, orgErrorHttpStatus, requireOrgStaffForOrgId, getUserIdFromBearerOrCookies } from "@/lib/apiOrgAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { notifyAdminsCdRemessaDeclarada } from "@/lib/notifyAdminsCdRemessaDeclarada";
import { notifyCdRemessaDeclaradaPeloAdmin } from "@/lib/notifyCdFornecedor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const orgId = (searchParams.get("orgId") || "").trim();
    if (!orgId) return NextResponse.json({ error: "orgId é obrigatório" }, { status: 400 });
    await requireOrgStaffForOrgId(req, orgId);
    const user_id = await getUserIdFromBearerOrCookies(req);
    if (!user_id) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const fornecedorId = typeof body?.fornecedor_id === "string" ? body.fornecedor_id.trim() : "";
    const skuId = typeof body?.sku_id === "string" ? body.sku_id.trim() : "";
    const quantidade = Number(body?.quantidade);
    if (!fornecedorId || !skuId) return NextResponse.json({ error: "fornecedor_id e sku_id são obrigatórios." }, { status: 400 });
    if (!Number.isFinite(quantidade) || quantidade <= 0) {
      return NextResponse.json({ error: "quantidade deve ser um número positivo." }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin.rpc("fn_cd_remessa_declarar", {
      p_fornecedor_id: fornecedorId,
      p_sku_id: skuId,
      p_quantidade: quantidade,
      p_org_id: orgId,
      p_criado_por_user_id: user_id,
      p_observacao: typeof body?.observacao === "string" ? body.observacao.trim() || null : null,
      p_criado_por_tipo: "admin",
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const result = data as { ok: boolean; error_code?: string };
    if (!result.ok) {
      const mensagens: Record<string, string> = {
        QUANTIDADE_INVALIDA: "Quantidade inválida.",
        SKU_NAO_PERTENCE_AO_FORNECEDOR: "Esse SKU não pertence ao fornecedor selecionado.",
        FORNECEDOR_NAO_OPERA_NO_CD: "Esse fornecedor não está no Centro de Distribuição.",
      };
      return NextResponse.json({ error: mensagens[result.error_code ?? ""] ?? "Erro ao declarar remessa." }, { status: 400 });
    }

    const [{ data: skuRow }, { data: fornecedorRow }] = await Promise.all([
      supabaseAdmin.from("skus").select("sku, nome_produto").eq("id", skuId).maybeSingle(),
      supabaseAdmin.from("fornecedores").select("nome").eq("id", fornecedorId).maybeSingle(),
    ]);

    await Promise.all([
      notifyAdminsCdRemessaDeclarada({
        org_id: orgId,
        fornecedor_id: fornecedorId,
        fornecedor_nome: fornecedorRow?.nome ?? "Fornecedor",
        sku: skuRow?.sku ?? "SKU",
        nome_produto: skuRow?.nome_produto ?? null,
        quantidade,
      }),
      notifyCdRemessaDeclaradaPeloAdmin({
        fornecedor_id: fornecedorId,
        sku: skuRow?.sku ?? "SKU",
        nome_produto: skuRow?.nome_produto ?? null,
        quantidade,
      }),
    ]);

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    if (e instanceof OrgAuthError) return NextResponse.json({ error: e.message }, { status: e.statusCode });
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: orgErrorHttpStatus(e) });
  }
}
