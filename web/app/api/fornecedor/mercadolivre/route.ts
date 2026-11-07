/**
 * GET /api/fornecedor/mercadolivre — status da conexão OAuth com o Mercado Livre.
 * DELETE /api/fornecedor/mercadolivre — desconecta. Espelho de /api/seller/mercadolivre.
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getFornecedorContextFromBearer } from "@/lib/fornecedorAuth";
import { logAdminAction } from "@/lib/adminAuditLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type IntegracaoRow = {
  ml_user_id: string | null;
  ml_access_token_expires_at: string | null;
  updated_at: string | null;
};

export async function GET(req: Request) {
  const ctx = await getFornecedorContextFromBearer(req);
  if (!ctx) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin.rpc("fn_fornecedor_mercadolivre_integracao_get", {
    p_fornecedor_id: ctx.fornecedor_id,
  });

  if (error) {
    console.error("[fornecedor/mercadolivre GET]", error.message);
    return NextResponse.json({ error: "Erro ao carregar integração Mercado Livre." }, { status: 500 });
  }

  const row = (Array.isArray(data) ? data[0] : data) as IntegracaoRow | null;

  return NextResponse.json({
    connected: Boolean(row?.ml_user_id),
    ml_user_id: row?.ml_user_id ?? null,
    access_token_expires_at: row?.ml_access_token_expires_at ?? null,
    updated_at: row?.updated_at ?? null,
  });
}

export async function DELETE(req: Request) {
  const ctx = await getFornecedorContextFromBearer(req);
  if (!ctx) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const { error } = await supabaseAdmin.rpc("fn_fornecedor_mercadolivre_integracao_delete", {
    p_fornecedor_id: ctx.fornecedor_id,
  });

  if (error) {
    console.error("[fornecedor/mercadolivre DELETE]", error.message);
    return NextResponse.json({ error: "Erro ao desconectar o Mercado Livre." }, { status: 500 });
  }

  await logAdminAction({
    req,
    orgId: ctx.org_id,
    actorUserId: ctx.user_id,
    action: "marketplace.mercadolivre.desconectar",
    targetTable: "fornecedor_mercadolivre_integrations",
    targetId: ctx.fornecedor_id,
  });

  return NextResponse.json({ ok: true, connected: false });
}
