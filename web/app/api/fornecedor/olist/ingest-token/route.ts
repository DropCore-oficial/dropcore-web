/**
 * POST /api/fornecedor/olist/ingest-token — Gera novo token `?w=` (invalida URL antiga na Olist/Tiny).
 */
import { NextResponse } from "next/server";
import { getFornecedorContextFromBearer } from "@/lib/fornecedorAuth";
import { regenerateFornecedorOlistIngestToken } from "@/lib/fornecedorOlistIngestToken";
import { buildOlistFornecedorEstoqueWebhookUrl } from "@/lib/olistWebhookUrl";
import { logAdminAction } from "@/lib/adminAuditLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" } as const;

export async function POST(req: Request) {
  try {
    const ctx = await getFornecedorContextFromBearer(req);
    if (!ctx) {
      return NextResponse.json({ error: "Não autenticado como fornecedor." }, { status: 401, headers: NO_STORE });
    }

    const token = await regenerateFornecedorOlistIngestToken(ctx.fornecedor_id);
    if (!token) {
      return NextResponse.json(
        {
          error:
            "Não foi possível gerar o link. Salve o token API de novo (para gravar o CNPJ) e rode add-fornecedor-olist-webhook.sql no Supabase.",
        },
        { status: 503, headers: NO_STORE },
      );
    }

    await logAdminAction({
      req,
      orgId: ctx.org_id,
      actorUserId: ctx.user_id,
      action: "erp.olist.regenerar_ingest_token",
      targetTable: "fornecedor_olist_integrations",
      targetId: ctx.fornecedor_id,
    });

    return NextResponse.json(
      {
        ok: true,
        webhook_estoque_url: buildOlistFornecedorEstoqueWebhookUrl(token),
      },
      { headers: NO_STORE },
    );
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erro inesperado" },
      { status: 500, headers: NO_STORE },
    );
  }
}
