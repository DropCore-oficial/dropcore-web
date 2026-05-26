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

function trimPart(s: string | null | undefined): string {
  return String(s ?? "").trim();
}

function structTemAlgumCampo(p: ExpedicaoEnderecoParts): boolean {
  return (
    trimPart(p.expedicao_cep).length > 0 ||
    trimPart(p.expedicao_logradouro).length > 0 ||
    trimPart(p.expedicao_numero).length > 0 ||
    trimPart(p.expedicao_complemento).length > 0 ||
    trimPart(p.expedicao_bairro).length > 0 ||
    trimPart(p.expedicao_cidade).length > 0 ||
    trimPart(p.expedicao_uf).length > 0
  );
}

function splitLogradouroNumero(ruaPart: string): { logradouro: string; numero: string } {
  const t = ruaPart.trim();
  const idx = t.lastIndexOf(",");
  if (idx > 0) {
    return { logradouro: t.slice(0, idx).trim(), numero: t.slice(idx + 1).trim() };
  }
  return { logradouro: t, numero: "" };
}

/** Linha única com CEP / cidade (cadastro antigo usa « - », o app novo usa « · »). */
function linhaPareceEnderecoFormatado(s: string): boolean {
  const t = s.trim();
  if (!t) return false;
  if (/cep\s*\d/i.test(t)) return true;
  if (t.includes("·")) return true;
  if (/\s-\s/.test(t) && t.split(/\s+-\s+/).length >= 3) return true;
  return false;
}

function segmentosDaLinhaEndereco(raw: string): string[] {
  const t = raw.trim();
  if (!t) return [];
  if (t.includes("·")) {
    return t
      .split(/\s*·\s*/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (/\s+-\s+/.test(t) && /cep\s*\d/i.test(t)) {
    return t
      .split(/\s+-\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [t];
}

/**
 * Interpreta `expedicao_padrao_linha` (formato « · » ou legado « - »).
 * Ex.: "RUA X, 123 · SALA · CENTRO · CEP 01310-100 · SAO PAULO/SP"
 * Ex.: "RUA MANDAGUARI, S/N - QUADRA 36 … - SETOR JARDIM MARISTA - CEP 75383-423 - TRINDADE/GO"
 */
export function parseExpedicaoPadraoLinha(linha: string): ExpedicaoEnderecoParts | null {
  const raw = linha.trim();
  if (!raw) return null;

  const segmentos = segmentosDaLinhaEndereco(raw);
  if (segmentos.length === 0) return null;

  let expedicao_cep = "";
  let expedicao_cidade = "";
  let expedicao_uf = "";
  const meio: string[] = [];

  for (const seg of segmentos) {
    const cepM = seg.match(/^CEP\s*(\d{5})-?(\d{3})$/i);
    if (cepM) {
      expedicao_cep = `${cepM[1]}${cepM[2]}`;
      continue;
    }
    const civ = seg.match(/^(.+?)\/([A-Za-z]{2})$/);
    if (civ && civ[2].length === 2) {
      expedicao_cidade = civ[1].trim();
      expedicao_uf = civ[2].toUpperCase();
      continue;
    }
    meio.push(seg);
  }

  if (meio.length === 0) {
    return {
      expedicao_cep,
      expedicao_logradouro: raw,
      expedicao_numero: "",
      expedicao_complemento: "",
      expedicao_bairro: "",
      expedicao_cidade,
      expedicao_uf,
    };
  }

  const { logradouro, numero } = splitLogradouroNumero(meio[0] ?? "");
  let expedicao_complemento = "";
  let expedicao_bairro = "";

  if (meio.length >= 3) {
    expedicao_complemento = meio[1] ?? "";
    expedicao_bairro = meio[2] ?? "";
  } else if (meio.length === 2) {
    expedicao_bairro = meio[1] ?? "";
  }

  return {
    expedicao_cep,
    expedicao_logradouro: logradouro,
    expedicao_numero: numero,
    expedicao_complemento,
    expedicao_bairro,
    expedicao_cidade,
    expedicao_uf,
  };
}

function enderecoParseadoTemDetalhe(r: ExpedicaoEnderecoParts): boolean {
  return Boolean(
    trimPart(r.expedicao_cep) ||
      trimPart(r.expedicao_bairro) ||
      trimPart(r.expedicao_cidade) ||
      trimPart(r.expedicao_complemento)
  );
}

function normalizarStruct(p: ExpedicaoEnderecoParts): ExpedicaoEnderecoParts {
  return {
    expedicao_cep: trimPart(p.expedicao_cep).replace(/\D/g, "").slice(0, 8) || null,
    expedicao_logradouro: trimPart(p.expedicao_logradouro) || null,
    expedicao_numero: trimPart(p.expedicao_numero) || null,
    expedicao_complemento: trimPart(p.expedicao_complemento) || null,
    expedicao_bairro: trimPart(p.expedicao_bairro) || null,
    expedicao_cidade: trimPart(p.expedicao_cidade) || null,
    expedicao_uf:
      trimPart(p.expedicao_uf)
        .toUpperCase()
        .replace(/[^A-Z]/g, "")
        .slice(0, 2) || null,
  };
}

/** Usa campos estruturados do fornecedor; se vazios, interpreta `expedicao_padrao_linha`. */
export function resolveExpedicaoEndereco(
  p: ExpedicaoEnderecoParts & { expedicao_padrao_linha?: string | null }
): ExpedicaoEnderecoParts {
  const leg = trimPart(p.expedicao_padrao_linha);
  const logStruct = trimPart(p.expedicao_logradouro);

  if (leg) {
    const parsed = parseExpedicaoPadraoLinha(leg);
    if (parsed && enderecoParseadoTemDetalhe(parsed)) {
      return normalizarStruct(parsed);
    }
  }

  if (linhaPareceEnderecoFormatado(logStruct)) {
    const parsed = parseExpedicaoPadraoLinha(logStruct);
    if (parsed) return normalizarStruct(parsed);
  }

  if (structTemAlgumCampo(p)) {
    const norm = normalizarStruct(p);
    if (!enderecoParseadoTemDetalhe(norm) && leg) {
      const parsed = parseExpedicaoPadraoLinha(leg);
      if (parsed && enderecoParseadoTemDetalhe(parsed)) return normalizarStruct(parsed);
    }
    return norm;
  }

  if (leg) {
    return normalizarStruct(
      parseExpedicaoPadraoLinha(leg) ?? {
        expedicao_cep: null,
        expedicao_logradouro: leg,
        expedicao_numero: null,
        expedicao_complemento: null,
        expedicao_bairro: null,
        expedicao_cidade: null,
        expedicao_uf: null,
      }
    );
  }

  return {
    expedicao_cep: null,
    expedicao_logradouro: null,
    expedicao_numero: null,
    expedicao_complemento: null,
    expedicao_bairro: null,
    expedicao_cidade: null,
    expedicao_uf: null,
  };
}

/** Partes normalizadas para formulários (criar variantes / cadastro). */
export type EnderecoCdFormParts = {
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
};

export function enderecoCdFormFromExpedicao(
  src: ExpedicaoEnderecoParts & { expedicao_padrao_linha?: string | null }
): EnderecoCdFormParts {
  const r = resolveExpedicaoEndereco(src);
  return {
    cep: String(r.expedicao_cep ?? "").replace(/\D/g, "").slice(0, 8),
    logradouro: String(r.expedicao_logradouro ?? "").trim(),
    numero: String(r.expedicao_numero ?? "").trim(),
    complemento: String(r.expedicao_complemento ?? "").trim(),
    bairro: String(r.expedicao_bairro ?? "").trim(),
    cidade: String(r.expedicao_cidade ?? "").trim(),
    uf: String(r.expedicao_uf ?? "")
      .replace(/[^A-Za-z]/g, "")
      .toUpperCase()
      .slice(0, 2),
  };
}

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
