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
import { countHabilitadosQueContamNoLimite, isSellerPlanoPro } from "@/lib/sellerSkuHabilitado";
import { sellerCustoTotalPagoUnitario } from "@/lib/sellerCustoTotalPago";

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

    /** Sem armazém ligado em Produtos: não listar SKUs da org inteira — só após vínculo. */
    const fornecedorId = (seller as { fornecedor_id?: string | null }).fornecedor_id ?? null;

    let habilitadoSet = new Set<string>();
    let habilitados_count = 0;
    let habilitados_tabela_ok = true;
    const { data: habRows, error: habErr } = await supabaseAdmin
      .from("seller_skus_habilitados")
      .select("sku_id")
      .eq("seller_id", (seller as { id: string }).id);
    if (habErr) {
      const m = String(habErr.message ?? "");
      if (m.includes("does not exist") || habErr.code === "42P01") {
        habilitados_tabela_ok = false;
      } else {
        throw habErr;
      }
    } else {
      habilitadoSet = new Set((habRows ?? []).map((r: { sku_id: string }) => r.sku_id));
      const cnt = await countHabilitadosQueContamNoLimite(supabaseAdmin, (seller as { id: string }).id);
      habilitados_count = cnt.count;
    }

    const sellerPlano = (seller as { plano?: string | null }).plano ?? null;

    if (!fornecedorId) {
      return NextResponse.json({
        ok: true,
        items: [],
        fornecedor_id: null,
        sem_armazem_ligado: true,
        seller_plano: sellerPlano,
        habilitados_count,
        habilitados_max: isSellerPlanoPro(sellerPlano) ? null : 15,
        habilitados_tabela_ok,
      });
    }

    let query = supabaseAdmin
      .from("skus")
      // custo_dropcore / custo_base só no servidor para calcular custo_total; nunca expor ao client
      .select(
        "id, sku, nome_produto, cor, tamanho, status, fornecedor_id, estoque_atual, estoque_minimo, custo_dropcore, custo_base, categoria, dimensoes_pacote, comprimento_cm, largura_cm, altura_cm, peso_kg, imagem_url, link_fotos, descricao, ncm, origem, cest, cfop",
      )
      .eq("org_id", seller.org_id)
      .ilike("status", "ativo")
      .eq("fornecedor_id", fornecedorId)
      .order("sku", { ascending: true })
      .limit(500);

    if (qRaw) query = query.or(`sku.ilike.%${qRaw}%,nome_produto.ilike.%${qRaw}%,cor.ilike.%${qRaw}%,tamanho.ilike.%${qRaw}%`);

    const { data, error } = await query;
    if (error) throw error;

    const items = (data ?? []).map((row) => {
      const custoTotal = sellerCustoTotalPagoUnitario(
        (row as { custo_base?: unknown }).custo_base,
        (row as { custo_dropcore?: unknown }).custo_dropcore,
      );
      const { custo_dropcore: _cd, custo_base: _cb, ...rest } = row as Record<string, unknown> & { custo_dropcore?: unknown; custo_base?: unknown };
      const id = String((row as { id?: string }).id ?? "");
      return {
        ...rest,
        custo_total: custoTotal,
        habilitado_venda: habilitadoSet.has(id),
      };
    });

    return NextResponse.json({
      ok: true,
      items,
      fornecedor_id: fornecedorId,
      sem_armazem_ligado: false,
      seller_plano: sellerPlano,
      habilitados_count,
      habilitados_max: isSellerPlanoPro(sellerPlano) ? null : 15,
      habilitados_tabela_ok,
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro inesperado" }, { status: 500 });
  }
}
