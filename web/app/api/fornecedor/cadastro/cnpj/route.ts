/**
 * GET /api/fornecedor/cadastro/cnpj?cnpj=00000000000000
 * Valida CNPJ (BrasilAPI com retry; fallback ReceitaWS) e devolve dados para autopreenchimento.
 */
import { NextResponse } from "next/server";
import { getFornecedorIdFromBearer } from "@/lib/fornecedorAuth";
import { normalizeCnpjInput } from "@/lib/fornecedorCadastro";
import { consultarCnpjNaReceitaFederal } from "@/lib/cnpjBrasilConsulta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const fornecedorId = await getFornecedorIdFromBearer(req);
    if (!fornecedorId) {
      return NextResponse.json({ error: "Não autenticado como fornecedor." }, { status: 401 });
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
