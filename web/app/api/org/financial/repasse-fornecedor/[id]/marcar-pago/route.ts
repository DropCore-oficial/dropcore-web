/**
 * POST /api/org/financial/repasse-fornecedor/[id]/marcar-pago
 * Marca o repasse como pago (status → pago, pago_em = now).
 * Apenas para status pendente ou liberado. Apenas admin/owner.
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

    const { data: row, error: fetchErr } = await supabaseAdmin
      .from("financial_repasse_fornecedor")
      .select("id, org_id, status, fornecedor_id, valor_total, ciclo_repasse")
      .eq("id", id)
      .eq("org_id", org_id)
      .single();

    if (fetchErr || !row) {
      return NextResponse.json({ error: "Repasse não encontrado." }, { status: 404 });
    }

    if (row.status !== "pendente" && row.status !== "liberado") {
      return NextResponse.json(
        { error: "Só é possível marcar como pago quando o status é pendente ou liberado." },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    const { error: updateErr } = await supabaseAdmin
      .from("financial_repasse_fornecedor")
      .update({ status: "pago", pago_em: now, atualizado_em: now })
      .eq("id", id)
      .eq("org_id", org_id);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    // Notificação para o fornecedor: repasse pago
    if (row.fornecedor_id) {
      const { data: member } = await supabaseAdmin
        .from("org_members")
        .select("user_id")
        .eq("org_id", org_id)
        .eq("fornecedor_id", row.fornecedor_id)
        .limit(1)
        .maybeSingle();
      if (member?.user_id) {
        const valorBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(row.valor_total ?? 0));
        const cicloLabel = row.ciclo_repasse ? ` (ciclo ${row.ciclo_repasse})` : "";
        await supabaseAdmin.from("notifications").insert({
          user_id: member.user_id,
          tipo: "repasse_recebido",
          titulo: "Repasse pago",
          mensagem: `Seu repasse de ${valorBRL}${cicloLabel} foi marcado como pago.`,
          metadata: { repasse_id: row.id },
        });
      }
    }

    return NextResponse.json({
      ok: true,
      status: "pago",
      pago_em: now,
      mensagem: "Repasse marcado como pago.",
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    const status =
      msg === "Unauthorized" || msg === "Usuário sem organização." ? 401 : msg === "Sem permissão." ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
