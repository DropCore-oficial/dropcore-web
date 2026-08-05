/** Resolve o user_id dono de um seller/fornecedor (sellers.user_id direto; fornecedor via org_members). */
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function getUserIdParaEntidade(
  tipo: "seller" | "fornecedor",
  entidadeId: string
): Promise<string | null> {
  if (tipo === "seller") {
    const { data } = await supabaseAdmin.from("sellers").select("user_id").eq("id", entidadeId).maybeSingle();
    return (data?.user_id as string | null) ?? null;
  }
  const { data } = await supabaseAdmin
    .from("org_members")
    .select("user_id")
    .eq("fornecedor_id", entidadeId)
    .limit(1)
    .maybeSingle();
  return (data?.user_id as string | null) ?? null;
}
