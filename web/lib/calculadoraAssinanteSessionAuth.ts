import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type AssinanteRow = { id: string; user_id: string; ativo: boolean; inclui_gestores_ia: boolean };

/** Mesmo padrão de `sellerSessionAuth.ts`, mas pro assinante avulso (`calculadora_assinantes`).
 * Leitura via RPC (fn_calculadora_assinante_por_user_id, 2026-10-07) — ver docs/SCHEMA.md
 * "Ulisses avulso ... 1º uso real de RPC". */
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

  const { data: assinante } = await supabaseAdmin.rpc("fn_calculadora_assinante_por_user_id", {
    p_user_id: userData.user.id,
  });

  return (assinante as AssinanteRow | null) ?? null;
}
