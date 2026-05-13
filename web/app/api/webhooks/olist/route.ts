/**
 * POST /api/webhooks/olist
 * Webhooks de pedidos da Olist/Tiny (API 2.0 — notificações de vendas).
 * Doc: https://tiny.com.br/api-docs/api2-webhooks-tiny
 *
 * A Olist envia JSON com cnpj (conta), tipo (inclusao_pedido | atualizacao_pedido) e dados.id (pedido).
 * O DropCore identifica o seller pelo CNPJ salvo em seller_olist_integrations.olist_account_cnpj_normalized.
 *
 * Segurança opcional: defina OLIST_WEBHOOK_SECRET na Vercel e use a mesma na URL cadastrada na Olist:
 *   https://www.dropcore.com.br/api/webhooks/olist?secret=SUA_CHAVE
 */
import { NextResponse } from "next/server";
import { normalizeOlistCnpjDigits } from "@/lib/olistPedidoImportPolicy";
import { processOlistPedidoImport } from "@/lib/sellerOlistPedidoImport";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type OlistWebhookPayload = {
  versao?: string;
  cnpj?: string;
  tipo?: string;
  dados?: {
    id?: number;
    codigoSituacao?: string;
    descricaoSituacao?: string;
    numero?: number;
  };
};

function verifyOptionalSecret(req: Request): boolean {
  const expected = process.env.OLIST_WEBHOOK_SECRET?.trim();
  if (!expected) return true;
  const url = new URL(req.url);
  const q = url.searchParams.get("secret")?.trim() ?? "";
  const h = req.headers.get("x-dropcore-olist-secret")?.trim() ?? "";
  return q === expected || h === expected;
}

async function logOlistWebhook(params: {
  seller_id: string | null;
  org_id: string | null;
  olist_cnpj_normalized: string | null;
  tipo: string | null;
  olist_pedido_id: number | null;
  payload: Record<string, unknown>;
  resultado: string;
  error_detail: string | null;
}) {
  const { error } = await supabaseAdmin.from("olist_webhook_logs").insert({
    seller_id: params.seller_id,
    org_id: params.org_id,
    olist_cnpj_normalized: params.olist_cnpj_normalized,
    tipo: params.tipo,
    olist_pedido_id: params.olist_pedido_id,
    payload: params.payload,
    resultado: params.resultado,
    error_detail: params.error_detail,
  });
  if (error) {
    const msg = String(error.message ?? "").toLowerCase();
    if (!msg.includes("olist_webhook_logs") && error.code !== "42P01") {
      console.error("[webhooks/olist] log insert:", error.message);
    }
  }
}

export async function POST(req: Request) {
  const raw = await req.text();
  let body: OlistWebhookPayload;
  try {
    body = JSON.parse(raw) as OlistWebhookPayload;
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  if (!verifyOptionalSecret(req)) {
    await logOlistWebhook({
      seller_id: null,
      org_id: null,
      olist_cnpj_normalized: normalizeOlistCnpjDigits(body.cnpj) || null,
      tipo: body.tipo ?? null,
      olist_pedido_id: typeof body.dados?.id === "number" ? body.dados.id : null,
      payload: body as unknown as Record<string, unknown>,
      resultado: "rejeitado_secret",
      error_detail: "secret inválido ou ausente",
    });
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const cnpjNorm = normalizeOlistCnpjDigits(body.cnpj);
  const tipo = String(body.tipo ?? "").trim();
  const pedidoId = typeof body.dados?.id === "number" ? body.dados.id : Number.NaN;
  const codigoSituacao = body.dados?.codigoSituacao ? String(body.dados.codigoSituacao).trim() : "";

  if (!cnpjNorm || cnpjNorm.length < 11) {
    await logOlistWebhook({
      seller_id: null,
      org_id: null,
      olist_cnpj_normalized: cnpjNorm || null,
      tipo: tipo || null,
      olist_pedido_id: Number.isFinite(pedidoId) ? pedidoId : null,
      payload: body as unknown as Record<string, unknown>,
      resultado: "ignorado_sem_cnpj",
      error_detail: null,
    });
    return NextResponse.json({ ok: true, ignored: true }, { status: 200 });
  }

  if (!Number.isFinite(pedidoId)) {
    await logOlistWebhook({
      seller_id: null,
      org_id: null,
      olist_cnpj_normalized: cnpjNorm,
      tipo: tipo || null,
      olist_pedido_id: null,
      payload: body as unknown as Record<string, unknown>,
      resultado: "ignorado_sem_pedido_id",
      error_detail: null,
    });
    return NextResponse.json({ ok: true, ignored: true }, { status: 200 });
  }

  if (tipo !== "inclusao_pedido" && tipo !== "atualizacao_pedido") {
    await logOlistWebhook({
      seller_id: null,
      org_id: null,
      olist_cnpj_normalized: cnpjNorm,
      tipo: tipo || null,
      olist_pedido_id: pedidoId,
      payload: body as unknown as Record<string, unknown>,
      resultado: "ignorado_tipo",
      error_detail: tipo || null,
    });
    return NextResponse.json({ ok: true, ignored: true }, { status: 200 });
  }

  const { data: rows, error: findErr } = await supabaseAdmin
    .from("seller_olist_integrations")
    .select("seller_id, org_id, olist_token_ciphertext, olist_account_cnpj_normalized")
    .eq("olist_account_cnpj_normalized", cnpjNorm)
    .not("olist_token_ciphertext", "is", null)
    .limit(5);

  if (findErr) {
    console.error("[webhooks/olist] lookup:", findErr.message);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }

  const matches = rows ?? [];
  if (matches.length === 0) {
    await logOlistWebhook({
      seller_id: null,
      org_id: null,
      olist_cnpj_normalized: cnpjNorm,
      tipo,
      olist_pedido_id: pedidoId,
      payload: body as unknown as Record<string, unknown>,
      resultado: "sem_seller",
      error_detail: null,
    });
    return NextResponse.json({ ok: true, matched: false }, { status: 200 });
  }

  if (matches.length > 1) {
    console.warn("[webhooks/olist] múltiplos sellers para o mesmo CNPJ; usando o primeiro.");
  }

  const row = matches[0] as {
    seller_id: string;
    org_id: string;
    olist_token_ciphertext: string;
  };

  const proc = await processOlistPedidoImport({
    org_id: row.org_id,
    seller_id: row.seller_id,
    olist_token_ciphertext: row.olist_token_ciphertext,
    olist_pedido_id: pedidoId,
    codigo_situacao_webhook: codigoSituacao || undefined,
  });

  let resultado = "erro";
  let errorDetail: string | null = null;
  if (!proc.ok) {
    resultado = "erro";
    errorDetail = proc.error;
  } else if (proc.outcome === "imported") {
    resultado = "importado";
  } else if (proc.outcome === "skipped_duplicate") {
    resultado = "duplicado";
  } else if (proc.outcome === "skipped_situacao") {
    resultado = "ignorado_situacao";
  } else if (proc.outcome === "skipped_sem_itens") {
    resultado = "ignorado_sem_itens";
  }

  await logOlistWebhook({
    seller_id: row.seller_id,
    org_id: row.org_id,
    olist_cnpj_normalized: cnpjNorm,
    tipo,
    olist_pedido_id: pedidoId,
    payload: body as unknown as Record<string, unknown>,
    resultado,
    error_detail: errorDetail,
  });

  if (!proc.ok) {
    return NextResponse.json({ ok: false, error: proc.error }, { status: 200 });
  }

  return NextResponse.json({
    ok: true,
    outcome: proc.outcome,
    ...(proc.outcome === "imported" ? { pedido_id_dropcore: proc.pedido_id_dropcore } : {}),
  });
}
