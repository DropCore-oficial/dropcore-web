/**
 * GET /api/seller/erp-api-key — Retorna se o seller tem API key configurada (só prefixo)
 * POST /api/seller/erp-api-key — Gera nova API key para o seller. Retorna a chave COMPLETA só uma vez.
 */
import { NextResponse } from "next/server";
import { createHash, randomBytes } from "crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function hashApiKey(key: string): string {
  return createHash("sha256").update(key.trim()).digest("hex");
}

function generateApiKey(): string {
  const prefix = "dc_";
  const random = randomBytes(24).toString("base64url");
  return `${prefix}${random}`;
}

async function getSellerFromToken(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return null;

  const sbAnon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );
  const { data: userData, error: userErr } = await sbAnon.auth.getUser(token);
  if (userErr || !userData?.user) return null;

  const { data: seller } = await supabaseAdmin
    .from("sellers")
    .select("id")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  return seller;
}

export async function GET(req: Request) {
  try {
    const seller = await getSellerFromToken(req);
    if (!seller) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

    const { data: row, error } = await supabaseAdmin
      .from("sellers")
      .select("erp_api_key_prefix")
      .eq("id", seller.id)
      .maybeSingle();

    if (error) {
      console.error("[seller/erp-api-key GET]", error.message);
      return NextResponse.json({ error: "Erro ao buscar configuração." }, { status: 500 });
    }

    const hasKey = !!row?.erp_api_key_prefix;

    return NextResponse.json({
      has_key: hasKey,
      prefix: hasKey ? row.erp_api_key_prefix : null,
    });
  } catch (e: unknown) {
    console.error("[seller/erp-api-key GET]", e);
    return NextResponse.json({ error: "Erro inesperado" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const seller = await getSellerFromToken(req);
    if (!seller) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

    const apiKey = generateApiKey();
    const keyHash = hashApiKey(apiKey);
    const prefix = apiKey.slice(0, 10);

    const { error } = await supabaseAdmin
      .from("sellers")
      .update({
        erp_api_key_hash: keyHash,
        erp_api_key_prefix: prefix,
      })
      .eq("id", seller.id);

    if (error) {
      if (error.message?.includes("erp_api_key_hash") || error.message?.includes("does not exist")) {
        return NextResponse.json(
          { error: "Execute o script add-seller-erp-api-key.sql no Supabase para habilitar a integração ERP." },
          { status: 503 }
        );
      }
      console.error("[seller/erp-api-key POST]", error.message);
      return NextResponse.json({ error: "Erro ao gerar chave." }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      api_key: apiKey,
      prefix,
      message: "Guarde esta chave em local seguro. Ela não será exibida novamente.",
    });
  } catch (e: unknown) {
    console.error("[seller/erp-api-key POST]", e);
    return NextResponse.json({ error: "Erro inesperado" }, { status: 500 });
  }
}
