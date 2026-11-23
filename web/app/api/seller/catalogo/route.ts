/**
 * GET /api/seller/catalogo?q=xxx
 * Catálogo de SKUs para o seller — só lista itens quando existe `sellers.fornecedor_id` (armazém ligado em Produtos).
 * Sem vínculo: `items: []`, `sem_armazem_ligado: true`, `fornecedor_id: null` (não expor SKUs de toda a org).
 * Com vínculo: filtra por esse fornecedor; `sem_armazem_ligado: false`.
 * Retorna custo_total por unidade (fornecedor + taxa DropCore em R$, ou base×1,15 se só base). Não expõe custo_base/custo_dropcore.
 * Requer Bearer token do seller.
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createClient } from "@supabase/supabase-js";
import { paiKeyDoSku } from "@/lib/skuPaiKey";
import { pipelineDetalhesCatalogoEspelho, type SkuCatalogoDetalhesRow } from "@/lib/catalogoSkusDetalhesEspelho";
import { sellerCustoTotalPagoUnitario } from "@/lib/sellerCustoTotalPago";
import { loadSellerFornecedoresList, loadSellerFornecedorVinculoMeta } from "@/lib/sellerFornecedoresList";
import { resolverFornecedoresAtivosDoSeller } from "@/lib/sellerFornecedoresCdAtivos";

const SKU_CATALOGO_FIELDS =
  "id, sku, nome_produto, cor, tamanho, status, fornecedor_id, estoque_atual, estoque_minimo, custo_dropcore, custo_base, categoria, dimensoes_pacote, comprimento_cm, largura_cm, altura_cm, peso_kg, imagem_url, link_fotos, descricao, ncm, origem, cest, marca, expedicao_override_linha, detalhes_produto_json, data_lancamento";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const auth = req.headers.get("authorization") ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) return NextResponse.json({ error: "Sem token." }, { status: 401 });

    const sbAnon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } }
    );
    const { data: userData, error: userErr } = await sbAnon.auth.getUser(token);
    if (userErr || !userData?.user) return NextResponse.json({ error: "Token inválido." }, { status: 401 });

    const { data: seller, error: sellerErr } = await supabaseAdmin
      .from("sellers")
      .select("id, org_id, fornecedor_id, plano")
      .eq("user_id", userData.user.id)
      .maybeSingle();
    if (sellerErr || !seller) return NextResponse.json({ error: "Seller não encontrado." }, { status: 404 });

    const { searchParams } = new URL(req.url);
    const qRaw = (searchParams.get("q") ?? "").trim().slice(0, 200).replace(/[%_\\]/g, "");
    const includeFornecedores = searchParams.get("include_fornecedores") === "1";

    /** Sem armazém ligado em Produtos: não listar SKUs da org inteira — só após vínculo.
     * Todo vínculo ativo (avulso ou do CD) vive em seller_fornecedor_vinculos. */
    const fornecedorIds = await resolverFornecedoresAtivosDoSeller({
      seller_id: (seller as { id: string }).id,
      org_id: seller.org_id,
    });
    const fornecedorId = fornecedorIds[0] ?? null;

    const fornecedoresListaPromise = includeFornecedores
      ? loadSellerFornecedorVinculoMeta((seller as { id: string }).id).then((meta) =>
          loadSellerFornecedoresList(
            seller.org_id,
            meta.fornecedor_conectado_id,
            meta.fornecedor_vinculado_em,
            meta.fornecedor_desvinculo_liberado
          )
        )
      : null;

    const sellerPlano = (seller as { plano?: string | null }).plano ?? null;

    if (fornecedorIds.length === 0) {
      const fornecedoresMeta = fornecedoresListaPromise ? await fornecedoresListaPromise : null;
      return NextResponse.json({
        ok: true,
        items: [],
        fornecedor_id: null,
        sem_armazem_ligado: true,
        seller_plano: sellerPlano,
        habilitados_count: 0,
        habilitados_max: null,
        habilitados_tabela_ok: true,
        ...(fornecedoresMeta && {
          fornecedores: fornecedoresMeta.fornecedores,
          vinculo: fornecedoresMeta.vinculo,
        }),
      });
    }

    let query = supabaseAdmin
      .from("skus")
      // custo_dropcore / custo_base só no servidor para calcular custo_total; nunca expor ao client
      .select(SKU_CATALOGO_FIELDS)
      .eq("org_id", seller.org_id)
      .ilike("status", "ativo")
      .in("fornecedor_id", fornecedorIds)
      .order("sku", { ascending: true })
      .limit(500);

    if (qRaw) query = query.or(`sku.ilike.%${qRaw}%,nome_produto.ilike.%${qRaw}%,cor.ilike.%${qRaw}%,tamanho.ilike.%${qRaw}%`);

    const fornecedorExpedicaoPromise = supabaseAdmin
      .from("fornecedores")
      .select(
        "expedicao_padrao_linha, expedicao_cep, expedicao_logradouro, expedicao_numero, expedicao_complemento, expedicao_bairro, expedicao_cidade, expedicao_uf"
      )
      .eq("id", fornecedorId as string)
      .maybeSingle();

    const { data, error } = await query;
    if (error) throw error;

    const rawRows = (data ?? []) as Record<string, unknown>[];

    /** Mesmo espelho do GET fornecedor: inclui SKU pai (…000) só para JSON, depois só devolve
     * ativos — cada fornecedor do CD tem numeração própria de SKU, então o pipeline roda uma
     * vez por fornecedor (nunca mistura o grupo de um com o pai de outro) e concatena o resultado. */
    const rowsPorFornecedor = new Map<string, Record<string, unknown>[]>();
    for (const row of rawRows) {
      const fid = String((row as { fornecedor_id?: string | null }).fornecedor_id ?? "");
      if (!fid) continue;
      const lista = rowsPorFornecedor.get(fid) ?? [];
      lista.push(row);
      rowsPorFornecedor.set(fid, lista);
    }
    const rowsEspelho: Record<string, unknown>[] = [];
    for (const [fid, rowsDoFornecedor] of rowsPorFornecedor) {
      const espelhado = await pipelineDetalhesCatalogoEspelho(supabaseAdmin, rowsDoFornecedor as SkuCatalogoDetalhesRow[], {
        orgId: seller.org_id,
        fornecedorId: fid,
        selectFields: SKU_CATALOGO_FIELDS,
      });
      rowsEspelho.push(...espelhado);
    }

    const items = rowsEspelho
      .filter((row) => String(row.status ?? "").toLowerCase() === "ativo")
      .map((row) => {
        const custoTotal = sellerCustoTotalPagoUnitario(
          (row as { custo_base?: unknown }).custo_base,
          (row as { custo_dropcore?: unknown }).custo_dropcore,
        );
        const { custo_dropcore: _cd, custo_base: _cb, ...rest } = row as Record<string, unknown> & {
          custo_dropcore?: unknown;
          custo_base?: unknown;
        };
        return {
          ...rest,
          custo_total: custoTotal,
          habilitado_venda: true,
        };
      });

    /** Cores distintas (grupo SKU + cor) entre os SKUs ativos — todo SKU ativo já vende na
     * API, sem toggle manual (removido 2026-11-08, ver docs/SCHEMA.md). */
    const habilitados_count = new Set(
      items.map((it) => `${paiKeyDoSku(String((it as { sku?: string }).sku ?? ""))}::${String((it as { cor?: string }).cor ?? "").trim().toUpperCase()}`),
    ).size;

    const fornecedoresMeta = fornecedoresListaPromise ? await fornecedoresListaPromise : null;
    const { data: fornExpRow } = await fornecedorExpedicaoPromise;

    return NextResponse.json({
      ok: true,
      items,
      fornecedor_id: fornecedorId,
      fornecedor_ids: fornecedorIds,
      sem_armazem_ligado: false,
      seller_plano: sellerPlano,
      habilitados_count,
      habilitados_max: null,
      habilitados_tabela_ok: true,
      fornecedor_expedicao: fornExpRow ?? null,
      ...(fornecedoresMeta && {
        fornecedores: fornecedoresMeta.fornecedores,
        vinculo: fornecedoresMeta.vinculo,
      }),
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro inesperado" }, { status: 500 });
  }
}
