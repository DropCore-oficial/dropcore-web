/**
 * GET /api/gestores-ia-avulso/resumo — card "Resultado · últimos 30 dias" do hub avulso
 * (lucro estimado, faturamento, produto campeão). Ver `buscarResumoFinanceiroAvulso` em
 * gestorAvulsoResumoDados.ts — 100% código, sem IA, direto da API do Mercado Livre.
 */
import { NextResponse } from "next/server";
import { getAssinanteFromToken } from "@/lib/calculadoraAssinanteSessionAuth";
import { buscarResumoFinanceiroAvulso } from "@/lib/ai/gestorAvulsoResumoDados";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const assinante = await getAssinanteFromToken(req);
  if (!assinante) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }
  if (assinante.inclui_gestores_ia !== true) {
    return NextResponse.json({ error: "Recurso não disponível." }, { status: 403 });
  }

  const resumo = await buscarResumoFinanceiroAvulso(assinante.id);
  if (!resumo) {
    return NextResponse.json({ error: "Conecte sua conta do Mercado Livre antes." }, { status: 422 });
  }

  return NextResponse.json(resumo);
}
