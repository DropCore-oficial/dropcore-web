/** Dígitos do CNPJ ou string vazia. */
export function normalizeCnpjInput(raw: string | null | undefined): string {
  return String(raw ?? "").replace(/\D/g, "");
}

function cnpjDv(base: string, weights: readonly number[]): number {
  let sum = 0;
  for (let i = 0; i < weights.length; i++) {
    sum += parseInt(base[i]!, 10) * weights[i]!;
  }
  const r = sum % 11;
  return r < 2 ? 0 : 11 - r;
}

const W1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] as const;
const W2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] as const;

/** CNPJ com exatamente 14 dígitos e dígitos verificadores válidos (rejeita sequências iguais). */
export function isValidCnpjDigits(digits: string): boolean {
  if (!/^\d{14}$/.test(digits)) return false;
  if (/^(\d)\1{13}$/.test(digits)) return false;
  const d1 = cnpjDv(digits.slice(0, 12), W1);
  const d2 = cnpjDv(digits.slice(0, 13), W2);
  return d1 === parseInt(digits[12]!, 10) && d2 === parseInt(digits[13]!, 10);
}

/** Formata 14 dígitos para exibição; se incompleto, devolve os dígitos ou "—". */
export function formatCnpjBr(digitsOrRaw: string | null | undefined): string {
  const d = normalizeCnpjInput(digitsOrRaw).slice(0, 14);
  if (d.length === 0) return "—";
  if (d.length !== 14) return d;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

export type FornecedorCadastroFields = {
  cnpj: string | null;
  telefone: string | null;
  email_comercial: string | null;
  chave_pix: string | null;
  nome_banco: string | null;
  nome_no_banco: string | null;
  agencia: string | null;
  conta: string | null;
  tipo_conta: string | null;
};

/** Mínimo para repasse + identificação (banner “complete o cadastro”). */
export function cadastroMinimoCompleto(f: FornecedorCadastroFields): boolean {
  const cnpj = normalizeCnpjInput(f.cnpj);
  const tel = (f.telefone ?? "").trim();
  const email = (f.email_comercial ?? "").trim();
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const pixOk = !!(f.chave_pix && String(f.chave_pix).trim());
  const bankOk = !!(
    f.nome_banco?.trim() &&
    f.conta?.trim() &&
    f.nome_no_banco?.trim()
  );
  return isValidCnpjDigits(cnpj) && tel.length >= 8 && emailOk && (pixOk || bankOk);
}
