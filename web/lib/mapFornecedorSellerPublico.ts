import { nomePublicoFornecedor } from "@/lib/sellerCatalogoPrivacidade";

export type FornecedorSellerListaRow = {
  id: string;
  nome_publico: string;
  status: string | null;
  premium: boolean | null;
  local_resumido: string | null;
};

/** Resposta GET /api/seller/fornecedores → linhas tipadas */
export function normalizarFornecedoresSellerApi(raw: unknown): FornecedorSellerListaRow[] {
  if (!Array.isArray(raw)) return [];
  return (raw as Record<string, unknown>[]).map((r) => ({
    id: String(r.id ?? ""),
    nome_publico: String(r.nome_publico ?? r.nome ?? "").trim() || "Armazém",
    status: r.status != null ? String(r.status) : null,
    premium: typeof r.premium === "boolean" ? r.premium : null,
    local_resumido: r.local_resumido != null ? String(r.local_resumido) : null,
  }));
}

/** Linha vinda do Supabase (lista) → payload seguro para o painel seller */
export function mapFornecedorRowSellerPublico(row: Record<string, unknown>) {
  const cidade = row.endereco_cidade != null ? String(row.endereco_cidade).trim() : "";
  const uf = row.endereco_uf != null ? String(row.endereco_uf).trim() : "";
  const local = [cidade, uf].filter(Boolean).join("/");
  return {
    id: String(row.id ?? ""),
    nome_publico: nomePublicoFornecedor({
      nome_exibicao: row.nome_exibicao as string | null | undefined,
      nome: row.nome as string | null | undefined,
    }),
    status: row.status != null ? String(row.status) : null,
    premium: typeof row.premium === "boolean" ? row.premium : null,
    local_resumido: local || null,
  };
}
