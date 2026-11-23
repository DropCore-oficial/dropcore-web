/**
 * POST /api/org/cd/conferencia?orgId=...
 * Operador confirma a entrada física de uma remessa declarada. body: { remessa_id, quantidade_conferida, observacao? }
 */
import { NextResponse } from "next/server";
import { OrgAuthError, orgErrorHttpStatus, requireOrgStaffForOrgId, getUserIdFromBearerOrCookies } from "@/lib/apiOrgAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { notifyCdRemessaConferida } from "@/lib/notifyCdFornecedor";

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
    const remessaId = typeof body?.remessa_id === "string" ? body.remessa_id.trim() : "";
    const quantidade = Number(body?.quantidade_conferida);
    if (!remessaId) return NextResponse.json({ error: "remessa_id é obrigatório." }, { status: 400 });
    if (!Number.isFinite(quantidade) || quantidade <= 0) {
      return NextResponse.json({ error: "quantidade_conferida deve ser um número positivo." }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin.rpc("fn_cd_conferencia_confirmar", {
      p_remessa_ref_id: remessaId,
      p_quantidade_conferida: quantidade,
      p_org_id: orgId,
      p_criado_por_user_id: user_id,
      p_observacao: typeof body?.observacao === "string" ? body.observacao.trim() || null : null,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const result = data as {
      ok: boolean;
      error_code?: string;
      movimento?: { fornecedor_id: string; sku_id: string; quantidade: number };
      declarado?: number;
    };
    if (!result.ok) {
      const mensagens: Record<string, string> = {
        QUANTIDADE_INVALIDA: "Quantidade inválida.",
        REMESSA_NAO_ENCONTRADA: "Remessa não encontrada.",
        REMESSA_JA_CONFERIDA: "Essa remessa já foi conferida.",
      };
      return NextResponse.json({ error: mensagens[result.error_code ?? ""] ?? "Erro ao conferir." }, { status: 400 });
    }

    if (result.movimento) {
      const { data: skuRow } = await supabaseAdmin
        .from("skus")
        .select("sku, nome_produto")
        .eq("id", result.movimento.sku_id)
        .maybeSingle();
      await notifyCdRemessaConferida({
        fornecedor_id: result.movimento.fornecedor_id,
        sku: skuRow?.sku ?? "SKU",
        nome_produto: skuRow?.nome_produto ?? null,
        quantidade_declarada: result.declarado ?? result.movimento.quantidade,
        quantidade_conferida: result.movimento.quantidade,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    if (e instanceof OrgAuthError) return NextResponse.json({ error: e.message }, { status: e.statusCode });
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: orgErrorHttpStatus(e) });
  }
}
