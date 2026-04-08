import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/apiOrgAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const getUrl = () => process.env.NEXT_PUBLIC_SUPABASE_URL!;
const getAnonKey = () => process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const getServiceKey = () => process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getBearerToken(req: Request): string | null {
  const auth = req.headers.get("authorization") || "";
  return auth.startsWith("Bearer ") ? auth.slice(7) : null;
}

export async function GET(req: Request) {
  try {
    const url = getUrl();
    const anonKey = getAnonKey();
    const serviceKey = getServiceKey();
    if (!url || !anonKey || !serviceKey) {
      return NextResponse.json({ error: "Configuração Supabase ausente" }, { status: 500 });
    }

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
    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const orgId = (searchParams.get("orgId") || "").trim();
    if (!orgId) {
      return NextResponse.json({ error: "orgId é obrigatório" }, { status: 400 });
    }

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
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }

    const { data, error } = await supabaseAdmin
      .from("fornecedores")
      .select(
        "id, nome, org_id, status, premium, sla_postagem_dias, janela_validacao_dias, criado_em, cnpj, telefone, email_comercial"
      )
      .eq("org_id", orgId)
      .order("nome", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data ?? []);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro no GET /api/org/fornecedores";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * POST /api/org/fornecedores
 * Body: { nome: string }
 * Cria novo fornecedor na org. Apenas admin/owner.
 */
export async function POST(req: Request) {
  try {
    const { org_id } = await requireAdmin(req);
    const body = await req.json().catch(() => ({}));
    const nome = String(body?.nome ?? "").trim();
    if (!nome) {
      return NextResponse.json({ error: "Nome é obrigatório." }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("fornecedores")
      .insert({ org_id, nome, status: "ativo" })
      .select("id, nome, org_id, status, premium, criado_em")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    const status = msg === "Unauthorized" || msg === "Usuário sem organização." ? 401 : msg === "Sem permissão." ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
