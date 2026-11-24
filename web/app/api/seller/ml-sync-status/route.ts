/**
 * GET /api/seller/ml-sync-status — diz pro próprio seller se a conexão dele com o Mercado
 * Livre está com falha recorrente agora (pendente ou esgotada nas últimas 48h). Alimenta o
 * banner fixo insistente no painel — achado real 2026-11-24: seller só ficava sabendo que o
 * estoque não estava sincronizando quando um cliente comprava algo que não existia mais.
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function resolveSeller(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return null;
  const sbAnon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );
  const { data: userData, error: userErr } = await sbAnon.auth.getUser(token);
  if (userErr || !userData?.user) return null;
  const { data: seller } = await supabaseAdmin.from("sellers").select("id").eq("user_id", userData.user.id).maybeSingle();
  return seller ?? null;
}

export async function GET(req: Request) {
  const seller = await resolveSeller(req);
  if (!seller) return NextResponse.json({ error: "Seller não encontrado." }, { status: 404 });

  const { data, error } = await supabaseAdmin.rpc("fn_ml_sync_falha_resumo_seller", { p_seller_id: seller.id });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const row = (data as { qtd_pendente: number; qtd_esgotado: number; ultimo_erro: string | null }[] | null)?.[0];
  const total = (row?.qtd_pendente ?? 0) + (row?.qtd_esgotado ?? 0);

  return NextResponse.json({
    ok: true,
    falha_ativa: total >= 5,
    ultimo_erro: row?.ultimo_erro ?? null,
  });
}
