/**
 * Notifica o seller quando o admin vincula um fornecedor do CD sem o seller ter pedido —
 * regra de produto: nunca fica oculto, o seller sempre sabe quando ganha acesso a um
 * fornecedor novo.
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function notifySellerVinculoFornecedorCd(params: {
  org_id: string;
  seller_id: string;
  fornecedor_id: string;
}): Promise<void> {
  const [{ data: sellerRow }, { data: fornecedorRow }] = await Promise.all([
    supabaseAdmin.from("sellers").select("user_id").eq("id", params.seller_id).maybeSingle(),
    supabaseAdmin.from("fornecedores").select("nome, opera_no_cd").eq("id", params.fornecedor_id).maybeSingle(),
  ]);

  const userId = sellerRow?.user_id ?? null;
  if (!userId) return;

  const fornecedorNome = fornecedorRow?.nome?.trim() || "um novo fornecedor";
  const sufixoCd = fornecedorRow?.opera_no_cd ? " (Centro de Distribuição)" : "";

  await supabaseAdmin.from("notifications").insert({
    user_id: userId,
    tipo: "fornecedor_cd_vinculado_admin",
    titulo: "Novo fornecedor vinculado",
    mensagem: `A DropCore vinculou ${fornecedorNome} ao seu catálogo${sufixoCd}.`,
    metadata: { fornecedor_id: params.fornecedor_id },
  });
}

/**
 * Notifica o seller quando o admin desvincula (ou exclui) um fornecedor do CD — mesma regra:
 * nunca fica oculto. Cobre tanto "Desvincular" no painel quanto o fornecedor sendo excluído
 * por completo em Empresas (nesse caso o catálogo dele some do seller).
 */
export async function notifySellerDesvinculoFornecedorCd(params: {
  seller_id: string;
  fornecedor_id: string;
  motivo?: "desvinculado" | "fornecedor_excluido";
}): Promise<void> {
  const [{ data: sellerRow }, { data: fornecedorRow }] = await Promise.all([
    supabaseAdmin.from("sellers").select("user_id").eq("id", params.seller_id).maybeSingle(),
    supabaseAdmin.from("fornecedores").select("nome, opera_no_cd").eq("id", params.fornecedor_id).maybeSingle(),
  ]);

  const userId = sellerRow?.user_id ?? null;
  if (!userId) return;

  const fornecedorNome = fornecedorRow?.nome?.trim() || "um fornecedor";
  const sufixoCd = fornecedorRow?.opera_no_cd ? " (Centro de Distribuição)" : "";
  const mensagem =
    params.motivo === "fornecedor_excluido"
      ? `A DropCore removeu ${fornecedorNome} do sistema — o catálogo dele não está mais disponível no seu painel.`
      : `A DropCore desvinculou ${fornecedorNome} do seu catálogo${sufixoCd}.`;

  await supabaseAdmin.from("notifications").insert({
    user_id: userId,
    tipo: "fornecedor_cd_desvinculado_admin",
    titulo: "Fornecedor desvinculado",
    mensagem,
    metadata: { fornecedor_id: params.fornecedor_id },
  });
}
