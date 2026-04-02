/**
 * GET /api/seller/mensalidades
 * Lista mensalidades pendentes/inadimplentes do seller autenticado.
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

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
      .select("id, org_id")
      .eq("user_id", userData.user.id)
      .maybeSingle();

    if (!seller) {
      return NextResponse.json({ error: "Seller não encontrado." }, { status: 404 });
    }

    const { data: rows } = await supabaseAdmin
      .from("financial_mensalidades")
      .select("id, ciclo, valor, status, vencimento_em, pago_em")
      .eq("org_id", seller.org_id)
      .eq("tipo", "seller")
      .eq("entidade_id", seller.id)
      .in("status", ["pendente", "inadimplente"])
      .order("ciclo", { ascending: false });

    const hoje = new Date().toISOString().slice(0, 10);
    const em3Dias = new Date();
    em3Dias.setDate(em3Dias.getDate() + 3);
    const em3DiasStr = em3Dias.toISOString().slice(0, 10);
    const items = (rows ?? []).map((r) => ({
      id: r.id,
      ciclo: r.ciclo,
      valor: Number(r.valor),
      status: r.status,
      vencimento_em: r.vencimento_em,
      vencido: r.vencimento_em ? r.vencimento_em < hoje : false,
      pago_em: r.pago_em,
    }));

    const temVencidas = items.some((i) => i.vencido);
    const vencendoEm3Dias = items.some((i) => i.vencimento_em && i.vencimento_em >= hoje && i.vencimento_em <= em3DiasStr);
    const desde = new Date();
    desde.setHours(desde.getHours() - 24);

    if (vencendoEm3Dias) {
      const { data: jaExisteVencendo } = await supabaseAdmin
        .from("notifications")
        .select("id")
        .eq("user_id", userData.user.id)
        .eq("tipo", "mensalidade_vencendo")
        .gte("criado_em", desde.toISOString())
        .limit(1)
        .maybeSingle();
      if (!jaExisteVencendo) {
        const m = items.find((i) => i.vencimento_em && i.vencimento_em >= hoje && i.vencimento_em <= em3DiasStr)!;
        const msg = `Sua mensalidade de ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(m.valor)} vence em ${new Date(m.vencimento_em! + "T12:00:00").toLocaleDateString("pt-BR", { day: "numeric", month: "short" })}. Pague agora para não ser bloqueado.`;
        await supabaseAdmin.from("notifications").insert({
          user_id: userData.user.id,
          tipo: "mensalidade_vencendo",
          titulo: "Mensalidade vencendo",
          mensagem: msg,
          metadata: {},
        });
      }
    }

    if (temVencidas) {
      const { data: jaExiste } = await supabaseAdmin
        .from("notifications")
        .select("id")
        .eq("user_id", userData.user.id)
        .eq("tipo", "mensalidade_vencida")
        .gte("criado_em", desde.toISOString())
        .limit(1)
        .maybeSingle();
      if (!jaExiste) {
        const qtd = items.filter((i) => i.vencido).length;
        const msg =
          qtd === 1
            ? `Sua mensalidade de ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(items.find((i) => i.vencido)!.valor)} está vencida. Regularize para não ter o acesso bloqueado.`
            : `${qtd} mensalidades estão vencidas. Regularize para não ter o acesso bloqueado.`;
        await supabaseAdmin.from("notifications").insert({
          user_id: userData.user.id,
          tipo: "mensalidade_vencida",
          titulo: "Mensalidade vencida",
          mensagem: msg,
          metadata: {},
        });
      }
    }

    return NextResponse.json({ items });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
