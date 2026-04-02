/**
 * PATCH /api/fornecedor/pedidos/[id]/marcar-postado
 * Fornecedor marca o pedido como postado (enviado → aguardando_repasse).
 * Mesma lógica do admin entregar, mas com autenticação de fornecedor.
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { resolveLedgerIdForPedido } from "@/lib/resolveLedgerForPedido";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function proximaSegunda(): string {
  const d = new Date();
  const dia = d.getDay();
  const diff = dia === 1 ? 7 : (8 - dia) % 7 || 7;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

async function getFornecedorFromToken(req: Request): Promise<{ fornecedor_id: string; org_id: string } | null> {
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

  const { data: member } = await supabaseAdmin
    .from("org_members")
    .select("org_id, fornecedor_id")
    .eq("user_id", userData.user.id)
    .not("fornecedor_id", "is", null)
    .limit(1)
    .maybeSingle();

  if (!member?.fornecedor_id) return null;
  return { fornecedor_id: member.fornecedor_id, org_id: member.org_id };
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getFornecedorFromToken(req);
    if (!ctx) {
      return NextResponse.json({ error: "Não autenticado como fornecedor." }, { status: 401 });
    }

    const { id: pedido_id } = await params;
    if (!pedido_id) {
      return NextResponse.json({ error: "ID do pedido é obrigatório." }, { status: 400 });
    }

    const { data: pedido, error: pedidoErr } = await supabaseAdmin
      .from("pedidos")
      .select("id, status, ledger_id, org_id, fornecedor_id")
      .eq("id", pedido_id)
      .eq("org_id", ctx.org_id)
      .eq("fornecedor_id", ctx.fornecedor_id)
      .maybeSingle();

    if (pedidoErr) return NextResponse.json({ error: pedidoErr.message }, { status: 500 });
    if (!pedido) return NextResponse.json({ error: "Pedido não encontrado." }, { status: 404 });

    /* Legado: pedido já postado mas financial_ledger ficou BLOQUEADO (sem ledger_id no pedido). Repara extrato do seller. */
    if (pedido.status === "aguardando_repasse") {
      const nowRepair = new Date().toISOString();
      const ledgerIdRepair = await resolveLedgerIdForPedido(ctx.org_id, pedido_id, pedido.ledger_id);
      if (ledgerIdRepair && !pedido.ledger_id) {
        await supabaseAdmin.from("pedidos").update({ ledger_id: ledgerIdRepair, atualizado_em: nowRepair }).eq("id", pedido_id);
      }
      if (ledgerIdRepair) {
        const { data: led } = await supabaseAdmin
          .from("financial_ledger")
          .select("status, ciclo_repasse")
          .eq("id", ledgerIdRepair)
          .maybeSingle();
        if (led?.status === "BLOQUEADO") {
          let ciclo = led.ciclo_repasse ?? null;
          if (!ciclo) ciclo = proximaSegunda();
          await supabaseAdmin
            .from("financial_ledger")
            .update({ status: "AGUARDANDO_REPASSE", ciclo_repasse: ciclo, atualizado_em: nowRepair })
            .eq("id", ledgerIdRepair);
          return NextResponse.json({
            ok: true,
            pedido_id,
            status: "aguardando_repasse",
            extrato_sincronizado: true,
          });
        }
      }
      return NextResponse.json({ error: "Pedido já marcado como postado." }, { status: 409 });
    }

    if (pedido.status !== "enviado") {
      return NextResponse.json(
        { error: `Não é possível marcar como postado um pedido com status "${pedido.status}".` },
        { status: 422 }
      );
    }

    const now = new Date().toISOString();
    const { error: upPedido } = await supabaseAdmin
      .from("pedidos")
      .update({ status: "aguardando_repasse", atualizado_em: now })
      .eq("id", pedido_id)
      .eq("org_id", ctx.org_id);

    if (upPedido) return NextResponse.json({ error: upPedido.message }, { status: 500 });

    const ledgerId = await resolveLedgerIdForPedido(ctx.org_id, pedido_id, pedido.ledger_id);

    if (ledgerId && !pedido.ledger_id) {
      await supabaseAdmin.from("pedidos").update({ ledger_id: ledgerId, atualizado_em: now }).eq("id", pedido_id);
    }

    let ciclo_repasse: string | null = null;
    if (ledgerId) {
      const { data: ledger } = await supabaseAdmin
        .from("financial_ledger")
        .select("id, ciclo_repasse")
        .eq("id", ledgerId)
        .maybeSingle();

      ciclo_repasse = ledger?.ciclo_repasse ?? null;
      if (!ciclo_repasse) ciclo_repasse = proximaSegunda();

      const { error: upLedgerErr } = await supabaseAdmin
        .from("financial_ledger")
        .update({ status: "AGUARDANDO_REPASSE", ciclo_repasse, atualizado_em: now })
        .eq("id", ledgerId);

      if (upLedgerErr) {
        console.error("[marcar-postado] ledger update:", upLedgerErr.message);
        return NextResponse.json({ error: "Erro ao atualizar extrato do seller: " + upLedgerErr.message }, { status: 500 });
      }
    }

    const { data: member } = await supabaseAdmin
      .from("org_members")
      .select("user_id")
      .eq("org_id", ctx.org_id)
      .eq("fornecedor_id", ctx.fornecedor_id)
      .limit(1)
      .maybeSingle();
    await supabaseAdmin.from("pedido_eventos").insert({
      org_id: ctx.org_id,
      pedido_id,
      tipo: "pedido_postado_manual",
      origem: "manual",
      actor_id: member?.user_id ?? null,
      actor_tipo: "fornecedor",
      descricao: "Fornecedor marcou o pedido como postado manualmente.",
      metadata: { via: "fornecedor/pedidos" },
    });

    return NextResponse.json({
      ok: true,
      pedido_id,
      status: "aguardando_repasse",
      ciclo_repasse,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
