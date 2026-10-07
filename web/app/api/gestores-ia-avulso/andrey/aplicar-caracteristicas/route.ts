/**
 * POST /api/gestores-ia-avulso/andrey/aplicar-caracteristicas — Andrey preenche
 * característica (atributo da ficha técnica) que estava vazia, em 1 ou mais anúncios do
 * grupo. Revalida cada valor contra o schema REAL da categoria antes de escrever — não
 * confia só no `valorValido` calculado no enriquecimento (mesma defesa em profundidade do
 * hub).
 */
import { NextResponse } from "next/server";
import { getAssinanteFromToken } from "@/lib/calculadoraAssinanteSessionAuth";
import { getValidMercadoLivreAvulsoAccessToken } from "@/lib/mercadoLivreAvulsoToken";
import {
  mlBuscarItensDetalhe,
  mlBuscarAtributosCategoria,
  mlAtualizarAtributos,
  type MercadoLivreAuthContext,
  type MercadoLivreAtributoCategoria,
} from "@/lib/mercadoLivreApiClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_ITENS_POR_CHAMADA = 50;

function validarCaracteristicas(
  sugeridas: { atributo_id: string; valor: string }[],
  schema: MercadoLivreAtributoCategoria[]
): { id: string; value_name: string }[] {
  const porId = new Map(schema.map((a) => [a.id, a]));
  const validas: { id: string; value_name: string }[] = [];
  for (const s of sugeridas) {
    const atributo = porId.get(s.atributo_id);
    if (!atributo) continue;
    if (atributo.valueType === "list" && !atributo.valoresPermitidos.includes(s.valor)) continue;
    validas.push({ id: s.atributo_id, value_name: s.valor });
  }
  return validas;
}

export async function POST(req: Request) {
  const assinante = await getAssinanteFromToken(req);
  if (!assinante) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }
  if (assinante.inclui_gestores_ia !== true) {
    return NextResponse.json({ error: "Recurso não disponível." }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    item_ids?: string[];
    caracteristicas?: { atributo_id: string; valor: string }[];
  };
  const itemIds = (body.item_ids ?? []).map((id) => id.trim()).filter(Boolean);
  const caracteristicas = body.caracteristicas ?? [];
  if (itemIds.length === 0 || caracteristicas.length === 0) {
    return NextResponse.json({ error: "item_ids e caracteristicas são obrigatórios." }, { status: 400 });
  }
  if (itemIds.length > MAX_ITENS_POR_CHAMADA) {
    return NextResponse.json({ error: `Máximo de ${MAX_ITENS_POR_CHAMADA} anúncios por vez.` }, { status: 400 });
  }

  const ctx = await getValidMercadoLivreAvulsoAccessToken(assinante.id);
  if (!ctx) {
    return NextResponse.json({ error: "Conecte o Mercado Livre pra aplicar a ficha técnica." }, { status: 422 });
  }

  const cacheAtributos = new Map<string, MercadoLivreAtributoCategoria[]>();
  async function buscarSchema(categoryId: string, ctxAuth: MercadoLivreAuthContext) {
    let schema = cacheAtributos.get(categoryId);
    if (!schema) {
      schema = await mlBuscarAtributosCategoria(categoryId, ctxAuth);
      cacheAtributos.set(categoryId, schema);
    }
    return schema;
  }

  const resultados: { item_id: string; ok: boolean; erro?: string; aplicados?: number }[] = [];
  for (const itemId of itemIds) {
    const [detalhe] = await mlBuscarItensDetalhe([itemId], ctx);
    if (!detalhe || String(detalhe.seller_id) !== ctx.mlUserId) {
      resultados.push({ item_id: itemId, ok: false, erro: "Esse anúncio não pertence à sua conta do Mercado Livre." });
      continue;
    }

    const schema = await buscarSchema(detalhe.category_id, ctx);
    const validas = validarCaracteristicas(caracteristicas, schema);
    if (validas.length === 0) {
      resultados.push({ item_id: itemId, ok: false, erro: "Nenhum valor sugerido bateu com a categoria real do anúncio." });
      continue;
    }

    const escrita = await mlAtualizarAtributos(itemId, validas, ctx);
    if (!escrita.ok) {
      resultados.push({ item_id: itemId, ok: false, erro: escrita.erro });
      continue;
    }

    resultados.push({ item_id: itemId, ok: true, aplicados: validas.length });
  }

  const sucesso = resultados.filter((r) => r.ok).length;
  return NextResponse.json({ ok: sucesso > 0, sucesso, total: itemIds.length, resultados });
}
