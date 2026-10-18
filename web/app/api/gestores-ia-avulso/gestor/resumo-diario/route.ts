/**
 * GET /api/gestores-ia-avulso/gestor/resumo-diario — card do painel do Gestor com as 3 ações
 * mais importantes do dia, cruzando a última rodada dos 4 gestores (sem precisar perguntar
 * no chat). Mesma lógica usada pela tool `resumo_diario_acoes` do chat
 * (`gestorTiagoResumoDiarioAvulso.ts`) — zero IA, zero banco novo.
 */
import { NextResponse } from "next/server";
import { getAssinanteFromToken } from "@/lib/calculadoraAssinanteSessionAuth";
import { montarResumoDiarioAvulso } from "@/lib/ai/gestorTiagoResumoDiarioAvulso";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const assinante = await getAssinanteFromToken(req);
  if (!assinante) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }
  if (assinante.inclui_gestores_ia !== true) {
    return NextResponse.json({ liberado: false });
  }

  const resumo = await montarResumoDiarioAvulso(assinante.id);
  return NextResponse.json({ liberado: true, ...resumo });
}
