/**
 * Notifica o seller (painel + e-mail) quando um pedido do Mercado Livre chega sem SKU
 * cadastrado no anúncio (`anuncio_sem_sku`) — no aviso inicial e, se o prazo de despacho
 * do marketplace estiver perto (ver `anuncioSemSkuRetry.ts`), num segundo aviso urgente.
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { notifySellerPedidoAtencao } from "@/lib/notifySellerPedidoAtencao";
import { notifyUserEmail } from "@/lib/notifyEmail";

function formatarPrazoBrt(iso: string | null): string | null {
  if (!iso) return null;
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return null;
  const fmt = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${fmt.format(data)} (horário de Brasília)`;
}

export async function notifySellerAnuncioSemSku(params: {
  org_id: string;
  seller_id: string;
  pedido_id: string;
  nome_produto: string;
  sla_prazo_despacho: string | null;
  urgente: boolean;
}): Promise<void> {
  const prazoTexto = formatarPrazoBrt(params.sla_prazo_despacho);
  const tipo = params.urgente ? "anuncio_sem_sku_urgente" : "anuncio_sem_sku";

  const motivo = params.urgente
    ? `Urgente: o anúncio "${params.nome_produto}" ainda está sem o SKU do DropCore cadastrado${
        prazoTexto ? ` e o prazo de despacho é ${prazoTexto}` : ""
      }. Cadastre o SKU agora ou o fornecedor não vai conseguir despachar a tempo.`
    : `O anúncio "${params.nome_produto}" não tem nenhum SKU do DropCore cadastrado nessa variação${
        prazoTexto ? ` — prazo de despacho: ${prazoTexto}` : ""
      }. Cadastre o SKU certo no anúncio pra essa venda entrar automaticamente.`;

  await notifySellerPedidoAtencao({
    org_id: params.org_id,
    seller_id: params.seller_id,
    pedido_id: params.pedido_id,
    tipo,
    motivo,
  });

  const { data: sellerRow } = await supabaseAdmin
    .from("sellers")
    .select("user_id")
    .eq("id", params.seller_id)
    .maybeSingle();
  const userId = sellerRow?.user_id ?? null;
  if (!userId) return;

  await notifyUserEmail({
    userId,
    subject: params.urgente ? "Urgente: anúncio sem SKU — prazo de envio em risco" : "Ação necessária: anúncio sem SKU cadastrado",
    titulo: params.urgente ? "Urgente: anúncio sem SKU" : "Anúncio sem SKU cadastrado",
    mensagem: motivo,
    ctaUrl: "https://www.dropcore.com.br/seller/pedidos",
    ctaLabel: "Ver pedido",
  });
}
