/**
 * Notifica o seller (painel + e-mail) quando o sync diário (mercadoLivreSkuSync.ts) acha
 * anúncio ativo no Mercado Livre sem nenhum SKU vinculado — causa raiz recorrente: pedido
 * desse anúncio vira placeholder "anuncio_sem_sku" (ver mercadoLivrePedidoIngest.ts), e os
 * Gestores de IA (Ulisses) não conseguem gerar candidato pra ele (ver gestorAdsDados.ts).
 * Detecta ANTES de qualquer pedido/rodada acontecer, não depois.
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { notifyUserEmail } from "@/lib/notifyEmail";
import type { ItemSemSku } from "@/lib/ai/mercadoLivreSkuSync";

const TIPO = "anuncios_sem_sku_catalogo";

/** Filtra só os itens que ainda não foram notificados antes (idempotente — evita alertar
 * todo dia o mesmo anúncio enquanto o seller não cadastrar o SKU). */
async function filtrarNaoNotificados(sellerId: string, itens: ItemSemSku[]): Promise<ItemSemSku[]> {
  if (itens.length === 0) return [];

  const { data: jaNotificados } = await supabaseAdmin
    .from("notifications")
    .select("metadata")
    .eq("tipo", TIPO)
    .contains("metadata", { seller_id: sellerId });

  const idsJaNotificados = new Set(
    (jaNotificados ?? [])
      .map((n) => (n.metadata as { ml_item_id?: string } | null)?.ml_item_id)
      .filter((v): v is string => !!v)
  );

  return itens.filter((it) => !idsJaNotificados.has(it.ml_item_id));
}

export async function notifySellerAnunciosSemSkuCatalogo(params: {
  sellerId: string;
  itens: ItemSemSku[];
}): Promise<void> {
  const novos = await filtrarNaoNotificados(params.sellerId, params.itens);
  if (novos.length === 0) return;

  const { data: sellerRow } = await supabaseAdmin
    .from("sellers")
    .select("user_id")
    .eq("id", params.sellerId)
    .maybeSingle();
  const userId = sellerRow?.user_id ?? null;
  if (!userId) return;

  const lista = novos.map((it) => `• ${it.titulo}${it.permalink ? ` (${it.permalink})` : ""}`).join("\n");
  const titulo = novos.length === 1 ? "Anúncio sem SKU vinculado" : `${novos.length} anúncios sem SKU vinculado`;
  const mensagem =
    novos.length === 1
      ? `O anúncio "${novos[0].titulo}" está ativo no Mercado Livre, mas não tem nenhum SKU do DropCore cadastrado. Isso pode fazer pedido desse produto ficar preso e impede os Gestores de IA de analisá-lo. Cadastre o SKU no campo SKU do anúncio.`
      : `Você tem ${novos.length} anúncios ativos no Mercado Livre sem SKU do DropCore cadastrado:\n\n${lista}\n\nIsso pode fazer pedido desses produtos ficar preso e impede os Gestores de IA de analisá-los. Cadastre o SKU no campo SKU de cada anúncio.`;

  // Uma notificação por item (não agrupada) — cada uma carrega seu próprio ml_item_id no
  // metadata, é o que o dedupe (filtrarNaoNotificados) usa pra não repetir por anúncio.
  await supabaseAdmin.from("notifications").insert(
    novos.map((it) => ({
      user_id: userId,
      tipo: TIPO,
      titulo: "Anúncio sem SKU vinculado",
      mensagem: `O anúncio "${it.titulo}" está ativo no Mercado Livre, mas não tem nenhum SKU do DropCore cadastrado. Isso pode fazer pedido desse produto ficar preso e impede os Gestores de IA de analisá-lo. Cadastre o SKU no campo SKU do anúncio.`,
      metadata: { seller_id: params.sellerId, ml_item_id: it.ml_item_id, permalink: it.permalink },
    }))
  );

  await notifyUserEmail({
    userId,
    subject: titulo,
    titulo,
    mensagem,
    ctaUrl: "https://www.dropcore.com.br/seller/integracoes-marketplace",
    ctaLabel: "Ver integração",
  });
}
