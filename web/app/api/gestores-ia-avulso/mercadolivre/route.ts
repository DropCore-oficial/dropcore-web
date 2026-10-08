/**
 * GET /api/gestores-ia-avulso/mercadolivre — status da conexão ML do assinante avulso. Leitura
 * via RPC (fn_calculadora_assinante_ml_status_get, 2026-10-07) — ver docs/SCHEMA.md "Ulisses
 * avulso ... 1º uso real de RPC". DELETE — desconecta (remove a linha, continua `.from()`
 * direto, escrita não entrou nesse retrofit) **e revoga a autorização de verdade no Mercado
 * Livre antes** (achado 2026-10-08: mudar permissão no DevCenter não expande consentimento já
 * concedido — reconectar sem revogar reaproveita o grant antigo, com o escopo velho. Revogando
 * via API antes, o próximo "Conectar" sempre pede consentimento do zero, já com o escopo atual
 * do app — nunca mais precisa o assinante ir mexer manualmente nas configurações da conta ML
 * dele). Best-effort: se a revogação falhar (token já expirado etc.), segue desconectando local
 * mesmo assim.
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAssinanteFromToken } from "@/lib/calculadoraAssinanteSessionAuth";
import { getValidMercadoLivreAvulsoAccessToken } from "@/lib/mercadoLivreAvulsoToken";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const assinante = await getAssinanteFromToken(req);
  if (!assinante) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin.rpc("fn_calculadora_assinante_ml_status_get", {
    p_assinante_id: assinante.id,
  });

  if (error) {
    console.error("[gestores-ia-avulso/mercadolivre GET]", error.message);
    return NextResponse.json({ error: "Erro ao carregar integração Mercado Livre." }, { status: 500 });
  }

  return NextResponse.json({
    connected: Boolean(data?.ml_user_id),
    ml_user_id: data?.ml_user_id ?? null,
    access_token_expires_at: data?.ml_access_token_expires_at ?? null,
    updated_at: data?.updated_at ?? null,
  });
}

export async function DELETE(req: Request) {
  const assinante = await getAssinanteFromToken(req);
  if (!assinante) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  try {
    const ctx = await getValidMercadoLivreAvulsoAccessToken(assinante.id);
    const appId = process.env.GESTORES_IA_AVULSO_MERCADOLIVRE_CLIENT_ID?.trim();
    if (ctx && appId) {
      const revokeRes = await fetch(`https://api.mercadolibre.com/users/${ctx.mlUserId}/applications/${appId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${ctx.accessToken}` },
      });
      if (!revokeRes.ok) {
        console.error("[gestores-ia-avulso/mercadolivre DELETE] revogar no ML devolveu", revokeRes.status);
      }
    }
  } catch (e) {
    console.error("[gestores-ia-avulso/mercadolivre DELETE] revogar no ML falhou, seguindo mesmo assim", e);
  }

  const { error } = await supabaseAdmin
    .from("calculadora_assinante_mercadolivre_integrations")
    .delete()
    .eq("assinante_id", assinante.id);

  if (error) {
    console.error("[gestores-ia-avulso/mercadolivre DELETE]", error.message);
    return NextResponse.json({ error: "Erro ao desconectar o Mercado Livre." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, connected: false });
}
