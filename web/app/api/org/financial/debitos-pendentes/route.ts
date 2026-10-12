/**
 * GET /api/org/financial/debitos-pendentes
 * Lista débito de fornecedor (devolução pós-repasse) ainda não descontado — inclui o que
 * ficou adiado pra um ciclo futuro por não caber na capacidade do fornecedor naquele ciclo
 * (ver fix 2026-10-11 em repasse-semanal/route.ts). Só admin/owner.
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAdmin } from "@/lib/apiOrgAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { org_id } = await requireAdmin(req);

    const { data, error } = await supabaseAdmin.rpc("fn_org_debitos_fornecedor_pendentes_list", {
      p_org_id: org_id,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ items: data ?? [] });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    const status =
      msg === "Unauthorized" || msg === "Usuário sem organização." ? 401 : msg === "Sem permissão." ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
