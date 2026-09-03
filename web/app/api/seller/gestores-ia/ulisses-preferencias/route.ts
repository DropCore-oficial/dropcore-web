/**
 * GET/POST /api/seller/gestores-ia/ulisses-preferencias — wizard de configuração do
 * Ulisses (margem mínima/máxima, imposto, perda, e liga/desliga+% de ads/afiliado/cupom).
 * Mesmo padrão de auth dos outros endpoints de gestores (bearer do seller, `supabaseAdmin`
 * direto — service role bypassa RLS, não precisa passar pela RPC
 * `fn_seller_ulisses_preferencias_get/upsert`, que existe pra chamada direta do client
 * autenticado, ver docs/SCHEMA.md).
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSellerFromToken } from "@/lib/sellerSessionAuth";
import { gestoresIaSellerPermitido } from "@/lib/ai/gestoresIaAcesso";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const seller = await getSellerFromToken(req);
  if (!seller) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }
  if (!gestoresIaSellerPermitido(seller.id)) {
    return NextResponse.json({ error: "Recurso não disponível." }, { status: 403 });
  }

  const { data, error } = await supabaseAdmin
    .from("seller_ulisses_preferencias")
    .select(
      "margem_minima_pct, margem_maxima_pct, imposto_pct, perda_pct, ads_ativo, ads_tacos_pct, ads_teto_valor, ads_teto_periodo, afiliado_ativo, afiliado_pct, cupom_ativo, cupom_pct"
    )
    .eq("seller_id", seller.id)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ preferencias: data ?? null });
}

type Payload = {
  margem_minima_pct?: unknown;
  margem_maxima_pct?: unknown;
  imposto_pct?: unknown;
  perda_pct?: unknown;
  ads_ativo?: unknown;
  ads_tacos_pct?: unknown;
  ads_teto_valor?: unknown;
  ads_teto_periodo?: unknown;
  afiliado_ativo?: unknown;
  afiliado_pct?: unknown;
  cupom_ativo?: unknown;
  cupom_pct?: unknown;
};

function numOuNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function POST(req: Request) {
  const seller = await getSellerFromToken(req);
  if (!seller) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }
  if (!gestoresIaSellerPermitido(seller.id)) {
    return NextResponse.json({ error: "Recurso não disponível." }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as Payload;

  const margemMinimaPct = numOuNull(body.margem_minima_pct);
  if (margemMinimaPct === null || margemMinimaPct <= 0) {
    return NextResponse.json({ error: "Margem mínima precisa ser maior que zero." }, { status: 400 });
  }
  const margemMaximaPct = numOuNull(body.margem_maxima_pct);
  if (margemMaximaPct !== null && margemMaximaPct < margemMinimaPct) {
    return NextResponse.json({ error: "Margem máxima não pode ser menor que a mínima." }, { status: 400 });
  }
  const impostoPct = numOuNull(body.imposto_pct) ?? 0;
  const perdaPct = numOuNull(body.perda_pct) ?? 0;

  const adsAtivo = Boolean(body.ads_ativo);
  const adsTetoPeriodo = body.ads_teto_periodo === "dia" || body.ads_teto_periodo === "mes" ? body.ads_teto_periodo : null;
  const afiliadoAtivo = Boolean(body.afiliado_ativo);
  const cupomAtivo = Boolean(body.cupom_ativo);

  const { data, error } = await supabaseAdmin
    .from("seller_ulisses_preferencias")
    .upsert(
      {
        org_id: seller.org_id,
        seller_id: seller.id,
        margem_minima_pct: margemMinimaPct,
        margem_maxima_pct: margemMaximaPct,
        imposto_pct: impostoPct,
        perda_pct: perdaPct,
        ads_ativo: adsAtivo,
        ads_tacos_pct: adsAtivo ? numOuNull(body.ads_tacos_pct) : null,
        ads_teto_valor: adsAtivo ? numOuNull(body.ads_teto_valor) : null,
        ads_teto_periodo: adsAtivo ? adsTetoPeriodo : null,
        afiliado_ativo: afiliadoAtivo,
        afiliado_pct: afiliadoAtivo ? numOuNull(body.afiliado_pct) : null,
        cupom_ativo: cupomAtivo,
        cupom_pct: cupomAtivo ? numOuNull(body.cupom_pct) : null,
        atualizado_em: new Date().toISOString(),
      },
      { onConflict: "seller_id" }
    )
    .select(
      "margem_minima_pct, margem_maxima_pct, imposto_pct, perda_pct, ads_ativo, ads_tacos_pct, ads_teto_valor, ads_teto_periodo, afiliado_ativo, afiliado_pct, cupom_ativo, cupom_pct"
    )
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ preferencias: data });
}
