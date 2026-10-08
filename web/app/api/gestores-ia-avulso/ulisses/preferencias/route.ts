/**
 * GET/POST /api/gestores-ia-avulso/ulisses/preferencias — wizard de margem/imposto/perda do
 * Ulisses avulso. Lê/grava via RPC (fn_calculadora_assinante_ulisses_preferencias_get/
 * upsert) — mesmo princípio do resto do sistema: a rota confere o dono (getAssinanteFromToken)
 * e só então chama a função do banco, que faz a leitura/escrita.
 */
import { NextResponse } from "next/server";
import { getAssinanteFromToken } from "@/lib/calculadoraAssinanteSessionAuth";
import { buscarPreferenciasUlissesAvulso, salvarPreferenciasUlissesAvulso } from "@/lib/ai/gestorAdsDadosAvulso";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const assinante = await getAssinanteFromToken(req);
  if (!assinante) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }
  if (assinante.inclui_gestores_ia !== true) {
    return NextResponse.json({ error: "Recurso não disponível." }, { status: 403 });
  }

  const preferencias = await buscarPreferenciasUlissesAvulso(assinante.id);
  return NextResponse.json({ preferencias });
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
  const assinante = await getAssinanteFromToken(req);
  if (!assinante) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }
  if (assinante.inclui_gestores_ia !== true) {
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

  try {
    const preferencias = await salvarPreferenciasUlissesAvulso(assinante.id, {
      margemMinimaPct,
      margemMaximaPct,
      impostoPct,
      perdaPct,
      adsAtivo,
      adsTacosPct: numOuNull(body.ads_tacos_pct),
      adsTetoValor: numOuNull(body.ads_teto_valor),
      adsTetoPeriodo,
      afiliadoAtivo,
      afiliadoPct: numOuNull(body.afiliado_pct),
      cupomAtivo,
      cupomPct: numOuNull(body.cupom_pct),
    });
    return NextResponse.json({ preferencias });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro ao salvar preferências." }, { status: 500 });
  }
}
