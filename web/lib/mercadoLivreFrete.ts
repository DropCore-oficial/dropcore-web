/**
 * Tabela de frete Mercado Livre (Full) — faixa de preço × faixa de peso.
 * Colunas = faixas de preço (R$), Linhas = faixas de peso (kg).
 * Valores em R$ por envio.
 */

/** Limites superiores das faixas de preço (R$). Último = Infinity = "A partir de R$ 200" */
const FAIXAS_PRECO = [19, 49, 79, 100, 120, 150, 200, Infinity] as const;

/** Limites superiores das faixas de peso (kg). Ordem: até 0,3 → 0,3–0,5 → … → mais de 150 */
const FAIXAS_PESO = [
  0.3, 0.5, 1, 1.5, 2, 3, 4, 5, 6, 7, 8, 9, 11, 13, 15, 17, 20, 25, 30, 40, 50, 60, 70, 80, 90, 100, 125, 150, Infinity,
] as const;

/**
 * Tabela [pesoIndex][precoIndex] = valor R$ frete.
 * Linha 0 = até 0,3 kg; Coluna 0 = R$ 0–18,99; Coluna 7 = a partir de R$ 200.
 * Fonte: tabela oficial ML (ajustar valores se necessário).
 */
const TABELA_FRETE_ML: number[][] = [
  [5.65, 6.55, 7.75, 12.35, 14.35, 16.45, 18.45, 20.95],   // até 0,3 kg
  [5.95, 6.65, 7.85, 13.25, 15.45, 17.65, 19.85, 22.55],   // 0,3–0,5
  [6.25, 6.95, 8.25, 13.95, 16.25, 18.55, 20.85, 23.75],   // 0,5–1
  [6.55, 7.25, 8.65, 14.65, 17.05, 19.45, 21.95, 24.95],   // 1–1,5
  [6.85, 7.55, 9.05, 15.35, 17.85, 20.35, 22.95, 26.15],   // 1,5–2
  [7.45, 8.15, 9.75, 16.45, 19.15, 21.85, 24.65, 28.05],   // 2–3
  [8.05, 8.75, 10.45, 17.55, 20.45, 23.35, 26.35, 29.95],  // 3–4
  [8.65, 9.35, 11.15, 18.65, 21.75, 24.85, 28.05, 31.85],  // 4–5
  [9.25, 9.95, 11.85, 19.75, 23.05, 26.35, 29.75, 33.75],  // 5–6
  [9.85, 10.55, 12.55, 20.85, 24.35, 27.85, 31.45, 35.65], // 6–7
  [10.45, 11.15, 13.25, 21.95, 25.65, 29.35, 33.15, 37.55], // 7–8
  [11.05, 11.75, 13.95, 23.05, 26.95, 30.85, 34.85, 39.45], // 8–9
  [12.25, 12.95, 15.35, 25.25, 29.55, 33.85, 38.25, 43.25], // 9–11
  [13.45, 14.15, 16.75, 27.45, 32.15, 36.85, 41.65, 47.05], // 11–13
  [14.65, 15.35, 18.15, 29.65, 34.75, 39.85, 45.05, 50.85], // 13–15
  [15.85, 16.55, 19.55, 31.85, 37.35, 42.85, 48.45, 54.65], // 15–17
  [17.65, 18.35, 21.65, 35.25, 41.35, 47.45, 53.65, 60.45], // 17–20
  [20.05, 20.75, 24.45, 39.85, 46.75, 53.65, 60.65, 68.25], // 20–25
  [22.45, 23.15, 27.25, 44.45, 52.15, 59.85, 67.65, 76.05], // 25–30
  [27.25, 27.95, 32.85, 53.65, 62.95, 72.25, 81.65, 91.65], // 30–40
  [32.05, 32.75, 38.45, 62.85, 73.75, 84.65, 95.65, 107.25], // 40–50
  [36.85, 37.55, 44.05, 72.05, 84.55, 97.05, 109.65, 122.85], // 50–60
  [41.65, 42.35, 49.65, 81.25, 95.35, 109.45, 123.65, 138.45], // 60–70
  [46.45, 47.15, 55.25, 90.45, 106.15, 121.85, 137.65, 154.05], // 70–80
  [51.25, 51.95, 60.85, 99.65, 116.95, 134.25, 151.65, 169.65], // 80–90
  [56.05, 56.75, 66.45, 108.85, 127.75, 146.65, 165.65, 185.25], // 90–100
  [65.65, 66.35, 77.65, 127.25, 149.35, 171.45, 193.65, 216.45], // 100–125
  [75.25, 75.95, 88.85, 145.65, 170.95, 196.25, 221.65, 247.65], // 125–150
  [84.85, 85.55, 100.05, 164.05, 192.55, 221.05, 249.65, 278.85], // mais de 150
];

function getPrecoIndex(preco: number): number {
  for (let i = 0; i < FAIXAS_PRECO.length; i++) {
    if (preco < FAIXAS_PRECO[i]) return i;
  }
  return FAIXAS_PRECO.length - 1;
}

function getPesoIndex(pesoKg: number): number {
  if (pesoKg <= 0) return 0;
  for (let i = 0; i < FAIXAS_PESO.length; i++) {
    if (pesoKg <= FAIXAS_PESO[i]) return i;
  }
  return FAIXAS_PESO.length - 1;
}

/**
 * Retorna o custo de envio ML (R$) para um dado preço de venda e peso em kg.
 */
export function getFreteML(preco: number, pesoKg: number): number {
  const pi = getPrecoIndex(preco);
  const wi = getPesoIndex(pesoKg);
  const row = TABELA_FRETE_ML[wi];
  if (!row) return TABELA_FRETE_ML[0][pi]; // fallback
  return row[pi] ?? row[row.length - 1];
}
