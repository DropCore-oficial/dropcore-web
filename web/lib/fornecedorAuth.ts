import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAdmin } from "@/lib/apiOrgAuth";

/** Resolve o fornecedor_id do usuário autenticado (Bearer Supabase). */
export async function getFornecedorIdFromBearer(req: Request): Promise<string | null> {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return null;

  const sbAnon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );
  const { data: userData, error: userErr } = await sbAnon.auth.getUser(token);
  if (userErr || !userData?.user) return null;

  const { data: member } = await supabaseAdmin
    .from("org_members")
    .select("fornecedor_id")
    .eq("user_id", userData.user.id)
    .not("fornecedor_id", "is", null)
    .limit(1)
    .maybeSingle();

  return member?.fornecedor_id ?? null;
}

/** Resolve fornecedor_id + org_id do usuário autenticado (Bearer Supabase). */
export async function getFornecedorContextFromBearer(
  req: Request
): Promise<{ fornecedor_id: string; org_id: string; user_id: string } | null> {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return null;

  const sbAnon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );
  const { data: userData, error: userErr } = await sbAnon.auth.getUser(token);
  if (userErr || !userData?.user) return null;

  const { data: member } = await supabaseAdmin
    .from("org_members")
    .select("org_id, fornecedor_id")
    .eq("user_id", userData.user.id)
    .not("fornecedor_id", "is", null)
    .limit(1)
    .maybeSingle();

  if (!member?.fornecedor_id || !member.org_id) return null;
  return { fornecedor_id: member.fornecedor_id, org_id: member.org_id, user_id: userData.user.id };
}

/**
 * Resolve o contexto de produto (fornecedor_id/org_id) pros dois casos de quem pode usar o
 * assistente de cadastro/edição: o próprio fornecedor logado (comportamento de sempre,
 * `fornecedor_id` vem da sessão) OU um admin da org agindo EM NOME de um fornecedor
 * escolhido por ele (achado 2026-11-24, Sr Stark: admin precisa da mesma tela completa que
 * o fornecedor usa, não só campos soltos — ver `docs/SCHEMA.md`). Admin manda o fornecedor
 * escolhido via header `x-fornecedor-id` (nunca lido de dentro de um token de fornecedor —
 * isso seria deixar um fornecedor agir como outro; só é usado quando o bearer NÃO resolve
 * como fornecedor). `org_id` nunca vem do cliente — sempre da membership real do admin.
 */
export async function resolverFornecedorContexto(
  req: Request,
  fornecedorIdExplicito?: string | null
): Promise<{ fornecedor_id: string; org_id: string; user_id: string; via: "fornecedor" | "admin" } | null> {
  const comoFornecedor = await getFornecedorContextFromBearer(req);
  if (comoFornecedor) return { ...comoFornecedor, via: "fornecedor" };

  const fornecedorId = fornecedorIdExplicito ?? req.headers.get("x-fornecedor-id");
  if (!fornecedorId) return null;

  let admin: { user_id: string; org_id: string };
  try {
    const me = await requireAdmin(req);
    admin = { user_id: me.user_id, org_id: me.org_id };
  } catch {
    return null;
  }

  const { data: forn } = await supabaseAdmin
    .from("fornecedores")
    .select("id")
    .eq("id", fornecedorId)
    .eq("org_id", admin.org_id)
    .maybeSingle();
  if (!forn) return null;

  return { fornecedor_id: fornecedorId, org_id: admin.org_id, user_id: admin.user_id, via: "admin" };
}
