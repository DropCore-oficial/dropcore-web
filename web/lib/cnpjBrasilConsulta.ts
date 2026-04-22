/**
 * Consulta CNPJ na BrasilAPI (com retry leve) e fallback ReceitaWS.
 * Usado pelo cadastro fornecedor e seller.
 */
import { isValidCnpjDigits, normalizeCnpjInput } from "@/lib/fornecedorCadastro";

const UA = "DropCore/1.0 (+https://www.dropcore.com.br)";

export type EmpresaCnpjPayload = {
  nome: string | null;
  razao_social: string | null;
  nome_fantasia: string | null;
  telefone: string | null;
  email_comercial: string | null;
  endereco_cep: string | null;
  endereco_logradouro: string | null;
  endereco_numero: string | null;
  endereco_complemento: string | null;
  endereco_bairro: string | null;
  endereco_cidade: string | null;
  endereco_uf: string | null;
};

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

type ReceitaWsCnpj = {
  status?: string;
  message?: string;
  nome?: string;
  fantasia?: string;
  email?: string;
  telefone?: string;
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

function formatTelefoneLoose(raw: string): string | null {
  const d = raw.replace(/\D/g, "");
  if (d.length < 10) return raw.trim() || null;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  return raw.trim();
}

function mapBrasilApi(payload: BrasilApiCnpj): EmpresaCnpjPayload {
  const nome = String(payload.nome_fantasia ?? payload.razao_social ?? "").trim() || null;
  const telefone = normalizarTelefoneBrasilApi(payload);
  const email = String(payload.email ?? "").trim() || null;
  return {
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
  };
}

function mapReceitaWs(payload: ReceitaWsCnpj): EmpresaCnpjPayload | null {
  if (payload.status === "ERROR" || (payload.message && /inválido|invalid|erro/i.test(payload.message))) {
    return null;
  }
  const nome = String(payload.fantasia ?? payload.nome ?? "").trim() || null;
  const tel = payload.telefone ? formatTelefoneLoose(payload.telefone) : null;
  return {
    nome,
    razao_social: String(payload.nome ?? "").trim() || null,
    nome_fantasia: String(payload.fantasia ?? "").trim() || null,
    telefone: tel,
    email_comercial: String(payload.email ?? "").trim() || null,
    endereco_cep: String(payload.cep ?? "").replace(/\D/g, "") || null,
    endereco_logradouro: String(payload.logradouro ?? "").trim() || null,
    endereco_numero: String(payload.numero ?? "").trim() || null,
    endereco_complemento: String(payload.complemento ?? "").trim() || null,
    endereco_bairro: String(payload.bairro ?? "").trim() || null,
    endereco_cidade: String(payload.municipio ?? "").trim() || null,
    endereco_uf: String(payload.uf ?? "").trim().toUpperCase() || null,
  };
}

async function fetchBrasilApi(cnpjDigits: string, signal: AbortSignal) {
  return fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpjDigits}`, {
    method: "GET",
    cache: "no-store",
    signal,
    headers: {
      Accept: "application/json",
      "User-Agent": UA,
    },
  });
}

async function fetchReceitaWs(cnpjDigits: string, signal: AbortSignal) {
  return fetch(`https://www.receitaws.com.br/v1/cnpj/${cnpjDigits}`, {
    method: "GET",
    cache: "no-store",
    signal,
    headers: {
      Accept: "application/json",
      "User-Agent": UA,
    },
  });
}

export type ConsultaCnpjOk = {
  ok: true;
  cnpj: string;
  fonte: "brasilapi" | "receitaws";
  empresa: EmpresaCnpjPayload;
};

export type ConsultaCnpjErro = { ok: false; status: number; error: string };

export type ConsultaCnpjResult = ConsultaCnpjOk | ConsultaCnpjErro;

/**
 * Valida dígitos verificadores e consulta bases públicas (BrasilAPI → ReceitaWS).
 */
export async function consultarCnpjNaReceitaFederal(rawCnpj: string | null | undefined): Promise<ConsultaCnpjResult> {
  const cnpjDigits = normalizeCnpjInput(rawCnpj);
  if (!isValidCnpjDigits(cnpjDigits)) {
    return { ok: false, status: 400, error: "CNPJ inválido. Confira os 14 dígitos." };
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12_000);

  try {
    let brasilApiRes = await fetchBrasilApi(cnpjDigits, ctrl.signal);
    if (brasilApiRes.status === 502 || brasilApiRes.status === 503 || brasilApiRes.status === 504) {
      await new Promise((r) => setTimeout(r, 400));
      brasilApiRes = await fetchBrasilApi(cnpjDigits, ctrl.signal);
    }

    if (brasilApiRes.status === 404) {
      return { ok: false, status: 404, error: "CNPJ não encontrado na base oficial." };
    }
    if (brasilApiRes.status === 429) {
      return {
        ok: false,
        status: 429,
        error: "Limite de validação de CNPJ atingido. Tente novamente em instantes.",
      };
    }

    if (brasilApiRes.ok) {
      const payload = (await brasilApiRes.json()) as BrasilApiCnpj;
      const empresa = mapBrasilApi(payload);
      return { ok: true, cnpj: cnpjDigits, fonte: "brasilapi", empresa };
    }

    const receitaRes = await fetchReceitaWs(cnpjDigits, ctrl.signal);
    if (receitaRes.ok) {
      const raw = (await receitaRes.json()) as ReceitaWsCnpj;
      const empresa = mapReceitaWs(raw);
      if (empresa) {
        return { ok: true, cnpj: cnpjDigits, fonte: "receitaws", empresa };
      }
    }

    return {
      ok: false,
      status: 503,
      error:
        "Não foi possível consultar o CNPJ agora. Tente de novo em alguns minutos ou preencha os dados manualmente.",
    };
  } catch (e: unknown) {
    if (e instanceof Error && e.name === "AbortError") {
      return {
        ok: false,
        status: 504,
        error: "A consulta demorou demais. Verifique a conexão e tente novamente.",
      };
    }
    return { ok: false, status: 500, error: "Erro inesperado na validação de CNPJ." };
  } finally {
    clearTimeout(timer);
  }
}

/** Uma linha de endereço para formulários que só têm campo único (ex.: seller). */
export function empresaCnpjParaEnderecoLinha(e: EmpresaCnpjPayload): string {
  const cidadeUf = [e.endereco_cidade, e.endereco_uf].filter(Boolean).join(" - ");
  const partes = [
    e.endereco_logradouro,
    e.endereco_numero ? `nº ${e.endereco_numero}` : null,
    e.endereco_complemento,
    e.endereco_bairro,
    cidadeUf || null,
  ].filter(Boolean);
  return partes.join(", ");
}
