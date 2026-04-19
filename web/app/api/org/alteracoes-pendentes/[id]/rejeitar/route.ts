/**
 * POST /api/org/alteracoes-pendentes/[id]/rejeitar — rejeita alterações
 * body: { motivo?: string }
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

    const body = await req.json().catch(() => ({}));
    const motivo = typeof body?.motivo === "string" ? body.motivo.trim() || null : null;

    const { data: alteracao, error: fetchErr } = await supabaseAdmin
      .from("sku_alteracoes_pendentes")
      .select("id, fornecedor_id, status, dados_propostos")
      .eq("id", id)
      .eq("org_id", org_id)
      .single();

    if (fetchErr || !alteracao) {
      return NextResponse.json({ error: "Solicitação não encontrada." }, { status: 404 });
    }
    if (alteracao.status !== "pendente") {
      return NextResponse.json({ error: "Esta solicitação já foi analisada." }, { status: 400 });
    }

    const { data: member } = await supabaseAdmin
      .from("org_members")
      .select("user_id")
      .eq("org_id", org_id)
      .eq("role_base", "owner")
      .limit(1)
      .maybeSingle();
    const analisadoPor = member?.user_id ?? null;

    const { error: statusErr } = await supabaseAdmin
      .from("sku_alteracoes_pendentes")
      .update({
        status: "rejeitado",
        motivo_rejeicao: motivo,
        analisado_em: new Date().toISOString(),
        analisado_por: analisadoPor,
      })
      .eq("id", id)
      .eq("org_id", org_id);

    if (statusErr) return NextResponse.json({ error: statusErr.message }, { status: 500 });

    const { data: forn } = await supabaseAdmin
      .from("org_members")
      .select("user_id")
      .eq("org_id", org_id)
      .eq("fornecedor_id", alteracao.fornecedor_id)
      .limit(1)
      .maybeSingle();
    const fornecedorUserId = forn?.user_id;

    if (fornecedorUserId) {
      const dp = (alteracao as { dados_propostos?: Record<string, unknown> }).dados_propostos ?? {};
      const exclusao = dp._solicitacao_dropcore === "exclusao_grupo";
      const msg = exclusao
        ? motivo
          ? `O pedido de exclusão do produto foi recusado. Motivo: ${motivo}`
          : "O pedido de exclusão do produto foi recusado pela DropCore."
        : motivo
          ? `Suas alterações foram rejeitadas. Motivo: ${motivo}`
          : "Suas alterações foram rejeitadas.";
      await supabaseAdmin.from("notifications").insert({
        user_id: fornecedorUserId,
        tipo: "alteracao_rejeitada",
        titulo: exclusao ? "Exclusão não aprovada" : "Alterações rejeitadas",
        mensagem: msg,
        metadata: { alteracao_id: id, motivo },
      });
    }

    return NextResponse.json({ ok: true, mensagem: "Alterações rejeitadas." });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: 401 });
  }
}
