/**
 * GET /api/notifications
 * Lista notificações do usuário. ?mark_read=1 marca como lidas.
 * Requer Bearer token (Supabase Auth).
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { syncMensalidadeNotifications } from "@/lib/syncMensalidadeNotifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const auth = req.headers.get("authorization") ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const sbAnon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } }
    );
    const { data: userData, error: userErr } = await sbAnon.auth.getUser(token);
    if (userErr || !userData?.user) {
      return NextResponse.json({ error: "Token inválido" }, { status: 401 });
    }
    const userId = userData.user.id;

    await syncMensalidadeNotifications(userId);

    const { searchParams } = new URL(req.url);
    const markRead = searchParams.get("mark_read") === "1";

    const { data: rows } = await supabaseAdmin
      .from("notifications")
      .select("id, tipo, titulo, mensagem, metadata, lido, criado_em")
      .eq("user_id", userId)
      .order("criado_em", { ascending: false })
      .limit(50);

    let items = rows ?? [];

    // Fornecedor: garantir que pedido_para_postar mostre valor_fornecedor (nunca valor_total/taxa DropCore)
    const pedidoParaPostar = items.filter((n) => n.tipo === "pedido_para_postar" && (n.metadata as { pedido_id?: string })?.pedido_id);
    if (pedidoParaPostar.length > 0) {
      const pedidoIds = [...new Set(pedidoParaPostar.map((n) => (n.metadata as { pedido_id?: string })?.pedido_id).filter(Boolean))] as string[];
      const { data: pedidos } = await supabaseAdmin
        .from("pedidos")
        .select("id, valor_fornecedor")
        .in("id", pedidoIds);
      const vfMap = new Map((pedidos ?? []).map((p) => [p.id, Number(p.valor_fornecedor ?? 0)]));
      const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
      items = items.map((n) => {
        if (n.tipo === "pedido_para_postar") {
          const pid = (n.metadata as { pedido_id?: string })?.pedido_id;
          const vf = pid ? vfMap.get(pid) : null;
          if (vf != null) {
            return { ...n, mensagem: `Você tem um novo pedido de ${BRL.format(vf)} aguardando envio.` };
          }
        }
        return n;
      });
    }
    if (markRead && items.some((n) => !n.lido)) {
      const ids = items.filter((n) => !n.lido).map((n) => n.id);
      await supabaseAdmin.from("notifications").update({ lido: true }).in("id", ids).eq("user_id", userId);
    }

    return NextResponse.json({ items });
  } catch (e: unknown) {
    return NextResponse.json({ error: "Erro" }, { status: 500 });
  }
}
