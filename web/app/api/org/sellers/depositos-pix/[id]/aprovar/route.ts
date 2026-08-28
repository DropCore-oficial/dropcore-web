/**
 * POST /api/org/sellers/depositos-pix/[id]/aprovar
 * Aprova o depósito PIX manualmente (admin confirmou visualmente que o valor entrou).
 *
 * Antes de creditar, confirma com a API do Mercado Pago se existe pagamento aprovado
 * pra este depósito (mesma checagem do polling automático). Um depósito pendente há
 * muito tempo, sem confirmação do MP, quase sempre nunca foi pago de verdade — já
 * aconteceu de admin aprovar um desses por engano e duplicar o crédito do seller.
 * Se o MP não confirmar, exige `force: true` no body pra aprovar mesmo assim (uso
 * excepcional, com comprovante bancário em mãos) — fica registrado no audit log.
 *
 * Usa o mesmo claim atômico (`UPDATE ... WHERE status = 'pendente'`) do webhook do
 * Mercado Pago via `processarDepositoAprovado` — sem isso, um clique manual bem na hora
 * em que o webhook/polling automático também aprova o mesmo depósito credita 2×.
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAdmin } from "@/lib/apiOrgAuth";
import { logAdminAction } from "@/lib/adminAuditLog";
import { processarDepositoAprovado } from "@/lib/depositoPixProcessor";
import { pagamentoAprovadoPorBusca } from "@/lib/depositoPixMercadoPagoSync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user_id, org_id } = await requireAdmin(req);
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const force = body?.force === true;

    const { data: deposito, error: fetchErr } = await supabaseAdmin
      .from("seller_depositos_pix")
      .select("id, org_id, seller_id, valor, status, referencia, mp_order_id, mp_payment_id")
      .eq("id", id)
      .eq("org_id", org_id)
      .single();

    if (fetchErr || !deposito) {
      return NextResponse.json({ error: "Depósito não encontrado." }, { status: 404 });
    }
    if (deposito.status !== "pendente") {
      return NextResponse.json({ error: "Este depósito já foi aprovado ou cancelado." }, { status: 400 });
    }

    let mpPaymentId: string | null = deposito.mp_payment_id ?? null;

    if (!force) {
      const mpToken = process.env.MERCADOPAGO_ACCESS_TOKEN?.trim();
      if (mpToken) {
        const confirmacao = await pagamentoAprovadoPorBusca(mpToken, deposito);
        if (!confirmacao.aprovado) {
          return NextResponse.json(
            {
              error:
                "O Mercado Pago não confirma pagamento aprovado para este depósito. Confira o extrato bancário com atenção antes de forçar a aprovação — um depósito pendente há muito tempo geralmente nunca foi pago.",
              code: "nao_confirmado_mp",
            },
            { status: 409 }
          );
        }
        mpPaymentId = confirmacao.payment_id ?? mpPaymentId;
      }
    }

    const ok = await processarDepositoAprovado(`deposito-${id}`, mpPaymentId);
    if (!ok) {
      return NextResponse.json(
        {
          error:
            "Não foi possível aprovar — provavelmente o Mercado Pago já processou este depósito automaticamente nesse meio tempo. Atualize a lista.",
        },
        { status: 409 }
      );
    }

    await logAdminAction({
      req,
      orgId: org_id,
      actorUserId: user_id,
      action: "deposito_pix.aprovar",
      targetTable: "seller_depositos_pix",
      targetId: id,
      detalhes: { seller_id: deposito.seller_id, valor: Number(deposito.valor), forced: force },
    });

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
