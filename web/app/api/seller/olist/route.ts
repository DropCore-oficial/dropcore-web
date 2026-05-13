/**
 * GET /api/seller/olist — Status da integração Olist/Tiny (sem expor o token completo)
 * PUT /api/seller/olist — Valida e salva o token API da Olist
 * DELETE /api/seller/olist — Remove o token salvo
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { fetchOlistAccountInfo, formatOlistAccountLabel } from "@/lib/olistTinyApi";
import { buildOlistPedidosWebhookUrl } from "@/lib/olistWebhookUrl";
import { normalizeOlistCnpjDigits } from "@/lib/olistPedidoImportPolicy";
import { encryptSellerErpSecret, maskErpSecret, decryptSellerErpSecret, describeSellerErpSecretDecryptFailure } from "@/lib/sellerErpSecretBox";
import { getSellerFromToken } from "@/lib/sellerSessionAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type OlistRow = {
  olist_token_ciphertext: string | null;
  olist_token_prefix: string | null;
  olist_account_name: string | null;
  olist_account_cnpj_normalized: string | null;
  olist_token_validated_at: string | null;
  updated_at: string | null;
  olist_last_sync_at: string | null;
  olist_last_sync_status: string | null;
  olist_last_sync_error: string | null;
  olist_last_sync_summary: Record<string, unknown> | null;
};

const OLIST_SELECT_WITH_SYNC =
  "olist_token_ciphertext, olist_token_prefix, olist_account_name, olist_account_cnpj_normalized, olist_token_validated_at, updated_at, olist_last_sync_at, olist_last_sync_status, olist_last_sync_error, olist_last_sync_summary";
const OLIST_SELECT_BASE =
  "olist_token_ciphertext, olist_token_prefix, olist_account_name, olist_account_cnpj_normalized, olist_token_validated_at, updated_at";
const OLIST_SELECT_LEGACY =
  "olist_token_ciphertext, olist_token_prefix, olist_account_name, olist_token_validated_at, updated_at";

function buildSyncPayload(row: OlistRow | null | undefined) {
  const summary = row?.olist_last_sync_summary;
  const imported =
    summary && typeof summary.imported === "number" && Number.isFinite(summary.imported) ? summary.imported : null;
  const skipped =
    summary && typeof summary.skipped === "number" && Number.isFinite(summary.skipped) ? summary.skipped : null;
  const warnings =
    summary && Array.isArray(summary.warnings) ? summary.warnings.length : null;

  return {
    last_at: row?.olist_last_sync_at ?? null,
    status: row?.olist_last_sync_status ?? null,
    error: row?.olist_last_sync_error ?? null,
    imported,
    skipped,
    warnings,
  };
}

function isMissingTableError(error: { message?: string; code?: string }) {
  const msg = String(error.message ?? "").toLowerCase();
  const code = String(error.code ?? "");
  return (
    msg.includes("does not exist") ||
    msg.includes("schema cache") ||
    code === "42P01" ||
    code === "PGRST205"
  );
}

export async function GET(req: Request) {
  try {
    const seller = await getSellerFromToken(req);
    if (!seller) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const { data: rows, error } = await supabaseAdmin
      .from("seller_olist_integrations")
      .select(OLIST_SELECT_WITH_SYNC)
      .eq("seller_id", seller.id)
      .limit(1);

    if (error) {
      if (isMissingTableError(error)) {
        return NextResponse.json({
          olist_unavailable: true,
          connected: false,
          token_prefix: null,
          account_name: null,
          validated_at: null,
          updated_at: null,
          webhook_pedidos_url: buildOlistPedidosWebhookUrl(),
          olist_webhook_cnpj_ready: false,
          sync: {
            last_at: null,
            status: null,
            error: null,
            imported: null,
            skipped: null,
            warnings: null,
          },
        });
      }

      const msg = String(error.message ?? "").toLowerCase();
      if (msg.includes("olist_last_sync") || error.code === "42703") {
        let fb = await supabaseAdmin
          .from("seller_olist_integrations")
          .select(OLIST_SELECT_BASE)
          .eq("seller_id", seller.id)
          .limit(1);
        if (fb.error && (msg.includes("olist_account_cnpj") || fb.error.code === "42703")) {
          fb = (await supabaseAdmin
            .from("seller_olist_integrations")
            .select(OLIST_SELECT_LEGACY)
            .eq("seller_id", seller.id)
            .limit(1)) as typeof fb;
        }
        if (fb.error) {
          console.error("[seller/olist GET]", fb.error.message);
          return NextResponse.json({ error: "Erro ao carregar integração Olist/Tiny." }, { status: 500 });
        }
        const row = fb.data?.[0] as OlistRow | null | undefined;
        const connected = Boolean(row?.olist_token_ciphertext?.trim());
        const cnpjNorm = row?.olist_account_cnpj_normalized?.trim() ?? "";
        return NextResponse.json({
          olist_unavailable: false,
          connected,
          token_prefix: row?.olist_token_prefix ?? null,
          account_name: row?.olist_account_name ?? null,
          validated_at: row?.olist_token_validated_at ?? null,
          updated_at: row?.updated_at ?? null,
          webhook_pedidos_url: buildOlistPedidosWebhookUrl(),
          olist_webhook_cnpj_ready: cnpjNorm.length >= 11,
          sync: buildSyncPayload(row),
        });
      }

      console.error("[seller/olist GET]", error.message);
      return NextResponse.json({ error: "Erro ao carregar integração Olist/Tiny." }, { status: 500 });
    }

    const row = rows?.[0] as OlistRow | null | undefined;
    const connected = Boolean(row?.olist_token_ciphertext?.trim());
    let token_usable = connected;
    let token_error: string | null = null;
    if (connected && row?.olist_token_ciphertext) {
      try {
        decryptSellerErpSecret(row.olist_token_ciphertext);
      } catch (error: unknown) {
        token_usable = false;
        token_error = describeSellerErpSecretDecryptFailure(error);
      }
    }

    const cnpjNorm = row?.olist_account_cnpj_normalized?.trim() ?? "";
    return NextResponse.json({
      olist_unavailable: false,
      connected,
      token_usable,
      token_error,
      token_prefix: row?.olist_token_prefix ?? null,
      account_name: row?.olist_account_name ?? null,
      validated_at: row?.olist_token_validated_at ?? null,
      updated_at: row?.updated_at ?? null,
      webhook_pedidos_url: buildOlistPedidosWebhookUrl(),
      olist_webhook_cnpj_ready: cnpjNorm.length >= 11,
      sync: buildSyncPayload(row),
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro inesperado" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const seller = await getSellerFromToken(req);
    if (!seller) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
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
            ? "Este ambiente ainda não está pronto para salvar o token da Olist/Tiny. Reinicie o servidor após configurar a chave de criptografia no ambiente."
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
      await supabaseAdmin.from("seller_olist_integrations").upsert(
        {
          seller_id: seller.id,
          org_id: seller.org_id,
          olist_token_ciphertext: ciphertext,
          olist_token_prefix: maskErpSecret(apiToken),
          olist_account_name: accountName,
          olist_account_cnpj_normalized: cnpjNorm.length >= 11 ? cnpjNorm : null,
          olist_token_validated_at: now,
          updated_at: now,
        },
        { onConflict: "seller_id" },
      )
    ).error;

    if (upErr) {
      const msg = String(upErr.message ?? "").toLowerCase();
      if (msg.includes("olist_account_cnpj") || upErr.code === "42703") {
        upErr = (
          await supabaseAdmin.from("seller_olist_integrations").upsert(
            {
              seller_id: seller.id,
              org_id: seller.org_id,
              olist_token_ciphertext: ciphertext,
              olist_token_prefix: maskErpSecret(apiToken),
              olist_account_name: accountName,
              olist_token_validated_at: now,
              updated_at: now,
            },
            { onConflict: "seller_id" },
          )
        ).error;
      }
    } else if (cnpjNorm.length >= 11) {
      cnpjSavedToDb = true;
    }

    if (upErr) {
      if (isMissingTableError(upErr)) {
        return NextResponse.json(
          { error: "Execute o script add-seller-olist-integration.sql no Supabase." },
          { status: 503 },
        );
      }
      console.error("[seller/olist PUT]", upErr.message);
      return NextResponse.json({ error: "Erro ao salvar o token." }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      connected: true,
      token_prefix: maskErpSecret(apiToken),
      account_name: accountName,
      validated_at: now,
      webhook_pedidos_url: buildOlistPedidosWebhookUrl(),
      olist_webhook_cnpj_ready: cnpjSavedToDb,
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro inesperado" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const seller = await getSellerFromToken(req);
    if (!seller) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    let delErr = (
      await supabaseAdmin
        .from("seller_olist_integrations")
        .update({
          olist_token_ciphertext: null,
          olist_token_prefix: null,
          olist_account_name: null,
          olist_account_cnpj_normalized: null,
          olist_token_validated_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("seller_id", seller.id)
    ).error;

    if (delErr) {
      const msg = String(delErr.message ?? "").toLowerCase();
      if (msg.includes("olist_account_cnpj") || delErr.code === "42703") {
        delErr = (
          await supabaseAdmin
            .from("seller_olist_integrations")
            .update({
              olist_token_ciphertext: null,
              olist_token_prefix: null,
              olist_account_name: null,
              olist_token_validated_at: null,
              updated_at: new Date().toISOString(),
            })
            .eq("seller_id", seller.id)
        ).error;
      }
    }

    if (delErr) {
      if (isMissingTableError(delErr)) {
        return NextResponse.json(
          { error: "Execute o script add-seller-olist-integration.sql no Supabase." },
          { status: 503 },
        );
      }
      console.error("[seller/olist DELETE]", delErr.message);
      return NextResponse.json({ error: "Erro ao remover o token." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, connected: false });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro inesperado" }, { status: 500 });
  }
}
