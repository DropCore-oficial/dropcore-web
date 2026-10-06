import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/** Mesmo padrão de `sellerSessionAuth.ts`, mas pro assinante avulso (`calculadora_assinantes`). */
export async function getAssinanteFromToken(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return null;

  const sbAnon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  );
  const { data: userData, error: userErr } = await sbAnon.auth.getUser(token);
  if (userErr || !userData?.user) return null;

  const { data: assinante } = await supabaseAdmin
    .from("calculadora_assinantes")
    .select("id, user_id, ativo, inclui_gestores_ia")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  return assinante;
}
