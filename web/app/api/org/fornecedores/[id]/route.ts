import { NextResponse } from "next/server";
import { deleteFornecedorCascade } from "@/lib/fornecedorDeleteCascade";
import { OrgAuthError, orgErrorHttpStatus, requireAdminForOrgId } from "@/lib/apiOrgAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { clampMensalidadeDiaVencimento } from "@/lib/mensalidadeDiaVencimento";
import { logAdminAction } from "@/lib/adminAuditLog";
import { buildExpedicaoPadraoLinha } from "@/lib/expedicaoFornecedorFormat";
import { CD_EXPEDICAO_ENDERECO_FIXO } from "@/lib/cdEnderecoExpedicaoFixo";
import { notifySellerDesvinculoFornecedorCd } from "@/lib/notifySellerVinculoFornecedorCd";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PATCH /api/org/fornecedores/[id]?orgId=...
 * body: { premium?: boolean, mensalidade_dia_vencimento?: number | null,
 *   opera_no_cd?: boolean, cd_fulfillment_taxa_valor?: number }
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { searchParams } = new URL(req.url);
    const orgId = (searchParams.get("orgId") || "").trim();
    if (!orgId) {
      return NextResponse.json({ error: "orgId é obrigatório" }, { status: 400 });
    }

    await requireAdminForOrgId(req, orgId);

    const { id } = await params;
    if (!id) return NextResponse.json({ error: "id é obrigatório" }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    const updates: Record<string, unknown> = {};
    if (typeof body?.premium === "boolean") {
      updates.premium = body.premium;
    }
    if (body?.mensalidade_dia_vencimento !== undefined) {
      if (body.mensalidade_dia_vencimento === null) {
        updates.mensalidade_dia_vencimento = null;
      } else {
        updates.mensalidade_dia_vencimento = clampMensalidadeDiaVencimento(Number(body.mensalidade_dia_vencimento));
      }
    }
    if (typeof body?.opera_no_cd === "boolean") {
      // Saindo do CD: não pode enquanto ainda tiver seller vinculado a ele por lá — senão o
      // vínculo fica "órfão" (seller continua pagando/conectado a um fornecedor que o painel
      // já não trata mais como CD). Tem que desvincular todos os sellers primeiro.
      if (body.opera_no_cd === false) {
        const { count, error: countErr } = await supabaseAdmin
          .from("seller_fornecedor_vinculos")
          .select("id", { count: "exact", head: true })
          .eq("fornecedor_id", id)
          .is("desvinculado_em", null);
        if (countErr) return NextResponse.json({ error: countErr.message }, { status: 500 });
        if ((count ?? 0) > 0) {
          return NextResponse.json(
            {
              error: `Esse fornecedor ainda tem ${count} seller(s) vinculado(s) pelo Centro de Distribuição — desvincule todos antes de tirar do CD.`,
              code: "FORNECEDOR_CD_COM_VINCULOS_ATIVOS",
            },
            { status: 400 },
          );
        }
      }
      updates.opera_no_cd = body.opera_no_cd;
      // Entrando no CD: o despacho passa a sair do armazém físico único da DropCore, não
      // mais do endereço próprio do fornecedor — regra confirmada 2026-11-21.
      if (body.opera_no_cd === true) {
        Object.assign(updates, CD_EXPEDICAO_ENDERECO_FIXO, {
          expedicao_padrao_linha: buildExpedicaoPadraoLinha(CD_EXPEDICAO_ENDERECO_FIXO),
        });
      }
    }
    if (body?.cd_fulfillment_taxa_valor !== undefined) {
      const taxa = Number(body.cd_fulfillment_taxa_valor);
      if (!Number.isFinite(taxa) || taxa < 0) {
        return NextResponse.json({ error: "cd_fulfillment_taxa_valor inválido." }, { status: 400 });
      }
      updates.cd_fulfillment_taxa_valor = taxa;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "Envie { premium, mensalidade_dia_vencimento, opera_no_cd, cd_fulfillment_taxa_valor }." },
        { status: 400 },
      );
    }

    const { data, error } = await supabaseAdmin
      .from("fornecedores")
      .update(updates)
      .eq("id", id)
      .eq("org_id", orgId)
      .select("id, premium, mensalidade_dia_vencimento, opera_no_cd, cd_fulfillment_taxa_valor")
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "Fornecedor não encontrado" }, { status: 404 });

    return NextResponse.json({ ok: true, ...data });
  } catch (e: unknown) {
    if (e instanceof OrgAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    }
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: orgErrorHttpStatus(e) });
  }
}

/**
 * DELETE /api/org/fornecedores/[id]?orgId=...
 */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { searchParams } = new URL(req.url);
    const orgId = (searchParams.get("orgId") || "").trim();
    if (!orgId) {
      return NextResponse.json({ error: "orgId é obrigatório" }, { status: 400 });
    }

    const { user_id } = await requireAdminForOrgId(req, orgId);

    const { id } = await params;
    if (!id) return NextResponse.json({ error: "id é obrigatório" }, { status: 400 });

    // Capturado antes do cascade apagar as linhas — pra avisar quem tinha vínculo ativo.
    const { data: vinculosAtivosAntes } = await supabaseAdmin
      .from("seller_fornecedor_vinculos")
      .select("seller_id")
      .eq("org_id", orgId)
      .eq("fornecedor_id", id)
      .is("desvinculado_em", null);

    const result = await deleteFornecedorCascade(supabaseAdmin, orgId, id);
    if (!result.ok) {
      const status = result.message.includes("não encontrado") ? 404 : 400;
      return NextResponse.json({ error: result.message }, { status });
    }

    if (vinculosAtivosAntes && vinculosAtivosAntes.length > 0) {
      await Promise.all(
        vinculosAtivosAntes.map((v) =>
          notifySellerDesvinculoFornecedorCd({
            seller_id: v.seller_id as string,
            fornecedor_id: id,
            motivo: "fornecedor_excluido",
          })
        )
      );
    }

    await logAdminAction({
      req,
      orgId,
      actorUserId: user_id,
      action: "fornecedor.excluir",
      targetTable: "fornecedores",
      targetId: id,
    });

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    if (e instanceof OrgAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    }
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: orgErrorHttpStatus(e) });
  }
}
