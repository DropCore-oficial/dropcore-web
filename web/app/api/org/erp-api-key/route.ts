/**
 * GET /api/org/erp-api-key — Retorna se a org tem API key configurada (só prefixo)
 * POST /api/org/erp-api-key — Gera nova API key (owner/admin). Retorna a chave COMPLETA só uma vez.
 */
import { NextResponse } from "next/server";
import { createHash, randomBytes } from "crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAdmin } from "@/lib/apiOrgAuth";

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

export async function GET(req: Request) {
  try {
    const { org_id } = await requireAdmin(req);

    const { data: org, error } = await supabaseAdmin
      .from("orgs")
      .select("erp_api_key_prefix")
      .eq("id", org_id)
      .maybeSingle();

    if (error) {
      console.error("[erp-api-key GET]", error.message);
      return NextResponse.json({ error: "Erro ao buscar configuração." }, { status: 500 });
    }

    const hasKey = !!org?.erp_api_key_prefix;

    return NextResponse.json({
      has_key: hasKey,
      prefix: hasKey ? org.erp_api_key_prefix : null,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    const status = msg === "Unauthorized" || msg === "Usuário sem organização." ? 401 : msg === "Sem permissão." ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function POST(req: Request) {
  try {
    const { org_id } = await requireAdmin(req);

    const apiKey = generateApiKey();
    const keyHash = hashApiKey(apiKey);
    const prefix = apiKey.slice(0, 10);

    const { error } = await supabaseAdmin
      .from("orgs")
      .update({
        erp_api_key_hash: keyHash,
        erp_api_key_prefix: prefix,
      })
      .eq("id", org_id);

    if (error) {
      if (error.message?.includes("erp_api_key_hash") || error.message?.includes("does not exist")) {
        return NextResponse.json(
          { error: "Execute o script add-erp-api-key.sql no Supabase para habilitar a integração ERP." },
          { status: 503 }
        );
      }
      console.error("[erp-api-key POST]", error.message);
      return NextResponse.json({ error: "Erro ao gerar chave." }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      api_key: apiKey,
      prefix,
      message: "Guarde esta chave em local seguro. Ela não será exibida novamente.",
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    const status = msg === "Unauthorized" || msg === "Usuário sem organização." ? 401 : msg === "Sem permissão." ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
