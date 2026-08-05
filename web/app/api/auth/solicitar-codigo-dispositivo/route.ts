/**
 * POST /api/auth/solicitar-codigo-dispositivo
 * Gera e envia por e-mail um código de 6 dígitos pra confirmar um dispositivo/navegador
 * não reconhecido (ver web/middleware.ts, gate de trusted_devices). Requer Bearer do
 * usuário já autenticado no Supabase (só ainda não passou pela checagem de dispositivo).
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createHash, randomInt } from "crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { notifyUserEmail } from "@/lib/notifyEmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CODE_EXPIRA_MINUTOS = 10;
const REENVIO_MINIMO_SEGUNDOS = 60;

async function getUserIdFromBearer(req: Request): Promise<{ userId: string; email: string | null } | null> {
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
  return { userId: data.user.id, email: data.user.email ?? null };
}

function gerarCodigo(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

function hashCodigo(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

export async function POST(req: Request) {
  try {
    const authUser = await getUserIdFromBearer(req);
    if (!authUser) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const desde = new Date(Date.now() - REENVIO_MINIMO_SEGUNDOS * 1000).toISOString();
    const { data: recente } = await supabaseAdmin
      .from("login_verification_codes")
      .select("id")
      .eq("user_id", authUser.userId)
      .eq("usado", false)
      .gte("criado_em", desde)
      .limit(1)
      .maybeSingle();

    if (recente) {
      return NextResponse.json({ ok: true, message: "Código já enviado — confira seu e-mail." });
    }

    const codigo = gerarCodigo();
    const expiraEm = new Date(Date.now() + CODE_EXPIRA_MINUTOS * 60 * 1000).toISOString();

    const { error: insErr } = await supabaseAdmin.from("login_verification_codes").insert({
      user_id: authUser.userId,
      code_hash: hashCodigo(codigo),
      expira_em: expiraEm,
    });
    if (insErr) {
      return NextResponse.json({ error: "Erro ao gerar código." }, { status: 500 });
    }

    await notifyUserEmail({
      userId: authUser.userId,
      subject: "Seu código de verificação DropCore",
      titulo: "Confirme este dispositivo",
      mensagem: `Alguém (provavelmente você) está entrando no DropCore de um dispositivo novo. Use o código ${codigo} pra confirmar — ele vale por ${CODE_EXPIRA_MINUTOS} minutos. Se não foi você, troque sua senha.`,
    });

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
