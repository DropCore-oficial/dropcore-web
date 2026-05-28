import { strSellerCatalogo as str } from "@/components/seller/SellerCatalogoGrupoUi";
import { tecidoFromTexto } from "@/lib/produtoTecidoInferencia";

export function resumoDescricao(v: string | null, max = 90): string | null {
  const s = str(v).trim().replace(/\s+/g, " ");
  if (!s) return null;
  if (s.length <= max) return s;
  return `${s.slice(0, max).trimEnd()}…`;
}

export { tecidoFromTexto };
