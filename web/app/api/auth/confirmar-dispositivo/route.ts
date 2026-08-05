/**
 * POST /api/auth/confirmar-dispositivo
 * Valida o código de 6 dígitos e, se certo, marca este navegador como dispositivo
 * confiável (cookie httpOnly `dc_device`, 30 dias) — ver web/middleware.ts.
 * Body: { code: string }
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createHash, randomBytes } from "crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEVICE_COOKIE_NAME = "dc_device";
const DEVICE_VALIDADE_DIAS = 30;
const MAX_TENTATIVAS = 5;

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function getUserIdFromBearer(req: Request): Promise<string | null> {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return null;

  const sbAnon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );
  const { data, error } = await sbAnon.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user.id;
}

export async function POST(req: Request) {
  try {
    const userId = await getUserIdFromBearer(req);
    if (!userId) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const code = String(body?.code ?? "").trim();
    if (!/^\d{6}$/.test(code)) {
      return NextResponse.json({ error: "Código inválido." }, { status: 400 });
    }

    const { data: pendente, error: buscaErr } = await supabaseAdmin
      .from("login_verification_codes")
      .select("id, code_hash, tentativas, expira_em")
      .eq("user_id", userId)
      .eq("usado", false)
      .gt("expira_em", new Date().toISOString())
      .order("criado_em", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (buscaErr || !pendente) {
      return NextResponse.json(
        { error: "Código expirado ou não encontrado. Solicite um novo." },
        { status: 400 }
      );
    }

    if (pendente.code_hash !== hash(code)) {
      const tentativas = (pendente.tentativas ?? 0) + 1;
      const esgotou = tentativas >= MAX_TENTATIVAS;
      await supabaseAdmin
        .from("login_verification_codes")
        .update({ tentativas, usado: esgotou })
        .eq("id", pendente.id);
      return NextResponse.json(
        {
          error: esgotou
            ? "Muitas tentativas erradas. Solicite um novo código."
            : "Código incorreto.",
        },
        { status: 400 }
      );
    }

    await supabaseAdmin.from("login_verification_codes").update({ usado: true }).eq("id", pendente.id);

    const deviceToken = randomBytes(32).toString("hex");
    const expiraEm = new Date(Date.now() + DEVICE_VALIDADE_DIAS * 24 * 60 * 60 * 1000).toISOString();

    const { error: insErr } = await supabaseAdmin.from("trusted_devices").insert({
      user_id: userId,
      device_token_hash: hash(deviceToken),
      expira_em: expiraEm,
    });
    if (insErr) {
      return NextResponse.json({ error: "Erro ao confirmar dispositivo." }, { status: 500 });
    }

    const res = NextResponse.json({ ok: true });
    res.cookies.set(DEVICE_COOKIE_NAME, deviceToken, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: DEVICE_VALIDADE_DIAS * 24 * 60 * 60,
    });
    return res;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
