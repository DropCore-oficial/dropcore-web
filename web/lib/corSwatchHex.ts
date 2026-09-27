/** Mapa nome de cor (texto livre cadastrado pelo fornecedor) → hex/gradient pra swatch
 * visual. Fonte única — não duplicar em cada componente que precisa mostrar cor. */
export const CORES_HEX: Record<string, string> = {
  preto: "#1a1a1a",
  branco: "#f5f5f5",
  azul: "#2563eb",
  vermelho: "#dc2626",
  verde: "#16a34a",
  amarelo: "#eab308",
  rosa: "#ec4899",
  marrom: "#92400e",
  bege: "#d4b896",
  cinza: "#6b7280",
  laranja: "#ea580c",
  roxo: "#7c3aed",
  nude: "#e8d5c4",
  caramelo: "#c17a3d",
  estampado: "linear-gradient(135deg,#6366f1 25%,#ec4899 50%,#eab308 75%)",
};

/** Devolve o hex/gradient pra cor informada, ou um cinza neutro se não reconhecida. */
export function corParaHex(cor: string | null | undefined): string | undefined {
  const nome = (cor ?? "").trim().toLowerCase();
  if (!nome) return undefined;
  return CORES_HEX[nome] ?? "#94a3b8";
}
