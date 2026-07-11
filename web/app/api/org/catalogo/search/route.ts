import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { OrgAuthError, requireOrgStaffForOrgId, getMe } from "@/lib/apiOrgAuth";

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
    const orgIdParam = (searchParams.get("orgId") || "").trim();
    const fornecedorId = (searchParams.get("fornecedorId") || "").trim();

    /** Sem orgId no query: resolve a própria org do usuário (mais simples pro front, ainda seguro —
     * é a org do próprio token, não uma passada por fora). Com orgId no query: mantém a checagem
     * anti-IDOR de sempre (valida que o usuário pertence àquela org específica). */
    let orgId: string;
    let isOperacional: boolean;
    if (orgIdParam) {
      orgId = orgIdParam;
      ({ isOperacional } = await requireOrgStaffForOrgId(req, orgId));
    } else {
      const me = await getMe(req);
      orgId = me.org_id;
      isOperacional = me.role_base === "operacional";
    }

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
    const status = msg === "Sem permissão." ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
