/**
 * POST /api/org/cd/baixa-manual?orgId=...
 * Único mecanismo pra desligamento do fornecedor do CD e avaria/perda física — diferenciados
 * só pelo motivo. body: { fornecedor_id, sku_id, quantidade, motivo, observacao? }
 */
import { NextResponse } from "next/server";
import { OrgAuthError, orgErrorHttpStatus, requireAdminForOrgId } from "@/lib/apiOrgAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { notifyCdBaixaManual } from "@/lib/notifyCdFornecedor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MOTIVOS = ["saida_cd_fornecedor_desligado", "avaria_perda_dropcore", "defeito_fabrica_fornecedor"] as const;

export async function POST(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const orgId = (searchParams.get("orgId") || "").trim();
    if (!orgId) return NextResponse.json({ error: "orgId é obrigatório" }, { status: 400 });
    const { user_id } = await requireAdminForOrgId(req, orgId);

    const body = await req.json().catch(() => ({}));
    const fornecedorId = typeof body?.fornecedor_id === "string" ? body.fornecedor_id.trim() : "";
    const skuId = typeof body?.sku_id === "string" ? body.sku_id.trim() : "";
    const quantidade = Number(body?.quantidade);
    const motivo = typeof body?.motivo === "string" ? body.motivo.trim() : "";

    if (!fornecedorId || !skuId) return NextResponse.json({ error: "fornecedor_id e sku_id são obrigatórios." }, { status: 400 });
    if (!Number.isFinite(quantidade) || quantidade <= 0) {
      return NextResponse.json({ error: "quantidade deve ser um número positivo." }, { status: 400 });
    }
    if (!MOTIVOS.includes(motivo as (typeof MOTIVOS)[number])) {
      return NextResponse.json({ error: "motivo inválido." }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin.rpc("fn_cd_baixa_manual", {
      p_fornecedor_id: fornecedorId,
      p_sku_id: skuId,
      p_quantidade: quantidade,
      p_motivo: motivo,
      p_org_id: orgId,
      p_criado_por_user_id: user_id,
      p_observacao: typeof body?.observacao === "string" ? body.observacao.trim() || null : null,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const result = data as { ok: boolean; error_code?: string };
    if (!result.ok) {
      const mensagens: Record<string, string> = {
        QUANTIDADE_INVALIDA: "Quantidade inválida.",
        MOTIVO_INVALIDO: "Motivo inválido.",
        SKU_NAO_PERTENCE_AO_FORNECEDOR: "Esse SKU não pertence ao fornecedor selecionado.",
      };
      return NextResponse.json({ error: mensagens[result.error_code ?? ""] ?? "Erro ao registrar baixa." }, { status: 400 });
    }

    const { data: skuRow } = await supabaseAdmin.from("skus").select("sku, nome_produto").eq("id", skuId).maybeSingle();
    await notifyCdBaixaManual({
      fornecedor_id: fornecedorId,
      sku: skuRow?.sku ?? "SKU",
      nome_produto: skuRow?.nome_produto ?? null,
      quantidade,
      motivo,
    });

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    if (e instanceof OrgAuthError) return NextResponse.json({ error: e.message }, { status: e.statusCode });
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: orgErrorHttpStatus(e) });
  }
}
