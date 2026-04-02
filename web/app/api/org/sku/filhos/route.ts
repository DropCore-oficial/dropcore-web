import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Troque aqui se sua tabela tiver outro nome:
 */
const TABLE = "skus";

function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
}

function getOrgId(req: Request) {
  const h = req.headers.get("x-org-id");
  if (h) return h;

  const env = process.env.DROPCORE_DEFAULT_ORG_ID;
  if (env) return env;

  throw new Error("Org não definida. Configure DROPCORE_DEFAULT_ORG_ID ou envie header x-org-id.");
}

const SEED_SKUS_FIXOS = new Set<string>(["DJU999000"]);
/** Grupos (SKU Pai) ocultos em todos os locais — não apagar, só não exibir */
const PAIS_OCULTOS = new Set<string>(["DJU999000"]);

function isSkuSemente(row: { sku: string; cor: string | null; tamanho: string | null; nome_produto: string | null }) {
  const sku = String(row?.sku || "").trim().toUpperCase();
  const nome = String(row?.nome_produto || "").trim().toLowerCase();
  const semCorTam = !row.cor && !row.tamanho;

  if (SEED_SKUS_FIXOS.has(sku)) return true;
  if (!sku.endsWith("000")) return false;
  if (nome.includes("semente")) return true;
  return semCorTam;
}

export async function GET(req: Request) {
  try {
    const org_id = getOrgId(req);
    const { searchParams } = new URL(req.url);
    const pai = String(searchParams.get("pai") || "").trim().toUpperCase();

    if (!pai.match(/^[A-Z]+\d{6}$/) || !pai.endsWith("000")) {
      throw new Error("Parâmetro 'pai' inválido. Ex: DJU100000");
    }
    if (PAIS_OCULTOS.has(pai)) {
      return NextResponse.json([]);
    }

    const base = pai.slice(0, -3); // DJU100
    const supabase = supabaseAdmin();

    const { data, error } = await supabase
      .from(TABLE)
      .select("id,sku,nome_produto,estoque_atual,estoque_minimo,custo_base,custo_dropcore,status,cor,tamanho,peso_kg,criado_em,fornecedor_id,fornecedor_org_id,org_id")
      .eq("org_id", org_id)
      .like("sku", `${base}%`)
      .order("sku", { ascending: true })
      .limit(5000);

    if (error) throw new Error(error.message);

    const rows = (Array.isArray(data) ? data : []).filter((r) => {
      const sku = String(r.sku || "").trim().toUpperCase();
      if (!sku) return false;
      if (sku === pai) return false;       // não retorna o pai
      if (sku.endsWith("000")) return false; // corta semente/pai
      if (isSkuSemente({ sku, cor: r.cor ?? null, tamanho: r.tamanho ?? null, nome_produto: r.nome_produto ?? null })) return false;
      return true;
    });

    return NextResponse.json(rows);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Erro ao listar filhos" }, { status: 400 });
  }
}
