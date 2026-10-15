/**
 * GET /api/gestores-ia-avulso/cadastro/cnpj?cnpj=00000000000000
 * Mesma consulta BrasilAPI / ReceitaWS do `/api/seller/cadastro/cnpj`, só que pra sessão de
 * assinante avulso. Consulta externa (BrasilAPI/ReceitaWS) é a exceção da regra 9 — não
 * escreve nada no banco, só repassa o resultado.
 */
import { NextResponse } from "next/server";
import { getAssinanteFromToken } from "@/lib/calculadoraAssinanteSessionAuth";
import { normalizeCnpjInput } from "@/lib/fornecedorCadastro";
import { consultarCnpjNaReceitaFederal } from "@/lib/cnpjBrasilConsulta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const assinante = await getAssinanteFromToken(req);
    if (!assinante) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const cnpjDigits = normalizeCnpjInput(searchParams.get("cnpj"));

    const result = await consultarCnpjNaReceitaFederal(cnpjDigits);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({
      ok: true,
      cnpj: result.cnpj,
      fonte: result.fonte,
      empresa: result.empresa,
    });
  } catch {
    return NextResponse.json({ error: "Erro inesperado na validação de CNPJ." }, { status: 500 });
  }
}
