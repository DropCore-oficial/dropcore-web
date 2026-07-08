/**
 * Notifica o seller (portal DropCore) que um pedido foi bloqueado por regra de
 * negócio (cor não habilitada no plano, inadimplência, despacho misto, valor
 * inválido) — sem isso, a venda real só aparece no log técnico de sync da Olist.
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function notifySellerPedidoBloqueado(params: {
  org_id: string;
  seller_id: string;
  pedido_id: string;
  motivo: string;
}): Promise<void> {
  const { data: sellerRow } = await supabaseAdmin
    .from("sellers")
    .select("user_id")
    .eq("id", params.seller_id)
    .maybeSingle();

  const userId = sellerRow?.user_id ?? null;
  if (!userId) return;

  await supabaseAdmin.from("notifications").insert({
    user_id: userId,
    tipo: "pedido_bloqueado",
    titulo: "Pedido bloqueado",
    mensagem: params.motivo,
    metadata: { pedido_id: params.pedido_id },
  });
}
