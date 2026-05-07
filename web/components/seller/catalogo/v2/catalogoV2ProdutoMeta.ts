import { strSellerCatalogo as str } from "@/components/seller/SellerCatalogoGrupoUi";

export function resumoDescricao(v: string | null, max = 90): string | null {
  const s = str(v).trim().replace(/\s+/g, " ");
  if (!s) return null;
  if (s.length <= max) return s;
  return `${s.slice(0, max).trimEnd()}…`;
}

export function tecidoFromTexto(nome: string, descricao: string | null): string | null {
  const base = `${nome} ${str(descricao)}`.toLowerCase();
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
