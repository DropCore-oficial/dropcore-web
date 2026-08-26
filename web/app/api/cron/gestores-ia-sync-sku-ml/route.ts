/**
 * GET/POST /api/cron/gestores-ia-sync-sku-ml — atualiza seller_mercadolivre_sku_map pra
 * todo seller com ML conectado. Não usa IA (zero custo de token), só leitura da API do ML +
 * upsert. Roda separado dos crons de gestor porque não depende do plano Pro nem do resto do
 * pipeline de IA — é infra de vínculo, útil mesmo pra Starter que conectou o ML.
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sincronizarSkuMercadoLivre } from "@/lib/ai/mercadoLivreSkuSync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;

  const auth = req.headers.get("authorization")?.trim() ?? "";
  if (auth === `Bearer ${secret}`) return true;

  const manual = req.headers.get("x-cron-secret")?.trim();
  return manual === secret;
}

export async function GET(req: Request) {
  return run(req);
}

export async function POST(req: Request) {
  return run(req);
}

async function run(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { data: sellersConectados, error } = await supabaseAdmin
      .from("seller_mercadolivre_integrations")
      .select("seller_id");
    if (error) throw new Error(error.message);

    const resultados = [];
    for (const { seller_id } of sellersConectados ?? []) {
      const r = await sincronizarSkuMercadoLivre(seller_id);
      resultados.push({ seller_id, ...r });
    }

    return NextResponse.json({
      ok: true,
      sellers_sincronizados: resultados.length,
      total_skus_encontrados: resultados.reduce((s, r) => s + r.skus_encontrados, 0),
      detalhe: resultados,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
