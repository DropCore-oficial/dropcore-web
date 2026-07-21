/**
 * PATCH /api/fornecedor/pedidos/[id]/marcar-postado
 * Fornecedor marca o pedido como postado (enviado → aguardando_repasse).
 * Mesma lógica do admin entregar, mas com autenticação de fornecedor.
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { promoverPedidoParaPostado, repararExtratoBloqueado } from "@/lib/pedidoPostadoPromote";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
      .select("id, status, ledger_id, org_id, fornecedor_id, etiqueta_pdf_url, etiqueta_pdf_base64")
      .eq("id", pedido_id)
      .eq("org_id", ctx.org_id)
      .eq("fornecedor_id", ctx.fornecedor_id)
      .maybeSingle();

    if (pedidoErr) return NextResponse.json({ error: pedidoErr.message }, { status: 500 });
    if (!pedido) return NextResponse.json({ error: "Pedido não encontrado." }, { status: 404 });

    /* Legado: pedido já postado mas financial_ledger ficou BLOQUEADO (sem ledger_id no pedido). Repara extrato do seller. */
    if (pedido.status === "aguardando_repasse") {
      const reparo = await repararExtratoBloqueado({
        org_id: ctx.org_id,
        pedido_id,
        ledger_id: pedido.ledger_id,
      });
      if (reparo.reparado) {
        return NextResponse.json({
          ok: true,
          pedido_id,
          status: "aguardando_repasse",
          extrato_sincronizado: true,
        });
      }
      return NextResponse.json({ error: "Pedido já marcado como postado." }, { status: 409 });
    }

    if (pedido.status !== "enviado") {
      return NextResponse.json(
        { error: `Não é possível marcar como postado um pedido com status "${pedido.status}".` },
        { status: 422 }
      );
    }

    if (!pedido.etiqueta_pdf_url && !pedido.etiqueta_pdf_base64) {
      return NextResponse.json(
        { error: "Sem a etiqueta real não dá pra marcar como postado — peça pro seller buscar o link primeiro." },
        { status: 422 }
      );
    }

    const { data: member } = await supabaseAdmin
      .from("org_members")
      .select("user_id")
      .eq("org_id", ctx.org_id)
      .eq("fornecedor_id", ctx.fornecedor_id)
      .limit(1)
      .maybeSingle();

    const promote = await promoverPedidoParaPostado({
      org_id: ctx.org_id,
      pedido_id,
      ledger_id: pedido.ledger_id,
      evento: {
        tipo: "pedido_postado_manual",
        origem: "manual",
        actor_id: member?.user_id ?? null,
        actor_tipo: "fornecedor",
        descricao: "Fornecedor marcou o pedido como postado manualmente.",
        metadata: { via: "fornecedor/pedidos" },
      },
    });

    if (!promote.ok) return NextResponse.json({ error: promote.error }, { status: 500 });

    return NextResponse.json({
      ok: true,
      pedido_id,
      status: "aguardando_repasse",
      ciclo_repasse: promote.ciclo_repasse,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
