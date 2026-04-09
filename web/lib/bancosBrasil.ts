/**
 * Instituições para repasse: código COMPE (3 dígitos) + nome.
 * Ordenação: código numérico.
 */
export type BancoBrasil = { readonly code: string; readonly nome: string };

/** Valor salvo em nome_banco quando o fornecedor escolhe da lista */
export function formatBancoLabel(b: BancoBrasil): string {
  return `${b.code} — ${b.nome}`;
}

const ENTRIES: readonly BancoBrasil[] = [
  { code: "001", nome: "Banco do Brasil S.A." },
  { code: "003", nome: "Banco da Amazônia S.A." },
  { code: "004", nome: "Banco do Nordeste do Brasil S.A." },
  { code: "007", nome: "BNDES — Banco Nacional de Desenvolvimento Econômico e Social" },
  { code: "012", nome: "Banco Inbursa S.A." },
  { code: "021", nome: "Banestes S.A. — Banco do Estado do Espírito Santo" },
  { code: "024", nome: "Banco Bandepe S.A." },
  { code: "025", nome: "Banco Alfa S.A." },
  { code: "029", nome: "Banco Itaú Consignado S.A." },
  { code: "033", nome: "Banco Santander (Brasil) S.A." },
  { code: "036", nome: "Banco Bradesco BBI S.A." },
  { code: "037", nome: "Banco do Estado do Pará S.A." },
  { code: "041", nome: "Banrisul — Banco do Estado do Rio Grande do Sul S.A." },
  { code: "047", nome: "Banese — Banco do Estado de Sergipe S.A." },
  { code: "062", nome: "Hipercard Banco Múltiplo S.A." },
  { code: "063", nome: "Banco Bradescard S.A." },
  { code: "065", nome: "Banco Andbank (Brasil) S.A." },
  { code: "066", nome: "Banco Morgan Stanley S.A." },
  { code: "069", nome: "Banco Crefisa S.A." },
  { code: "070", nome: "BRB — Banco de Brasília S.A." },
  { code: "074", nome: "Banco J. Safra S.A." },
  { code: "077", nome: "Banco Inter S.A." },
  { code: "082", nome: "Banco Topázio S.A." },
  { code: "083", nome: "Banco da China Brasil S.A." },
  { code: "084", nome: "Uniprime Norte do Paraná — Cooperativa de Crédito Ltda." },
  { code: "085", nome: "Cooperativa Central de Crédito — Ailos" },
  { code: "088", nome: "Banco Randon S.A." },
  { code: "089", nome: "Credisan — Cooperativa de Crédito" },
  { code: "091", nome: "Unicred Cooperativa" },
  { code: "093", nome: "PóloCred — Sociedade de Crédito ao Microempreendedor" },
  { code: "094", nome: "Banco Finaxis S.A." },
  { code: "095", nome: "Travelex Banco de Câmbio S.A." },
  { code: "096", nome: "Banco B3 S.A." },
  { code: "098", nome: "Credialiança Cooperativa de Crédito Rural" },
  { code: "099", nome: "Uniprime Cooperativa" },
  { code: "104", nome: "Caixa Econômica Federal" },
  { code: "117", nome: "Advanced Corretora de Câmbio Ltda." },
  { code: "119", nome: "Banco Western Union do Brasil S.A." },
  { code: "120", nome: "Banco Rodobens S.A." },
  { code: "121", nome: "Banco Agibank S.A." },
  { code: "125", nome: "Banco Genial S.A." },
  { code: "128", nome: "Banco BS2 S.A." },
  { code: "144", nome: "Bexs Banco de Câmbio S.A." },
  { code: "184", nome: "Banco Itaú BBA S.A." },
  { code: "197", nome: "Stone Pagamentos S.A." },
  { code: "204", nome: "Banco Bradesco Cartões S.A." },
  { code: "208", nome: "Banco BTG Pactual S.A." },
  { code: "212", nome: "Banco Original S.A." },
  { code: "213", nome: "Banco Arbi S.A." },
  { code: "217", nome: "Banco John Deere S.A." },
  { code: "222", nome: "Banco Credit Agricole Brasil S.A." },
  { code: "224", nome: "Banco Fibra S.A." },
  { code: "237", nome: "Banco Bradesco S.A." },
  { code: "243", nome: "Banco Master S.A." },
  { code: "246", nome: "Banco ABC Brasil S.A." },
  { code: "260", nome: "Nubank Pagamentos S.A." },
  { code: "265", nome: "Banco Fator S.A." },
  { code: "290", nome: "PagSeguro Internet S.A." },
  { code: "318", nome: "Banco BMG S.A." },
  { code: "323", nome: "Mercado Pago Instituição de Pagamento Ltda." },
  { code: "325", nome: "Órama Distribuidora de Títulos e Valores Mobiliários S.A." },
  { code: "335", nome: "Banco Digio S.A." },
  { code: "336", nome: "Banco C6 S.A." },
  { code: "340", nome: "Super Pagamentos S.A." },
  { code: "341", nome: "Banco Itaú Unibanco S.A." },
  { code: "348", nome: "Banco XP S.A." },
  { code: "359", nome: "Zema Crédito Financiamento e Investimento S.A." },
  { code: "364", nome: "Gerencianet Pagamentos do Brasil Ltda." },
  { code: "380", nome: "PicPay Bank — Banco Múltiplo S.A." },
  { code: "412", nome: "Banco Capital S.A." },
  { code: "422", nome: "Banco Safra S.A." },
  { code: "623", nome: "Banco Pan S.A." },
  { code: "633", nome: "Banco Rendimento S.A." },
  { code: "637", nome: "Banco Sofisa S.A." },
  { code: "643", nome: "Banco Pine S.A." },
  { code: "655", nome: "Banco Votorantim S.A." },
  { code: "707", nome: "Banco Daycoval S.A." },
  { code: "739", nome: "Banco Cetelem S.A." },
  { code: "743", nome: "Banco Semear S.A." },
  { code: "745", nome: "Banco Citibank S.A." },
  { code: "746", nome: "Banco Modal S.A." },
  { code: "747", nome: "Banco Rabobank International Brasil S.A." },
  { code: "748", nome: "Banco Cooperativo Sicredi S.A." },
  { code: "752", nome: "Banco BNP Paribas Brasil S.A." },
  { code: "756", nome: "Banco Cooperativo do Brasil S.A. — Bancoob / Sicoob" },
];

export const BANCOS_BRASIL: readonly BancoBrasil[] = [...ENTRIES].sort((a, b) => {
  const na = parseInt(a.code, 10);
  const nb = parseInt(b.code, 10);
  if (na !== nb) return na - nb;
  return a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" });
});

/** Filtra por código ou trecho do nome; valor já escolhido (`123 — Nome`) continua reconhecível */
export function filtrarBancos(query: string, lista: readonly BancoBrasil[] = BANCOS_BRASIL): BancoBrasil[] {
  const raw = query.trim();
  if (!raw) return [...lista];

  const picked = raw.match(/^(\d{3})\s*—\s*(.+)$/);
  if (picked) {
    const code = picked[1]!;
    const nome = picked[2]!.trim();
    return lista.filter((b) => b.code === code && b.nome === nome);
  }

  const qt = raw.toLowerCase();
  const digits = raw.replace(/\D/g, "").slice(0, 3);
  return lista.filter((b) => {
    if (b.nome.toLowerCase().includes(qt)) return true;
    if (digits.length > 0 && b.code.startsWith(digits)) return true;
    return false;
  });
}
