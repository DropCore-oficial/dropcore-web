/**
 * /api/org/sellers/[id]/fornecedor-cd — vínculo seller<->fornecedor unificado (avulso OU
 * CD, mesma regra única de fn_seller_fornecedor_vincular). Nome da rota ficou do tempo em
 * que só cobria CD — mantido pra não forçar troca de URL, mas hoje vale pra qualquer
 * vínculo. Rota dedicada (separada do PATCH genérico de sellers/[id]) pra não inflar mais
 * aquele arquivo.
 *
 * GET: lista vínculos ativos do seller.
 * POST body: { fornecedor_id } — admin vincula direto (notifica o seller sempre).
 * PATCH body: { vinculo_id, acao: "desvincular" } |
 *             { vinculo_id, acao: "cortesia", cortesia: boolean, cortesia_ate?: string|null }
 */
import { NextResponse } from "next/server";
import { OrgAuthError, orgErrorHttpStatus, requireAdminForOrgId } from "@/lib/apiOrgAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { notifySellerVinculoFornecedorCd, notifySellerDesvinculoFornecedorCd } from "@/lib/notifySellerVinculoFornecedorCd";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { searchParams } = new URL(req.url);
    const orgId = (searchParams.get("orgId") || "").trim();
    if (!orgId) return NextResponse.json({ error: "orgId é obrigatório" }, { status: 400 });

    await requireAdminForOrgId(req, orgId);
    const { id: sellerId } = await params;

    const { data, error } = await supabaseAdmin.rpc("fn_seller_fornecedor_vinculos_lista", {
      p_seller_id: sellerId,
      p_org_id: orgId,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, vinculos: data ?? [] });
  } catch (e: unknown) {
    if (e instanceof OrgAuthError) return NextResponse.json({ error: e.message }, { status: e.statusCode });
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: orgErrorHttpStatus(e) });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { searchParams } = new URL(req.url);
    const orgId = (searchParams.get("orgId") || "").trim();
    if (!orgId) return NextResponse.json({ error: "orgId é obrigatório" }, { status: 400 });

    const { user_id } = await requireAdminForOrgId(req, orgId);
    const { id: sellerId } = await params;
    const body = await req.json().catch(() => ({}));
    const fornecedorId = typeof body?.fornecedor_id === "string" ? body.fornecedor_id.trim() : "";
    if (!fornecedorId) return NextResponse.json({ error: "fornecedor_id é obrigatório." }, { status: 400 });

    const { data, error } = await supabaseAdmin.rpc("fn_seller_fornecedor_vincular", {
      p_seller_id: sellerId,
      p_fornecedor_id: fornecedorId,
      p_org_id: orgId,
      p_criado_por_tipo: "admin",
      p_criado_por_user_id: user_id,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const result = data as { ok: boolean; error_code?: string; vinculo?: { fornecedor_id: string } };
    if (!result.ok) {
      const mensagens: Record<string, string> = {
        FORNECEDOR_NAO_ENCONTRADO: "Fornecedor não encontrado.",
        FORNECEDOR_NAO_OPERA_NO_CD: "Esse fornecedor não opera no Centro de Distribuição.",
        JA_TEM_FORNECEDOR_VINCULADO: "Este seller já tem um fornecedor vinculado — desvincule antes de trocar.",
        JA_VINCULADO: "Seller já está vinculado a este fornecedor.",
      };
      return NextResponse.json(
        { error: mensagens[result.error_code ?? ""] ?? "Erro ao vincular.", code: result.error_code },
        { status: 400 }
      );
    }

    // Admin pode vincular sem o seller pedir — ele sempre é avisado, nunca fica oculto.
    await notifySellerVinculoFornecedorCd({ org_id: orgId, seller_id: sellerId, fornecedor_id: fornecedorId });

    return NextResponse.json({ ok: true, vinculo: result.vinculo });
  } catch (e: unknown) {
    if (e instanceof OrgAuthError) return NextResponse.json({ error: e.message }, { status: e.statusCode });
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: orgErrorHttpStatus(e) });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { searchParams } = new URL(req.url);
    const orgId = (searchParams.get("orgId") || "").trim();
    if (!orgId) return NextResponse.json({ error: "orgId é obrigatório" }, { status: 400 });

    await requireAdminForOrgId(req, orgId);
    await params; // sellerId não é usado aqui — vinculo_id já identifica a linha com segurança.
    const body = await req.json().catch(() => ({}));
    const vinculoId = typeof body?.vinculo_id === "string" ? body.vinculo_id.trim() : "";
    if (!vinculoId) return NextResponse.json({ error: "vinculo_id é obrigatório." }, { status: 400 });

    if (body?.acao === "desvincular") {
      const { data, error } = await supabaseAdmin.rpc("fn_seller_fornecedor_desvincular", {
        p_vinculo_id: vinculoId,
        p_org_id: orgId,
        p_confirmar_antes_prazo_admin: body?.confirmar_antes_prazo === true,
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      const result = data as {
        ok: boolean;
        error_code?: string;
        pode_trocar_fornecedor_a_partir_de?: string;
        vinculo?: { seller_id: string; fornecedor_id: string };
      };
      if (!result.ok) {
        return NextResponse.json(
          {
            error:
              result.error_code === "COMPROMISSO_FORNECEDOR_ATIVO"
                ? `Trava de 3 meses ativa — libera em ${result.pode_trocar_fornecedor_a_partir_de}.`
                : "Vínculo não encontrado.",
            code: result.error_code,
            pode_trocar_fornecedor_a_partir_de: result.pode_trocar_fornecedor_a_partir_de ?? null,
          },
          { status: 400 }
        );
      }
      // Admin desvincula sem o seller pedir — ele sempre é avisado, nunca fica oculto.
      if (result.vinculo) {
        await notifySellerDesvinculoFornecedorCd({
          seller_id: result.vinculo.seller_id,
          fornecedor_id: result.vinculo.fornecedor_id,
          motivo: "desvinculado",
        });
      }
      return NextResponse.json({ ok: true });
    }

    if (body?.acao === "cortesia") {
      const cortesia = body?.cortesia === true;
      const cortesiaAte = typeof body?.cortesia_ate === "string" && body.cortesia_ate.trim() ? body.cortesia_ate.trim() : null;
      const { data, error } = await supabaseAdmin.rpc("fn_seller_fornecedor_cd_cortesia_set", {
        p_vinculo_id: vinculoId,
        p_org_id: orgId,
        p_cortesia: cortesia,
        p_cortesia_ate: cortesiaAte,
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      const result = data as { ok: boolean };
      if (!result.ok) return NextResponse.json({ error: "Vínculo não encontrado." }, { status: 400 });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "acao inválida — use 'desvincular' ou 'cortesia'." }, { status: 400 });
  } catch (e: unknown) {
    if (e instanceof OrgAuthError) return NextResponse.json({ error: e.message }, { status: e.statusCode });
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: orgErrorHttpStatus(e) });
  }
}
