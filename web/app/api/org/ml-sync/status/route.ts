/**
 * GET /api/org/ml-sync/status — visão ao vivo de sync com o Mercado Livre pro admin:
 * resumo de falha ativa por seller/fornecedor (pendente/esgotado) + histórico recente de
 * envio (sucesso/falha/divergente). Achado 2026-11-24: não existia nenhuma tela pra isso,
 * só um painel do lado do fornecedor que ninguém olha — quem corrige é sempre o admin.
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAdmin, OrgAuthError, orgErrorHttpStatus } from "@/lib/apiOrgAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { org_id } = await requireAdmin(req);

    const [falhasRes, logRes] = await Promise.all([
      supabaseAdmin.rpc("fn_ml_sync_falhas_resumo_admin", { p_org_id: org_id }),
      supabaseAdmin.rpc("fn_ml_sync_log_listar_admin", { p_org_id: org_id, p_limit: 50 }),
    ]);

    if (falhasRes.error) return NextResponse.json({ error: falhasRes.error.message }, { status: 500 });
    if (logRes.error) return NextResponse.json({ error: logRes.error.message }, { status: 500 });

    return NextResponse.json({
      ok: true,
      falhas: falhasRes.data ?? [],
      log: logRes.data ?? [],
    });
  } catch (e: unknown) {
    if (e instanceof OrgAuthError) return NextResponse.json({ error: e.message }, { status: e.statusCode });
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: orgErrorHttpStatus(e) });
  }
}
