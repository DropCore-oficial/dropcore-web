/** Cores e tamanhos usados nas telas de criar/editar produto (fornecedor). */
export const CORES_PREDEFINIDAS = [
  "Preto", "Branco", "Vermelho", "Verde", "Cinza", "Marrom", "Rosa", "Laranja",
  "Vinho Tinto", "Branco Leitoso", "Azul Escuro", "Roxo", "Azul", "Amarelo", "Bege",
] as const;

export const TAMANHOS_PREDEFINIDOS = [
  "PP", "P", "M", "G", "GG", "L", "XL", "XXL", "XXXL", "Único",
] as const;

/** Ordem estável para listar tamanhos (PP… depois extras). */
export function ordenarTamanhosLista(tams: string[]): string[] {
  const ordem = new Map(TAMANHOS_PREDEFINIDOS.map((t, i) => [t.toUpperCase(), i]));
  return [...tams].sort((a, b) => {
    const ia = ordem.get(a.toUpperCase()) ?? 999;
    const ib = ordem.get(b.toUpperCase()) ?? 999;
    if (ia !== ib) return ia - ib;
    return a.localeCompare(b, undefined, { numeric: true });
  });
}

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

type SelectOption = { readonly value: string; readonly label: string };

/** Valor de enum/select → rótulo legível (seller e fornecedor no resumo expandido). */
export function labelCaracteristicaValor(
  options: readonly SelectOption[],
  value: unknown
): string {
  if (value == null) return "";
  const s = String(value).trim();
  if (!s) return "";
  const hit = options.find((o) => o.value === s);
  return hit?.label ?? s;
}

export function formatOcasioesCaracteristicas(ocasioes: unknown): string {
  if (!Array.isArray(ocasioes)) return "";
  return ocasioes
    .filter((x): x is string => typeof x === "string")
    .map((raw) => {
      const s = raw.trim();
      if (!s) return "";
      const hit = ocasiaoOptions.find(
        (o) => o.value === s || o.label.localeCompare(s, "pt-BR", { sensitivity: "accent" }) === 0
      );
      return hit?.label ?? s;
    })
    .filter(Boolean)
    .join(", ");
}

export function formatAmassaCaracteristica(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  return "";
}
