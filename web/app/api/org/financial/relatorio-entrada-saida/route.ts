/**
 * GET /api/org/financial/relatorio-entrada-saida
 * Relatório de entrada e saída no período.
 * Query: de=YYYY-MM-DD, ate=YYYY-MM-DD (obrigatórios).
 * - Entrada: depósitos PIX aprovados no período (aprovado_em).
 * - Saída: ciclos fechados no período (fechado_em) — total_fornecedores.
 * - Receita DropCore: ciclos fechados no período (fechado_em) — total_dropcore.
 * Usa fechado_em (não pago_em) para que todos os ciclos fechados no período apareçam,
 * mesmo antes de clicar em "Marcar como pago".
 * Apenas admin/owner.
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAdmin } from "@/lib/apiOrgAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { org_id } = await requireAdmin(req);
    const { searchParams } = new URL(req.url);
    const deStr = searchParams.get("de")?.trim().slice(0, 10);
    const ateStr = searchParams.get("ate")?.trim().slice(0, 10);

    if (!deStr || !ateStr) {
      return NextResponse.json({ error: "Parâmetros de e ate (YYYY-MM-DD) são obrigatórios." }, { status: 400 });
    }

    const de = new Date(deStr + "T00:00:00");
    const ate = new Date(ateStr + "T23:59:59.999");
    if (Number.isNaN(de.getTime()) || Number.isNaN(ate.getTime())) {
      return NextResponse.json({ error: "Datas inválidas. Use YYYY-MM-DD." }, { status: 400 });
    }
    if (de > ate) {
      return NextResponse.json({ error: "Data 'de' deve ser anterior ou igual a 'ate'." }, { status: 400 });
    }

    const deIso = de.toISOString();
    const ateIso = ate.toISOString();

    const [pixRes, ciclosRes] = await Promise.all([
      supabaseAdmin
        .from("seller_depositos_pix")
        .select("valor, aprovado_em, seller_id")
        .eq("org_id", org_id)
        .eq("status", "aprovado")
        .not("aprovado_em", "is", null)
        .gte("aprovado_em", deIso)
        .lte("aprovado_em", ateIso),
      supabaseAdmin
        .from("financial_ciclos_repasse")
        .select("total_dropcore, total_fornecedores, fechado_em, ciclo_repasse")
        .eq("org_id", org_id)
        .eq("status", "fechado")
        .not("fechado_em", "is", null)
        .gte("fechado_em", deIso)
        .lte("fechado_em", ateIso),
    ]);

    const pixRows = pixRes.data ?? [];
    const ciclosRows = ciclosRes.data ?? [];

    const entrada = pixRows.reduce((s, r) => s + Number(r.valor || 0), 0);
    const saida = ciclosRows.reduce((s, r) => s + Number(r.total_fornecedores || 0), 0);
    const receita_dropcore = ciclosRows.reduce((s, r) => s + Number(r.total_dropcore || 0), 0);

    const linhas_entrada = pixRows.map((r) => ({
      tipo: "deposito_pix",
      valor: Number(r.valor || 0),
      data: r.aprovado_em,
      descricao: "Depósito PIX aprovado",
    }));
    const linhas_saida = ciclosRows.map((r) => ({
      tipo: "ciclo_fechado",
      valor: Number(r.total_fornecedores || 0),
      data: r.fechado_em,
      descricao: `Ciclo ${r.ciclo_repasse} — repasse aos fornecedores`,
    }));

    return NextResponse.json({
      periodo: { de: deStr, ate: ateStr },
      resumo: {
        entrada,
        saida,
        receita_dropcore,
        total_ciclos_fechados: ciclosRows.length,
        total_depositos: pixRows.length,
      },
      linhas_entrada,
      linhas_saida,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    const status =
      msg === "Unauthorized" || msg === "Usuário sem organização." ? 401 : msg === "Sem permissão." ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
