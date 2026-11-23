/**
 * Notifica o seller quando um fornecedor é vinculado/desvinculado do catálogo dele — tanto
 * quando o próprio seller faz (self-service) quanto quando é o admin fazendo em nome dele.
 * Regra de produto: nunca fica oculto, e sempre deixa claro se isso vai cobrar algo (e
 * quanto, a partir de quando) ou se está isento — nunca o seller só descobre quando a
 * mensalidade chega maior.
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { notifyUserEmail } from "@/lib/notifyEmail";
import { resolverCobrancaVinculoCd, mensagemCobrancaVinculo } from "@/lib/cdFornecedorExtraAddonPrecos";

async function userIdDoSeller(sellerId: string): Promise<string | null> {
  const { data } = await supabaseAdmin.from("sellers").select("user_id").eq("id", sellerId).maybeSingle();
  return data?.user_id ?? null;
}

export async function notifySellerVinculoFornecedorCd(params: {
  org_id: string;
  seller_id: string;
  fornecedor_id: string;
}): Promise<void> {
  const [userId, { data: fornecedorRow }, cobranca] = await Promise.all([
    userIdDoSeller(params.seller_id),
    supabaseAdmin.from("fornecedores").select("nome, opera_no_cd").eq("id", params.fornecedor_id).maybeSingle(),
    resolverCobrancaVinculoCd({ seller_id: params.seller_id, org_id: params.org_id, fornecedor_id: params.fornecedor_id }),
  ]);
  if (!userId) return;

  const fornecedorNome = fornecedorRow?.nome?.trim() || "um novo fornecedor";
  const sufixoCd = fornecedorRow?.opera_no_cd ? " (Centro de Distribuição)" : "";
  const titulo = "Novo fornecedor vinculado";
  const mensagem = `A DropCore vinculou ${fornecedorNome} ao seu catálogo${sufixoCd}.${mensagemCobrancaVinculo(cobranca)}`;

  await supabaseAdmin.from("notifications").insert({
    user_id: userId,
    tipo: "fornecedor_cd_vinculado_admin",
    titulo,
    mensagem,
    metadata: { fornecedor_id: params.fornecedor_id },
  });

  await notifyUserEmail({
    userId,
    subject: titulo,
    titulo,
    mensagem,
    ctaUrl: "https://www.dropcore.com.br/seller/plano",
    ctaLabel: "Ver meu plano",
  });
}

/** Mesmo aviso, mas pro caso do próprio seller se vinculando sozinho (não o admin). */
export async function notifySellerVinculoFornecedorProprio(params: {
  org_id: string;
  seller_id: string;
  fornecedor_id: string;
}): Promise<void> {
  const [userId, { data: fornecedorRow }, cobranca] = await Promise.all([
    userIdDoSeller(params.seller_id),
    supabaseAdmin.from("fornecedores").select("nome, opera_no_cd").eq("id", params.fornecedor_id).maybeSingle(),
    resolverCobrancaVinculoCd({ seller_id: params.seller_id, org_id: params.org_id, fornecedor_id: params.fornecedor_id }),
  ]);
  if (!userId) return;

  const fornecedorNome = fornecedorRow?.nome?.trim() || "um novo fornecedor";
  const sufixoCd = fornecedorRow?.opera_no_cd ? " (Centro de Distribuição)" : "";
  const titulo = "Fornecedor vinculado";
  const mensagem = `Você vinculou ${fornecedorNome} ao seu catálogo${sufixoCd}.${mensagemCobrancaVinculo(cobranca)}`;

  await supabaseAdmin.from("notifications").insert({
    user_id: userId,
    tipo: "fornecedor_cd_vinculado_admin",
    titulo,
    mensagem,
    metadata: { fornecedor_id: params.fornecedor_id },
  });

  await notifyUserEmail({
    userId,
    subject: titulo,
    titulo,
    mensagem,
    ctaUrl: "https://www.dropcore.com.br/seller/plano",
    ctaLabel: "Ver meu plano",
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
  const [userId, { data: fornecedorRow }] = await Promise.all([
    userIdDoSeller(params.seller_id),
    supabaseAdmin.from("fornecedores").select("nome, opera_no_cd").eq("id", params.fornecedor_id).maybeSingle(),
  ]);
  if (!userId) return;

  const fornecedorNome = fornecedorRow?.nome?.trim() || "um fornecedor";
  const sufixoCd = fornecedorRow?.opera_no_cd ? " (Centro de Distribuição)" : "";
  const titulo = "Fornecedor desvinculado";
  const mensagem =
    params.motivo === "fornecedor_excluido"
      ? `A DropCore removeu ${fornecedorNome} do sistema — o catálogo dele não está mais disponível no seu painel.`
      : `A DropCore desvinculou ${fornecedorNome} do seu catálogo${sufixoCd}.`;

  await supabaseAdmin.from("notifications").insert({
    user_id: userId,
    tipo: "fornecedor_cd_desvinculado_admin",
    titulo,
    mensagem,
    metadata: { fornecedor_id: params.fornecedor_id },
  });

  await notifyUserEmail({ userId, subject: titulo, titulo, mensagem });
}
