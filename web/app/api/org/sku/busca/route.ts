import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { OrgAuthError, requireOrgStaffForOrgId } from "@/lib/apiOrgAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AnyRow = Record<string, any>;

async function tableExists(table: string) {
  // tenta um select simples — se não existir, vem erro do PostgREST
  const { error } = await supabaseAdmin.from(table).select("*").limit(1);
  return !error;
}

async function resolveTables() {
  // tenta os nomes mais comuns (plural e singular)
  const paisCandidates = ["sku_pais", "sku_pai"];
  const filhosCandidates = ["sku_filhos", "sku_filho"];

  let paisTable: string | null = null;
  let filhosTable: string | null = null;

  for (const t of paisCandidates) {
    if (await tableExists(t)) {
      paisTable = t;
      break;
    }
  }
  for (const t of filhosCandidates) {
    if (await tableExists(t)) {
      filhosTable = t;
      break;
    }
  }

  return { paisTable, filhosTable };
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const org_id = url.searchParams.get("org_id")?.trim() || "";
    const q = (url.searchParams.get("q") || "").trim();

    if (!org_id || org_id === "SEU_ORG_ID" || org_id === "SEU_ORG_ID_AQUI") {
      return NextResponse.json(
        { ok: false, error: "org_id inválido. Troque SEU_ORG_ID pelo id real da org." },
        { status: 400 }
      );
    }

    await requireOrgStaffForOrgId(req, org_id);

    const { paisTable, filhosTable } = await resolveTables();

    if (!paisTable || !filhosTable) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Não encontrei as tabelas de SKUs no Supabase. Verifique se existem (sku_pais/sku_pai e sku_filhos/sku_filho).",
          debug: { paisTable, filhosTable },
        },
        { status: 500 }
      );
    }

    // Busca pais da org (com filtro opcional)
    let paisQuery = supabaseAdmin
      .from(paisTable)
      .select("*")
      .eq("org_id", org_id)
      .order("sku_pai", { ascending: true });

    if (q) {
      // tenta filtrar por sku/titulo (se existir coluna)
      paisQuery = paisQuery.or(`sku_pai.ilike.%${q}%,titulo.ilike.%${q}%`);
    }

    const { data: pais, error: ePais } = await paisQuery;

    if (ePais) {
      return NextResponse.json(
        { ok: false, error: ePais.message, where: "paisQuery", table: paisTable },
        { status: 500 }
      );
    }

    const paisIds = (pais || []).map((p: AnyRow) => p.id);

    // Busca filhos desses pais
    const { data: filhos, error: eFilhos } = await supabaseAdmin
      .from(filhosTable)
      .select("*")
      .in("sku_pai_id", paisIds.length ? paisIds : ["00000000-0000-0000-0000-000000000000"])
      .order("sku_filho", { ascending: true });

    if (eFilhos) {
      return NextResponse.json(
        { ok: false, error: eFilhos.message, where: "filhosQuery", table: filhosTable },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      tables: { paisTable, filhosTable },
      pais: pais || [],
      filhos: filhos || [],
    });
  } catch (err: unknown) {
    if (err instanceof OrgAuthError) {
      return NextResponse.json({ ok: false, error: err.message }, { status: err.statusCode });
    }
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
