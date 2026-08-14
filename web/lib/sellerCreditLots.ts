/**
 * Lotes de crédito pré-pago do seller (validade ver SELLER_CREDITO_MESES_VALIDADE, consumo FIFO, expiração).
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sellerCreditoExpiraEmIso, SELLER_CREDITO_MESES_VALIDADE } from "@/lib/sellerCreditoTermos";

export type SellerCreditoResumo = {
  expira_em_breve: number;
  proxima_expiracao_em: string | null;
  dias_ate_proxima_expiracao: number | null;
};

export async function criarSellerCreditLot(params: {
  org_id: string;
  seller_id: string;
  valor: number;
  deposito_id?: string | null;
  ledger_id?: string | null;
  creditado_em?: string;
}): Promise<string> {
  const creditado_em = params.creditado_em ?? new Date().toISOString();
  const expira_em = sellerCreditoExpiraEmIso(new Date(creditado_em));

  const { error } = await supabaseAdmin.from("seller_credit_lots").insert({
    org_id: params.org_id,
    seller_id: params.seller_id,
    deposito_id: params.deposito_id ?? null,
    ledger_id: params.ledger_id ?? null,
    valor_inicial: params.valor,
    valor_restante: params.valor,
    creditado_em,
    expira_em,
    status: "ativo",
  });

  if (error) throw error;
  return expira_em;
}

/** Consome lotes ativos (FIFO por vencimento). Ignora falha silenciosa se tabela ainda não existir. */
export async function consumirSellerCreditLots(seller_id: string, valor: number): Promise<void> {
  if (!Number.isFinite(valor) || valor <= 0) return;

  const now = new Date().toISOString();
  const { data: lots, error } = await supabaseAdmin
    .from("seller_credit_lots")
    .select("id, valor_restante")
    .eq("seller_id", seller_id)
    .eq("status", "ativo")
    .gt("valor_restante", 0)
    .gte("expira_em", now)
    .order("expira_em", { ascending: true });

  if (error) {
    if (error.code === "42P01") return;
    console.error("[sellerCreditLots] consumir:", error.message);
    return;
  }

  let restante = valor;
  for (const lot of lots ?? []) {
    if (restante <= 0) break;
    const vr = Number(lot.valor_restante);
    if (vr <= 0) continue;
    const consumir = Math.min(restante, vr);
    const novo = Math.round((vr - consumir) * 100) / 100;
    restante = Math.round((restante - consumir) * 100) / 100;

    await supabaseAdmin
      .from("seller_credit_lots")
      .update({
        valor_restante: novo,
        status: novo <= 0 ? "esgotado" : "ativo",
        atualizado_em: now,
      })
      .eq("id", lot.id);
  }
}

export async function getSellerCreditoResumo(seller_id: string): Promise<SellerCreditoResumo> {
  const now = Date.now();
  const em30d = new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: lots, error } = await supabaseAdmin
    .from("seller_credit_lots")
    .select("valor_restante, expira_em")
    .eq("seller_id", seller_id)
    .eq("status", "ativo")
    .gt("valor_restante", 0)
    .gte("expira_em", new Date().toISOString())
    .order("expira_em", { ascending: true });

  if (error || !lots?.length) {
    return { expira_em_breve: 0, proxima_expiracao_em: null, dias_ate_proxima_expiracao: null };
  }

  let expira_em_breve = 0;
  let proxima_expiracao_em: string | null = null;

  for (const lot of lots) {
    const exp = String(lot.expira_em);
    if (!proxima_expiracao_em) proxima_expiracao_em = exp;
    if (exp <= em30d) {
      expira_em_breve += Number(lot.valor_restante);
    }
  }

  const dias_ate_proxima_expiracao = proxima_expiracao_em
    ? Math.max(0, Math.ceil((new Date(proxima_expiracao_em).getTime() - now) / (24 * 60 * 60 * 1000)))
    : null;

  return { expira_em_breve, proxima_expiracao_em, dias_ate_proxima_expiracao };
}

export type ExpirarCreditosResult = {
  expirados: number;
  avisos_30: number;
  avisos_7: number;
};

export async function processarCreditosSellerCron(): Promise<ExpirarCreditosResult> {
  const result: ExpirarCreditosResult = { expirados: 0, avisos_30: 0, avisos_7: 0 };
  const now = new Date();
  const nowIso = now.toISOString();
  const em30d = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const em7d = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: vencidos, error: vErr } = await supabaseAdmin
    .from("seller_credit_lots")
    .select("id, org_id, seller_id, valor_restante, deposito_id, expira_em")
    .eq("status", "ativo")
    .gt("valor_restante", 0)
    .lt("expira_em", nowIso);

  if (vErr) {
    if (vErr.code === "42P01") return result;
    throw vErr;
  }

  for (const lot of vencidos ?? []) {
    const valor = Number(lot.valor_restante);
    if (valor <= 0) continue;

    const { error: ledgerErr } = await supabaseAdmin.from("financial_ledger").insert({
      org_id: lot.org_id,
      seller_id: lot.seller_id,
      fornecedor_id: null,
      pedido_id: null,
      tipo: "CREDITO",
      valor_fornecedor: 0,
      valor_dropcore: -valor,
      valor_total: -valor,
      status: "LIBERADO",
      referencia: `Expiração créditos não utilizados (lote ${lot.id})`,
    });

    if (ledgerErr) {
      console.error("[sellerCreditLots] expirar ledger:", ledgerErr.message);
      continue;
    }

    await supabaseAdmin
      .from("seller_credit_lots")
      .update({
        valor_restante: 0,
        status: "expirado",
        atualizado_em: nowIso,
      })
      .eq("id", lot.id);

    const { data: sellerRow } = await supabaseAdmin
      .from("sellers")
      .select("user_id")
      .eq("id", lot.seller_id)
      .maybeSingle();

    if (sellerRow?.user_id) {
      const fmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
      await supabaseAdmin.from("notifications").insert({
        user_id: sellerRow.user_id,
        tipo: "credito_expirado",
        titulo: "Créditos expirados",
        mensagem: `${fmt.format(valor)} em créditos DropCore expiraram após ${SELLER_CREDITO_MESES_VALIDADE} meses sem uso.`,
        metadata: { lot_id: lot.id, valor },
      });
    }

    result.expirados += 1;
  }

  const { data: aviso30, error: a30Err } = await supabaseAdmin
    .from("seller_credit_lots")
    .select("id, seller_id, valor_restante, expira_em")
    .eq("status", "ativo")
    .gt("valor_restante", 0)
    .gte("expira_em", nowIso)
    .lte("expira_em", em30d)
    .is("aviso_30_enviado_em", null);

  if (!a30Err) {
    for (const lot of aviso30 ?? []) {
      const sent = await enviarAvisoExpiracao(lot, "30");
      if (sent) {
        await supabaseAdmin
          .from("seller_credit_lots")
          .update({ aviso_30_enviado_em: nowIso, atualizado_em: nowIso })
          .eq("id", lot.id);
        result.avisos_30 += 1;
      }
    }
  }

  const { data: aviso7, error: a7Err } = await supabaseAdmin
    .from("seller_credit_lots")
    .select("id, seller_id, valor_restante, expira_em")
    .eq("status", "ativo")
    .gt("valor_restante", 0)
    .gte("expira_em", nowIso)
    .lte("expira_em", em7d)
    .is("aviso_7_enviado_em", null);

  if (!a7Err) {
    for (const lot of aviso7 ?? []) {
      const sent = await enviarAvisoExpiracao(lot, "7");
      if (sent) {
        await supabaseAdmin
          .from("seller_credit_lots")
          .update({ aviso_7_enviado_em: nowIso, atualizado_em: nowIso })
          .eq("id", lot.id);
        result.avisos_7 += 1;
      }
    }
  }

  return result;
}

async function enviarAvisoExpiracao(
  lot: { id: string; seller_id: string; valor_restante: unknown; expira_em: string },
  dias: "30" | "7"
): Promise<boolean> {
  const { data: sellerRow } = await supabaseAdmin
    .from("sellers")
    .select("user_id")
    .eq("id", lot.seller_id)
    .maybeSingle();

  if (!sellerRow?.user_id) return false;

  const fmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  const valor = Number(lot.valor_restante);
  const dataFmt = new Date(lot.expira_em).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  await supabaseAdmin.from("notifications").insert({
    user_id: sellerRow.user_id,
    tipo: dias === "30" ? "credito_expira_30d" : "credito_expira_7d",
    titulo: `Créditos expiram em ${dias} dias`,
    mensagem: `${fmt.format(valor)} em créditos DropCore expiram em ${dataFmt}. Use na plataforma antes do prazo.`,
    metadata: { lot_id: lot.id, valor, expira_em: lot.expira_em, dias },
  });

  return true;
}
