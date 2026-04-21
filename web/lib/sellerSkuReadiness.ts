/**
 * Critérios práticos para anúncio + pedido via ERP alinhados ao cadastro no DropCore.
 * Tudo client-side a partir dos campos já expostos em GET /api/seller/catalogo.
 */

export type SkuReadinessRow = {
  nome_produto: string | null | undefined;
  imagem_url: string | null | undefined;
  link_fotos: string | null | undefined;
  custo_total: number | null | undefined;
  estoque_atual: number | null | undefined;
  comprimento_cm: number | null | undefined;
  largura_cm: number | null | undefined;
  altura_cm: number | null | undefined;
  dimensoes_pacote: string | null | undefined;
  ncm: string | null | undefined;
  descricao: string | null | undefined;
};

function s(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return "";
}

export type ReadinessCheck = { id: string; ok: boolean; label: string };

export function skuReadinessChecks(item: SkuReadinessRow): ReadinessCheck[] {
  const nome = s(item.nome_produto).trim();
  const temFoto = s(item.imagem_url).trim().length > 0 || s(item.link_fotos).trim().length > 0;
  const custo = item.custo_total;
  const custoOk = typeof custo === "number" && Number.isFinite(custo) && custo > 0;
  const est = item.estoque_atual;
  const estOk = typeof est === "number" && Number.isFinite(est) && est > 0;
  const temMedidas =
    item.comprimento_cm != null &&
    item.largura_cm != null &&
    item.altura_cm != null &&
    [item.comprimento_cm, item.largura_cm, item.altura_cm].every(
      (x) => typeof x === "number" && Number.isFinite(x) && (x as number) > 0,
    ) ||
    s(item.dimensoes_pacote).trim().length > 0;
  const ncmDigits = s(item.ncm).replace(/\D/g, "");
  const ncmOk = ncmDigits.length >= 8;
  const descOk = s(item.descricao).trim().length >= 20;

  return [
    { id: "nome", ok: nome.length > 0, label: "Nome do produto" },
    { id: "foto", ok: temFoto, label: "Foto ou link de fotos" },
    { id: "custo", ok: custoOk, label: "Custo (o que você paga)" },
    { id: "estoque", ok: estOk, label: "Estoque > 0" },
    { id: "medidas", ok: temMedidas, label: "Medidas do pacote" },
    { id: "ncm", ok: ncmOk, label: "NCM (8 dígitos)" },
    { id: "descricao", ok: descOk, label: "Descrição (mín. 20 caracteres)" },
  ];
}

export function skuProntoParaVender(item: SkuReadinessRow): boolean {
  return skuReadinessChecks(item).every((c) => c.ok);
}

export function skuReadinessLabelsFalha(item: SkuReadinessRow): string[] {
  return skuReadinessChecks(item).filter((c) => !c.ok).map((c) => c.label);
}
