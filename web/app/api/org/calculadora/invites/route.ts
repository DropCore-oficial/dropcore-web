/**
 * POST /api/org/calculadora/invites
 * Admin cria convites para a DropCore Calculadora.
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { orgErrorHttpStatus, requireAdmin } from "@/lib/apiOrgAuth";
import { resolveInvitePublicOrigin } from "@/lib/appOrigin";
import {
  isGestoresIaAvulsoCiclo,
  isGestoresIaAvulsoDescontoTipo,
  VALOR_GESTORES_IA_AVULSO_MENSAL,
} from "@/lib/gestoresIaAvulsoPlanos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function supabaseService() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Faltou SUPABASE env.");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST(req: Request) {
  try {
    await requireAdmin(req);
    const body = await req.json().catch(() => ({}));

    const email_raw = typeof body?.email_alvo === "string" ? body.email_alvo : "";
    const email_alvo = email_raw.trim().toLowerCase() || null;
    const validade_raw = Number(body?.validade_dias ?? 30);
    const validade_dias = Number.isFinite(validade_raw) && validade_raw > 0 && validade_raw <= 365 ? validade_raw : 30;
    const inclui_gestores_ia = body?.inclui_gestores_ia === true;

    if (email_alvo && !email_alvo.includes("@")) {
      return NextResponse.json({ error: "E-mail inválido." }, { status: 400 });
    }

    // Ciclo/desconto só fazem sentido pra convite de Gestores de IA — ignorados silenciosamente
    // pro convite só-calculadora (inclui_gestores_ia=false).
    let gestores_ia_ciclo: "mensal" | "anual" | null = null;
    let gestores_ia_desconto_tipo: "valor" | "percentual" | null = null;
    let gestores_ia_desconto_valor: number | null = null;

    if (inclui_gestores_ia) {
      if (body?.gestores_ia_ciclo != null) {
        if (!isGestoresIaAvulsoCiclo(body.gestores_ia_ciclo)) {
          return NextResponse.json({ error: "Ciclo inválido." }, { status: 400 });
        }
        gestores_ia_ciclo = body.gestores_ia_ciclo;
      }

      if (body?.gestores_ia_desconto_tipo != null) {
        if (!isGestoresIaAvulsoDescontoTipo(body.gestores_ia_desconto_tipo)) {
          return NextResponse.json({ error: "Tipo de desconto inválido." }, { status: 400 });
        }
        const valor = Number(body?.gestores_ia_desconto_valor);
        if (!Number.isFinite(valor) || valor <= 0) {
          return NextResponse.json({ error: "Informe um valor de desconto maior que zero." }, { status: 400 });
        }
        if (body.gestores_ia_desconto_tipo === "percentual" && valor > 100) {
          return NextResponse.json({ error: "Percentual não pode passar de 100." }, { status: 400 });
        }
        if (body.gestores_ia_desconto_tipo === "valor" && valor >= VALOR_GESTORES_IA_AVULSO_MENSAL) {
          return NextResponse.json(
            { error: "Desconto em R$ não pode ser maior ou igual ao preço cheio." },
            { status: 400 }
          );
        }
        gestores_ia_desconto_tipo = body.gestores_ia_desconto_tipo;
        gestores_ia_desconto_valor = valor;
      }
    }

    const supabase = supabaseService();
    const { data, error } = await supabase
      .from("calculadora_invites")
      .insert({
        email_alvo,
        validade_dias,
        inclui_gestores_ia,
        gestores_ia_ciclo,
        gestores_ia_desconto_tipo,
        gestores_ia_desconto_valor,
      })
      .select(
        "id, token, email_alvo, validade_dias, expira_em, usado, usado_em, criado_em, inclui_gestores_ia, gestores_ia_ciclo, gestores_ia_desconto_tipo, gestores_ia_desconto_valor"
      )
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? "Erro ao criar convite." }, { status: 500 });
    }

    const base = resolveInvitePublicOrigin(req);
    const link =
      base.length > 0
        ? `${base}/calculadora/register/${data.token}`
        : `/calculadora/register/${data.token}`;

    return NextResponse.json({
      ok: true,
      invite: {
        ...data,
        link,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: orgErrorHttpStatus(e) });
  }
}

