/**
 * Pagamento PIX de ativação do add-on "Gestores de IA" (`external_reference`:
 * `addon-gestores-ia-{row.id}` em `seller_depositos_pix`, `referencia` = ADDON_GESTORES_IA).
 * Não credita saldo do seller — só liga `sellers.gestores_ia_addon_ativo` após confirmação do MP.
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { valorAddonGestoresIaPorPlano } from "@/lib/gestoresIaAddonPrecos";

export const SELLER_DEPOSITO_REF_ADDON_GESTORES_IA = "ADDON_GESTORES_IA";

/**
 * A mensalidade do ciclo atual (se já tiver sido gerada, ainda não paga) fica sem o add-on
 * até a próxima rodada de geração (cron do dia seguinte) — sem isso o seller paga a ativação
 * mas o ciclo corrente não reflete o valor novo até lá.
 */
async function recalcularMensalidadeCicloAtualComAddon(sellerId: string, planoLc: string): Promise<void> {
  try {
    const now = new Date();
    const ciclo = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

    const { data: sellerRow } = await supabaseAdmin
      .from("sellers")
      .select("mensalidade_valor_travado, plano")
      .eq("id", sellerId)
      .maybeSingle();

    const { data: planoRow } = await supabaseAdmin
      .from("financial_planos")
      .select("valor_seller")
      .eq("plano", planoLc === "pro" ? "Pro" : "Starter")
      .maybeSingle();

    const valorTravado = sellerRow?.mensalidade_valor_travado;
    const valorBase = valorTravado != null ? Number(valorTravado) : Number(planoRow?.valor_seller ?? 0);
    const valorAddon = valorAddonGestoresIaPorPlano(planoLc);

    await supabaseAdmin
      .from("financial_mensalidades")
      .update({ valor: valorBase + valorAddon })
      .eq("tipo", "seller")
      .eq("entidade_id", sellerId)
      .eq("ciclo", ciclo)
      .in("status", ["pendente", "inadimplente"]);
  } catch (e) {
    console.error("[addonGestoresIaPixProcessor] recalcular mensalidade do ciclo:", e);
  }
}

export async function processarAddonGestoresIaAprovado(extRef: string): Promise<boolean> {
  const prefix = "addon-gestores-ia-";
  if (!extRef.trim().startsWith(prefix)) return false;

  const rowId = extRef.slice(prefix.length).trim();
  if (!rowId) return false;

  const { data: dep, error: fetchErr } = await supabaseAdmin
    .from("seller_depositos_pix")
    .select("id, org_id, seller_id, valor, status, referencia")
    .eq("id", rowId)
    .maybeSingle();

  if (fetchErr || !dep || dep.referencia !== SELLER_DEPOSITO_REF_ADDON_GESTORES_IA || dep.status !== "pendente") {
    return false;
  }

  const now = new Date().toISOString();

  const { data: sellerRow, error: sellerErr } = await supabaseAdmin
    .from("sellers")
    .select("id, plano, user_id, nome, gestores_ia_addon_ativo")
    .eq("id", dep.seller_id)
    .maybeSingle();

  if (sellerErr || !sellerRow) return false;

  const planoLc = String(sellerRow.plano ?? "").trim().toLowerCase();

  if (sellerRow.gestores_ia_addon_ativo === true) {
    await supabaseAdmin
      .from("seller_depositos_pix")
      .update({ status: "aprovado", aprovado_em: now })
      .eq("id", rowId)
      .eq("referencia", SELLER_DEPOSITO_REF_ADDON_GESTORES_IA);
    return true;
  }

  const { error: upSellerErr } = await supabaseAdmin
    .from("sellers")
    .update({ gestores_ia_addon_ativo: true, gestores_ia_addon_ativado_em: now })
    .eq("id", sellerRow.id);

  if (upSellerErr) {
    console.error("[addonGestoresIaPixProcessor] ativar add-on:", upSellerErr.message);
    return false;
  }

  await supabaseAdmin
    .from("seller_depositos_pix")
    .update({ status: "aprovado", aprovado_em: now })
    .eq("id", rowId)
    .eq("seller_id", dep.seller_id);

  await recalcularMensalidadeCicloAtualComAddon(sellerRow.id, planoLc);

  const valorBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(dep.valor ?? 0));
  if (sellerRow.user_id) {
    await supabaseAdmin.from("notifications").insert({
      user_id: sellerRow.user_id,
      tipo: "gestores_ia_addon_ativo",
      titulo: "Gestores de IA ativos",
      mensagem: `Pagamento de ${valorBRL} confirmado. Diogo, Andrey e Amanda (e o Ulisses, se ainda não tinha) já estão liberados.`,
      metadata: { deposito_id: rowId },
    });
  }

  return true;
}
