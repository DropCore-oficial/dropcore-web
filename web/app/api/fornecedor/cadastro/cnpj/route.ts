/**
 * GET /api/fornecedor/cadastro/cnpj?cnpj=00000000000000
 * Valida CNPJ na BrasilAPI e devolve dados para autopreenchimento.
 */
import { NextResponse } from "next/server";
import { getFornecedorIdFromBearer } from "@/lib/fornecedorAuth";
import { isValidCnpjDigits, normalizeCnpjInput } from "@/lib/fornecedorCadastro";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type BrasilApiCnpj = {
  cnpj?: string;
  razao_social?: string;
  nome_fantasia?: string;
  ddd_telefone_1?: string;
  ddd_telefone_2?: string;
  email?: string;
  cep?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  municipio?: string;
  uf?: string;
};

function normalizarTelefoneBrasilApi(payload: BrasilApiCnpj): string | null {
  const t1 = String(payload.ddd_telefone_1 ?? "").replace(/\D/g, "");
  const t2 = String(payload.ddd_telefone_2 ?? "").replace(/\D/g, "");
  const raw = t1 || t2;
  if (!raw) return null;
  if (raw.length < 10 || raw.length > 11) return raw;
  if (raw.length === 10) return `(${raw.slice(0, 2)}) ${raw.slice(2, 6)}-${raw.slice(6)}`;
  return `(${raw.slice(0, 2)}) ${raw.slice(2, 7)}-${raw.slice(7)}`;
}

export async function GET(req: Request) {
  try {
    const fornecedorId = await getFornecedorIdFromBearer(req);
    if (!fornecedorId) {
      return NextResponse.json({ error: "Não autenticado como fornecedor." }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const cnpjDigits = normalizeCnpjInput(searchParams.get("cnpj"));
    if (!isValidCnpjDigits(cnpjDigits)) {
      return NextResponse.json({ error: "CNPJ inválido. Confira os 14 dígitos." }, { status: 400 });
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 7000);
    try {
      const brasilApiRes = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpjDigits}`, {
        method: "GET",
        cache: "no-store",
        signal: ctrl.signal,
        headers: { Accept: "application/json" },
      });

      if (brasilApiRes.status === 404) {
        return NextResponse.json({ error: "CNPJ não encontrado na base oficial." }, { status: 404 });
      }
      if (brasilApiRes.status === 429) {
        return NextResponse.json(
          { error: "Limite de validação de CNPJ atingido. Tente novamente em instantes." },
          { status: 429 }
        );
      }
      if (!brasilApiRes.ok) {
        return NextResponse.json({ error: "Não foi possível consultar o CNPJ agora." }, { status: 503 });
      }

      const payload = (await brasilApiRes.json()) as BrasilApiCnpj;
      const nome = String(payload.nome_fantasia ?? payload.razao_social ?? "").trim() || null;
      const telefone = normalizarTelefoneBrasilApi(payload);
      const email = String(payload.email ?? "").trim() || null;

      return NextResponse.json({
        ok: true,
        cnpj: cnpjDigits,
        empresa: {
          nome,
          razao_social: String(payload.razao_social ?? "").trim() || null,
          nome_fantasia: String(payload.nome_fantasia ?? "").trim() || null,
          telefone,
          email_comercial: email,
          endereco_cep: String(payload.cep ?? "").replace(/\D/g, "") || null,
          endereco_logradouro: String(payload.logradouro ?? "").trim() || null,
          endereco_numero: String(payload.numero ?? "").trim() || null,
          endereco_complemento: String(payload.complemento ?? "").trim() || null,
          endereco_bairro: String(payload.bairro ?? "").trim() || null,
          endereco_cidade: String(payload.municipio ?? "").trim() || null,
          endereco_uf: String(payload.uf ?? "").trim().toUpperCase() || null,
        },
      });
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return NextResponse.json({ error: "Erro inesperado na validação de CNPJ." }, { status: 500 });
  }
}
