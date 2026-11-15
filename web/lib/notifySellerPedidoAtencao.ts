/**
 * Notifica o seller (portal DropCore) sobre eventos de um pedido importado: novo
 * pedido recebido, bloqueado por regra de negócio, aguardando reposição de estoque,
 * ou barrado por saldo insuficiente. Sem isso, o seller só descobre entrando na
 * tela de Pedidos e vendo o badge.
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { notifyUserEmail } from "@/lib/notifyEmail";

/** Tipos que, além do sino, também mandam e-mail — achado real 2026-11-11: fornecedor
 * contestar devolução é caso raro e financeiro, o seller precisa saber mesmo sem abrir o
 * painel. Os demais tipos continuam só sino, igual sempre foi. */
const TIPOS_TAMBEM_EMAIL = new Set(["devolucao_contestada_fornecedor_seller", "devolucao_nao_procede_seller"]);

const TITULOS = {
  pedido_novo: "Novo pedido recebido",
  pedido_bloqueado: "Pedido bloqueado",
  pedido_pendente_estoque: "Pedido aguardando estoque",
  erro_saldo: "Erro de saldo",
  erro_saldo_expirado: "Pedido cancelado por saldo",
  pedido_sem_estoque_expirado: "Pedido cancelado por falta de estoque",
  etiqueta_pendente_manual: "Etiqueta não chegou automaticamente",
  pedido_cancelado_ml: "Pedido cancelado pelo Mercado Livre",
  pedido_cancelado_erp: "Pedido cancelado",
  produto_nao_vinculado: "Produto fora do catálogo do fornecedor",
  anuncio_sem_sku: "Anúncio sem SKU vinculado",
  anuncio_sem_sku_urgente: "Urgente: anúncio sem SKU perto do prazo",
  devolucao_ml_provavel_seller: "Possível devolução no Mercado Livre",
  devolucao_liberada_automatico_seller: "Devolução liberada automaticamente",
  devolucao_confirmada_fornecedor_seller: "Devolução confirmada pelo fornecedor",
  devolucao_contestada_fornecedor_seller: "Fornecedor contestou sua devolução",
  devolucao_nao_procede_seller: "Devolução não procede — venda mantida",
} as const;

export async function notifySellerPedidoAtencao(params: {
  org_id: string;
  seller_id: string;
  // Nulo quando a reclamação do ML não casou com nenhum pedido interno (ex: integração ERP
  // quebrada, pedido nunca sincronizado) — mesmo assim o seller precisa ser avisado.
  pedido_id: string | null;
  tipo:
    | "pedido_novo"
    | "pedido_bloqueado"
    | "pedido_pendente_estoque"
    | "erro_saldo"
    | "erro_saldo_expirado"
    | "pedido_sem_estoque_expirado"
    | "etiqueta_pendente_manual"
    | "pedido_cancelado_ml"
    | "pedido_cancelado_erp"
    | "produto_nao_vinculado"
    | "anuncio_sem_sku"
    | "anuncio_sem_sku_urgente"
    | "devolucao_ml_provavel_seller"
    | "devolucao_liberada_automatico_seller"
    | "devolucao_confirmada_fornecedor_seller"
    | "devolucao_contestada_fornecedor_seller"
    | "devolucao_nao_procede_seller";
  motivo: string;
}): Promise<void> {
  const { data: sellerRow } = await supabaseAdmin
    .from("sellers")
    .select("user_id")
    .eq("id", params.seller_id)
    .maybeSingle();

  const userId = sellerRow?.user_id ?? null;
  if (!userId) return;

  const titulo = TITULOS[params.tipo];

  await supabaseAdmin.from("notifications").insert({
    user_id: userId,
    tipo: params.tipo,
    titulo,
    mensagem: params.motivo,
    metadata: { pedido_id: params.pedido_id },
  });

  if (TIPOS_TAMBEM_EMAIL.has(params.tipo)) {
    await notifyUserEmail({
      userId,
      subject: titulo,
      titulo,
      mensagem: params.motivo,
      ctaUrl: "https://www.dropcore.com.br/seller/pedidos",
      ctaLabel: "Ver pedido",
    });
  }
}
