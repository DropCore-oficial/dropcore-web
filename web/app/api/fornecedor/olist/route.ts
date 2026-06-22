/**
 * GET /api/fornecedor/olist — Status da integração Olist/Tiny do fornecedor
 * PUT /api/fornecedor/olist — Valida e salva token API
 * DELETE /api/fornecedor/olist — Remove token
 */
import { NextResponse } from "next/server";
import { getFornecedorContextFromBearer } from "@/lib/fornecedorAuth";
import { fetchOlistAccountInfo, formatOlistAccountLabel } from "@/lib/olistTinyApi";
import {
  decryptSellerErpSecret,
  describeSellerErpSecretDecryptFailure,
  encryptSellerErpSecret,
  maskErpSecret,
} from "@/lib/sellerErpSecretBox";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" } as const;

const OLIST_SELECT =
  "olist_token_ciphertext, olist_token_prefix, olist_account_name, olist_token_validated_at, updated_at, olist_last_estoque_sync_at, olist_last_estoque_sync_status, olist_last_estoque_sync_error, olist_last_estoque_sync_summary";

type OlistRow = {
  olist_token_ciphertext: string | null;
  olist_token_prefix: string | null;
  olist_account_name: string | null;
  olist_token_validated_at: string | null;
  updated_at: string | null;
  olist_last_estoque_sync_at: string | null;
  olist_last_estoque_sync_status: string | null;
  olist_last_estoque_sync_error: string | null;
  olist_last_estoque_sync_summary: Record<string, unknown> | null;
};

function isMissingTableError(error: { message?: string; code?: string }) {
  const msg = String(error.message ?? "").toLowerCase();
  const code = String(error.code ?? "");
  return msg.includes("does not exist") || msg.includes("schema cache") || code === "42P01" || code === "PGRST205";
}

function buildEstoqueSyncPayload(row: OlistRow | null | undefined) {
  const summary = row?.olist_last_estoque_sync_summary;
  return {
    last_at: row?.olist_last_estoque_sync_at ?? null,
    status: row?.olist_last_estoque_sync_status ?? null,
    error: row?.olist_last_estoque_sync_error ?? null,
    updated: typeof summary?.updated === "number" ? summary.updated : null,
    unchanged: typeof summary?.unchanged === "number" ? summary.unchanged : null,
    missing_olist: typeof summary?.missing_olist === "number" ? summary.missing_olist : null,
    errors: typeof summary?.errors === "number" ? summary.errors : null,
  };
}

export async function GET(req: Request) {
  try {
    const ctx = await getFornecedorContextFromBearer(req);
    if (!ctx) {
      return NextResponse.json({ error: "Não autenticado como fornecedor." }, { status: 401, headers: NO_STORE });
    }

    const { data: row, error } = await supabaseAdmin
      .from("fornecedor_olist_integrations")
      .select(OLIST_SELECT)
      .eq("fornecedor_id", ctx.fornecedor_id)
      .maybeSingle();

    if (error) {
      if (isMissingTableError(error)) {
        return NextResponse.json(
          {
            olist_unavailable: true,
            connected: false,
            estoque_sync: buildEstoqueSyncPayload(null),
          },
          { headers: NO_STORE },
        );
      }
      console.error("[fornecedor/olist GET]", error.message);
      return NextResponse.json({ error: "Erro ao carregar integração Olist." }, { status: 500, headers: NO_STORE });
    }

    const typed = row as OlistRow | null;
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

    const { error: upErr } = await supabaseAdmin.from("fornecedor_olist_integrations").upsert(
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
    );

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

    return NextResponse.json({
      ok: true,
      connected: true,
      token_prefix: maskErpSecret(apiToken),
      account_name: accountName,
      validated_at: now,
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

    const { error: delErr } = await supabaseAdmin
      .from("fornecedor_olist_integrations")
      .update({
        olist_token_ciphertext: null,
        olist_token_prefix: null,
        olist_account_name: null,
        olist_token_validated_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("fornecedor_id", ctx.fornecedor_id);

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

    return NextResponse.json({ ok: true, connected: false });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro inesperado" }, { status: 500 });
  }
}
