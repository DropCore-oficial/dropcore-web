/**
 * Marketplaces como a Shein não permitem dois anúncios com o mesmo SKU — pra duplicar
 * anúncio do mesmo produto o seller sufixa `-1`, `-2`, `-6`... só na hora de cadastrar lá.
 * O pedido chega com esse sufixo, mas o catálogo do DropCore só conhece o SKU base
 * (sem traço). Retorna o SKU base se `sku` terminar em `-<número>`, senão null.
 */
export function skuBaseSemSufixoMarketplace(sku: string): string | null {
  const m = /^(.+)-\d+$/.exec(sku.trim());
  return m ? m[1] : null;
}
