/**
 * Notifica o(s) usuário(s) do fornecedor quando uma remessa do CD é conferida (sempre, não
 * só quando diverge) ou quando sofre baixa manual — regra de produto: o fornecedor precisa
 * ver tudo que acontece com a remessa dele, não só o resultado final sem explicação.
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { notifyUserEmail } from "@/lib/notifyEmail";
import { cdBaixaMotivoLabel } from "@/lib/cdBaixaMotivos";

async function userIdsDoFornecedor(fornecedorId: string): Promise<string[]> {
  const { data } = await supabaseAdmin.from("org_members").select("user_id").eq("fornecedor_id", fornecedorId);
  return (data ?? []).map((r) => r.user_id as string).filter(Boolean);
}

export async function notifyCdRemessaConferida(params: {
  fornecedor_id: string;
  sku: string;
  nome_produto: string | null;
  quantidade_declarada: number;
  quantidade_conferida: number;
}): Promise<void> {
  const userIds = await userIdsDoFornecedor(params.fornecedor_id);
  if (userIds.length === 0) return;

  const bate = params.quantidade_declarada === params.quantidade_conferida;
  const produto = params.nome_produto ? `${params.sku} (${params.nome_produto})` : params.sku;
  const mensagem = bate
    ? `Remessa de ${produto} conferida: ${params.quantidade_conferida} unidade(s), conforme declarado.`
    : `Remessa de ${produto} conferida: você declarou ${params.quantidade_declarada}, o operador confirmou ${params.quantidade_conferida}.`;

  await supabaseAdmin.from("notifications").insert(
    userIds.map((user_id) => ({
      user_id,
      tipo: "cd_remessa_conferida",
      titulo: "Remessa conferida no CD",
      mensagem,
      metadata: { fornecedor_id: params.fornecedor_id, sku: params.sku, declarado: params.quantidade_declarada, conferido: params.quantidade_conferida },
    }))
  );

  await Promise.all(
    userIds.map((userId) =>
      notifyUserEmail({
        userId,
        subject: "Remessa conferida no CD",
        titulo: "Remessa conferida no CD",
        mensagem,
        ctaUrl: "https://www.dropcore.com.br/fornecedor/cd",
        ctaLabel: "Ver Centro de Distribuição",
      })
    )
  );
}

/** A DropCore declarou a remessa em nome do fornecedor — nunca fica oculto, mesma regra das
 * notificações de vínculo de fornecedor feitas pelo admin. */
export async function notifyCdRemessaDeclaradaPeloAdmin(params: {
  fornecedor_id: string;
  sku: string;
  nome_produto: string | null;
  quantidade: number;
}): Promise<void> {
  const userIds = await userIdsDoFornecedor(params.fornecedor_id);
  if (userIds.length === 0) return;

  const produto = params.nome_produto ? `${params.sku} (${params.nome_produto})` : params.sku;
  const mensagem = `A DropCore declarou ${params.quantidade} unidade(s) de ${produto} em seu nome no CD.`;

  await supabaseAdmin.from("notifications").insert(
    userIds.map((user_id) => ({
      user_id,
      tipo: "cd_remessa_declarada_admin",
      titulo: "Remessa declarada pela DropCore",
      mensagem,
      metadata: { fornecedor_id: params.fornecedor_id, sku: params.sku, quantidade: params.quantidade },
    }))
  );

  await Promise.all(
    userIds.map((userId) =>
      notifyUserEmail({
        userId,
        subject: "Remessa declarada pela DropCore",
        titulo: "Remessa declarada pela DropCore",
        mensagem,
        ctaUrl: "https://www.dropcore.com.br/fornecedor/cd",
        ctaLabel: "Ver Centro de Distribuição",
      })
    )
  );
}

export async function notifyCdBaixaManual(params: {
  fornecedor_id: string;
  sku: string;
  nome_produto: string | null;
  quantidade: number;
  motivo: string;
}): Promise<void> {
  const userIds = await userIdsDoFornecedor(params.fornecedor_id);
  if (userIds.length === 0) return;

  const produto = params.nome_produto ? `${params.sku} (${params.nome_produto})` : params.sku;
  const mensagem = `Baixa de ${params.quantidade} unidade(s) de ${produto} no CD — motivo: ${cdBaixaMotivoLabel(params.motivo)}.`;

  await supabaseAdmin.from("notifications").insert(
    userIds.map((user_id) => ({
      user_id,
      tipo: "cd_baixa_manual",
      titulo: "Baixa de estoque no CD",
      mensagem,
      metadata: { fornecedor_id: params.fornecedor_id, sku: params.sku, quantidade: params.quantidade, motivo: params.motivo },
    }))
  );

  await Promise.all(
    userIds.map((userId) =>
      notifyUserEmail({
        userId,
        subject: "Baixa de estoque no CD",
        titulo: "Baixa de estoque no CD",
        mensagem,
        ctaUrl: "https://www.dropcore.com.br/fornecedor/cd",
        ctaLabel: "Ver Centro de Distribuição",
      })
    )
  );
}
