/**
 * POST /api/webhooks/olist-fornecedor-estoque
 * Webhook de estoque da Olist/Tiny (fornecedor/armazém).
 * Doc: https://tiny.com.br/api-docs/api2-webhooks-tiny — tipo "estoque"
 *
 * Autenticação: `?w=` — token opaco por fornecedor (`olist_ingest_token`), com binding ao CNPJ do JSON.
 */
import { NextResponse } from "next/server";
import {
  aplicarEstoqueWebhookFornecedor,
  logFornecedorOlistWebhookEstoque,
  skuFromOlistEstoqueWebhookDados,
} from "@/lib/fornecedorOlistWebhookEstoque";
import { normalizeOlistCnpjDigits } from "@/lib/olistPedidoImportPolicy";
import { assertOlistWebhookRateLimit } from "@/lib/olistWebhookRateLimit";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type OlistEstoqueWebhookPayload = {
  versao?: string;
  cnpj?: string;
  tipo?: string;
  dados?: Record<string, unknown>;
};

type FornecedorWebhookRow = {
  fornecedor_id: string;
  org_id: string;
};

async function tryAuthIngestToken(
  ingestToken: string,
  body: OlistEstoqueWebhookPayload,
): Promise<{ ok: true; row: FornecedorWebhookRow } | { ok: false; reason: string }> {
  const { data: rows, error } = await supabaseAdmin
    .from("fornecedor_olist_integrations")
    .select("fornecedor_id, org_id, olist_account_cnpj_normalized")
    .eq("olist_ingest_token", ingestToken)
    .not("olist_token_ciphertext", "is", null)
    .limit(5);

  if (error) {
    const msg = String(error.message ?? "").toLowerCase();
    if (error.code === "42703" || msg.includes("olist_ingest_token")) {
      return { ok: false, reason: "ingest_col_ausente" };
    }
    console.error("[webhooks/olist-fornecedor-estoque] ingest lookup:", error.message);
    return { ok: false, reason: "erro_db" };
  }

  const list = rows ?? [];
  if (list.length === 0) return { ok: false, reason: "token_invalido" };
  if (list.length > 1) {
    console.warn("[webhooks/olist-fornecedor-estoque] múltiplas integrações com o mesmo ingest token; usando a primeira.");
  }

  const r = list[0] as {
    fornecedor_id: string;
    org_id: string;
    olist_account_cnpj_normalized: string | null;
  };

  const payloadCnpj = normalizeOlistCnpjDigits(body.cnpj);
  const saved = String(r.olist_account_cnpj_normalized ?? "").trim();
  if (!payloadCnpj || payloadCnpj.length < 11 || saved.length < 11 || payloadCnpj !== saved) {
    return { ok: false, reason: "cnpj_binding" };
  }

  return { ok: true, row: { fornecedor_id: r.fornecedor_id, org_id: r.org_id } };
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

  if (!ingestTokenEarly) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const raw = await req.text();
  let body: OlistEstoqueWebhookPayload;
  try {
    body = JSON.parse(raw) as OlistEstoqueWebhookPayload;
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const cnpjNorm = normalizeOlistCnpjDigits(body.cnpj);
  const tipo = String(body.tipo ?? "").trim();
  const payload = body as unknown as Record<string, unknown>;

  const auth = await tryAuthIngestToken(ingestTokenEarly, body);
  if (!auth.ok) {
    await logFornecedorOlistWebhookEstoque({
      fornecedor_id: null,
      org_id: null,
      olist_cnpj_normalized: cnpjNorm || null,
      sku: null,
      saldo: null,
      payload,
      resultado: "rejeitado_ingest",
      error_detail: auth.reason,
    });
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const row = auth.row;

  if (tipo !== "estoque") {
    await logFornecedorOlistWebhookEstoque({
      fornecedor_id: row.fornecedor_id,
      org_id: row.org_id,
      olist_cnpj_normalized: cnpjNorm || null,
      sku: null,
      saldo: null,
      payload,
      resultado: "ignorado_tipo",
      error_detail: tipo || null,
    });
    return NextResponse.json({ ok: true, ignored: true }, { status: 200 });
  }

  const dados = body.dados ?? {};
  const sku = skuFromOlistEstoqueWebhookDados(dados);
  const saldoRaw = dados.saldo ?? dados.quantidade ?? dados.estoque;
  const saldoNum =
    saldoRaw == null || saldoRaw === ""
      ? null
      : typeof saldoRaw === "number"
        ? saldoRaw
        : parseFloat(String(saldoRaw).replace(",", "."));

  if (!sku) {
    await logFornecedorOlistWebhookEstoque({
      fornecedor_id: row.fornecedor_id,
      org_id: row.org_id,
      olist_cnpj_normalized: cnpjNorm || null,
      sku: null,
      saldo: Number.isFinite(saldoNum) ? Math.floor(saldoNum!) : null,
      payload,
      resultado: "ignorado_sem_sku",
      error_detail: null,
    });
    return NextResponse.json({ ok: true, ignored: true }, { status: 200 });
  }

  if (saldoNum == null || !Number.isFinite(saldoNum)) {
    await logFornecedorOlistWebhookEstoque({
      fornecedor_id: row.fornecedor_id,
      org_id: row.org_id,
      olist_cnpj_normalized: cnpjNorm || null,
      sku,
      saldo: null,
      payload,
      resultado: "ignorado_sem_saldo",
      error_detail: null,
    });
    return NextResponse.json({ ok: true, ignored: true }, { status: 200 });
  }

  const saldo = Math.max(0, Math.floor(saldoNum));
  const applied = await aplicarEstoqueWebhookFornecedor({
    fornecedorId: row.fornecedor_id,
    orgId: row.org_id,
    skuCode: sku,
    saldo,
  });

  await logFornecedorOlistWebhookEstoque({
    fornecedor_id: row.fornecedor_id,
    org_id: row.org_id,
    olist_cnpj_normalized: cnpjNorm || null,
    sku,
    saldo,
    payload,
    resultado: applied.ok
      ? applied.updated
        ? "atualizado"
        : applied.reason ?? "sem_mudanca"
      : "erro",
    error_detail: applied.ok ? null : applied.reason ?? null,
  });

  if (!applied.ok) {
    return NextResponse.json({ error: "Erro ao aplicar estoque." }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    updated: applied.updated,
    pushed_sellers: applied.pushed_sellers,
    reason: applied.reason ?? null,
  });
}
