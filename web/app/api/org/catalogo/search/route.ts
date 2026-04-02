import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const getUrl = () =>
  process.env.NEXT_PUBLIC_SUPABASE_URL!;
const getAnonKey = () =>
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const getServiceKey = () =>
  process.env.SUPABASE_SERVICE_ROLE_KEY!;

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
      return NextResponse.json(
        { error: "Configuração Supabase ausente" },
        { status: 500 }
      );
    }

    let user: { id: string } | null = null;

    // 1) Tentar token no header (cliente envia session.access_token)
    const bearerToken = getBearerToken(req);
    if (bearerToken) {
      const supabaseAnon = createClient(url, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: u, error } = await supabaseAnon.auth.getUser(bearerToken);
      if (!error && u?.user) user = u.user;
    }

    // 2) Se não tiver user, tentar sessão nos cookies — usa getUser() para validar no servidor
    if (!user) {
      const cookieStore = await cookies();
      const supabaseAuth = createServerClient(url, anonKey, {
        cookies: {
          get(name) {
            return cookieStore.get(name)?.value;
          },
        },
      });
      // getUser() valida o JWT no servidor Supabase (não apenas decodifica localmente)
      const { data: userData, error: authErr } = await supabaseAuth.auth.getUser();
      if (!authErr && userData?.user) {
        user = userData.user;
      }
    }

    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const qRaw = (searchParams.get("q") || "").trim();
    const q = qRaw.slice(0, 200).replace(/[%_\\]/g, ""); // limita tamanho e remove curingas do LIKE
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
      .select(
        "id, sku, nome_produto, cor, tamanho, status, fornecedor_id, estoque_atual, estoque_minimo, custo_base, custo_dropcore, categoria, dimensoes_pacote, comprimento_cm, largura_cm, altura_cm, peso_kg"
      )
      .eq("org_id", orgId)
      .order("sku", { ascending: true })
      .limit(500);

    if (fornecedorId) {
      query = query.eq("fornecedor_id", fornecedorId);
    }
    if (q) {
      query = query.or(
        `sku.ilike.%${q}%,nome_produto.ilike.%${q}%,cor.ilike.%${q}%,tamanho.ilike.%${q}%`
      );
    }

    const { data, error } = await query;
    if (error) throw error;

    const rawItems = data ?? [];
    const items =
      isOperacional
        ? rawItems.map((row: Record<string, unknown>) => {
            const { custo_base: _, ...rest } = row;
            return rest;
          })
        : rawItems;

    return NextResponse.json({
      ok: true,
      items,
      count: items.length,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
