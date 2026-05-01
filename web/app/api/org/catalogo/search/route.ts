import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { OrgAuthError, requireOrgStaffForOrgId } from "@/lib/apiOrgAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const getUrl = () => process.env.NEXT_PUBLIC_SUPABASE_URL!;
const getServiceKey = () => process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET(req: Request) {
  try {
    const url = getUrl();
    const serviceKey = getServiceKey();
    if (!url || !serviceKey) {
      return NextResponse.json({ error: "Configuração Supabase ausente" }, { status: 500 });
    }

    const { searchParams } = new URL(req.url);
    const qRaw = (searchParams.get("q") || "").trim();
    const q = qRaw.slice(0, 200).replace(/[%_\\]/g, "");
    const orgId = (searchParams.get("orgId") || "").trim();
    const fornecedorId = (searchParams.get("fornecedorId") || "").trim();

    if (!orgId) {
      return NextResponse.json({ error: "orgId é obrigatório" }, { status: 400 });
    }

    const { isOperacional } = await requireOrgStaffForOrgId(req, orgId);

    const supabaseAdmin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    let query = supabaseAdmin
      .from("skus")
      .select(
        "id, sku, nome_produto, cor, tamanho, status, fornecedor_id, estoque_atual, estoque_minimo, custo_base, custo_dropcore, categoria, dimensoes_pacote, comprimento_cm, largura_cm, altura_cm, peso_kg"
      )
      .eq("org_id", orgId)
      .order("sku", { ascending: true })
      .limit(500);

    if (fornecedorId) {
      query = query.eq("fornecedor_id", fornecedorId);
    }
    if (q) {
      query = query.or(`sku.ilike.%${q}%,nome_produto.ilike.%${q}%,cor.ilike.%${q}%,tamanho.ilike.%${q}%`);
    }

    const { data, error } = await query;
    if (error) throw error;

    const rawItems = data ?? [];
    const items = isOperacional
      ? rawItems.map((row: Record<string, unknown>) => {
          const { custo_base: _, ...rest } = row;
          return rest;
        })
      : rawItems;

    return NextResponse.json({
      ok: true,
      items,
      count: items.length,
    });
  } catch (e: unknown) {
    if (e instanceof OrgAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    }
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
