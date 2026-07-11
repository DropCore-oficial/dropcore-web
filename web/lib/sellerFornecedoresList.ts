import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { MESES_MINIMOS_COM_FORNECEDOR, dataMinimaTrocaFornecedor, podeTrocarFornecedorAgora } from "@/lib/sellerFornecedorVinculo";
import { mapFornecedorRowSellerPublico } from "@/lib/mapFornecedorSellerPublico";

export type SellerFornecedoresList = {
  fornecedores: ReturnType<typeof mapFornecedorRowSellerPublico>[];
  fornecedor_conectado_id: string | null;
  vinculo: {
    fornecedor_id: string | null;
    vinculado_em: string | null;
    pode_trocar_agora: boolean;
    pode_trocar_fornecedor_a_partir_de: string | null;
    meses_minimos: number;
    liberado_antecipado: boolean;
  };
};

export type SellerFornecedorVinculoMeta = {
  fornecedor_conectado_id: string | null;
  fornecedor_vinculado_em: string | null;
  fornecedor_desvinculo_liberado: boolean;
};

/** `sellers.fornecedor_id` + metadados de vínculo — com fallback pra bancos ainda sem as colunas novas. */
export async function loadSellerFornecedorVinculoMeta(sellerId: string): Promise<SellerFornecedorVinculoMeta> {
  let fornecedor_conectado_id: string | null = null;
  let fornecedor_vinculado_em: string | null = null;
  let fornecedor_desvinculo_liberado = false;
  try {
    const { data: s2, error: s2e } = await supabaseAdmin
      .from("sellers")
      .select("fornecedor_id, fornecedor_vinculado_em, fornecedor_desvinculo_liberado")
      .eq("id", sellerId)
      .maybeSingle();
    if (s2e && (s2e.message?.includes("column") || s2e.code === "42703")) {
      const { data: s3 } = await supabaseAdmin.from("sellers").select("fornecedor_id").eq("id", sellerId).maybeSingle();
      fornecedor_conectado_id = (s3 as { fornecedor_id?: string | null } | null)?.fornecedor_id ?? null;
    } else {
      const row = s2 as {
        fornecedor_id?: string | null;
        fornecedor_vinculado_em?: string | null;
        fornecedor_desvinculo_liberado?: boolean | null;
      } | null;
      fornecedor_conectado_id = row?.fornecedor_id ?? null;
      fornecedor_vinculado_em = row?.fornecedor_vinculado_em ?? null;
      fornecedor_desvinculo_liberado = Boolean(row?.fornecedor_desvinculo_liberado);
    }
  } catch {
    // coluna fornecedor_id pode não existir ainda
  }
  return { fornecedor_conectado_id, fornecedor_vinculado_em, fornecedor_desvinculo_liberado };
}

/** Lista pública de fornecedores da org (sem CNPJ/e-mail/telefone) + vínculo atual do seller. */
export async function loadSellerFornecedoresList(
  orgId: string,
  fornecedorConectadoId: string | null,
  fornecedorVinculadoEm: string | null,
  fornecedorDesvinculoLiberado: boolean
): Promise<SellerFornecedoresList> {
  const selectTries: string[] = [
    "id, nome, nome_exibicao, status, premium, endereco_cidade, endereco_uf, expedicao_cidade, expedicao_uf, criado_em, sla_postagem_dias, janela_validacao_dias",
    "id, nome, status, premium, endereco_cidade, endereco_uf, expedicao_cidade, expedicao_uf, criado_em, sla_postagem_dias, janela_validacao_dias",
    "id, nome, status, premium, endereco_cidade, endereco_uf, expedicao_cidade, expedicao_uf",
    "id, nome, status, premium, endereco_cidade, endereco_uf",
    "id, nome, status",
  ];

  let rawRows: Record<string, unknown>[] = [];
  let lastErr: Error | null = null;
  for (const cols of selectTries) {
    const { data, error } = await supabaseAdmin
      .from("fornecedores")
      .select(cols)
      .eq("org_id", orgId)
      .order("nome", { ascending: true });
    if (!error) {
      rawRows = (data ?? []) as unknown as Record<string, unknown>[];
      lastErr = null;
      break;
    }
    lastErr = new Error(error.message);
    const colMissing = error.message?.includes("column") || error.code === "42703";
    if (!colMissing) throw lastErr;
  }
  if (lastErr && rawRows.length === 0) throw lastErr;

  const fornecedores = rawRows.map((r) => mapFornecedorRowSellerPublico(r));

  const podeTrocarAgora =
    !fornecedorConectadoId || podeTrocarFornecedorAgora(fornecedorVinculadoEm, fornecedorDesvinculoLiberado, false);
  const dataMinTroca = dataMinimaTrocaFornecedor(fornecedorVinculadoEm);

  return {
    fornecedores,
    fornecedor_conectado_id: fornecedorConectadoId,
    vinculo: {
      fornecedor_id: fornecedorConectadoId,
      vinculado_em: fornecedorVinculadoEm,
      pode_trocar_agora: podeTrocarAgora,
      pode_trocar_fornecedor_a_partir_de: dataMinTroca?.toISOString() ?? null,
      meses_minimos: MESES_MINIMOS_COM_FORNECEDOR,
      liberado_antecipado: fornecedorDesvinculoLiberado,
    },
  };
}
