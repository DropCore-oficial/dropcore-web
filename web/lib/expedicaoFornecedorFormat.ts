/** Partes do endereço de despacho / CD padrão (fornecedores). */
export type ExpedicaoEnderecoParts = {
  expedicao_cep: string | null | undefined;
  expedicao_logradouro: string | null | undefined;
  expedicao_numero: string | null | undefined;
  expedicao_complemento: string | null | undefined;
  expedicao_bairro: string | null | undefined;
  expedicao_cidade: string | null | undefined;
  expedicao_uf: string | null | undefined;
};

/** Gera `expedicao_padrao_linha` legível para integrações / regra «um CD por envio». */
export function buildExpedicaoPadraoLinha(p: ExpedicaoEnderecoParts): string | null {
  const cep = String(p.expedicao_cep ?? "").replace(/\D/g, "").slice(0, 8);
  const log = String(p.expedicao_logradouro ?? "").trim();
  const num = String(p.expedicao_numero ?? "").trim();
  const comp = String(p.expedicao_complemento ?? "").trim();
  const bai = String(p.expedicao_bairro ?? "").trim();
  const cid = String(p.expedicao_cidade ?? "").trim();
  const uf = String(p.expedicao_uf ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 2);

  const parts: string[] = [];
  const rua = [log, num].filter(Boolean).join(", ");
  if (rua) parts.push(rua);
  if (comp) parts.push(comp);
  if (bai) parts.push(bai);
  if (cep.length === 8) parts.push(`CEP ${cep.slice(0, 5)}-${cep.slice(5)}`);
  if (cid || uf) parts.push([cid, uf].filter(Boolean).join("/"));
  const line = parts.join(" · ").trim();
  return line.length ? line.slice(0, 4000) : null;
}
