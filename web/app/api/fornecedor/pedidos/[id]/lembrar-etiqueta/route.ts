/**
 * POST /api/fornecedor/pedidos/[id]/lembrar-etiqueta
 *
 * O fornecedor não tem acesso à Olist (quem tem é o seller) — quando o pedido está sem
 * etiqueta, a única ação que o fornecedor pode tomar é cutucar o seller pra ele ir buscar
 * o link manualmente. Compartilha o mesmo cooldown (`etiqueta_alerta_enviado_em`) do
 * lembrete automático em web/lib/etiquetaOlistRetry.ts, pra não virar spam.
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { addPedidoEvento } from "@/lib/erp/submitSellerErpPedido";
import { notifySellerPedidoAtencao } from "@/lib/notifySellerPedidoAtencao";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COOLDOWN_MINUTOS = 30;

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

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getFornecedorFromToken(req);
    if (!ctx) {
      return NextResponse.json({ error: "Não autenticado como fornecedor." }, { status: 401 });
    }

    const { id: pedido_id } = await params;
    if (!pedido_id) return NextResponse.json({ error: "ID do pedido é obrigatório." }, { status: 400 });

    const { data: pedido, error: pedidoErr } = await supabaseAdmin
      .from("pedidos")
      .select("id, org_id, seller_id, status, etiqueta_pdf_url, etiqueta_pdf_base64, etiqueta_tentativas, etiqueta_alerta_enviado_em")
      .eq("org_id", ctx.org_id)
      .eq("fornecedor_id", ctx.fornecedor_id)
      .eq("id", pedido_id)
      .maybeSingle();

    if (pedidoErr) return NextResponse.json({ error: pedidoErr.message }, { status: 500 });
    if (!pedido) return NextResponse.json({ error: "Pedido não encontrado." }, { status: 404 });

    if (pedido.etiqueta_pdf_url || pedido.etiqueta_pdf_base64) {
      return NextResponse.json({ error: "Este pedido já tem etiqueta." }, { status: 409 });
    }
    if (pedido.status !== "enviado") {
      return NextResponse.json({ error: "Pedido não está aguardando postagem." }, { status: 409 });
    }

    const ultimoAlertaMs = pedido.etiqueta_alerta_enviado_em ? new Date(pedido.etiqueta_alerta_enviado_em).getTime() : null;
    if (ultimoAlertaMs && Date.now() - ultimoAlertaMs < COOLDOWN_MINUTOS * 60_000) {
      return NextResponse.json(
        { error: `O seller já foi avisado há pouco tempo. Espere alguns minutos antes de lembrar de novo.` },
        { status: 429 }
      );
    }

    const agora = new Date().toISOString();
    await supabaseAdmin.from("pedidos").update({ etiqueta_alerta_enviado_em: agora }).eq("id", pedido_id);

    await notifySellerPedidoAtencao({
      org_id: ctx.org_id,
      seller_id: pedido.seller_id,
      pedido_id,
      tipo: "etiqueta_pendente_manual",
      motivo: "O fornecedor está esperando a etiqueta desse pedido pra conseguir postar. Cole o link da etiqueta em Pedidos.",
    });

    await addPedidoEvento({
      org_id: ctx.org_id,
      pedido_id,
      tipo: "etiqueta_lembrete_fornecedor",
      origem: "manual",
      actor_tipo: "fornecedor",
      descricao: "Fornecedor pediu pra lembrar o seller de buscar a etiqueta.",
    });

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
