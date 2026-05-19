/**
 * POST /api/seller/olist/ingest-token — Gera novo token `?w=` (invalida URL antiga na Olist/Tiny).
 */
import { NextResponse } from "next/server";
import { buildOlistPedidosWebhookUrl } from "@/lib/olistWebhookUrl";
import { regenerateSellerOlistIngestToken } from "@/lib/olistIngestToken";
import { getSellerFromToken } from "@/lib/sellerSessionAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_JSON_HEADERS = { "Cache-Control": "private, no-store, max-age=0" } as const;

export async function POST(req: Request) {
  try {
    const seller = await getSellerFromToken(req);
    if (!seller) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401, headers: NO_STORE_JSON_HEADERS });
    }

    const token = await regenerateSellerOlistIngestToken(seller.id);
    if (!token) {
      return NextResponse.json(
        {
          error:
            "Não foi possível gerar o link. Confirme o CNPJ da conta (salve o token API de novo) e rode o SQL add-seller-olist-ingest-token.sql no Supabase.",
        },
        { status: 503, headers: NO_STORE_JSON_HEADERS },
      );
    }

    return NextResponse.json(
      {
        ok: true,
        webhook_pedidos_url: buildOlistPedidosWebhookUrl({ ingestToken: token }),
      },
      { headers: NO_STORE_JSON_HEADERS },
    );
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erro inesperado" },
      { status: 500, headers: NO_STORE_JSON_HEADERS },
    );
  }
}
