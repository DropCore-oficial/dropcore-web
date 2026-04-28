/** Cores e tamanhos usados nas telas de criar/editar produto (fornecedor). */
export const CORES_PREDEFINIDAS = [
  "Preto", "Branco", "Vermelho", "Verde", "Cinza", "Marrom", "Rosa", "Laranja",
  "Vinho Tinto", "Branco Leitoso", "Azul Escuro", "Roxo", "Azul", "Amarelo", "Bege",
] as const;

export const TAMANHOS_PREDEFINIDOS = [
  "PP", "P", "M", "G", "GG", "L", "XL", "XXL", "XXXL", "Único",
] as const;

export const caimentoOptions = [
  { value: "slim", label: "Slim" },
  { value: "regular", label: "Regular" },
  { value: "oversized", label: "Oversized" },
] as const;

export const elasticidadeOptions = [
  { value: "baixa", label: "Baixa" },
  { value: "media", label: "Média" },
  { value: "alta", label: "Alta" },
] as const;

export const transparenciaOptions = [
  { value: "nao", label: "Não" },
  { value: "leve", label: "Leve" },
  { value: "alta", label: "Alta" },
] as const;

export const climaOptions = [
  { value: "calor", label: "Calor" },
  { value: "frio", label: "Frio" },
  { value: "ambos", label: "Ambos" },
] as const;

export const ocasiaoOptions = [
  { value: "dia-a-dia", label: "Dia a dia" },
  { value: "trabalho", label: "Trabalho" },
  { value: "evento", label: "Evento" },
  { value: "casual", label: "Casual" },
] as const;

export const posicionamentoOptions = [
  { value: "basico", label: "Básico" },
  { value: "intermediario", label: "Intermediário" },
  { value: "premium", label: "Premium" },
] as const;
