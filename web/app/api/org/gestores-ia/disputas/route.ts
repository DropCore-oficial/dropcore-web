/**
 * GET /api/org/gestores-ia/disputas — lista os casos de disputa fornecedor x seller que a
 * Amanda detectou (reclamação real do Mercado Livre com evidência anexada). Admin-only,
 * mesmo padrão de acesso do resto do financeiro (requireAdmin + supabaseAdmin, não RPC).
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAdmin } from "@/lib/apiOrgAuth";
import { DISPUTAS_EVIDENCIAS_BUCKET } from "@/lib/ai/gestorDisputasFornecedorDados";

const SIGNED_URL_EXPIRA_SEGUNDOS = 60 * 10;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { org_id } = await requireAdmin(req);

    const { data: casosRaw, error } = await supabaseAdmin
      .from("seller_ai_disputas_fornecedor")
      .select(
        "id, seller_id, fornecedor_id, pedido_id, ledger_id, ml_claim_id, ml_order_id, ml_item_id, evidencia, evidencia_seller_path, analise_ia, veredito_ia, status, fornecedor_resposta, fornecedor_respondeu_em, decisao_admin, decisao_detalhes, decidido_em, criado_em"
      )
      .eq("org_id", org_id)
      .order("criado_em", { ascending: false })
      .limit(50);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const casos = casosRaw ?? [];
    const sellerIds = Array.from(new Set(casos.map((c) => c.seller_id)));
    const fornecedorIds = Array.from(new Set(casos.map((c) => c.fornecedor_id).filter((id): id is string => !!id)));

    const [sellersRes, fornecedoresRes] = await Promise.all([
      sellerIds.length > 0
        ? supabaseAdmin.from("sellers").select("id, nome").in("id", sellerIds)
        : Promise.resolve({ data: [] as { id: string; nome: string }[] }),
      fornecedorIds.length > 0
        ? supabaseAdmin.from("fornecedores").select("id, nome").in("id", fornecedorIds)
        : Promise.resolve({ data: [] as { id: string; nome: string }[] }),
    ]);

    const sellerNomePorId = new Map((sellersRes.data ?? []).map((s) => [s.id, s.nome]));
    const fornecedorNomePorId = new Map((fornecedoresRes.data ?? []).map((f) => [f.id, f.nome]));

    const resultado = await Promise.all(
      casos.map(async (c) => {
        let foto_url: string | null = null;
        if (c.evidencia_seller_path) {
          const { data: signed } = await supabaseAdmin.storage
            .from(DISPUTAS_EVIDENCIAS_BUCKET)
            .createSignedUrl(c.evidencia_seller_path, SIGNED_URL_EXPIRA_SEGUNDOS);
          foto_url = signed?.signedUrl ?? null;
        }
        return {
          ...c,
          seller_nome: sellerNomePorId.get(c.seller_id) ?? "—",
          fornecedor_nome: c.fornecedor_id ? (fornecedorNomePorId.get(c.fornecedor_id) ?? "—") : "—",
          foto_url,
        };
      })
    );

    return NextResponse.json({ ok: true, casos: resultado });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    const status = msg === "Unauthorized" || msg === "Usuário sem organização." ? 401 : msg === "Sem permissão." ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
