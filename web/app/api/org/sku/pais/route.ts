import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { OrgAuthError, requireOrgStaffForOrgId } from "@/lib/apiOrgAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Troque aqui se sua tabela tiver outro nome:
 * ex: "org_skus" | "catalogo_skus"
 */
const TABLE = "skus";

function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
}

type Status = "ativo" | "inativo";

function getStatusNorm(status?: string | null): Status {
  return (String(status || "").toLowerCase() === "inativo" ? "inativo" : "ativo") as Status;
}

function skuPaiFromSku(sku: string) {
  const s = (sku || "").trim().toUpperCase();
  const m = s.match(/^([A-Z]+)(\d{3})(\d{3})$/);
  if (!m) return null;
  const prefixo = m[1];
  const bloco = m[2];
  return `${prefixo}${bloco}000`;
}

/**
 * ✅ SKU SEMENTE: some de vez
 * - regra base: termina com 000
 * - e (não tem cor/tamanho) OU nome contém "semente"
 * - e também aceita SKU fixo DJU999000 (se existir)
 */
const SEED_SKUS_FIXOS = new Set<string>(["DJU999000"]);
/** Grupos (SKU Pai) ocultos em todos os locais — não excluir do banco, só não exibir */
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
    const { searchParams } = new URL(req.url);
    const org_id = (searchParams.get("org_id") || "").trim();
    if (!org_id) {
      return NextResponse.json(
        { error: "org_id é obrigatório (query). Ex.: ?org_id=UUID" },
        { status: 400 }
      );
    }
    await requireOrgStaffForOrgId(req, org_id);
    const supabase = supabaseAdmin();

    // ⚠️ aqui buscamos só colunas necessárias para agregar PAI
    const { data, error } = await supabase
      .from(TABLE)
      .select("sku,nome_produto,estoque_atual,custo_base,status,cor,tamanho")
      .eq("org_id", org_id)
      .limit(50000); // ajuste se precisar

    if (error) throw new Error(error.message);

    const rows = Array.isArray(data) ? data : [];

    // Agrupar por SKU Pai
    const map = new Map<
      string,
      {
        skuPai: string;
        nome: string;
        totalEstoque: number;
        totalVar: number;
        custoSum: number;
        custoCount: number;
        statusPai: Status;
      }
    >();

    for (const r of rows) {
      const sku = String(r.sku || "").trim().toUpperCase();
      if (!sku) continue;

      if (
        isSkuSemente({
          sku,
          cor: r.cor ?? null,
          tamanho: r.tamanho ?? null,
          nome_produto: r.nome_produto ?? null,
        })
      ) {
        continue; // some
      }

      const pai = skuPaiFromSku(sku);
      if (!pai) continue;
      if (PAIS_OCULTOS.has(pai)) continue;

      // filho real = sku != pai e não termina com 000
      if (sku === pai) continue;
      if (sku.endsWith("000")) continue;

      if (!map.has(pai)) {
        map.set(pai, {
          skuPai: pai,
          nome: String(r.nome_produto || "—"),
          totalEstoque: 0,
          totalVar: 0,
          custoSum: 0,
          custoCount: 0,
          statusPai: "ativo",
        });
      }

      const bucket = map.get(pai)!;

      // nome (primeiro que aparecer)
      if (!bucket.nome || bucket.nome === "—") bucket.nome = String(r.nome_produto || "—");

      bucket.totalVar += 1;
      bucket.totalEstoque += Number(r.estoque_atual || 0);

      const cb = r.custo_base;
      if (typeof cb === "number" && Number.isFinite(cb)) {
        bucket.custoSum += cb;
        bucket.custoCount += 1;
      }

      // statusPai: só vira inativo se TODOS filhos inativos
      // aqui marcamos se encontrar algum ativo
      if (getStatusNorm(r.status) === "ativo") bucket.statusPai = "ativo";
    }

    // Segunda passada: descobrir se pai é inativo (todos inativos)
    // (se nunca vimos ativo, ele fica "ativo" por padrão. Vamos corrigir:)
    // Para isso, vamos criar um contador de "inativos".
    const countByPai = new Map<string, { total: number; inativos: number }>();

    for (const r of rows) {
      const sku = String(r.sku || "").trim().toUpperCase();
      if (!sku) continue;

      if (
        isSkuSemente({
          sku,
          cor: r.cor ?? null,
          tamanho: r.tamanho ?? null,
          nome_produto: r.nome_produto ?? null,
        })
      ) {
        continue;
      }

      const pai = skuPaiFromSku(sku);
      if (!pai) continue;
      if (PAIS_OCULTOS.has(pai)) continue;
      if (sku === pai) continue;
      if (sku.endsWith("000")) continue;

      if (!countByPai.has(pai)) countByPai.set(pai, { total: 0, inativos: 0 });
      const c = countByPai.get(pai)!;
      c.total += 1;
      if (getStatusNorm(r.status) === "inativo") c.inativos += 1;
    }

    const out = Array.from(map.values())
      .map((g) => {
        const c = countByPai.get(g.skuPai);
        const statusPai: Status = c && c.total > 0 && c.inativos === c.total ? "inativo" : "ativo";
        const custoMedio = g.custoCount ? g.custoSum / g.custoCount : 0;

        return {
          skuPai: g.skuPai,
          nome: g.nome || "—",
          totalVar: g.totalVar,
          totalEstoque: g.totalEstoque,
          custoMedio,
          statusPai,
        };
      })
      .filter((g) => g.totalVar > 0)
      .filter((g) => !PAIS_OCULTOS.has(g.skuPai))
      .sort((a, b) => a.skuPai.localeCompare(b.skuPai));

    return NextResponse.json(out);
  } catch (e: unknown) {
    if (e instanceof OrgAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    }
    const msg = e instanceof Error ? e.message : "Erro ao listar pais";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
