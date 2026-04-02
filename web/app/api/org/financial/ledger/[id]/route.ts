/**
 * PATCH /api/org/financial/ledger/[id]
 * Atualiza status do registro no ledger (devolução em duas etapas).
 * Body: { status: "ENTREGUE" | "AGUARDANDO_REPASSE" | "EM_DEVOLUCAO" | "DEVOLVIDO" }.
 * - ENTREGUE / AGUARDANDO_REPASSE: só quando está BLOQUEADO.
 * - EM_DEVOLUCAO: quando está BLOQUEADO, ENTREGUE ou AGUARDANDO_REPASSE.
 * - DEVOLVIDO: só quando está EM_DEVOLUCAO — cria registro tipo DEVOLUCAO para devolver saldo ao seller.
 * Apenas admin/owner.
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAdmin } from "@/lib/apiOrgAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_NEXT = new Set(["ENTREGUE", "AGUARDANDO_REPASSE", "EM_DEVOLUCAO", "DEVOLVIDO"]);
const PODE_IR_PARA_EM_DEVOLUCAO = new Set(["BLOQUEADO", "ENTREGUE", "AGUARDANDO_REPASSE"]);

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { org_id } = await requireAdmin(req);
    const { id } = await params;
    const body = await req.json();
    const status = body?.status != null ? String(body.status).trim().toUpperCase() : null;

    if (!status || !ALLOWED_NEXT.has(status)) {
      return NextResponse.json(
        { error: "status deve ser ENTREGUE, AGUARDANDO_REPASSE, EM_DEVOLUCAO ou DEVOLVIDO." },
        { status: 400 }
      );
    }

    const { data: row, error: fetchErr } = await supabaseAdmin
      .from("financial_ledger")
      .select("id, org_id, status, tipo, seller_id, fornecedor_id, pedido_id, valor_fornecedor, valor_dropcore, valor_total, ciclo_repasse")
      .eq("id", id)
      .eq("org_id", org_id)
      .single();

    if (fetchErr || !row) {
      return NextResponse.json({ error: "Registro não encontrado." }, { status: 404 });
    }

    const current = String(row.status);
    if (row.tipo !== "BLOQUEIO" && row.tipo !== "VENDA") {
      return NextResponse.json({ error: "Tipo de registro não permite esta transição." }, { status: 400 });
    }

    if (status === "EM_DEVOLUCAO") {
      if (!PODE_IR_PARA_EM_DEVOLUCAO.has(current)) {
        return NextResponse.json(
          { error: "Só é possível marcar como EM_DEVOLUCAO quando o registro está BLOQUEADO, ENTREGUE ou AGUARDANDO_REPASSE." },
          { status: 400 }
        );
      }
    } else if (status === "DEVOLVIDO") {
      if (current !== "EM_DEVOLUCAO") {
        return NextResponse.json(
          { error: "Só é possível marcar como DEVOLVIDO após o fornecedor conferir o recebimento (registro deve estar EM_DEVOLUCAO)." },
          { status: 400 }
        );
      }
    } else {
      if (current !== "BLOQUEADO") {
        return NextResponse.json(
          { error: "Só é possível definir ENTREGUE/AGUARDANDO_REPASSE quando o registro está BLOQUEADO." },
          { status: 400 }
        );
      }
    }

    // Atualiza o status do ledger original
    const { error: updateErr } = await supabaseAdmin
      .from("financial_ledger")
      .update({ status })
      .eq("id", id)
      .eq("org_id", org_id);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    // Ao confirmar DEVOLVIDO: cria lançamento DEVOLUCAO para devolver o valor ao saldo do seller
    let devolucao_ledger_id: string | null = null;
    if (status === "DEVOLVIDO") {
      const { data: devRow, error: devErr } = await supabaseAdmin
        .from("financial_ledger")
        .insert({
          org_id,
          seller_id: row.seller_id,
          fornecedor_id: row.fornecedor_id ?? null,
          pedido_id: row.pedido_id ?? null,
          tipo: "DEVOLUCAO",
          valor_fornecedor: Number(row.valor_fornecedor),
          valor_dropcore: Number(row.valor_dropcore),
          valor_total: Number(row.valor_total),
          status: "DEVOLVIDO",
          ciclo_repasse: row.ciclo_repasse ?? null,
          referencia: `devolucao do ledger ${id}`,
        })
        .select("id")
        .single();

      if (devErr) {
        return NextResponse.json(
          { error: "Ledger atualizado, mas erro ao criar lançamento de devolução: " + devErr.message },
          { status: 500 }
        );
      }
      devolucao_ledger_id = devRow?.id ?? null;
    }

    const mensagem =
      status === "EM_DEVOLUCAO"
        ? "Devolução registrada. Valor permanece bloqueado até o fornecedor conferir o recebimento."
        : status === "DEVOLVIDO"
          ? "Fornecedor confirmou recebimento. Valor devolvido ao saldo disponível do seller."
          : undefined;

    return NextResponse.json({
      ok: true,
      status,
      ...(devolucao_ledger_id && { devolucao_ledger_id }),
      ...(mensagem && { mensagem }),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    const status =
      msg === "Unauthorized" || msg === "Usuário sem organização." ? 401 : msg === "Sem permissão." ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
