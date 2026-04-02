/**
 * GET /api/org/calculadora/assinantes
 * Lista assinantes da calculadora para o admin.
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/apiOrgAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function supabaseService() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Faltou SUPABASE env.");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET(req: Request) {
  try {
    await requireAdmin(req);
    const supabase = supabaseService();

    const { data, error } = await supabase
      .from("calculadora_assinantes")
      .select("id, user_id, valido_ate, ativo")
      .order("valido_ate", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data || data.length === 0) {
      return NextResponse.json({ items: [] });
    }

    const userIds = Array.from(new Set(data.map((d) => d.user_id)));

    const { data: users, error: usersErr } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });

    if (usersErr) {
      return NextResponse.json({ error: usersErr.message }, { status: 500 });
    }

    const emailById = new Map<string, string | null>();
    users.users.forEach((u) => {
      if (userIds.includes(u.id)) {
        emailById.set(u.id, u.email ?? null);
      }
    });

    const now = Date.now();

    const items = data.map((a) => {
      const email = emailById.get(a.user_id) ?? null;
      const validoDate = new Date(a.valido_ate);
      const diffMs = validoDate.getTime() - now;
      const diasRestantes = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      const expirado = Number.isNaN(validoDate.getTime()) || validoDate.getTime() < now;

      return {
        id: a.id,
        user_id: a.user_id,
        email,
        valido_ate: a.valido_ate,
        ativo: a.ativo,
        dias_restantes: diasRestantes,
        expirado,
      };
    });

    return NextResponse.json({ items });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    const status = msg === "Unauthorized" || msg === "Usuário sem organização." ? 401 : msg === "Sem permissão." ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

