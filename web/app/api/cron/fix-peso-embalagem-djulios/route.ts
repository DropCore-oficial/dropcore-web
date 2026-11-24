/**
 * GET/POST /api/cron/fix-peso-embalagem-djulios — correção PONTUAL, não é cron agendado (sem
 * cron.schedule, disparo manual uma única vez via dropcore_cron_http_post).
 *
 * Achado 2026-11-24: 28 SKUs do fornecedor Djulios (DJU002001-012, DJU003001-016) nasceram
 * com peso_kg=0.0002 (0,2g — bug de unidade kg/grama numa importação antiga). O bug no
 * código que criava variante já foi corrigido em 2026-11-16 (ver
 * app/api/fornecedor/produtos/multivariante/route.ts, guard PESO_KG_MIN_PLAUSIVEL), mas os
 * 28 SKUs já existentes continuaram com o dado ruim — e os anúncios no Mercado Livre desses
 * SKUs já tinham sido publicados com peso quase zero, o que trava o Mercado Livre em
 * "shipment status: pending" pra sempre (ML não consegue calcular frete sem peso real).
 * Isso explica boa parte do salto de pedido sem etiqueta a partir da semana de 16/11.
 *
 * O dado local (skus.peso_kg) já foi corrigido pra 0.25 direto no banco. Esta rota só
 * reenvia o peso/dimensão certos pros anúncios JÁ PUBLICADOS no ML desses SKUs (a correção
 * do banco sozinha não muda o que já está lá).
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getValidMercadoLivreAccessToken, mlAtualizarAtributos } from "@/lib/mercadoLivreApiClient";
import { mapWithConcurrency } from "@/lib/mapWithConcurrency";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const SKUS_AFETADOS = [
  "DJU002001", "DJU002002", "DJU002003", "DJU002004", "DJU002005", "DJU002006",
  "DJU002007", "DJU002008", "DJU002009", "DJU002010", "DJU002011", "DJU002012",
  "DJU003001", "DJU003002", "DJU003003", "DJU003004", "DJU003005", "DJU003006",
  "DJU003007", "DJU003008", "DJU003009", "DJU003010", "DJU003011", "DJU003012",
  "DJU003013", "DJU003014", "DJU003015", "DJU003016",
];

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const auth = req.headers.get("authorization")?.trim() ?? "";
  if (auth === `Bearer ${secret}`) return true;
  const manual = req.headers.get("x-cron-secret")?.trim();
  return manual === secret;
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const { data: mapRows, error } = await supabaseAdmin
    .from("seller_mercadolivre_sku_map")
    .select("seller_id, ml_item_id, sku")
    .in("sku", SKUS_AFETADOS);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const { data: skuRows } = await supabaseAdmin
    .from("skus")
    .select("sku, peso_kg, altura_cm, largura_cm, comprimento_cm")
    .in("sku", SKUS_AFETADOS);
  const pesoPorSku = new Map((skuRows ?? []).map((s) => [s.sku, s]));

  // Dedup por (seller_id, ml_item_id) — peso/dimensão é atributo de item, não de variação;
  // mandar uma vez por anúncio já cobre todas as variações afetadas dele.
  const porItem = new Map<string, { sellerId: string; itemId: string; sku: string }>();
  for (const r of mapRows ?? []) {
    const key = `${r.seller_id}:${r.ml_item_id}`;
    if (!porItem.has(key)) porItem.set(key, { sellerId: r.seller_id, itemId: r.ml_item_id, sku: r.sku });
  }
  const itens = [...porItem.values()];

  const tokensPorSeller = new Map<string, Awaited<ReturnType<typeof getValidMercadoLivreAccessToken>>>();
  let corrigidos = 0;
  let falhas = 0;
  const errosDetalhe: { itemId: string; erro: string }[] = [];

  await mapWithConcurrency(itens, 3, async (it) => {
    let ctx = tokensPorSeller.get(it.sellerId);
    if (ctx === undefined) {
      ctx = await getValidMercadoLivreAccessToken(it.sellerId);
      tokensPorSeller.set(it.sellerId, ctx);
    }
    if (!ctx) {
      falhas += 1;
      errosDetalhe.push({ itemId: it.itemId, erro: "sem token ML pro seller" });
      return;
    }

    const dados = pesoPorSku.get(it.sku);
    const pesoKg = dados?.peso_kg != null ? Number(dados.peso_kg) : 0.25;
    const altura = dados?.altura_cm != null ? Number(dados.altura_cm) : 10;
    const largura = dados?.largura_cm != null ? Number(dados.largura_cm) : 20;
    const comprimento = dados?.comprimento_cm != null ? Number(dados.comprimento_cm) : 20;

    const atributos = [
      { id: "SELLER_PACKAGE_WEIGHT", value_name: `${Math.round(pesoKg * 1000)} g` },
      { id: "SELLER_PACKAGE_LENGTH", value_name: `${comprimento} cm` },
      { id: "SELLER_PACKAGE_WIDTH", value_name: `${largura} cm` },
      { id: "SELLER_PACKAGE_HEIGHT", value_name: `${altura} cm` },
    ];

    const r = await mlAtualizarAtributos(it.itemId, atributos, ctx);
    if (r.ok) {
      corrigidos += 1;
    } else {
      falhas += 1;
      errosDetalhe.push({ itemId: it.itemId, erro: r.erro });
    }
  });

  return NextResponse.json({
    ok: true,
    itens_avaliados: itens.length,
    corrigidos,
    falhas,
    erros_detalhe: errosDetalhe.slice(0, 20),
  });
}

export async function POST(req: Request) {
  return GET(req);
}
