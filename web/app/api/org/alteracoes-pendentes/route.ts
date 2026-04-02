/**
 * GET /api/org/alteracoes-pendentes — lista alterações de produto pendentes de análise (admin)
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAdmin } from "@/lib/apiOrgAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { org_id } = await requireAdmin(req);

    const { data, error } = await supabaseAdmin
      .from("sku_alteracoes_pendentes")
      .select("id, sku_id, fornecedor_id, org_id, dados_propostos, status, motivo_rejeicao, analisado_em, criado_em")
      .eq("org_id", org_id)
      .eq("status", "pendente")
      .order("criado_em", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const rows = data || [];
    const withDetails = await Promise.all(
      rows.map(async (row) => {
        const [skuRes, fornRes] = await Promise.all([
          supabaseAdmin.from("skus").select("id, sku, nome_produto, cor, tamanho, custo_base, custo_dropcore, estoque_atual, estoque_minimo, descricao, categoria, dimensoes_pacote, comprimento_cm, largura_cm, altura_cm, peso_kg, peso_liquido_kg, peso_bruto_kg, link_fotos, imagem_url, ncm, origem, cest, cfop").eq("id", row.sku_id).single(),
          supabaseAdmin.from("fornecedores").select("id, nome").eq("id", row.fornecedor_id).single(),
        ]);
        return {
          ...row,
          sku: skuRes.data,
          fornecedor_nome: fornRes.data?.nome ?? "—",
        };
      })
    );

    return NextResponse.json(withDetails);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: 401 });
  }
}
