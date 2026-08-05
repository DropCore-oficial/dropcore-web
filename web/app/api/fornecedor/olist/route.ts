/**
 * GET /api/fornecedor/olist — Status da integração Olist/Tiny do fornecedor
 * PUT /api/fornecedor/olist — Valida e salva token API
 * DELETE /api/fornecedor/olist — Remove token
 */
import { NextResponse } from "next/server";
import { getFornecedorContextFromBearer } from "@/lib/fornecedorAuth";
import { ensureFornecedorOlistIngestToken } from "@/lib/fornecedorOlistIngestToken";
import { fetchOlistAccountInfo, formatOlistAccountLabel } from "@/lib/olistTinyApi";
import { buildOlistFornecedorEstoqueWebhookUrl } from "@/lib/olistWebhookUrl";
import { normalizeOlistCnpjDigits } from "@/lib/olistPedidoImportPolicy";
import {
  decryptSellerErpSecret,
  describeSellerErpSecretDecryptFailure,
  encryptSellerErpSecret,
  maskErpSecret,
} from "@/lib/sellerErpSecretBox";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { logAdminAction } from "@/lib/adminAuditLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" } as const;

const OLIST_SELECT_WITH_WEBHOOK =
  "olist_token_ciphertext, olist_token_prefix, olist_account_name, olist_account_cnpj_normalized, olist_token_validated_at, updated_at, olist_last_estoque_sync_at, olist_last_estoque_sync_status, olist_last_estoque_sync_error, olist_last_estoque_sync_summary, olist_webhook_estoque_last_at";
const OLIST_SELECT_BASE =
  "olist_token_ciphertext, olist_token_prefix, olist_account_name, olist_token_validated_at, updated_at, olist_last_estoque_sync_at, olist_last_estoque_sync_status, olist_last_estoque_sync_error, olist_last_estoque_sync_summary";

type OlistRow = {
  olist_token_ciphertext: string | null;
  olist_token_prefix: string | null;
  olist_account_name: string | null;
  olist_account_cnpj_normalized: string | null;
  olist_token_validated_at: string | null;
  updated_at: string | null;
  olist_last_estoque_sync_at: string | null;
  olist_last_estoque_sync_status: string | null;
  olist_last_estoque_sync_error: string | null;
  olist_last_estoque_sync_summary: Record<string, unknown> | null;
  olist_webhook_estoque_last_at?: string | null;
};

function isMissingTableError(error: { message?: string; code?: string }) {
  const msg = String(error.message ?? "").toLowerCase();
  const code = String(error.code ?? "");
  return msg.includes("does not exist") || msg.includes("schema cache") || code === "42P01" || code === "PGRST205";
}

function buildEstoqueSyncPayload(row: OlistRow | null | undefined) {
  const summary = row?.olist_last_estoque_sync_summary;
  const errors = typeof summary?.errors === "number" ? summary.errors : 0;
  const missingOlist = typeof summary?.missing_olist === "number" ? summary.missing_olist : 0;
  let status = row?.olist_last_estoque_sync_status ?? null;
  let error = row?.olist_last_estoque_sync_error ?? null;

  // Cron antigo marcava parcial + mensagem genérica só por SKU ausente na Olist (sem falha de API).
  if (errors === 0 && status === "parcial") {
    status = "ok";
    error = null;
  }
  if (status === "ok" || (errors === 0 && missingOlist > 0)) {
    error = null;
  }

  return {
    last_at: row?.olist_last_estoque_sync_at ?? null,
    status,
    error,
    updated: typeof summary?.updated === "number" ? summary.updated : null,
    unchanged: typeof summary?.unchanged === "number" ? summary.unchanged : null,
    missing_olist: missingOlist > 0 ? missingOlist : null,
    errors: errors > 0 ? errors : null,
    index_codigos: typeof summary?.index_codigos === "number" ? summary.index_codigos : null,
    index_pais: typeof summary?.index_pais === "number" ? summary.index_pais : null,
  };
}

async function webhookEstoqueUrlForFornecedor(
  fornecedorId: string,
  opts: { connected: boolean; tokenUsable: boolean; cnpjLen: number },
): Promise<string | null> {
  if (!opts.connected || !opts.tokenUsable || opts.cnpjLen < 11) return null;
  const ingest = await ensureFornecedorOlistIngestToken(fornecedorId);
  if (!ingest) return null;
  return buildOlistFornecedorEstoqueWebhookUrl(ingest);
}

export async function GET(req: Request) {
  try {
    const ctx = await getFornecedorContextFromBearer(req);
    if (!ctx) {
      return NextResponse.json({ error: "Não autenticado como fornecedor." }, { status: 401, headers: NO_STORE });
    }

    let row: OlistRow | null = null;
    let loadError: { message?: string; code?: string } | null = null;

    const primary = await supabaseAdmin
      .from("fornecedor_olist_integrations")
      .select(OLIST_SELECT_WITH_WEBHOOK)
      .eq("fornecedor_id", ctx.fornecedor_id)
      .maybeSingle();

    row = (primary.data as OlistRow | null) ?? null;
    loadError = primary.error;

    if (loadError) {
      const msg = String(loadError.message ?? "").toLowerCase();
      if (msg.includes("olist_webhook_estoque") || msg.includes("olist_account_cnpj") || loadError.code === "42703") {
        const fb = await supabaseAdmin
          .from("fornecedor_olist_integrations")
          .select(OLIST_SELECT_BASE)
          .eq("fornecedor_id", ctx.fornecedor_id)
          .maybeSingle();
        row = (fb.data as OlistRow | null) ?? null;
        loadError = fb.error;
      }
    }

    if (loadError) {
      if (isMissingTableError(loadError)) {
        return NextResponse.json(
          {
            olist_unavailable: true,
            connected: false,
            estoque_sync: buildEstoqueSyncPayload(null),
            webhook_estoque_url: null,
            olist_webhook_cnpj_ready: false,
            webhook_estoque_last_at: null,
          },
          { headers: NO_STORE },
        );
      }
      console.error("[fornecedor/olist GET]", loadError.message);
      return NextResponse.json({ error: "Erro ao carregar integração Olist." }, { status: 500, headers: NO_STORE });
    }

    const typed = row;
    const connected = Boolean(typed?.olist_token_ciphertext?.trim());
    let token_usable = connected;
    let token_error: string | null = null;
    if (connected && typed?.olist_token_ciphertext) {
      try {
        decryptSellerErpSecret(typed.olist_token_ciphertext);
      } catch (e: unknown) {
        token_usable = false;
        token_error = describeSellerErpSecretDecryptFailure(e);
      }
    }

    const cnpjNorm = typed?.olist_account_cnpj_normalized?.trim() ?? "";
    const webhook_estoque_url = await webhookEstoqueUrlForFornecedor(ctx.fornecedor_id, {
      connected,
      tokenUsable: token_usable,
      cnpjLen: cnpjNorm.length,
    });

    return NextResponse.json(
      {
        olist_unavailable: false,
        connected,
        token_usable,
        token_error,
        token_prefix: typed?.olist_token_prefix ?? null,
        account_name: typed?.olist_account_name ?? null,
        validated_at: typed?.olist_token_validated_at ?? null,
        updated_at: typed?.updated_at ?? null,
        estoque_sync: buildEstoqueSyncPayload(typed),
        webhook_estoque_url,
        olist_webhook_cnpj_ready: cnpjNorm.length >= 11,
        webhook_estoque_last_at: typed?.olist_webhook_estoque_last_at ?? null,
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

export async function PUT(req: Request) {
  try {
    const ctx = await getFornecedorContextFromBearer(req);
    if (!ctx) {
      return NextResponse.json({ error: "Não autenticado como fornecedor." }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const apiToken = String(body?.olist_api_token ?? "").trim();
    if (!apiToken) {
      return NextResponse.json({ error: "Informe o token API gerado na Olist/Tiny." }, { status: 400 });
    }

    let accountInfo;
    try {
      accountInfo = await fetchOlistAccountInfo(apiToken);
    } catch (e: unknown) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Não foi possível validar o token na Olist/Tiny." },
        { status: 400 },
      );
    }

    let ciphertext: string;
    try {
      ciphertext = encryptSellerErpSecret(apiToken);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Erro ao proteger o token.";
      const status = message.includes("SELLER_ERP_CREDENTIALS_KEY") ? 503 : 500;
      return NextResponse.json(
        {
          error: message.includes("SELLER_ERP_CREDENTIALS_KEY")
            ? "Ambiente sem chave de criptografia configurada (SELLER_ERP_CREDENTIALS_KEY)."
            : message,
        },
        { status },
      );
    }

    const now = new Date().toISOString();
    const accountName = formatOlistAccountLabel(accountInfo);
    const cnpjNorm = normalizeOlistCnpjDigits(accountInfo.cnpj_cpf);
    let cnpjSavedToDb = false;

    let upErr = (
      await supabaseAdmin.from("fornecedor_olist_integrations").upsert(
        {
          fornecedor_id: ctx.fornecedor_id,
          org_id: ctx.org_id,
          olist_token_ciphertext: ciphertext,
          olist_token_prefix: maskErpSecret(apiToken),
          olist_account_name: accountName,
          olist_account_cnpj_normalized: cnpjNorm.length >= 11 ? cnpjNorm : null,
          olist_token_validated_at: now,
          updated_at: now,
        },
        { onConflict: "fornecedor_id" },
      )
    ).error;

    if (upErr) {
      const msg = String(upErr.message ?? "").toLowerCase();
      if (msg.includes("olist_account_cnpj") || upErr.code === "42703") {
        upErr = (
          await supabaseAdmin.from("fornecedor_olist_integrations").upsert(
            {
              fornecedor_id: ctx.fornecedor_id,
              org_id: ctx.org_id,
              olist_token_ciphertext: ciphertext,
              olist_token_prefix: maskErpSecret(apiToken),
              olist_account_name: accountName,
              olist_token_validated_at: now,
              updated_at: now,
            },
            { onConflict: "fornecedor_id" },
          )
        ).error;
      }
    } else if (cnpjNorm.length >= 11) {
      cnpjSavedToDb = true;
    }

    if (upErr) {
      if (isMissingTableError(upErr)) {
        return NextResponse.json(
          { error: "Execute o script add-fornecedor-olist-integration.sql no Supabase." },
          { status: 503 },
        );
      }
      console.error("[fornecedor/olist PUT]", upErr.message);
      return NextResponse.json({ error: "Erro ao salvar o token." }, { status: 500 });
    }

    await logAdminAction({
      req,
      orgId: ctx.org_id,
      actorUserId: ctx.user_id,
      action: "erp.olist.conectar",
      targetTable: "fornecedor_olist_integrations",
      targetId: ctx.fornecedor_id,
      detalhes: { account_name: accountName },
    });

    let webhook_estoque_url: string | null = null;
    if (cnpjSavedToDb) {
      const ingest = await ensureFornecedorOlistIngestToken(ctx.fornecedor_id);
      if (ingest) webhook_estoque_url = buildOlistFornecedorEstoqueWebhookUrl(ingest);
    }

    return NextResponse.json({
      ok: true,
      connected: true,
      token_prefix: maskErpSecret(apiToken),
      account_name: accountName,
      validated_at: now,
      webhook_estoque_url,
      olist_webhook_cnpj_ready: cnpjSavedToDb,
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro inesperado" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const ctx = await getFornecedorContextFromBearer(req);
    if (!ctx) {
      return NextResponse.json({ error: "Não autenticado como fornecedor." }, { status: 401 });
    }

    let delErr = (
      await supabaseAdmin
        .from("fornecedor_olist_integrations")
        .update({
          olist_token_ciphertext: null,
          olist_token_prefix: null,
          olist_account_name: null,
          olist_account_cnpj_normalized: null,
          olist_ingest_token: null,
          olist_token_validated_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("fornecedor_id", ctx.fornecedor_id)
    ).error;

    if (delErr) {
      const msg = String(delErr.message ?? "").toLowerCase();
      if (msg.includes("olist_account_cnpj") || msg.includes("olist_ingest_token") || delErr.code === "42703") {
        delErr = (
          await supabaseAdmin
            .from("fornecedor_olist_integrations")
            .update({
              olist_token_ciphertext: null,
              olist_token_prefix: null,
              olist_account_name: null,
              olist_token_validated_at: null,
              updated_at: new Date().toISOString(),
            })
            .eq("fornecedor_id", ctx.fornecedor_id)
        ).error;
      }
    }

    if (delErr) {
      if (isMissingTableError(delErr)) {
        return NextResponse.json(
          { error: "Execute o script add-fornecedor-olist-integration.sql no Supabase." },
          { status: 503 },
        );
      }
      console.error("[fornecedor/olist DELETE]", delErr.message);
      return NextResponse.json({ error: "Erro ao remover o token." }, { status: 500 });
    }

    await logAdminAction({
      req,
      orgId: ctx.org_id,
      actorUserId: ctx.user_id,
      action: "erp.olist.desconectar",
      targetTable: "fornecedor_olist_integrations",
      targetId: ctx.fornecedor_id,
    });

    return NextResponse.json({ ok: true, connected: false });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro inesperado" }, { status: 500 });
  }
}
