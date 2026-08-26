/**
 * Detecção de disputa fornecedor x seller pela Amanda — reclamação/devolução real do
 * Mercado Livre com evidência (foto) anexada, casada com o pedido interno (via
 * `pedidos.marketplace_numero`) pra achar fornecedor_id e ledger_id certos. Grava caso em
 * `seller_ai_disputas_fornecedor` (upsert por `ml_claim_id`, nunca duplica nem sobrescreve
 * um caso que o admin já está revisando/decidiu).
 *
 * Comparação visual (foto vs. o que o anúncio descrevia) ainda NÃO está implementada — o
 * endpoint de download do anexo (`/attachments/{filename}`) não foi resolvido ainda (ver
 * docs/SCHEMA.md). Por enquanto o caso é criado com `veredito_ia: "indeterminado"` e uma
 * observação explícita disso — o admin revisa a foto manualmente (abre a reclamação no
 * próprio Mercado Livre) até essa parte ser construída. Não é "sugestão falsa", é honesto
 * sobre o que já está automatizado e o que ainda não está.
 *
 * Só vira caso reclamação com pelo menos 1 evidência anexada — sem prova, não tem o que o
 * admin comparar, e reclamação sem evidência é o cenário mais comum de "cliente mudou de
 * ideia" (arrependimento), que não é disputa de fornecedor.
 */
import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  getValidMercadoLivreAccessToken,
  mlBuscarReclamacoesAbertas,
  mlBuscarEvidenciasReclamacao,
  mlBuscarPedidoItemPrincipal,
} from "@/lib/mercadoLivreApiClient";
import { parseGestorResposta } from "./gestorParseResposta";

export const DISPUTAS_EVIDENCIAS_BUCKET = "disputas-evidencias";

// Mesmo modelo dos outros gestores (MODELO_GESTORES_IA em gestorRequestBuilders.ts) — não
// importa de lá pra evitar dependência circular (gestorRequestBuilders já importa
// gestorReputacaoAtendimentoDados, que importa este arquivo).
const MODELO_ANALISE_EVIDENCIA = "claude-sonnet-5";

type PedidoVinculo = { id: string; fornecedor_id: string | null; ledger_id: string | null };

/** Acha o fornecedor via `seller_mercadolivre_sku_map` (item_id → sku → skus.fornecedor_id)
 * — funciona mesmo pra seller sem nenhum pedido ML sincronizado em `pedidos` (ingestão de
 * pedido direto do ML é outro projeto, ainda não construído; isso aqui não cria pedido nem
 * mexe em financial_ledger, só descobre "quem fabricou/despachou esse item"). */
async function buscarFornecedorViaSkuMap(sellerId: string, mlItemId: string): Promise<string | null> {
  const { data: vinculo } = await supabaseAdmin
    .from("seller_mercadolivre_sku_map")
    .select("sku")
    .eq("seller_id", sellerId)
    .eq("ml_item_id", mlItemId)
    .maybeSingle();
  if (!vinculo?.sku) return null;

  const { data: skuRow } = await supabaseAdmin
    .from("skus")
    .select("fornecedor_id")
    .eq("sku", vinculo.sku)
    .maybeSingle();
  return skuRow?.fornecedor_id ?? null;
}

export async function detectarDisputasFornecedor(
  sellerId: string,
  orgId: string
): Promise<{ reclamacoes_verificadas: number; casos_novos: number }> {
  const ctx = await getValidMercadoLivreAccessToken(sellerId);
  if (!ctx) return { reclamacoes_verificadas: 0, casos_novos: 0 };

  const reclamacoes = await mlBuscarReclamacoesAbertas(ctx);
  if (reclamacoes.length === 0) return { reclamacoes_verificadas: 0, casos_novos: 0 };

  let casosNovos = 0;
  for (const r of reclamacoes) {
    const evidencias = await mlBuscarEvidenciasReclamacao(r.id, ctx);
    if (evidencias.length === 0) continue;

    const [pedidoRes, itemPedido] = await Promise.all([
      supabaseAdmin
        .from("pedidos")
        .select("id, fornecedor_id, ledger_id")
        .eq("seller_id", sellerId)
        .eq("marketplace_numero", r.resourceId)
        .maybeSingle<PedidoVinculo>(),
      // Busca o item_id direto do pedido no ML (não depende do vínculo pedidos↔marketplace_numero
      // acima) — é o que alimenta o link "Ver anúncio" mesmo quando não achamos o pedido interno.
      mlBuscarPedidoItemPrincipal(r.resourceId, ctx).catch(() => null),
    ]);
    const pedido = pedidoRes.data;
    // pedidos.fornecedor_id só existe pra seller com pedido ML de verdade sincronizado
    // (não é o caso hoje — ingestão direta do ML ainda não existe). Fallback: descobre o
    // fornecedor pelo vínculo SKU↔ML que já existe, sem precisar de pedido nenhum.
    const fornecedorId =
      pedido?.fornecedor_id ?? (itemPedido ? await buscarFornecedorViaSkuMap(sellerId, itemPedido.itemId) : null);

    const { error, count } = await supabaseAdmin
      .from("seller_ai_disputas_fornecedor")
      .upsert(
        {
          org_id: orgId,
          seller_id: sellerId,
          fornecedor_id: fornecedorId,
          pedido_id: pedido?.id ?? null,
          ledger_id: pedido?.ledger_id ?? null,
          ml_claim_id: String(r.id),
          ml_order_id: r.resourceId,
          ml_item_id: itemPedido?.itemId ?? null,
          evidencia: { fotos: evidencias, reason_id: r.reasonId, tipo_reclamacao: r.type },
          analise_ia: {
            comparacao:
              "Evidência anexada pelo comprador — comparação visual automática ainda não implementada, revisar a foto manualmente na reclamação.",
          },
          veredito_ia: "indeterminado",
          // Já nasce "aguardando_fornecedor" — o fornecedor pode ver e responder assim que
          // o caso existe, sem precisar de um passo manual de "notificar" do admin.
          // "aberto" fica reservado pra quando não achamos fornecedor_id (nada pra
          // notificar ainda).
          status: fornecedorId ? "aguardando_fornecedor" : "aberto",
        },
        { onConflict: "ml_claim_id", ignoreDuplicates: true, count: "exact" }
      );
    if (!error && (count ?? 0) > 0) casosNovos += 1;
  }

  return { reclamacoes_verificadas: reclamacoes.length, casos_novos: casosNovos };
}

const MEDIA_TYPE_POR_EXTENSAO: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

const SCHEMA_ANALISE_EVIDENCIA = {
  type: "object",
  properties: {
    veredito: { type: "string", enum: ["fornecedor_provavel", "seller_provavel", "indeterminado"] },
    comparacao: { type: "string", maxLength: 400 },
  },
  required: ["veredito", "comparacao"],
  additionalProperties: false,
} as const;

/**
 * Roda depois que o SELLER envia a foto que ele conseguiu ver na própria reclamação (a API
 * do ML não deixa a DropCore baixar essa foto direto — ver docs/SCHEMA.md). Usa visão de
 * verdade (Claude) pra comparar a foto com o que o anúncio prometia (título + atributos do
 * pedido) e atualiza `analise_ia`/`veredito_ia`. Nunca decide nada sozinha — só troca
 * "indeterminado" por uma leitura de verdade pro admin usar.
 */
export async function analisarEvidenciaFoto(disputaId: string): Promise<void> {
  const { data: disputa } = await supabaseAdmin
    .from("seller_ai_disputas_fornecedor")
    .select("id, seller_id, ml_order_id, evidencia_seller_path, evidencia")
    .eq("id", disputaId)
    .maybeSingle();
  if (!disputa?.evidencia_seller_path) return;

  const { data: arquivo, error: downloadErr } = await supabaseAdmin.storage
    .from(DISPUTAS_EVIDENCIAS_BUCKET)
    .download(disputa.evidencia_seller_path);
  if (downloadErr || !arquivo) return;

  const extensao = disputa.evidencia_seller_path.split(".").pop()?.toLowerCase() ?? "jpg";
  const mediaType = MEDIA_TYPE_POR_EXTENSAO[extensao] ?? "image/jpeg";
  const base64 = Buffer.from(await arquivo.arrayBuffer()).toString("base64");

  let contextoAnuncio = "Não foi possível carregar o que o anúncio prometia.";
  if (disputa.ml_order_id) {
    const ctx = await getValidMercadoLivreAccessToken(disputa.seller_id);
    if (ctx) {
      const item = await mlBuscarPedidoItemPrincipal(disputa.ml_order_id, ctx);
      if (item) {
        const atributosTxt = item.atributos.map((a) => `${a.nome}: ${a.valor}`).join(", ") || "sem atributos declarados";
        contextoAnuncio = `Título do anúncio: "${item.titulo}". Atributos declarados: ${atributosTxt}.`;
      }
    }
  }

  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return;
  const client = new Anthropic({ apiKey });

  const message = await client.messages.create({
    model: MODELO_ANALISE_EVIDENCIA,
    max_tokens: 1024,
    thinking: { type: "disabled" },
    output_config: { format: { type: "json_schema", schema: SCHEMA_ANALISE_EVIDENCIA } },
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType as "image/jpeg", data: base64 } },
          {
            type: "text",
            text:
              `Você é um analista de disputa de e-commerce. Um comprador abriu reclamação alegando um ` +
              `problema com o produto recebido, e essa é a foto que ele anexou como prova. ${contextoAnuncio}\n\n` +
              `Compare a foto com o que o anúncio prometia. Classifique em: "fornecedor_provavel" (a foto ` +
              `confirma um erro real de quem fabricou/despachou — cor errada, produto errado, defeito de ` +
              `fabricação visível), "seller_provavel" (a foto não mostra nenhum problema real, ou o produto ` +
              `bate com o anúncio), ou "indeterminado" (a foto não é clara o suficiente pra decidir). Nunca ` +
              `presuma má-fé do comprador sem evidência visual clara disso. Responda curto e objetivo.`,
          },
        ],
      },
    ],
  });

  const { resultado, erroMensagem } = parseGestorResposta(message);
  if (erroMensagem || !resultado) return;
  const analise = resultado as { veredito: "fornecedor_provavel" | "seller_provavel" | "indeterminado"; comparacao: string };

  await supabaseAdmin
    .from("seller_ai_disputas_fornecedor")
    .update({
      analise_ia: { comparacao: analise.comparacao },
      veredito_ia: analise.veredito,
    })
    .eq("id", disputaId);
}
