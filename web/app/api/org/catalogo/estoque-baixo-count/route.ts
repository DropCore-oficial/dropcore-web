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

/** SKUs desse prefixo são de grupo oculto (não contamos no aviso) */
const PREFIXO_OCULTO = "DJU999";

export async function GET(req: Request) {
  try {
    const url = getUrl();
    const anonKey = getAnonKey();
    const serviceKey = getServiceKey();
    if (!url || !anonKey || !serviceKey) {
      return NextResponse.json(
        { error: "Configuração Supabase ausente" },
        { status: 500 }
      );
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
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
        },
      });
      const { data: sessionData, error: authErr } =
        await supabaseAuth.auth.getSession();
      if (!authErr && sessionData?.session?.user) {
        user = sessionData.session.user;
      }
    }

    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const orgId = (searchParams.get("orgId") || "").trim();
    const fornecedorId = (searchParams.get("fornecedorId") || "").trim();

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

    if (memErr) {
      return NextResponse.json(
        { error: "Erro ao verificar permissões" },
        { status: 500 }
      );
    }

    const role = member?.role_base;
    const isAdmin = member && ["owner", "admin"].includes(role ?? "");
    const isOperacional = member && role === "operacional";
    if (!member || (!isAdmin && !isOperacional)) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }

    let query = supabaseAdmin
      .from("skus")
      .select("id, sku, estoque_atual, estoque_minimo")
      .eq("org_id", orgId)
      .not("sku", "ilike", `${PREFIXO_OCULTO}%`)
      .limit(2000);

    if (fornecedorId) {
      query = query.eq("fornecedor_id", fornecedorId);
    }

    const { data: rows, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const count = (rows ?? []).filter((row: { estoque_atual: number | null; estoque_minimo: number | null }) => {
      const atual = row.estoque_atual;
      const min = row.estoque_minimo;
      return min != null && atual != null && Number(atual) < Number(min);
    }).length;

    return NextResponse.json({ count });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
