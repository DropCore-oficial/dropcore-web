/** Infere tipo de tecido a partir do nome/descrição do produto. */
export function tecidoFromTexto(nome: string, descricao: string | null): string | null {
  const base = `${nome} ${String(descricao ?? "").trim()}`.toLowerCase();
  const mapa: Array<{ rx: RegExp; label: string }> = [
    { rx: /poli[eé]ster/, label: "Poliéster" },
    { rx: /algod[aã]o/, label: "Algodão" },
    { rx: /viscose/, label: "Viscose" },
    { rx: /linho/, label: "Linho" },
    { rx: /elastano/, label: "Elastano" },
    { rx: /malha/, label: "Malha" },
    { rx: /moletom/, label: "Moletom" },
    { rx: /jeans|denim/, label: "Jeans" },
  ];
  for (const it of mapa) {
    if (it.rx.test(base)) return it.label;
  }
  return null;
}
