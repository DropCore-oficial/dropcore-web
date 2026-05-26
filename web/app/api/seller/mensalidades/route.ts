/**
 * GET /api/seller/mensalidades
 * Lista mensalidades pendentes/inadimplentes do seller autenticado.
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isPortalTrialAtivo } from "@/lib/portalTrial";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const auth = req.headers.get("authorization") ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) {
      return NextResponse.json({ error: "Sem token de autenticação." }, { status: 401 });
    }

    const sbAnon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } }
    );
    const { data: userData, error: userErr } = await sbAnon.auth.getUser(token);
    if (userErr || !userData?.user) {
      return NextResponse.json({ error: "Token inválido ou expirado." }, { status: 401 });
    }

    const { data: seller } = await supabaseAdmin
      .from("sellers")
      .select("id, org_id, trial_valido_ate")
      .eq("user_id", userData.user.id)
      .maybeSingle();

    if (!seller) {
      return NextResponse.json({ error: "Seller não encontrado." }, { status: 404 });
    }

    const trialValidoAte = (seller as { trial_valido_ate?: string | null }).trial_valido_ate ?? null;
    const trialAtivo = isPortalTrialAtivo(trialValidoAte);

    const { data: rows } = await supabaseAdmin
      .from("financial_mensalidades")
      .select("id, ciclo, valor, status, vencimento_em, pago_em")
      .eq("org_id", seller.org_id)
      .eq("tipo", "seller")
      .eq("entidade_id", seller.id)
      .in("status", ["pendente", "inadimplente"])
      .order("ciclo", { ascending: false });

    const hoje = new Date().toISOString().slice(0, 10);
    const items = (rows ?? []).map((r) => ({
      id: r.id,
      ciclo: r.ciclo,
      valor: Number(r.valor),
      status: r.status,
      vencimento_em: r.vencimento_em,
      vencido: r.vencimento_em ? r.vencimento_em < hoje : false,
      pago_em: r.pago_em,
    }));

    return NextResponse.json({
      items,
      trial_valido_ate: trialValidoAte,
      trial_ativo: trialAtivo,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
