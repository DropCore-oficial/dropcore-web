/**
 * POST /api/gestores-ia-avulso/estoque/alterar-status-anuncio — pausa (ou reativa) de
 * verdade o anúncio no Mercado Livre, mesmo padrão do hub
 * (app/api/seller/gestores-ia/alterar-status-anuncio/route.ts), mas com o token do
 * assinante avulso. Auditoria via `calculadora_assinante_ai_acoes` (2026-10-17).
 */
import { NextResponse } from "next/server";
import { getAssinanteFromToken } from "@/lib/calculadoraAssinanteSessionAuth";
import { getValidMercadoLivreAvulsoAccessToken } from "@/lib/mercadoLivreAvulsoToken";
import { mlAtualizarStatus, mlBuscarItemDono } from "@/lib/mercadoLivreApiClient";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

export async function POST(req: Request) {
  const assinante = await getAssinanteFromToken(req);
  if (!assinante) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }
  if (assinante.inclui_gestores_ia !== true) {
    return NextResponse.json({ error: "Recurso não disponível." }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as { item_id?: string; status?: "paused" | "active" };
  const itemId = body.item_id?.trim();
  const status = body.status;
  if (!itemId || (status !== "paused" && status !== "active")) {
    return NextResponse.json({ error: "item_id e status ('paused' ou 'active') são obrigatórios." }, { status: 400 });
  }

  const ctx = await getValidMercadoLivreAvulsoAccessToken(assinante.id);
  if (!ctx) {
    return NextResponse.json({ error: "Conecte o Mercado Livre pra executar essa ação." }, { status: 422 });
  }

  const dono = await mlBuscarItemDono(itemId, ctx);
  if (!dono || String(dono.sellerId) !== ctx.mlUserId) {
    return NextResponse.json({ error: "Esse anúncio não pertence à sua conta do Mercado Livre." }, { status: 403 });
  }

  const resultado = await mlAtualizarStatus(itemId, status, ctx);
  if (!resultado.ok) {
    return NextResponse.json({ error: resultado.erro }, { status: 502 });
  }

  await supabaseAdmin
    .rpc("fn_calculadora_assinante_ai_acao_registrar", {
      p_assinante_id: assinante.id,
      p_gestor: "estoque",
      p_tipo_acao: `alterar_status_anuncio_${status}`,
      p_item_id: itemId,
    })
    .then(({ error }) => {
      if (error) console.error("[alterar-status-anuncio] registrar ação falhou", error);
    });

  return NextResponse.json({ ok: true, item_id: itemId, status });
}
