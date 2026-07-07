/**
 * Sincroniza mensalidades pendentes/inadimplentes com o Mercado Pago (todas as entidades).
 * Rede de segurança quando o webhook do MP atrasa ou falha.
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sincronizarMensalidadesPendentesEntidade } from "@/lib/mensalidadeMercadoPagoSync";

export type RunMensalidadesMpSyncResult = {
  sellers: number;
  fornecedores: number;
  pagas: number;
};

export async function runMensalidadesMpSyncTodasEntidades(): Promise<RunMensalidadesMpSyncResult> {
  const mpToken = process.env.MERCADOPAGO_ACCESS_TOKEN?.trim();
  if (!mpToken) {
    return { sellers: 0, fornecedores: 0, pagas: 0 };
  }

  const { data: rows, error } = await supabaseAdmin
    .from("financial_mensalidades")
    .select("tipo, entidade_id")
    .in("status", ["pendente", "inadimplente"]);

  if (error) {
    console.error("[runMensalidadesMpSync] list:", error.message);
    return { sellers: 0, fornecedores: 0, pagas: 0 };
  }

  const sellers = new Set<string>();
  const fornecedores = new Set<string>();
  for (const r of rows ?? []) {
    if (r.tipo === "seller") sellers.add(r.entidade_id as string);
    else if (r.tipo === "fornecedor") fornecedores.add(r.entidade_id as string);
  }

  let pagas = 0;
  for (const id of sellers) {
    pagas += await sincronizarMensalidadesPendentesEntidade("seller", id);
  }
  for (const id of fornecedores) {
    pagas += await sincronizarMensalidadesPendentesEntidade("fornecedor", id);
  }

  return { sellers: sellers.size, fornecedores: fornecedores.size, pagas };
}
