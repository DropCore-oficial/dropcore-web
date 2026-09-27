/**
 * GET /api/public/vitrine
 * Amostra pública do catálogo pra landing page — sem autenticação, sem expor fornecedor.
 * Preço devolvido é `custo_total` (o que o SELLER paga, mesmo cálculo/fonte de
 * `api/seller/catalogo`), nunca `custo_base`/`custo_dropcore` brutos nem `fornecedor_id`.
 *
 * Agrupado por produto-pai (mesmo padrão `paiKey` de admin/catalogo: SKU termina em "000")
 * — cada item da amostra é um PRODUTO com as cores das variações-filhas, não um SKU solto.
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { PREFIXO_SKU_SISTEMA } from "@/lib/planos";
import { sellerCustoTotalPagoUnitario } from "@/lib/sellerCustoTotalPago";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AMOSTRA_TAMANHO = 12;
const CANDIDATOS_LIMITE = 400;

function embaralhar<T>(arr: T[]): T[] {
  const copia = [...arr];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

/** Mesma regra de admin/catalogo/page.tsx (paiKey): SKU pai termina em "000". */
function paiKey(sku: string): string {
  return sku.length >= 3 ? sku.slice(0, -3) + "000" : sku;
}

type SkuRow = {
  id: string;
  sku: string;
  nome_produto: string | null;
  categoria: string | null;
  cor: string | null;
  imagem_url: string | null;
  custo_base: unknown;
  custo_dropcore: unknown;
  estoque_atual: number | null;
};

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from("skus")
      .select("id, sku, nome_produto, categoria, cor, imagem_url, custo_base, custo_dropcore, estoque_atual")
      .ilike("status", "ativo")
      .not("sku", "ilike", `${PREFIXO_SKU_SISTEMA}%`)
      .not("imagem_url", "is", null)
      .gt("estoque_atual", 0)
      .order("criado_em", { ascending: false })
      .limit(CANDIDATOS_LIMITE);

    if (error) throw error;

    const rows = (data ?? []) as SkuRow[];

    const porProduto = new Map<string, SkuRow[]>();
    for (const row of rows) {
      const key = paiKey(row.sku);
      if (!porProduto.has(key)) porProduto.set(key, []);
      porProduto.get(key)!.push(row);
    }

    const produtos = embaralhar(Array.from(porProduto.values()));
    const items: {
      id: string;
      nome_produto: string | null;
      categoria: string | null;
      cores: { cor: string | null; imagem_url: string | null; preco: number }[];
    }[] = [];

    for (const filhos of produtos) {
      if (items.length >= AMOSTRA_TAMANHO) break;

      const cores: { cor: string | null; imagem_url: string | null; preco: number }[] = [];
      for (const filho of filhos) {
        const preco = sellerCustoTotalPagoUnitario(filho.custo_base, filho.custo_dropcore);
        if (preco == null || preco <= 0) continue;
        cores.push({ cor: filho.cor, imagem_url: filho.imagem_url, preco });
      }
      if (cores.length === 0) continue;

      // "Nome do produto" real vem do primeiro filho válido (SKU pai costuma não ter cor).
      const principal = filhos.find((f) => f.imagem_url) ?? filhos[0];
      items.push({
        id: paiKey(principal.sku),
        nome_produto: principal.nome_produto ?? null,
        categoria: principal.categoria ?? null,
        cores,
      });
    }

    return NextResponse.json({ ok: true, items });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro inesperado" }, { status: 500 });
  }
}
