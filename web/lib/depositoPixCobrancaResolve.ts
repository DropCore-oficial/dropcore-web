import { createClient, type User } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type DepositoCobrancaCtx =
  | {
      ok: true;
      org_id: string;
      seller_id: string;
      email: string;
      deposito: { id: string; valor: number; status: string; metodo: string };
    }
  | { ok: false; status: number; error: string };

/** Resolve autenticação + posse de um `seller_depositos_pix` pendente, pra cobrança via cartão. */
export async function resolveDepositoCobranca(
  token: string | null,
  depositoId: string,
): Promise<DepositoCobrancaCtx> {
  if (!token) {
    return { ok: false, status: 401, error: "Sem token de autenticação." };
  }

  const sbAnon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  );
  const { data: userData, error: userErr } = await sbAnon.auth.getUser(token);
  if (userErr || !userData?.user) {
    return { ok: false, status: 401, error: "Token inválido ou expirado." };
  }
  const user = userData.user as User;

  const { data: seller } = await supabaseAdmin
    .from("sellers")
    .select("id, org_id, email")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!seller) {
    return { ok: false, status: 404, error: "Seller não encontrado." };
  }

  const email = (seller.email?.trim() || user.email?.trim() || "").toLowerCase();
  if (!email) {
    return { ok: false, status: 400, error: "E-mail não cadastrado. Atualize seus dados para pagar com cartão." };
  }

  const { data: d, error: dErr } = await supabaseAdmin
    .from("seller_depositos_pix")
    .select("id, valor, status, metodo")
    .eq("id", depositoId)
    .eq("seller_id", seller.id)
    .maybeSingle();

  if (dErr || !d) {
    return { ok: false, status: 404, error: "Recarga não encontrada." };
  }
  if (d.status !== "pendente") {
    return { ok: false, status: 400, error: "Esta recarga já foi processada." };
  }
  if (d.metodo !== "cartao") {
    return { ok: false, status: 400, error: "Esta recarga não está configurada para cartão." };
  }

  return {
    ok: true,
    org_id: seller.org_id,
    seller_id: seller.id,
    email,
    deposito: { id: d.id, valor: Number(d.valor), status: d.status, metodo: d.metodo },
  };
}
