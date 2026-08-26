/**
 * POST /api/seller/gestores-ia/aplicar-caracteristicas — Andrey preenche característica
 * (atributo da ficha técnica) que estava vazia, em 1 ou mais anúncios do grupo. Mesma
 * escrita de descrição: sem trava de família nem de venda, aplica em todos os item_ids.
 *
 * Revalida cada valor contra o schema REAL da categoria do item antes de escrever — não
 * confia só no `valorValido` calculado no enriquecimento (que já veio do cliente, e o
 * schema de categoria pode ter mudado desde a rodada). Atributo de lista fechada só escreve
 * se o valor bater exato com uma opção real; texto livre sempre passa.
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSellerFromToken } from "@/lib/sellerSessionAuth";
import { gestoresIaSellerPermitido } from "@/lib/ai/gestoresIaAcesso";
import { isPro } from "@/lib/planos";
import { getRequestIp } from "@/lib/requestIp";
import {
  getValidMercadoLivreAccessToken,
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

async function registrarAcao(params: {
  req: Request;
  orgId: string;
  sellerId: string;
  actorUserId: string | null;
  itemId: string;
  status: "executado" | "erro";
  detalhes: Record<string, unknown>;
}) {
  await supabaseAdmin.from("seller_ai_acoes").insert({
    org_id: params.orgId,
    seller_id: params.sellerId,
    gestor: "anuncios_seo",
    alvo_tipo: "ml_item",
    alvo_id: params.itemId,
    acao: "aplicar_caracteristicas",
    status: params.status,
    detalhes: params.detalhes,
    actor_user_id: params.actorUserId,
    ip_address: getRequestIp(params.req),
    user_agent: params.req.headers.get("user-agent"),
    executado_em: new Date().toISOString(),
  });
}

/** Filtra as sugestões pra só as que batem no schema real da categoria — lista fechada
 * precisa bater exato, texto livre sempre passa. Descarta atributo que nem existe mais
 * na categoria. */
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
  const seller = await getSellerFromToken(req);
  if (!seller) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  if (!gestoresIaSellerPermitido(seller.id)) {
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

  const { data: sellerRow } = await supabaseAdmin
    .from("sellers")
    .select("plano, saldo_atual")
    .eq("id", seller.id)
    .maybeSingle();
  if (!isPro({ plano: sellerRow?.plano })) {
    return NextResponse.json({ error: "Gestores de IA são exclusivos do plano Pro." }, { status: 403 });
  }
  if (Math.max(0, Number(sellerRow?.saldo_atual ?? 0)) <= 0) {
    return NextResponse.json({ error: "Recarregue seu saldo pra usar os Gestores de IA." }, { status: 402 });
  }

  const ctx = await getValidMercadoLivreAccessToken(seller.id);
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
      await registrarAcao({
        req,
        orgId: seller.org_id,
        sellerId: seller.id,
        actorUserId: seller.user_id ?? null,
        itemId,
        status: "erro",
        detalhes: { motivo: "dono_invalido", caracteristicas },
      });
      continue;
    }

    const schema = await buscarSchema(detalhe.category_id, ctx);
    const validas = validarCaracteristicas(caracteristicas, schema);
    if (validas.length === 0) {
      resultados.push({ item_id: itemId, ok: false, erro: "Nenhum valor sugerido bateu com a categoria real do anúncio." });
      await registrarAcao({
        req,
        orgId: seller.org_id,
        sellerId: seller.id,
        actorUserId: seller.user_id ?? null,
        itemId,
        status: "erro",
        detalhes: { motivo: "nenhum_valor_valido", caracteristicas },
      });
      continue;
    }

    const escrita = await mlAtualizarAtributos(itemId, validas, ctx);
    if (!escrita.ok) {
      resultados.push({ item_id: itemId, ok: false, erro: escrita.erro });
      await registrarAcao({
        req,
        orgId: seller.org_id,
        sellerId: seller.id,
        actorUserId: seller.user_id ?? null,
        itemId,
        status: "erro",
        detalhes: { erro: escrita.erro, tentado: validas },
      });
      continue;
    }

    resultados.push({ item_id: itemId, ok: true, aplicados: validas.length });
    await registrarAcao({
      req,
      orgId: seller.org_id,
      sellerId: seller.id,
      actorUserId: seller.user_id ?? null,
      itemId,
      status: "executado",
      detalhes: { aplicado: validas },
    });
  }

  const sucesso = resultados.filter((r) => r.ok).length;
  return NextResponse.json({ ok: sucesso > 0, sucesso, total: itemIds.length, resultados });
}
