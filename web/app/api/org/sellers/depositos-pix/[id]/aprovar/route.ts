/**
 * POST /api/org/sellers/depositos-pix/[id]/aprovar
 * Aprova o depósito PIX: lança crédito no ledger + movimentação e marca o depósito como aprovado.
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAdmin } from "@/lib/apiOrgAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { org_id } = await requireAdmin(req);
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

    const { error: ledgerErr } = await supabaseAdmin.from("financial_ledger").insert({
      org_id: deposito.org_id,
      seller_id: deposito.seller_id,
      fornecedor_id: null,
      pedido_id: null,
      tipo: "CREDITO",
      valor_fornecedor: 0,
      valor_dropcore: valor,
      valor_total: valor,
      status: "LIBERADO",
      referencia: "PIX aprovado",
    });

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

    const { error: updateErr } = await supabaseAdmin
      .from("seller_depositos_pix")
      .update({ status: "aprovado", aprovado_em: new Date().toISOString() })
      .eq("id", id)
      .eq("org_id", org_id);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

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
        titulo: "Depósito aprovado",
        mensagem: `Seu depósito de ${valorBRL} foi aprovado e já está disponível no saldo.`,
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
          titulo: "Novo depósito PIX",
          mensagem: `Depósito de ${valorBRL} de ${sellerNome} foi aprovado.`,
          metadata: { deposito_id: id, valor, seller_id: deposito.seller_id },
        }));
      if (toInsert.length) {
        await supabaseAdmin.from("notifications").insert(toInsert);
      }
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
