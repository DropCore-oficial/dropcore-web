/**
 * Cria notificação de estoque baixo para o fornecedor e sellers conectados.
 * Usado quando estoque_atual < estoque_minimo (ao editar produto ou ao debitar via pedido).
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type ProdutoAbaixo = { sku: string; nome?: string };

export async function notifyEstoqueBaixo(params: {
  org_id: string;
  fornecedor_id: string;
  produtos: ProdutoAbaixo[];
}): Promise<void> {
  const { org_id, fornecedor_id, produtos } = params;
  if (produtos.length === 0) return;

  const qtd = produtos.length;
  const titulo = qtd === 1 ? "Estoque abaixo do mínimo" : `${qtd} produtos com estoque abaixo do mínimo`;
  const mensagemForn =
    qtd === 1
      ? `${produtos[0].nome ?? produtos[0].sku} está com estoque abaixo do mínimo. Reponha para evitar rupturas.`
      : `${qtd} produtos estão com estoque abaixo do mínimo. Verifique e reponha.`;
  const mensagemSeller =
    qtd === 1
      ? `${produtos[0].nome ?? produtos[0].sku} está com estoque abaixo do mínimo no catálogo.`
      : `${qtd} produtos do seu catálogo estão com estoque abaixo do mínimo.`;

  const toInsert: { user_id: string; titulo: string; mensagem: string }[] = [];

  // Fornecedor
  const { data: fornMember } = await supabaseAdmin
    .from("org_members")
    .select("user_id")
    .eq("org_id", org_id)
    .eq("fornecedor_id", fornecedor_id)
    .limit(1)
    .maybeSingle();
  if (fornMember?.user_id) {
    toInsert.push({ user_id: fornMember.user_id, titulo, mensagem: mensagemForn });
  }

  // Sellers conectados a este fornecedor
  const { data: sellers } = await supabaseAdmin
    .from("sellers")
    .select("id")
    .eq("org_id", org_id)
    .eq("fornecedor_id", fornecedor_id);
  if (sellers?.length) {
    const sellerIds = sellers.map((s) => s.id);
    const { data: sellerMembers } = await supabaseAdmin
      .from("org_members")
      .select("user_id")
      .eq("org_id", org_id)
      .in("seller_id", sellerIds);
    const seen = new Set<string>();
    for (const m of sellerMembers ?? []) {
      if (m.user_id && !seen.has(m.user_id) && m.user_id !== fornMember?.user_id) {
        seen.add(m.user_id);
        toInsert.push({ user_id: m.user_id, titulo, mensagem: mensagemSeller });
      }
    }
  }

  if (toInsert.length === 0) return;

  await supabaseAdmin.from("notifications").insert(
    toInsert.map((r) => ({
      user_id: r.user_id,
      tipo: "estoque_baixo",
      titulo: r.titulo,
      mensagem: r.mensagem,
      metadata: {},
    }))
  );
}
