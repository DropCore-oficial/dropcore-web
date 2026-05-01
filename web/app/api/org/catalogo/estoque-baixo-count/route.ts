import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { OrgAuthError, requireOrgStaffForOrgId } from "@/lib/apiOrgAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const getUrl = () => process.env.NEXT_PUBLIC_SUPABASE_URL!;
const getServiceKey = () => process.env.SUPABASE_SERVICE_ROLE_KEY!;

/** SKUs desse prefixo são de grupo oculto (não contamos no aviso) */
const PREFIXO_OCULTO = "DJU999";

export async function GET(req: Request) {
  try {
    const url = getUrl();
    const serviceKey = getServiceKey();
    if (!url || !serviceKey) {
      return NextResponse.json({ error: "Configuração Supabase ausente" }, { status: 500 });
    }

    const { searchParams } = new URL(req.url);
    const orgId = (searchParams.get("orgId") || "").trim();
    const fornecedorId = (searchParams.get("fornecedorId") || "").trim();

    if (!orgId) {
      return NextResponse.json({ error: "orgId é obrigatório" }, { status: 400 });
    }

    await requireOrgStaffForOrgId(req, orgId);

    const supabaseAdmin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    let query = supabaseAdmin
      .from("skus")
      .select("id, sku, estoque_atual, estoque_minimo")
      .eq("org_id", orgId)
      .not("sku", "ilike", `${PREFIXO_OCULTO}%`)
      .limit(2000);

    if (fornecedorId) {
      query = query.eq("fornecedor_id", fornecedorId);
    }

    const { data: rows, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const count = (rows ?? []).filter((row: { estoque_atual: number | null; estoque_minimo: number | null }) => {
      const atual = row.estoque_atual;
      const min = row.estoque_minimo;
      return min != null && atual != null && Number(atual) < Number(min);
    }).length;

    return NextResponse.json({ count });
  } catch (e: unknown) {
    if (e instanceof OrgAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    }
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
