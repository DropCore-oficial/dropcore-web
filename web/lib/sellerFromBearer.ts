import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/** Campos que o seller edita no cadastro comercial; dados bancários ficam só no painel da organização, se forem usados. */
export const SELLER_AUTH_SELECT =
  "id, org_id, nome, documento, plano, email, telefone, cep, endereco, nome_responsavel, cpf_responsavel, data_nascimento, status";

export type SellerAuthRow = {
  id: string;
  org_id: string;
  nome: string | null;
  documento: string | null;
  plano?: string | null;
  email: string | null;
  telefone: string | null;
  cep: string | null;
  endereco: string | null;
  nome_responsavel: string | null;
  cpf_responsavel: string | null;
  data_nascimento: string | null;
  status: string;
};

export async function sellerFromBearer(req: Request): Promise<
  { error: string; user_id: null; seller: null } | { error: null; user_id: string; seller: SellerAuthRow }
> {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return { error: "Sem token de autenticação.", user_id: null, seller: null };

  const sbAnon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );
  const { data: userData, error: userErr } = await sbAnon.auth.getUser(token);
  if (userErr || !userData?.user) {
    return { error: "Token inválido ou expirado.", user_id: null, seller: null };
  }

  const user_id = userData.user.id;
  const { data: seller, error: sellerErr } = await supabaseAdmin
    .from("sellers")
    .select(SELLER_AUTH_SELECT)
    .eq("user_id", user_id)
    .maybeSingle();

  if (sellerErr || !seller) {
    return { error: "Seller não encontrado para este usuário.", user_id: null, seller: null };
  }
  if (seller.status === "bloqueado") {
    return { error: "Conta bloqueada. Entre em contato com o suporte.", user_id: null, seller: null };
  }

  return { error: null, user_id, seller: seller as SellerAuthRow };
}
