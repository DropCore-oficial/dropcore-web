/**
 * GET /api/org/calculadora/recebimentos
 * Histórico de PIX de renovação da calculadora (receita) para admin org.
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { orgErrorHttpStatus, requireAdmin } from "@/lib/apiOrgAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function supabaseService() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Faltou SUPABASE env.");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET(req: Request) {
  try {
    await requireAdmin(req);
    const supabase = supabaseService();

    const { searchParams } = new URL(req.url);
    const limitRaw = searchParams.get("limit");
    const limit = Math.min(500, Math.max(1, parseInt(limitRaw ?? "100", 10) || 100));

    const { data: rows, error } = await supabase
      .from("calculadora_recebimentos")
      .select("id, user_id, mp_payment_id, valor, external_reference, pago_em, criado_em")
      .order("pago_em", { ascending: false })
      .limit(limit);

    if (error) {
      if (error.code === "42P01" || /does not exist/i.test(error.message ?? "")) {
        return NextResponse.json({
          error:
            "Tabela calculadora_recebimentos não existe. Execute web/scripts/create-calculadora-recebimentos.sql no Supabase.",
          items: [],
          total_registros: 0,
          soma_valores: 0,
          soma_total_geral: 0,
        });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const { data: todasLinhasValor } = await supabase.from("calculadora_recebimentos").select("valor");
    const soma_total_geral = (todasLinhasValor ?? []).reduce(
      (acc, r) => acc + (Number.isFinite(Number(r.valor)) ? Number(r.valor) : 0),
      0,
    );

    const list = rows ?? [];
    const userIds = Array.from(new Set(list.map((r) => r.user_id)));

    const { data: usersData, error: usersErr } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });

    const emailById = new Map<string, string | null>();
    if (!usersErr && usersData?.users) {
      usersData.users.forEach((u) => {
        if (userIds.includes(u.id)) emailById.set(u.id, u.email ?? null);
      });
    }

    const items = list.map((r) => ({
      id: r.id,
      user_id: r.user_id,
      email: emailById.get(r.user_id) ?? null,
      mp_payment_id: r.mp_payment_id,
      valor: Number(r.valor ?? 0),
      external_reference: r.external_reference,
      pago_em: r.pago_em,
    }));

    const soma_valores = items.reduce((acc, x) => acc + (Number.isFinite(x.valor) ? x.valor : 0), 0);

    return NextResponse.json({
      items,
      total_registros: items.length,
      soma_valores,
      soma_total_geral,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: orgErrorHttpStatus(e) });
  }
}
