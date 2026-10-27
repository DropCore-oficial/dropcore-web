/**
 * POST /api/gestores-ia-avulso/planos/contrato-anual
 * Inicia o contrato anual do pacote "Gestores de IA" — sem PIX: libera o pacote na hora com
 * 60 dias de carência antes da 1ª parcela (R$797,90/mês, pagas via
 * /api/gestores-ia-avulso/planos a partir daí). O front só chama isto depois do assinante
 * marcar o checkbox de aceite do compromisso de 12 parcelas.
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const auth = req.headers.get("authorization") ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) {
      return NextResponse.json({ error: "Sem token de autenticação." }, { status: 401 });
    }

    const sbAnon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } },
    );
    const { data: userData, error: userErr } = await sbAnon.auth.getUser(token);
    if (userErr || !userData?.user) {
      return NextResponse.json({ error: "Token inválido ou expirado." }, { status: 401 });
    }

    const { data: carenciaAte, error } = await supabaseAdmin.rpc(
      "fn_gestores_ia_avulso_contrato_anual_iniciar",
      { p_user_id: userData.user.id },
    );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, valido_ate: carenciaAte });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
