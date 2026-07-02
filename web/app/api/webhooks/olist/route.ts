/**
 * POST /api/webhooks/olist
 * Webhooks de pedidos da Olist/Tiny (API 2.0 — notificações de vendas).
 * Doc: https://tiny.com.br/api-docs/api2-webhooks-tiny
 *
 * Autenticação (preferencial): `?w=` — token opaco por seller (`olist_ingest_token`), com binding ao CNPJ do JSON.
 * Legado opcional: `?secret=` ou header `x-dropcore-olist-secret` = `OLIST_WEBHOOK_SECRET` na Vercel.
 * Sem `?w=` e sem secret global configurado → 401 (não aceita só CNPJ).
 *
 * Rate limit: janela de 60s por IP e por `?w=` (env `OLIST_WEBHOOK_RL_IP_MAX`, `OLIST_WEBHOOK_RL_W_MAX`).
 */
import { NextResponse } from "next/server";
import { isOlistLegacyWebhookSecretConfigured, isOlistLegacyWebhookSecretValid } from "@/lib/olistWebhookAuth";
import { normalizeOlistCnpjDigits } from "@/lib/olistPedidoImportPolicy";
import { assertOlistWebhookRateLimit } from "@/lib/olistWebhookRateLimit";
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

type OlistWebhookRow = {
  seller_id: string;
  org_id: string;
  olist_token_ciphertext: string;
};

async function tryAuthIngestToken(
  ingestToken: string,
  body: OlistWebhookPayload
): Promise<{ ok: true; row: OlistWebhookRow } | { ok: false; reason: string }> {
  const { data: rows, error } = await supabaseAdmin
    .from("seller_olist_integrations")
    .select("seller_id, org_id, olist_token_ciphertext, olist_account_cnpj_normalized")
    .eq("olist_ingest_token", ingestToken)
    .limit(5);

  if (error) {
    const msg = String(error.message ?? "").toLowerCase();
    if (error.code === "42703" || msg.includes("olist_ingest_token")) {
      return { ok: false, reason: "ingest_col_ausente" };
    }
    console.error("[webhooks/olist] ingest lookup:", error.message);
    return { ok: false, reason: "erro_db" };
  }

  const list = rows ?? [];
  if (list.length === 0) return { ok: false, reason: "token_invalido" };
  if (list.length > 1) {
    console.warn("[webhooks/olist] múltiplas integrações com o mesmo olist_ingest_token; usando a primeira.");
  }

  const r = list[0] as {
    seller_id: string;
    org_id: string;
    olist_token_ciphertext: string;
    olist_account_cnpj_normalized: string | null;
  };

  const payloadCnpj = normalizeOlistCnpjDigits(body.cnpj);
  const saved = String(r.olist_account_cnpj_normalized ?? "").trim();
  if (!payloadCnpj || payloadCnpj.length < 11 || saved.length < 11 || payloadCnpj !== saved) {
    return { ok: false, reason: "cnpj_binding" };
  }

  return {
    ok: true,
    row: {
      seller_id: r.seller_id,
      org_id: r.org_id,
      olist_token_ciphertext: r.olist_token_ciphertext,
    },
  };
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
  const url = new URL(req.url);
  const ingestTokenEarly = url.searchParams.get("w")?.trim() ?? "";

  const rl = assertOlistWebhookRateLimit(req, ingestTokenEarly || null);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Muitas requisições. Aguarde e tente novamente." },
      {
        status: 429,
        headers: {
          "Retry-After": String(rl.retryAfterSec),
          "Cache-Control": "no-store",
        },
      },
    );
  }

  const raw = await req.text();
  let body: OlistWebhookPayload;
  try {
    body = JSON.parse(raw) as OlistWebhookPayload;
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const ingestToken = ingestTokenEarly;

  const cnpjNorm = normalizeOlistCnpjDigits(body.cnpj);
  const tipo = String(body.tipo ?? "").trim();
  const pedidoId = typeof body.dados?.id === "number" ? body.dados.id : Number.NaN;
  const codigoSituacao = body.dados?.codigoSituacao ? String(body.dados.codigoSituacao).trim() : "";

  let row: OlistWebhookRow | null = null;

  if (ingestToken) {
    const auth = await tryAuthIngestToken(ingestToken, body);
    if (!auth.ok) {
      await logOlistWebhook({
        seller_id: null,
        org_id: null,
        olist_cnpj_normalized: cnpjNorm || null,
        tipo: body.tipo ?? null,
        olist_pedido_id: Number.isFinite(pedidoId) ? pedidoId : null,
        payload: body as unknown as Record<string, unknown>,
        resultado: "rejeitado_ingest",
        error_detail: auth.reason,
      });
      return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
    }
    row = auth.row;
  } else {
    if (!isOlistLegacyWebhookSecretConfigured()) {
      await logOlistWebhook({
        seller_id: null,
        org_id: null,
        olist_cnpj_normalized: cnpjNorm || null,
        tipo: body.tipo ?? null,
        olist_pedido_id: Number.isFinite(pedidoId) ? pedidoId : null,
        payload: body as unknown as Record<string, unknown>,
        resultado: "rejeitado_sem_w",
        error_detail: "Use URL com ?w= (Integrações ERP) ou configure OLIST_WEBHOOK_SECRET",
      });
      return NextResponse.json(
        { error: "Não autorizado. Cadastre a URL do webhook com ?w= na Olist." },
        { status: 401 },
      );
    }

    if (!isOlistLegacyWebhookSecretValid(req)) {
      await logOlistWebhook({
        seller_id: null,
        org_id: null,
        olist_cnpj_normalized: cnpjNorm || null,
        tipo: body.tipo ?? null,
        olist_pedido_id: Number.isFinite(pedidoId) ? pedidoId : null,
        payload: body as unknown as Record<string, unknown>,
        resultado: "rejeitado_secret",
        error_detail: "secret inválido ou ausente",
      });
      return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
    }

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

    const m = matches[0] as {
      seller_id: string;
      org_id: string;
      olist_token_ciphertext: string;
    };
    row = { seller_id: m.seller_id, org_id: m.org_id, olist_token_ciphertext: m.olist_token_ciphertext };
  }

  if (!row) {
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }

  if (!Number.isFinite(pedidoId)) {
    await logOlistWebhook({
      seller_id: row.seller_id,
      org_id: row.org_id,
      olist_cnpj_normalized: cnpjNorm || null,
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
      seller_id: row.seller_id,
      org_id: row.org_id,
      olist_cnpj_normalized: cnpjNorm || null,
      tipo: tipo || null,
      olist_pedido_id: pedidoId,
      payload: body as unknown as Record<string, unknown>,
      resultado: "ignorado_tipo",
      error_detail: tipo || null,
    });
    return NextResponse.json({ ok: true, ignored: true }, { status: 200 });
  }

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
    olist_cnpj_normalized: cnpjNorm || null,
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
    ...(proc.outcome === "skipped_duplicate" && proc.pedido_id_dropcore
      ? { pedido_id_dropcore: proc.pedido_id_dropcore }
      : {}),
  });
}
