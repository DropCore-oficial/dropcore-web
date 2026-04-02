import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: Request) {
  const adminKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.ADMIN_RESET_SECRET;

  if (!adminKey || !supabaseUrl || !secret) {
    return NextResponse.json(
      { error: "Configuração do servidor incompleta" },
      { status: 500 }
    );
  }

  const headerSecret = req.headers.get("x-admin-secret");
  if (!headerSecret || headerSecret !== secret) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { uid, newPassword } = await req.json();

  // Validação de UUID
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  
  if (!uid || !uuidRegex.test(uid)) {
    return NextResponse.json({ error: "uid inválido" }, { status: 400 });
  }

  // Validação de senha mais robusta
  const passwordStr = String(newPassword || "");
  if (passwordStr.length < 8) {
    return NextResponse.json(
      { error: "Senha deve ter no mínimo 8 caracteres" },
      { status: 400 }
    );
  }
  
  // Validação básica de complexidade (opcional, mas recomendado)
  if (!/[A-Z]/.test(passwordStr) || !/[a-z]/.test(passwordStr) || !/[0-9]/.test(passwordStr)) {
    return NextResponse.json(
      { error: "Senha deve conter letras maiúsculas, minúsculas e números" },
      { status: 400 }
    );
  }

  const supabaseAdmin = createClient(supabaseUrl, adminKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error } = await supabaseAdmin.auth.admin.updateUserById(uid, {
    password: newPassword,
  });

  if (error) {
    console.error("Erro ao atualizar senha:", error.message);
    return NextResponse.json(
      { error: "Erro ao atualizar senha" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
