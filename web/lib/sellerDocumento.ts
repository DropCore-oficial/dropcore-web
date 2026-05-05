import { isValidCnpjDigits, normalizeCnpjInput } from "@/lib/fornecedorCadastro";

/** Apenas dígitos do documento armazenado (CNPJ ou CPF). */
export function normalizeSellerDocDigits(raw: string | null | undefined): string {
  return String(raw ?? "").replace(/\D/g, "");
}

function isValidCpfDigits(cpf: string): boolean {
  if (!/^\d{11}$/.test(cpf)) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(cpf[i]!, 10) * (10 - i);
  let d1 = (sum * 10) % 11;
  if (d1 === 10) d1 = 0;
  if (d1 !== parseInt(cpf[9]!, 10)) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(cpf[i]!, 10) * (11 - i);
  let d2 = (sum * 10) % 11;
  if (d2 === 10) d2 = 0;
  return d2 === parseInt(cpf[10]!, 10);
}

/** CPF (11 dígitos) ou CNPJ (14 dígitos) com dígitos verificadores válidos. */
export function documentoSellerValido(stored: string | null | undefined): boolean {
  const d = normalizeSellerDocDigits(stored);
  if (d.length === 14) return isValidCnpjDigits(d);
  if (d.length === 11) return isValidCpfDigits(d);
  return false;
}

export function cadastroSellerDocumentoPendente(documento: string | null | undefined): boolean {
  return !documentoSellerValido(documento);
}

/** Plano seller já definido: `starter` ou `pro` no banco (ex.: coluna `Starter` / `Pro`, case-insensitive). */
export function planoSellerDefinido(plano: string | null | undefined): boolean {
  const p = String(plano ?? "").trim().toLowerCase();
  return p === "starter" || p === "pro";
}

/**
 * Onboarding incompleto: falta documento/dados comerciais válidos ou plano seller (starter/pro) não definido.
 * Para gate só de dados comerciais use `cadastroSellerDocumentoPendente`; para só plano use `!planoSellerDefinido`.
 */
export function sellerCadastroPendente(documento: string | null | undefined, plano: string | null | undefined): boolean {
  return cadastroSellerDocumentoPendente(documento) || !planoSellerDefinido(plano);
}
