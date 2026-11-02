/**
 * GET/POST /api/cron/backfill-destinatario-ml — backfill ÚNICO (não é cron recorrente, só
 * reaproveita o padrão de rota protegida por CRON_SECRET): preenche comprador_nome real
 * (`shipment.receiver_address`, mesmo campo que a UpSeller usa) + cidade/UF nos pedidos ML
 * já existentes que só tinham o nickname mascarado. Processa em lotes (query ?limit=N,
 * default 60) — chamar repetidas vezes até `processados < limit` (acabou a fila). Idempotente:
 * só pega pedido com comprador_cidade ainda nulo, então rodar de novo não duplica trabalho.
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getValidMercadoLivreAccessToken, mlBuscarOrderDetalheBruto, mlBuscarShipmentDetalheBruto } from "@/lib/mercadoLivreApiClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const auth = req.headers.get("authorization")?.trim() ?? "";
  if (auth === `Bearer ${secret}`) return true;
  const manual = req.headers.get("x-cron-secret")?.trim();
  return manual === secret;
}

async function processar(limite: number) {
  const { data: pedidos, error } = await supabaseAdmin
    .from("pedidos")
    .select("id, seller_id, referencia_externa, marketplace_numero")
    .like("referencia_externa", "ml:%")
    .is("comprador_cidade", null)
    .order("criado_em", { ascending: false })
    .limit(limite);

  if (error) throw new Error(error.message);
  if (!pedidos || pedidos.length === 0) return { processados: 0, atualizados: 0, falhas: 0 };

  const contextoPorSeller = new Map<string, Awaited<ReturnType<typeof getValidMercadoLivreAccessToken>>>();
  let atualizados = 0;
  let falhas = 0;

  for (const pedido of pedidos) {
    try {
      const sellerId = pedido.seller_id as string;
      if (!contextoPorSeller.has(sellerId)) {
        contextoPorSeller.set(sellerId, await getValidMercadoLivreAccessToken(sellerId).catch(() => null));
      }
      const ctx = contextoPorSeller.get(sellerId);
      if (!ctx) {
        falhas++;
        continue;
      }

      const orderId = pedido.marketplace_numero ?? (pedido.referencia_externa as string).slice(3);
      const orderBruto = await mlBuscarOrderDetalheBruto(String(orderId), ctx);
      const shippingId = (orderBruto?.shipping as { id?: number | string } | undefined)?.id;
      if (shippingId == null) {
        falhas++;
        continue;
      }

      const shipment = await mlBuscarShipmentDetalheBruto(String(shippingId), ctx);
      const endereco = shipment?.receiver_address as
        | { receiver_name?: string | null; city?: { name?: string | null } | null; state?: { id?: string | null; name?: string | null } | null }
        | undefined;
      const nome = endereco?.receiver_name?.trim() || null;
      const cidade = endereco?.city?.name?.trim() || null;
      const uf = endereco?.state?.id?.trim() || endereco?.state?.name?.trim() || null;

      if (!nome && !cidade && !uf) {
        falhas++;
        continue;
      }

      const { error: rpcErr } = await supabaseAdmin.rpc("fn_pedido_backfill_destinatario_ml", {
        p_pedido_id: pedido.id,
        p_comprador_nome: nome,
        p_comprador_cidade: cidade,
        p_comprador_uf: uf,
      });
      if (rpcErr) {
        console.error(`[backfill-destinatario-ml] erro no pedido ${pedido.id}:`, rpcErr.message);
        falhas++;
        continue;
      }
      atualizados++;
    } catch (e) {
      console.error(`[backfill-destinatario-ml] erro no pedido ${pedido.id}:`, e);
      falhas++;
    }
  }

  return { processados: pedidos.length, atualizados, falhas };
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  const limite = Math.min(150, Math.max(1, parseInt(searchParams.get("limit") || "60", 10) || 60));
  try {
    const resultado = await processar(limite);
    return NextResponse.json({ ok: true, ...resultado });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Erro inesperado." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  return GET(req);
}
