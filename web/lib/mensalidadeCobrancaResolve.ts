import { createClient, type User } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type MensalidadeCobrancaCtx =
  | {
      ok: true;
      tipo: "seller";
      org_id: string;
      entidade_id: string;
      email: string;
      mensalidade: { id: string; ciclo: string | null; valor: number; status: string };
    }
  | {
      ok: true;
      tipo: "fornecedor";
      org_id: string;
      entidade_id: string;
      email: string;
      mensalidade: { id: string; ciclo: string | null; valor: number; status: string };
    }
  | { ok: false; status: number; error: string };

function emailParaMp(email: string | null | undefined, userEmail: string | null | undefined): string | null {
  const e = (email?.trim() || userEmail?.trim() || "").toLowerCase();
  if (e) return e;
  if (process.env.MERCADOPAGO_TEST_MODE === "true") return "test@testuser.com";
  return null;
}

export async function resolveMensalidadeCobranca(
  token: string | null,
  tipoPortal: "seller" | "fornecedor",
  mensalidadeId: string,
): Promise<MensalidadeCobrancaCtx> {
  if (!token) {
    return { ok: false, status: 401, error: "Sem token de autenticação." };
  }

  const sbAnon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  );
  const { data: userData, error: userErr } = await sbAnon.auth.getUser(token);
  if (userErr || !userData?.user) {
    return { ok: false, status: 401, error: "Token inválido ou expirado." };
  }
  const user = userData.user as User;

  if (tipoPortal === "seller") {
    const { data: seller } = await supabaseAdmin
      .from("sellers")
      .select("id, org_id, nome, email")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!seller) {
      return { ok: false, status: 404, error: "Seller não encontrado." };
    }

    const email = emailParaMp(
      (seller as { email?: string | null }).email,
      user.email,
    );
    if (!email) {
      return {
        ok: false,
        status: 400,
        error: "E-mail não cadastrado. Atualize seus dados para pagar a mensalidade.",
      };
    }

    const { data: m, error: mErr } = await supabaseAdmin
      .from("financial_mensalidades")
      .select("id, ciclo, valor, status")
      .eq("id", mensalidadeId)
      .eq("org_id", seller.org_id)
      .eq("tipo", "seller")
      .eq("entidade_id", seller.id)
      .maybeSingle();

    if (mErr || !m) {
      return { ok: false, status: 404, error: "Mensalidade não encontrada." };
    }
    if (m.status !== "pendente" && m.status !== "inadimplente") {
      return { ok: false, status: 400, error: "Esta mensalidade já foi paga." };
    }

    return {
      ok: true,
      tipo: "seller",
      org_id: seller.org_id,
      entidade_id: seller.id,
      email,
      mensalidade: {
        id: m.id,
        ciclo: m.ciclo,
        valor: Number(m.valor),
        status: m.status,
      },
    };
  }

  const { data: member } = await supabaseAdmin
    .from("org_members")
    .select("org_id, fornecedor_id")
    .eq("user_id", user.id)
    .not("fornecedor_id", "is", null)
    .limit(1)
    .maybeSingle();

  if (!member?.fornecedor_id) {
    return { ok: false, status: 404, error: "Fornecedor não encontrado." };
  }

  const email = emailParaMp(null, user.email);
  if (!email) {
    return {
      ok: false,
      status: 400,
      error: "E-mail não encontrado. Atualize sua conta para pagar a mensalidade.",
    };
  }

  const { data: m, error: mErr } = await supabaseAdmin
    .from("financial_mensalidades")
    .select("id, ciclo, valor, status")
    .eq("id", mensalidadeId)
    .eq("org_id", member.org_id)
    .eq("tipo", "fornecedor")
    .eq("entidade_id", member.fornecedor_id)
    .maybeSingle();

  if (mErr || !m) {
    return { ok: false, status: 404, error: "Mensalidade não encontrada." };
  }
  if (m.status !== "pendente" && m.status !== "inadimplente") {
    return { ok: false, status: 400, error: "Esta mensalidade já foi paga." };
  }

  return {
    ok: true,
    tipo: "fornecedor",
    org_id: member.org_id,
    entidade_id: member.fornecedor_id,
    email,
    mensalidade: {
      id: m.id,
      ciclo: m.ciclo,
      valor: Number(m.valor),
      status: m.status,
    },
  };
}

export function cicloLabelMensalidade(ciclo: string | null): string {
  return ciclo
    ? new Date(ciclo + "T12:00:00").toLocaleDateString("pt-BR", { month: "short", year: "numeric" })
    : "";
}
