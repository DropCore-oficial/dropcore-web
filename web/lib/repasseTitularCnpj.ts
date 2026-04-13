import { isValidCnpjDigits, normalizeCnpjInput } from "@/lib/fornecedorCadastro";

export type DadosRepasseInput = {
  razaoSocial: string;
  /** 14 dígitos ou string vazia */
  cnpjEmpresa: string;
  chave_pix: string | null;
  nome_banco: string | null;
  nome_no_banco: string | null;
  agencia: string | null;
  conta: string | null;
  tipo_conta: string | null;
};

function normalizarNomeComparacao(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Titular da conta compatível com a razão social cadastrada (mesma empresa). */
export function titularCompativelComRazaoSocial(titular: string, razaoSocial: string): boolean {
  const t0 = normalizarNomeComparacao(titular);
  const r0 = normalizarNomeComparacao(razaoSocial);
  if (!t0 || !r0) return false;
  const t = t0.replace(/\b(LTDA|ME|EPP|SA|S A|CIA|COMERCIO|INDUSTRIA)\b/g, " ").replace(/\s+/g, " ").trim();
  const r = r0.replace(/\b(LTDA|ME|EPP|SA|S A|CIA|COMERCIO|INDUSTRIA)\b/g, " ").replace(/\s+/g, " ").trim();
  if (!t || !r) return false;
  if (t === r) return true;
  if (t.length >= 4 && r.includes(t)) return true;
  if (r.length >= 4 && t.includes(r)) return true;
  const tw = t.split(" ").filter((w) => w.length > 2);
  const rw = new Set(r.split(" ").filter((w) => w.length > 2));
  const hits = tw.filter((w) => rw.has(w)).length;
  return hits >= Math.min(2, Math.max(1, tw.length));
}

function temAlgumDadoRepasse(d: DadosRepasseInput): boolean {
  const f = (s: string | null | undefined) => String(s ?? "").trim().length > 0;
  return (
    f(d.chave_pix) ||
    f(d.nome_banco) ||
    f(d.nome_no_banco) ||
    f(d.agencia) ||
    f(d.conta) ||
    f(d.tipo_conta)
  );
}

/**
 * Regras: repasse só em nome do CNPJ / razão social da empresa.
 * — Nome no banco deve bater com a razão social (flexível).
 * — Se a chave PIX for CNPJ (14 dígitos válidos), deve ser o mesmo CNPJ da empresa.
 */
export function validarRepasseTitularEmpresa(
  d: DadosRepasseInput
): { ok: true } | { ok: false; error: string } {
  if (!temAlgumDadoRepasse(d)) return { ok: true };

  const razao = String(d.razaoSocial ?? "").trim();
  if (razao.length < 2) {
    return { ok: false, error: "Preencha o nome / razão social da empresa antes dos dados de repasse." };
  }

  const cnpj = normalizeCnpjInput(d.cnpjEmpresa);
  if (!isValidCnpjDigits(cnpj)) {
    return { ok: false, error: "Cadastre um CNPJ válido da empresa antes de informar dados bancários ou PIX." };
  }

  const titular = String(d.nome_no_banco ?? "").trim();
  if (!titular) {
    return { ok: false, error: "Informe o nome do titular da conta exatamente como na razão social da empresa." };
  }
  if (!titularCompativelComRazaoSocial(titular, razao)) {
    return {
      ok: false,
      error:
        "O nome no banco deve ser o da empresa (mesma razão social do cadastro). Contas de terceiros não são aceitas para repasse.",
    };
  }

  const pixRaw = String(d.chave_pix ?? "").trim();
  if (pixRaw) {
    const pixDigits = normalizeCnpjInput(pixRaw);
    if (pixDigits.length === 14 && isValidCnpjDigits(pixDigits)) {
      if (pixDigits !== cnpj) {
        return {
          ok: false,
          error: "Se a chave PIX for CNPJ, deve ser o mesmo CNPJ da empresa cadastrada acima.",
        };
      }
    }
  }

  const temAgenciaOuConta = Boolean(
    String(d.agencia ?? "").trim() || String(d.conta ?? "").trim()
  );
  if (temAgenciaOuConta) {
    const tipo = String(d.tipo_conta ?? "").trim();
    if (!tipo || (tipo !== "corrente" && tipo !== "poupanca")) {
      return { ok: false, error: "Se informar agência e/ou conta, selecione o tipo de conta (corrente ou poupança)." };
    }
  }

  return { ok: true };
}
