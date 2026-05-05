/**
 * Pagamento PIX de upgrade Start → Pro (`external_reference`: `upgrade-pro-{row.id}` em `seller_depositos_pix`, `referencia` = UPGRADE_PRO).
 * Não credita saldo do seller — apenas atualiza `sellers.plano` para Pro após confirmação do MP.
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const SELLER_DEPOSITO_REF_UPGRADE_PRO = "UPGRADE_PRO";

export async function processarUpgradeProAprovado(extRef: string): Promise<boolean> {
  const prefix = "upgrade-pro-";
  if (!extRef.trim().startsWith(prefix)) return false;

  const rowId = extRef.slice(prefix.length).trim();
  if (!rowId) return false;

  const { data: dep, error: fetchErr } = await supabaseAdmin
    .from("seller_depositos_pix")
    .select("id, org_id, seller_id, valor, status, referencia")
    .eq("id", rowId)
    .maybeSingle();

  if (fetchErr || !dep || dep.referencia !== SELLER_DEPOSITO_REF_UPGRADE_PRO || dep.status !== "pendente") {
    return false;
  }

  const now = new Date().toISOString();

  const { data: sellerRow, error: sellerErr } = await supabaseAdmin
    .from("sellers")
    .select("id, plano, user_id, nome")
    .eq("id", dep.seller_id)
    .maybeSingle();

  if (sellerErr || !sellerRow) return false;

  const planoLc = String(sellerRow.plano ?? "").trim().toLowerCase();

  if (planoLc === "pro") {
    await supabaseAdmin
      .from("seller_depositos_pix")
      .update({ status: "aprovado", aprovado_em: now })
      .eq("id", rowId)
      .eq("referencia", SELLER_DEPOSITO_REF_UPGRADE_PRO);
    return true;
  }

  if (planoLc !== "starter") {
    return false;
  }

  const { error: upSellerErr } = await supabaseAdmin.from("sellers").update({ plano: "Pro" }).eq("id", sellerRow.id);

  if (upSellerErr) {
    console.error("[upgradeProPixProcessor] atualizar plano:", upSellerErr.message);
    return false;
  }

  await supabaseAdmin
    .from("seller_depositos_pix")
    .update({ status: "aprovado", aprovado_em: now })
    .eq("id", rowId)
    .eq("seller_id", dep.seller_id);

  const valorBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(dep.valor ?? 0));
  if (sellerRow.user_id) {
    await supabaseAdmin.from("notifications").insert({
      user_id: sellerRow.user_id,
      tipo: "plano_upgrade_pro",
      titulo: "Plano Pro ativo",
      mensagem: `Pagamento de ${valorBRL} confirmado. O seu plano foi atualizado para Pro.`,
      metadata: { deposito_id: rowId },
    });
  }

  return true;
}
