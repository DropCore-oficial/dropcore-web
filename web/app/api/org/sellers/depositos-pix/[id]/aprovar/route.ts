/**
 * POST /api/org/sellers/depositos-pix/[id]/aprovar
 * Aprova o depósito PIX: lança crédito no ledger + movimentação e marca o depósito como aprovado.
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAdmin } from "@/lib/apiOrgAuth";
import { criarSellerCreditLot } from "@/lib/sellerCreditLots";
import { runPedidosErroSaldoRetry } from "@/lib/pedidosErroSaldoRetry";
import { logAdminAction } from "@/lib/adminAuditLog";
import { SELLER_CREDITO_MESES_VALIDADE } from "@/lib/sellerCreditoTermos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user_id, org_id } = await requireAdmin(req);
    const { id } = await params;

    const { data: deposito, error: fetchErr } = await supabaseAdmin
      .from("seller_depositos_pix")
      .select("id, org_id, seller_id, valor, status")
      .eq("id", id)
      .eq("org_id", org_id)
      .single();

    if (fetchErr || !deposito) {
      return NextResponse.json({ error: "Depósito não encontrado." }, { status: 404 });
    }
    if (deposito.status !== "pendente") {
      return NextResponse.json({ error: "Este depósito já foi aprovado ou cancelado." }, { status: 400 });
    }

    const valor = Number(deposito.valor);

    const aprovadoEm = new Date().toISOString();

    const { data: ledgerRow, error: ledgerErr } = await supabaseAdmin
      .from("financial_ledger")
      .insert({
        org_id: deposito.org_id,
        seller_id: deposito.seller_id,
        fornecedor_id: null,
        pedido_id: null,
        tipo: "CREDITO",
        valor_fornecedor: 0,
        valor_dropcore: valor,
        valor_total: valor,
        status: "LIBERADO",
        referencia: "Recarga PIX aprovada (manual)",
      })
      .select("id")
      .single();

    if (ledgerErr) {
      return NextResponse.json(
        { error: ledgerErr.message ?? "Não foi possível lançar o crédito no ledger." },
        { status: 500 }
      );
    }

    const { error: movErr } = await supabaseAdmin.from("seller_movimentacoes").insert({
      seller_id: deposito.seller_id,
      tipo: "credito",
      valor,
      motivo: "PIX",
      referencia: `Depósito aprovado ${id}`,
    });
    if (movErr) {
      // ledger já foi; movimentação é histórico
    }

    let creditoExpiraEm: string | null = null;
    try {
      creditoExpiraEm = await criarSellerCreditLot({
        org_id: deposito.org_id,
        seller_id: deposito.seller_id,
        deposito_id: id,
        ledger_id: ledgerRow.id,
        valor,
        creditado_em: aprovadoEm,
      });
    } catch (lotErr) {
      console.error("[aprovar deposito] lote crédito:", lotErr);
    }

    const { error: updateErr } = await supabaseAdmin
      .from("seller_depositos_pix")
      .update({
        status: "aprovado",
        aprovado_em: aprovadoEm,
        ...(creditoExpiraEm ? { credito_expira_em: creditoExpiraEm } : {}),
      })
      .eq("id", id)
      .eq("org_id", org_id);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    await logAdminAction({
      req,
      orgId: org_id,
      actorUserId: user_id,
      action: "deposito_pix.aprovar",
      targetTable: "seller_depositos_pix",
      targetId: id,
      detalhes: { seller_id: deposito.seller_id, valor },
    });

    const valorBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valor);
    const { data: sellerRow } = await supabaseAdmin
      .from("sellers")
      .select("user_id, nome")
      .eq("id", deposito.seller_id)
      .single();
    const sellerUserId = sellerRow?.user_id;
    const sellerNome = sellerRow?.nome ?? "Seller";

    if (sellerUserId) {
      await supabaseAdmin.from("notifications").insert({
        user_id: sellerUserId,
        tipo: "deposito_aprovado",
        titulo: "Recarga aprovada",
        mensagem: `Sua recarga de ${valorBRL} virou crédito DropCore. Validade: ${SELLER_CREDITO_MESES_VALIDADE} meses a partir de hoje.`,
        metadata: { deposito_id: id, valor },
      });
    }

    const { data: admins } = await supabaseAdmin
      .from("org_members")
      .select("user_id")
      .eq("org_id", org_id)
      .in("role_base", ["owner", "admin"]);
    if (admins?.length) {
      const toInsert = admins
        .filter((a) => a.user_id && a.user_id !== sellerUserId)
        .map((a) => ({
          user_id: a.user_id,
          tipo: "deposito_entrou",
          titulo: "Nova recarga PIX",
          mensagem: `Recarga de ${valorBRL} de ${sellerNome} foi aprovada.`,
          metadata: { deposito_id: id, valor, seller_id: deposito.seller_id },
        }));
      if (toInsert.length) {
        await supabaseAdmin.from("notifications").insert(toInsert);
      }
    }

    // Gatilho pontual: pedidos travados por saldo insuficiente podem ter sido liberados
    // com essa recarga — reavalia na hora (não espera o cron catch-all de 1 min).
    try {
      await runPedidosErroSaldoRetry({ seller_id: deposito.seller_id });
    } catch (retryErr: unknown) {
      console.error("[aprovar deposito] retry erro_saldo:", retryErr);
    }

    const { data: updated } = await supabaseAdmin.from("sellers").select("saldo_atual").eq("id", deposito.seller_id).single();
    return NextResponse.json({
      ok: true,
      saldo_atual: updated?.saldo_atual != null ? Number(updated.saldo_atual) : undefined,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    const status =
      msg === "Unauthorized" || msg === "Usuário sem organização." ? 401 : msg === "Sem permissão." ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
