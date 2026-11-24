/**
 * Notifica owners/admins da org (sino + e-mail) sobre problema real de sync com o
 * Mercado Livre — achado 2026-11-24: fornecedor/seller nunca age nisso, quem corrige é
 * sempre o admin, então o aviso tem que ir direto pra ele, nunca só pro painel do
 * fornecedor (que ninguém olha).
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { notifyUserEmail } from "@/lib/notifyEmail";

const TIPO_DIVERGENCIA = "ml_sync_divergencia_admin" as const;
const TIPO_FALHA_RECORRENTE = "ml_sync_falha_recorrente_admin" as const;

async function destinatariosAdmin(orgId: string): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from("org_members")
    .select("user_id")
    .eq("org_id", orgId)
    .is("fornecedor_id", null)
    .is("seller_id", null)
    .in("role_base", ["owner", "admin"]);
  return (data ?? [])
    .map((a) => (a as { user_id: string | null }).user_id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
}

/** Mercado Livre aceitou o PUT (HTTP 200) mas confirmou um valor diferente do que
 * mandamos — exatamente o tipo de silêncio que já causou overselling real (ver
 * DJU003031/Felipão, 2026-11-23). Dispara na hora, não espera acumular. */
export async function notifyAdminsMlSyncDivergencia(params: {
  org_id: string;
  seller_id: string;
  seller_nome?: string | null;
  fornecedor_id: string | null;
  sku: string;
  ml_item_id: string;
  enviado: number;
  confirmado: number;
}): Promise<void> {
  const destinatarios = await destinatariosAdmin(params.org_id);
  if (destinatarios.length === 0) return;

  const titulo = "Mercado Livre confirmou estoque diferente do enviado";
  const mensagem = `SKU ${params.sku} (seller ${params.seller_nome ?? params.seller_id}): mandamos ${params.enviado} e o Mercado Livre confirmou ${params.confirmado} no anúncio ${params.ml_item_id}. O PUT foi aceito (HTTP 200) mas o valor final não bate — confira esse anúncio direto na conta do seller.`;

  await supabaseAdmin.from("notifications").insert(
    destinatarios.map((userId) => ({
      user_id: userId,
      tipo: TIPO_DIVERGENCIA,
      titulo,
      mensagem,
      metadata: {
        seller_id: params.seller_id,
        fornecedor_id: params.fornecedor_id,
        sku: params.sku,
        ml_item_id: params.ml_item_id,
        enviado: params.enviado,
        confirmado: params.confirmado,
      },
    })),
  );

  await Promise.all(
    destinatarios.map((userId) =>
      notifyUserEmail({ userId, subject: `⚠️ ${titulo}`, titulo, mensagem }),
    ),
  );
}

/** Mesmo seller/fornecedor acumulando falha de sync com o ML (pendente ou esgotado) acima
 * do limite — dedup por janela de tempo pra não virar spam (ver chamador, cron
 * ml-sync-alerta-admin). */
export async function notifyAdminsMlSyncFalhaRecorrente(params: {
  org_id: string;
  seller_id: string;
  seller_nome?: string | null;
  fornecedor_id: string | null;
  fornecedor_nome?: string | null;
  qtd_pendente: number;
  qtd_esgotado: number;
  ultimo_erro: string | null;
}): Promise<void> {
  const destinatarios = await destinatariosAdmin(params.org_id);
  if (destinatarios.length === 0) return;

  const quem = params.fornecedor_nome
    ? `${params.seller_nome ?? params.seller_id} / fornecedor ${params.fornecedor_nome}`
    : (params.seller_nome ?? params.seller_id);
  const titulo = "Falha recorrente de sync com o Mercado Livre";
  const mensagem = `${quem}: ${params.qtd_pendente} falha(s) ainda tentando e ${params.qtd_esgotado} que desistiram de tentar. Último erro: "${params.ultimo_erro ?? "sem detalhe"}". Provavelmente precisa reconectar o Mercado Livre dessa conta.`;

  await supabaseAdmin.from("notifications").insert(
    destinatarios.map((userId) => ({
      user_id: userId,
      tipo: TIPO_FALHA_RECORRENTE,
      titulo,
      mensagem,
      metadata: {
        seller_id: params.seller_id,
        fornecedor_id: params.fornecedor_id,
        qtd_pendente: params.qtd_pendente,
        qtd_esgotado: params.qtd_esgotado,
      },
    })),
  );

  await Promise.all(
    destinatarios.map((userId) =>
      notifyUserEmail({ userId, subject: `⚠️ ${titulo}`, titulo, mensagem }),
    ),
  );
}

export { TIPO_DIVERGENCIA as NOTIFICACAO_TIPO_ML_SYNC_DIVERGENCIA_ADMIN, TIPO_FALHA_RECORRENTE as NOTIFICACAO_TIPO_ML_SYNC_FALHA_RECORRENTE_ADMIN };
