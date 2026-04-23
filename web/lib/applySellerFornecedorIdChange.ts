import { dataMinimaTrocaFornecedor, podeTrocarFornecedorAgora } from "@/lib/sellerFornecedorVinculo";

export function uuidNormFornecedor(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s.length ? s : null;
}

export type SellerFornecedorCampos = {
  fornecedor_id: string | null;
  fornecedor_vinculado_em: string | null;
  fornecedor_desvinculo_liberado: boolean;
};

/**
 * Calcula o patch em `sellers` para mudar o fornecedor (mesma regra que o PATCH admin em /api/org/sellers/[id]).
 * `confirmarTrocaAntesPrazoAdmin` só é true para ações do admin da org.
 */
export function buildSellerFornecedorIdPatch(
  cur: SellerFornecedorCampos,
  novoForn: string | null,
  confirmarTrocaAntesPrazoAdmin: boolean,
  opts?: { mensagemCompromisso?: string }
):
  | { ok: true; allowed: Record<string, unknown> }
  | {
      ok: false;
      error: string;
      status: number;
      code?: string;
      pode_trocar_fornecedor_a_partir_de?: string | null;
    } {
  const curForn = uuidNormFornecedor(cur.fornecedor_id);
  const curVin = cur.fornecedor_vinculado_em ?? null;
  const curLib = Boolean(cur.fornecedor_desvinculo_liberado);

  if (novoForn === curForn) {
    return { ok: true, allowed: {} };
  }

  const allowed: Record<string, unknown> = {};

  if (!curForn && novoForn) {
    allowed.fornecedor_id = novoForn;
    allowed.fornecedor_vinculado_em = new Date().toISOString();
    allowed.fornecedor_desvinculo_liberado = false;
    return { ok: true, allowed };
  }

  if (curForn) {
    if (!podeTrocarFornecedorAgora(curVin, curLib, confirmarTrocaAntesPrazoAdmin)) {
      const min = dataMinimaTrocaFornecedor(curVin);
      return {
        ok: false,
        error:
          opts?.mensagemCompromisso ??
          "Estás no período mínimo de 3 meses com o armazém atual. Só podes trocar ou remover o vínculo após essa data, salvo liberação antecipada feita pela organização no painel admin.",
        status: 403,
        code: "COMPROMISSO_FORNECEDOR_ATIVO",
        pode_trocar_fornecedor_a_partir_de: min?.toISOString() ?? null,
      };
    }
    allowed.fornecedor_id = novoForn;
    if (novoForn) {
      allowed.fornecedor_vinculado_em = new Date().toISOString();
      allowed.fornecedor_desvinculo_liberado = false;
    } else {
      allowed.fornecedor_vinculado_em = null;
      allowed.fornecedor_desvinculo_liberado = false;
    }
    return { ok: true, allowed };
  }

  if (!curForn && !novoForn) {
    return { ok: true, allowed: {} };
  }

  return { ok: true, allowed };
}
