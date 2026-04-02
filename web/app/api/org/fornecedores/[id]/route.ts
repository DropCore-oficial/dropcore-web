import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const getUrl = () => process.env.NEXT_PUBLIC_SUPABASE_URL!;
const getAnonKey = () => process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const getServiceKey = () => process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getBearerToken(req: Request): string | null {
  const auth = req.headers.get("authorization") || "";
  return auth.startsWith("Bearer ") ? auth.slice(7) : null;
}

async function requireOwnerOrAdmin(req: Request) {
  const url = getUrl();
  const anonKey = getAnonKey();
  const serviceKey = getServiceKey();
  if (!url || !anonKey || !serviceKey) throw new Error("Configuração Supabase ausente");

  let user: { id: string } | null = null;
  const bearerToken = getBearerToken(req);
  if (bearerToken) {
    const supabaseAnon = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: u, error } = await supabaseAnon.auth.getUser(bearerToken);
    if (!error && u?.user) user = u.user;
  }
  if (!user) {
    const cookieStore = await cookies();
    const supabaseAuth = createServerClient(url, anonKey, {
      cookies: { get(name) { return cookieStore.get(name)?.value; } },
    });
    const { data: sessionData, error: authErr } = await supabaseAuth.auth.getSession();
    if (!authErr && sessionData?.session?.user) user = sessionData.session.user;
  }
  if (!user) throw new Error("Não autenticado");

  const { searchParams } = new URL(req.url);
  const orgId = (searchParams.get("orgId") || "").trim();
  if (!orgId) throw new Error("orgId é obrigatório");

  const supabaseAdmin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: member, error: memErr } = await supabaseAdmin
    .from("org_members")
    .select("role_base")
    .eq("org_id", orgId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (memErr || !member || !["owner", "admin"].includes(member?.role_base ?? "")) {
    throw new Error("Sem permissão");
  }

  return { supabaseAdmin, orgId };
}

/**
 * PATCH /api/org/fornecedores/[id]?orgId=...
 * body: { premium?: boolean }
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { supabaseAdmin, orgId } = await requireOwnerOrAdmin(req);
    const { id } = await params;
    if (!id) return NextResponse.json({ error: "id é obrigatório" }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    const premiumRaw = body?.premium;
    if (typeof premiumRaw !== "boolean") {
      return NextResponse.json({ error: "Envie { premium: boolean }" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("fornecedores")
      .update({ premium: premiumRaw })
      .eq("id", id)
      .eq("org_id", orgId)
      .select("id, premium")
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "Fornecedor não encontrado" }, { status: 404 });

    return NextResponse.json({ ok: true, id: data.id, premium: data.premium });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    const status = msg === "Não autenticado" ? 401 : msg === "Sem permissão" ? 403 : msg === "orgId é obrigatório" ? 400 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

