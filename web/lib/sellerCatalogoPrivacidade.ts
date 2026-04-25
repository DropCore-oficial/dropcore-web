/** Privacidade na UI seller: SKU em lista e nome público de fornecedor */

export function nomePublicoFornecedor(row: {
  nome_exibicao?: string | null;
  nome?: string | null;
}): string {
  const ex = String(row.nome_exibicao ?? "").trim();
  if (ex) return ex;
  const n = String(row.nome ?? "").trim();
  return n || "Armazém";
}

/** SKU longo: prefixo + ... + sufixo (cópia usa valor completo). */
export function mascararSkuListagem(sku: string): string {
  const s = String(sku ?? "");
  if (s.length <= 9) return s;
  return `${s.slice(0, 4)}...${s.slice(-3)}`;
}

export const AVISO_DADOS_FORNECEDOR_SELLER =
  "Estes dados identificam o armazém para pedidos e suporte na DropCore. Use-os apenas nesse contexto; não copie para fins externos nem compartilhe fora da operação acordada com a organização.";
