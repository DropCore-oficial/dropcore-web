/**
 * GET /api/org/mensalidades - Lista mensalidades
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAdmin } from "@/lib/apiOrgAuth";
import { isPortalTrialAtivo } from "@/lib/portalTrial";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { org_id } = await requireAdmin(req);
    const { searchParams } = new URL(req.url);
    const ciclo = searchParams.get("ciclo")?.trim().slice(0, 7);
    const tipo = searchParams.get("tipo")?.trim();
    const status = searchParams.get("status")?.trim();

    let query = supabaseAdmin
      .from("financial_mensalidades")
      .select("id, tipo, entidade_id, ciclo, valor, status, vencimento_em, pago_em, criado_em")
      .eq("org_id", org_id)
      .order("ciclo", { ascending: false })
      .limit(200);

    if (ciclo) {
      query = query.eq("ciclo", ciclo + "-01");
    }
    if (tipo && ["seller", "fornecedor"].includes(tipo)) {
      query = query.eq("tipo", tipo);
    }
    if (status && ["pendente", "pago", "inadimplente", "cancelado"].includes(status)) {
      query = query.eq("status", status);
    }

    const { data, error } = await query;
    if (error) {
      if (error.message?.includes("does not exist") || error.code === "42P01") {
        return NextResponse.json([]);
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = data ?? [];
    const sellerIds = [...new Set(rows.filter((r) => r.tipo === "seller").map((r) => r.entidade_id))];
    const fornIds = [...new Set(rows.filter((r) => r.tipo === "fornecedor").map((r) => r.entidade_id))];

    const [sellersRes, fornRes] = await Promise.all([
      sellerIds.length > 0 ? supabaseAdmin.from("sellers").select("id, nome, trial_valido_ate").in("id", sellerIds) : { data: [] },
      fornIds.length > 0 ? supabaseAdmin.from("fornecedores").select("id, nome, trial_valido_ate").in("id", fornIds) : { data: [] },
    ]);

    const sellersMap = new Map((sellersRes.data ?? []).map((s) => [s.id, { nome: s.nome, trial: (s as { trial_valido_ate?: string | null }).trial_valido_ate ?? null }]));
    const fornMap = new Map((fornRes.data ?? []).map((f) => [f.id, { nome: f.nome, trial: (f as { trial_valido_ate?: string | null }).trial_valido_ate ?? null }]));

    const enriched = rows.map((r) => {
      const meta = r.tipo === "seller" ? sellersMap.get(r.entidade_id) : fornMap.get(r.entidade_id);
      const nome = meta?.nome ?? "—";
      const trialAte = meta?.trial ?? null;
      return {
        ...r,
        entidade_nome: nome,
        em_teste_gratis: isPortalTrialAtivo(trialAte),
      };
    });

    return NextResponse.json(enriched);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    const status =
      msg === "Unauthorized" || msg === "Usuário sem organização." ? 401 : msg === "Sem permissão." ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
