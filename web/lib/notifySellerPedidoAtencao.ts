/**
 * Notifica o seller (portal DropCore) quando um pedido importado da Olist precisa
 * de atenção — bloqueado por regra de negócio, ou aguardando reposição de estoque.
 * Sem isso, a venda real só aparece no log técnico de sync da Olist.
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function notifySellerPedidoAtencao(params: {
  org_id: string;
  seller_id: string;
  pedido_id: string;
  tipo: "pedido_bloqueado" | "pedido_pendente_estoque";
  motivo: string;
}): Promise<void> {
  const { data: sellerRow } = await supabaseAdmin
    .from("sellers")
    .select("user_id")
    .eq("id", params.seller_id)
    .maybeSingle();

  const userId = sellerRow?.user_id ?? null;
  if (!userId) return;

  const titulo = params.tipo === "pedido_bloqueado" ? "Pedido bloqueado" : "Pedido aguardando estoque";

  await supabaseAdmin.from("notifications").insert({
    user_id: userId,
    tipo: params.tipo,
    titulo,
    mensagem: params.motivo,
    metadata: { pedido_id: params.pedido_id },
  });
}
