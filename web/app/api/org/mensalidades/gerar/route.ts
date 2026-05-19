/**
 * POST /api/org/mensalidades/gerar
 * Gera mensalidades para o mês. Body: { ciclo: "YYYY-MM" }
 * Cria uma linha por seller ativo e por fornecedor ativo (vencimento = dia âncora da entidade ou 10 se legado).
 */
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/apiOrgAuth";
import { gerarMensalidadesParaOrgCiclo } from "@/lib/gerarMensalidadesCicloOrg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { org_id } = await requireAdmin(req);
    const body = await req.json();
    const cicloStr = body?.ciclo?.trim().slice(0, 7);
    const result = await gerarMensalidadesParaOrgCiclo(org_id, cicloStr ?? "");
    if (!result.ok) {
      const status = result.error.includes("não existe") ? 503 : 400;
      return NextResponse.json({ error: result.error }, { status });
    }
    return NextResponse.json({
      ok: true,
      ciclo: result.ciclo,
      geradas: result.geradas,
      ...(result.message ? { message: result.message } : {}),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    const status =
      msg === "Unauthorized" || msg === "Usuário sem organização." ? 401 : msg === "Sem permissão." ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
