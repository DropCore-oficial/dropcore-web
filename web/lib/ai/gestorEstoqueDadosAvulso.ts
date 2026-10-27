/**
 * Dado real do gestor Estoque pro assinante avulso "Gestores de IA" — réplica do Diogo do
 * hub (`gestorRupturaFulfillmentDados.ts`: dias até ruptura = estoque ÷ velocidade diária de
 * venda), mas 100% via API do Mercado Livre (`available_quantity` + `/orders/search` 30d),
 * nunca `skus.estoque_atual`/`pedido_itens` — o avulso não tem catálogo de fornecedor nem
 * pedido interno.
 *
 * Por isso não tem ponto de pedido com prazo de reposição do fornecedor, curva ABC por
 * lucro, nem "pedido pago aguardando estoque" (conceito de `pedidos.status` do hub) — fica
 * só na parte que a API do ML sustenta: estoque atual, velocidade de venda e dias até
 * esgotar. 100% código, sem IA, mesma decisão do hub (2026-09-07).
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  mlBuscarItensAtivos,
  mlBuscarItensDetalhe,
  mlBuscarResumoPedidosPeriodo,
  mlItemPermalink,
  type MercadoLivreAuthContext,
  type MercadoLivreItemDetail,
  type MercadoLivreVariation,
} from "@/lib/mercadoLivreApiClient";
import { getValidMercadoLivreAvulsoAccessToken } from "@/lib/mercadoLivreAvulsoToken";

const JANELA_VENDAS_DIAS = 30;
const MAX_CANDIDATOS = 100;

/** Mesmos limiares do Diogo (hub) — ver `DIAS_RUPTURA_RISCO_ALTO`/`_MEDIO` em
 * `gestorRupturaFulfillmentDados.ts`. Duplicado aqui de propósito (é só um número, não vale
 * importar entre hub e avulso). */
const DIAS_RUPTURA_RISCO_ALTO = 7;
const DIAS_RUPTURA_RISCO_MEDIO = 20;

export type Risco = "alto" | "medio" | "sem_risco" | "dado_insuficiente";

export type MembroEstoqueAvulso = { item_id: string; estoque: number; titulo: string };

/** Variação (cor/tamanho) específica dentro de um anúncio com múltiplas variações — achado
 * real 2026-10-19 (pedido direto do Sr Stark: "minhas G e GG de camisa acabam, mas o
 * anúncio mostra que tem estoque" — é a soma de TODAS as variações, não a que realmente
 * vende). `estoque_atual`/`vendas_30d` são só dessa variação específica, não do anúncio
 * inteiro. `risco` usa os MESMOS limiares (`DIAS_RUPTURA_RISCO_ALTO`/`_MEDIO`) da ruptura
 * agregada, só aplicados nessa variação — "alto" pode já estar zerada ou perto disso,
 * "medio" ainda tem estoque mas está esvaziando rápido (antecipa, não só avisa depois que já
 * zerou — pedido explícito 2026-10-19). */
export type VariacaoCriticaAvulso = {
  item_id: string;
  nome: string;
  estoque_atual: number;
  vendas_30d: number;
  dias_ate_ruptura: number | null;
  risco: "alto" | "medio";
};

export type SkuEstoqueResultadoAvulso = {
  chave: string;
  item_id_representante: string;
  nome_produto: string;
  estoque_atual: number;
  vendas_30d: number;
  dias_ate_ruptura: number | null;
  risco: Risco;
  acao_recomendada: string;
  /** `true` quando pelo menos uma variação do grupo está no Mercado Envios Full. */
  no_full: boolean;
  permalink: string | null;
  piorou_desde_ontem: boolean;
  /** Estoque por item individual do ML dentro da família — o agregado (`estoque_atual`) não
   * diz qual item específico está zerado; isso diz. Fonte de verdade pra decidir qual item
   * pausar (nunca `item_id_representante`, que é só o de maior estoque, escolhido pra
   * nome/permalink de exibição, não pra ação). */
  membros: MembroEstoqueAvulso[];
  /** `null` quando nenhum membro do grupo tem variação (cor/tamanho) crítica — ver
   * `VariacaoCriticaAvulso`. Mesmo quando `estoque_atual` do grupo está saudável, uma
   * variação específica pode estar esgotada. */
  variacao_critica: VariacaoCriticaAvulso | null;
};

export type ResultadoEstoqueAvulsoEnriquecido = {
  skus: SkuEstoqueResultadoAvulso[];
  destaque_risco_alto: string[];
  /** Métrica de valor (B5, 2026-10-17) — de toda pausa aplicada (clique real) nos últimos 30
   * dias, quantos desses itens não estão mais em risco alto hoje. Não afirma que o item
   * estava em risco alto NO MOMENTO da pausa (isso não foi capturado na ação) — é só "pausou
   * e hoje não está mais em risco", sinal, não prova de causa. Contagem, nunca R$. */
  pausas_recentes_confirmado?: { total_pausas_30d: number; hoje_fora_do_risco_alto: number };
};

/** Estoque atual ÷ velocidade diária de venda. `null` quando não há venda suficiente pra
 * estimar (mesmo critério do Diogo). */
export function calcularDiasAteRuptura(estoqueAtual: number, vendas30d: number): number | null {
  if (vendas30d <= 0) return null;
  const velocidadeDiaria = vendas30d / JANELA_VENDAS_DIAS;
  return Math.floor(estoqueAtual / velocidadeDiaria);
}

type GrupoEstoque = {
  chave: string;
  itemIdRepresentante: string;
  nomeProduto: string;
  estoqueAtual: number;
  noFull: boolean;
  permalink: string | null;
  membros: MembroEstoqueAvulso[];
};

/** Agrupa por família (mesma convenção do Ulisses avulso — `buscarCatalogoAgrupado` em
 * `gestorAdsDadosAvulso.ts`), mas SOMA estoque entre variações em vez de pegar só o
 * representante — pra ruptura, o que importa é o total disponível no grupo, não o preço de
 * uma variação específica. */
function agruparParaEstoque(detalhes: MercadoLivreItemDetail[]): GrupoEstoque[] {
  const porChave = new Map<string, MercadoLivreItemDetail[]>();
  for (const item of detalhes) {
    if (item.status !== "active") continue;
    const chave = item.family_id != null ? String(item.family_id) : item.id;
    const grupo = porChave.get(chave) ?? [];
    grupo.push(item);
    porChave.set(chave, grupo);
  }

  return Array.from(porChave.entries()).map(([chave, membros]) => {
    const representante = [...membros].sort((a, b) => b.available_quantity - a.available_quantity)[0];
    return {
      chave,
      itemIdRepresentante: representante.id,
      nomeProduto: representante.title,
      estoqueAtual: membros.reduce((acc, m) => acc + (m.available_quantity ?? 0), 0),
      noFull: membros.some((m) => m.shipping?.logistic_type === "fulfillment"),
      permalink: representante.permalink ?? null,
      membros: membros.map((m) => ({ item_id: m.id, estoque: m.available_quantity ?? 0, titulo: m.title })),
    };
  });
}

/** Nome legível da variação a partir de `attribute_combinations` (cor/tamanho) — ex. "Bege e
 * Branco / G". Fallback pro id numérico só se o ML não mandar nenhum `value_name` (raro). */
export function nomeVariacao(v: MercadoLivreVariation): string {
  const partes = (v.attribute_combinations ?? []).map((a) => a.value_name).filter((n): n is string => !!n);
  return partes.length > 0 ? partes.join(" / ") : `Variação ${v.id}`;
}

/** Entre os itens com MÚLTIPLAS variações (cor/tamanho dentro do mesmo anúncio — item sem
 * variação não tem o que esconder), acha a variação que mais vendeu de verdade nos últimos
 * 30 dias (`vendas30dPorVariacao`, nunca o `sold_quantity` lifetime da variação — mesmo
 * cuidado já aplicado no Anúncio) e flagra se ELA especificamente está com estoque quase
 * zero, mesmo que o anúncio inteiro (soma de todas as variações) ainda pareça saudável. */
function buscarVariacaoCriticaPorItem(
  detalhes: MercadoLivreItemDetail[],
  vendas30dPorVariacao: Map<string, number>
): Map<string, VariacaoCriticaAvulso> {
  const mapa = new Map<string, VariacaoCriticaAvulso>();
  for (const item of detalhes) {
    const variacoes = item.variations ?? [];
    if (variacoes.length < 2) continue;

    let melhor: { v: MercadoLivreVariation; vendas30d: number } | null = null;
    for (const v of variacoes) {
      const vendas30d = vendas30dPorVariacao.get(`${item.id}:${v.id}`) ?? 0;
      if (!melhor || vendas30d > melhor.vendas30d) melhor = { v, vendas30d };
    }
    if (!melhor || melhor.vendas30d <= 0) continue;

    const estoqueAtual = melhor.v.available_quantity ?? 0;
    const diasAteRuptura = calcularDiasAteRuptura(estoqueAtual, melhor.vendas30d);
    const risco: "alto" | "medio" | null =
      estoqueAtual <= 0 || (diasAteRuptura !== null && diasAteRuptura <= DIAS_RUPTURA_RISCO_ALTO)
        ? "alto"
        : diasAteRuptura !== null && diasAteRuptura <= DIAS_RUPTURA_RISCO_MEDIO
          ? "medio"
          : null;
    if (risco) {
      mapa.set(item.id, {
        item_id: item.id,
        nome: nomeVariacao(melhor.v),
        estoque_atual: estoqueAtual,
        vendas_30d: melhor.vendas30d,
        dias_ate_ruptura: diasAteRuptura,
        risco,
      });
    }
  }
  return mapa;
}

function classificarEstoque(estoqueAtual: number, vendas30d: number, diasAteRuptura: number | null): { risco: Risco; acaoRecomendada: string } {
  if (diasAteRuptura === null) {
    return { risco: "dado_insuficiente", acaoRecomendada: "Sem venda recente suficiente pra estimar risco de ruptura." };
  }

  if (estoqueAtual <= 0 || diasAteRuptura <= DIAS_RUPTURA_RISCO_ALTO) {
    return { risco: "alto", acaoRecomendada: "Pause ou despriorize o anúncio até repor o estoque." };
  }

  if (diasAteRuptura <= DIAS_RUPTURA_RISCO_MEDIO) {
    return { risco: "medio", acaoRecomendada: "Considere reduzir a verba de Ads nesse anúncio por enquanto." };
  }

  return { risco: "sem_risco", acaoRecomendada: "Estoque saudável — nenhuma ação necessária." };
}

const RANK_RISCO: Record<Risco, number> = { sem_risco: 0, dado_insuficiente: 1, medio: 2, alto: 3 };

type RunRecenteRow = { resultado: ResultadoEstoqueAvulsoEnriquecido | null };

const JANELA_PAUSAS_DIAS = 30;

/** Métrica de valor (B5) — pausas aplicadas (clique real) nos últimos 30 dias cujo item hoje
 * não está mais em risco alto (`riscoAtualPorItem`, já calculado nesta mesma rodada). */
async function contarPausasRecentesConfirmadoAvulso(
  assinanteId: string,
  riscoAtualPorItem: Map<string, Risco>
): Promise<{ total_pausas_30d: number; hoje_fora_do_risco_alto: number }> {
  const desde = new Date();
  desde.setDate(desde.getDate() - JANELA_PAUSAS_DIAS);

  const { data, error } = await supabaseAdmin
    .from("calculadora_assinante_ai_acoes")
    .select("item_id")
    .eq("assinante_id", assinanteId)
    .eq("gestor", "estoque")
    .eq("tipo_acao", "alterar_status_anuncio_paused")
    .gte("criado_em", desde.toISOString());
  if (error) {
    console.error("[gestorEstoqueDadosAvulso] contagem de pausas recentes falhou", error);
    return { total_pausas_30d: 0, hoje_fora_do_risco_alto: 0 };
  }

  const linhas = (data ?? []) as { item_id: string | null }[];
  const foraDoRiscoAlto = linhas.filter((l) => l.item_id && riscoAtualPorItem.get(l.item_id) !== "alto").length;
  return { total_pausas_30d: linhas.length, hoje_fora_do_risco_alto: foraDoRiscoAlto };
}

/** `null` quando ML não conectado OU catálogo vazio — mesmo padrão dos outros gestores
 * avulso (Andrey/Amanda/Ulisses). Leitura da rodada anterior (pra "piorou desde ontem") via
 * RPC genérica `fn_gestores_ia_avulso_ai_runs_recentes` — nunca `.from()` direto, 1º
 * gestor avulso escrito depois da regra 9 do CLAUDE.md. */
export async function montarResultadoEstoqueAvulso(assinanteId: string): Promise<ResultadoEstoqueAvulsoEnriquecido | null> {
  const ctx: MercadoLivreAuthContext | null = await getValidMercadoLivreAvulsoAccessToken(assinanteId);
  if (!ctx) return null;

  const ids = await mlBuscarItensAtivos(ctx, MAX_CANDIDATOS);
  if (ids.length === 0) return null;

  const agora = new Date();
  const desde = new Date(agora.getTime() - JANELA_VENDAS_DIAS * 24 * 60 * 60 * 1000);

  const [detalhes, resumoPedidos, runAnteriorRes] = await Promise.all([
    mlBuscarItensDetalhe(ids, ctx),
    mlBuscarResumoPedidosPeriodo(ctx, desde.toISOString(), agora.toISOString()),
    supabaseAdmin.rpc("fn_gestores_ia_avulso_ai_runs_recentes", {
      p_assinante_id: assinanteId,
      p_gestor: "estoque",
      p_limit: 1,
    }),
  ]);

  const grupos = agruparParaEstoque(detalhes);
  if (grupos.length === 0) return null;

  const vendasPorItem = new Map(resumoPedidos.itens.map((i) => [i.itemId, i.quantidade]));
  const vendas30dPorVariacao = new Map(resumoPedidos.porVariacao.map((v) => [`${v.itemId}:${v.variationId}`, v.quantidade]));
  const variacaoCriticaPorItem = buscarVariacaoCriticaPorItem(detalhes, vendas30dPorVariacao);

  const riscoAnteriorPorChave = new Map<string, string>();
  const runAnterior = ((runAnteriorRes.data ?? []) as RunRecenteRow[])[0];
  for (const s of runAnterior?.resultado?.skus ?? []) riscoAnteriorPorChave.set(s.chave, s.risco);

  const skus: SkuEstoqueResultadoAvulso[] = grupos.map((grupo) => {
    const vendas30d = grupo.membros.reduce((acc, m) => acc + (vendasPorItem.get(m.item_id) ?? 0), 0);
    const diasAteRuptura = calcularDiasAteRuptura(grupo.estoqueAtual, vendas30d);
    const { risco, acaoRecomendada } = classificarEstoque(grupo.estoqueAtual, vendas30d, diasAteRuptura);
    const riscoAnterior = riscoAnteriorPorChave.get(grupo.chave);
    const piorou = riscoAnterior !== undefined && (RANK_RISCO[risco] ?? 0) > (RANK_RISCO[riscoAnterior as Risco] ?? 0);
    const variacaoCritica = grupo.membros.map((m) => variacaoCriticaPorItem.get(m.item_id)).find((v) => v) ?? null;

    return {
      chave: grupo.chave,
      item_id_representante: grupo.itemIdRepresentante,
      nome_produto: grupo.nomeProduto,
      estoque_atual: grupo.estoqueAtual,
      vendas_30d: vendas30d,
      dias_ate_ruptura: diasAteRuptura,
      risco,
      acao_recomendada: acaoRecomendada,
      no_full: grupo.noFull,
      permalink: grupo.permalink ?? mlItemPermalink(grupo.itemIdRepresentante),
      piorou_desde_ontem: piorou,
      membros: grupo.membros,
      variacao_critica: variacaoCritica,
    };
  });

  const destaqueRiscoAlto = skus.filter((s) => s.risco === "alto").map((s) => s.chave);

  const riscoAtualPorItem = new Map<string, Risco>();
  for (const s of skus) {
    for (const m of s.membros) riscoAtualPorItem.set(m.item_id, s.risco);
  }
  const pausasRecentesConfirmado = await contarPausasRecentesConfirmadoAvulso(assinanteId, riscoAtualPorItem).catch(
    (e) => {
      console.error("[gestorEstoqueDadosAvulso] pausas recentes falhou", e);
      return { total_pausas_30d: 0, hoje_fora_do_risco_alto: 0 };
    }
  );

  return { skus, destaque_risco_alto: destaqueRiscoAlto, pausas_recentes_confirmado: pausasRecentesConfirmado };
}
