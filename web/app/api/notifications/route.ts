/**
 * GET /api/notifications
 * Lista notificações do usuário. ?mark_read=1 marca como lidas.
 * Requer Bearer token (Supabase Auth).
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  filterNotificationsForContext,
  type NotificationPortalContext,
} from "@/lib/notificationContextFilter";
function parseNotificationContext(raw: string | null): NotificationPortalContext | null {
  if (raw === "admin" || raw === "seller" || raw === "fornecedor") return raw;
  return null;
}

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

    const { searchParams } = new URL(req.url);
    const markRead = searchParams.get("mark_read") === "1";
    const portalContext = parseNotificationContext(searchParams.get("context"));

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
    // Auto-resolve: pedido_bloqueado/pendente_estoque/erro_saldo cujo pedido já saiu
    // desse status (ex: liberado pelo retry, postado, cancelado) não precisam mais
    // aparecer como alerta ativo — marca como lida sem o seller precisar abrir.
    const TIPO_STATUS_ATIVO: Record<string, string> = {
      pedido_bloqueado: "bloqueado",
      pedido_pendente_estoque: "pendente_estoque",
      erro_saldo: "erro_saldo",
    };
    const alertasDePedido = items.filter(
      (n) => !n.lido && TIPO_STATUS_ATIVO[n.tipo ?? ""] && (n.metadata as { pedido_id?: string } | null)?.pedido_id
    );
    if (alertasDePedido.length > 0) {
      const pedidoIds = [
        ...new Set(alertasDePedido.map((n) => (n.metadata as { pedido_id?: string }).pedido_id).filter(Boolean)),
      ] as string[];
      const { data: pedidosAtuais } = await supabaseAdmin.from("pedidos").select("id, status").in("id", pedidoIds);
      const statusPorPedido = new Map((pedidosAtuais ?? []).map((p) => [p.id, p.status]));
      const idsParaResolver = alertasDePedido
        .filter((n) => {
          const pid = (n.metadata as { pedido_id?: string }).pedido_id!;
          const statusAtual = statusPorPedido.get(pid);
          return statusAtual != null && statusAtual !== TIPO_STATUS_ATIVO[n.tipo ?? ""];
        })
        .map((n) => n.id);
      if (idsParaResolver.length > 0) {
        await supabaseAdmin.from("notifications").update({ lido: true }).in("id", idsParaResolver);
        items = items.map((n) => (idsParaResolver.includes(n.id) ? { ...n, lido: true } : n));
      }
    }

    if (portalContext) {
      items = filterNotificationsForContext(items, portalContext);
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
