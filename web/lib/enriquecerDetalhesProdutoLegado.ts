/**
 * Preenche blocos de `detalhes_produto_json` a partir de colunas legadas (`descricao`, `expedicao_override_linha`, nome).
 */

import { parseExpedicaoPadraoLinha } from "@/lib/expedicaoFornecedorFormat";
import { tecidoFromTexto } from "@/lib/produtoTecidoInferencia";

function asRecord(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}

function filled(v: unknown): boolean {
  if (v == null) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (typeof v === "boolean") return true;
  if (typeof v === "number") return Number.isFinite(v);
  if (Array.isArray(v)) return v.length > 0;
  return false;
}

function tecidoDoNome(nome: string): string | null {
  const m = nome.match(/\btecido\s+([A-Za-zÀ-ú0-9][A-Za-zÀ-ú0-9\s-]{0,40})/i);
  if (m?.[1]) return m[1].trim();
  return null;
}

function guiadoFromDescricaoColuna(descricao: string | null | undefined): {
  diferencial?: string;
  indicacao?: string;
  observacoesSeller?: string;
} {
  const raw = String(descricao ?? "").trim();
  if (!raw || !raw.includes("|")) return {};
  const parts = raw.split(/\s+\|\s+/).map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return {};
  return {
    diferencial: parts[0],
    indicacao: parts[1],
    observacoesSeller: parts.length > 2 ? parts.slice(2).join(" | ") : undefined,
  };
}

export type SkuRowLegadoDetalhes = {
  nome_produto: string;
  descricao?: string | null;
  categoria?: string | null;
  marca?: string | null;
  data_lancamento?: string | null;
  expedicao_override_linha?: string | null;
};

/** Completa JSON ausente/parcial com dados já gravados nas colunas do SKU. */
export function enriquecerDetalhesProdutoLegado(
  detalhes: Record<string, unknown> | null,
  base: SkuRowLegadoDetalhes
): Record<string, unknown> {
  const out: Record<string, unknown> = detalhes ? { ...detalhes } : {};
  const infoBasica = { ...asRecord(out.infoBasica) };
  const guiado = { ...asRecord(out.guiado) };
  const caracteristicas = { ...asRecord(out.caracteristicas) };
  const logistica = { ...asRecord(out.logistica) };

  if (!filled(infoBasica.nomeProduto) && base.nome_produto.trim()) {
    infoBasica.nomeProduto = base.nome_produto.trim();
  }
  if (!filled(infoBasica.categoria) && base.categoria?.trim()) {
    infoBasica.categoria = base.categoria.trim();
  }
  if (!filled(infoBasica.marca) && base.marca?.trim()) {
    infoBasica.marca = base.marca.trim();
  }
  if (!filled(infoBasica.dataLancamento) && base.data_lancamento?.trim()) {
    infoBasica.dataLancamento = base.data_lancamento.trim().slice(0, 10);
  }

  const guiadoDesc = guiadoFromDescricaoColuna(base.descricao);
  if (!filled(guiado.diferencial) && guiadoDesc.diferencial) guiado.diferencial = guiadoDesc.diferencial;
  if (!filled(guiado.indicacao) && guiadoDesc.indicacao) guiado.indicacao = guiadoDesc.indicacao;
  if (!filled(guiado.observacoesSeller) && guiadoDesc.observacoesSeller) {
    guiado.observacoesSeller = guiadoDesc.observacoesSeller;
  }

  if (!filled(caracteristicas.tecido)) {
    const doNome = tecidoDoNome(base.nome_produto);
    const inferido = tecidoFromTexto(base.nome_produto, base.descricao ?? null);
    caracteristicas.tecido = doNome ?? inferido ?? caracteristicas.tecido;
  }

  const linhaExp = String(base.expedicao_override_linha ?? "").trim();
  if (linhaExp) {
    if (!filled(logistica.cdSaida)) logistica.cdSaida = linhaExp;
    const parsed = parseExpedicaoPadraoLinha(linhaExp);
    if (parsed) {
      if (!filled(logistica.cdSaidaCep) && parsed.expedicao_cep) logistica.cdSaidaCep = parsed.expedicao_cep;
      if (!filled(logistica.cdSaidaLogradouro) && parsed.expedicao_logradouro) {
        logistica.cdSaidaLogradouro = parsed.expedicao_logradouro;
      }
      if (!filled(logistica.cdSaidaNumero) && parsed.expedicao_numero) logistica.cdSaidaNumero = parsed.expedicao_numero;
      if (!filled(logistica.cdSaidaComplemento) && parsed.expedicao_complemento) {
        logistica.cdSaidaComplemento = parsed.expedicao_complemento;
      }
      if (!filled(logistica.cdSaidaBairro) && parsed.expedicao_bairro) logistica.cdSaidaBairro = parsed.expedicao_bairro;
      if (!filled(logistica.cdSaidaCidade) && parsed.expedicao_cidade) logistica.cdSaidaCidade = parsed.expedicao_cidade;
      if (!filled(logistica.cdSaidaUf) && parsed.expedicao_uf) logistica.cdSaidaUf = parsed.expedicao_uf;
      if (logistica.cdUsarDespachoCadastro == null) logistica.cdUsarDespachoCadastro = false;
    }
  }

  out.infoBasica = infoBasica;
  out.guiado = guiado;
  out.caracteristicas = caracteristicas;
  out.logistica = logistica;
  return out;
}
