/**
 * Notifica o fornecedor (portal DropCore) de novo pedido aguardando postagem.
 * Usado após venda via ERP/Olist do seller — valor exibido é só valor_fornecedor.
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function notifyFornecedorPedidoParaPostar(params: {
  org_id: string;
  fornecedor_id: string;
  pedido_id: string;
  valor_fornecedor: number;
  motivo?: "postar" | "estoque" | "bloqueado";
  motivo_bloqueio?: string | null;
}): Promise<void> {
  let memberUserId: string | null = null;

  const { data: member } = await supabaseAdmin
    .from("org_members")
    .select("user_id")
    .eq("org_id", params.org_id)
    .eq("fornecedor_id", params.fornecedor_id)
    .limit(1)
    .maybeSingle();

  memberUserId = member?.user_id ?? null;

  if (!memberUserId) {
    const { data: fallback } = await supabaseAdmin
      .from("org_members")
      .select("user_id")
      .eq("fornecedor_id", params.fornecedor_id)
      .limit(1)
      .maybeSingle();
    memberUserId = fallback?.user_id ?? null;
  }

  if (!memberUserId) return;

  const valorBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    params.valor_fornecedor,
  );

  const { tipo, titulo, mensagem } =
    params.motivo === "estoque"
      ? {
          tipo: "pedido_pendente_estoque",
          titulo: "Pedido aguardando estoque",
          mensagem: `Pedido de ${valorBRL} importado, mas o estoque no DropCore está zerado. Reposição necessária antes do envio.`,
        }
      : params.motivo === "bloqueado"
        ? {
            tipo: "pedido_bloqueado",
            titulo: "Pedido bloqueado",
            mensagem: params.motivo_bloqueio?.trim() || `Pedido de ${valorBRL} foi bloqueado e precisa de atenção.`,
          }
        : {
            tipo: "pedido_para_postar",
            titulo: "Novo pedido para postar",
            mensagem: `Você tem um novo pedido de ${valorBRL} aguardando envio.`,
          };

  await supabaseAdmin.from("notifications").insert({
    user_id: memberUserId,
    tipo,
    titulo,
    mensagem,
    metadata: { pedido_id: params.pedido_id },
  });
}
