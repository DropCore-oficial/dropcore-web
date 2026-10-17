/**
 * GET /api/org/gestores-ia-avulso/assinantes — lista, pro admin, os assinantes da
 * Calculadora com o pacote Gestores de IA avulso ativo (`inclui_gestores_ia = true`).
 * Leitura 100% via RPC (`fn_calculadora_assinantes_gestores_ia_list`), nunca `.from()`
 * direto — regra 9 do CLAUDE.md pra tabela/rota nova.
 */
import { NextResponse } from "next/server";
import { orgErrorHttpStatus, requireAdmin } from "@/lib/apiOrgAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AssinanteRow = {
  id: string;
  user_id: string;
  nome: string | null;
  ativo: boolean;
  gestores_ia_ciclo: string | null;
  valido_ate: string;
  gestores_ia_contrato_aceite_em: string | null;
  created_at: string;
  total_count: number;
};

export async function GET(req: Request) {
  try {
    await requireAdmin(req);

    const { searchParams } = new URL(req.url);
    const limit = Math.min(Number(searchParams.get("limit") ?? 50) || 50, 200);
    const offset = Math.max(Number(searchParams.get("offset") ?? 0) || 0, 0);

    const { data, error } = await supabaseAdmin.rpc("fn_calculadora_assinantes_gestores_ia_list", {
      p_limit: limit,
      p_offset: offset,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = (data ?? []) as AssinanteRow[];
    const totalCount = rows[0]?.total_count ?? 0;

    const emailById = new Map<string, string | null>();
    await Promise.all(
      rows.map(async (a) => {
        const { data: userData } = await supabaseAdmin.auth.admin.getUserById(a.user_id);
        emailById.set(a.user_id, userData?.user?.email ?? null);
      })
    );

    const items = rows.map((a) => ({
      id: a.id,
      user_id: a.user_id,
      nome: a.nome,
      email: emailById.get(a.user_id) ?? null,
      ativo: a.ativo,
      gestores_ia_ciclo: a.gestores_ia_ciclo,
      valido_ate: a.valido_ate,
      gestores_ia_contrato_aceite_em: a.gestores_ia_contrato_aceite_em,
      created_at: a.created_at,
    }));

    return NextResponse.json({ items, total_count: totalCount, limit, offset });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: orgErrorHttpStatus(e) });
  }
}
