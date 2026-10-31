/**
 * Detecção de devolução real no Mercado Livre — código determinístico, sem IA/gestor
 * nenhum envolvido. Roda pra TODO seller com integração direta ML ativa
 * (`seller_mercadolivre_integrations`), independente de add-on de Gestores de IA, saldo ou
 * teto de gasto — devolução é risco financeiro, não feature paga.
 *
 * Achado real 2026-10-29: o seller Vinz Collection teve devolução no ML que não apareceu em
 * nenhuma tabela do DropCore porque o único código que lia "claims" do ML era da Amanda
 * (gestor de reputação), que descarta de propósito reclamação sem foto — e "sem foto" é
 * justamente o caso mais comum de devolução real ("cliente mudou de ideia"). Essa rotina é
 * separada e não depende daquele pipeline.
 *
 * Critério de classificação (pode precisar calibração depois de ver volume real em produção
 * — não há staging hoje pra validar antes): `rules_engine_triage` contém "repentant"
 * (arrependimento, classificação do próprio ML) OU zero evidências anexadas. Reclamação com
 * evidência e que não é "repentant" fica fora daqui — é domínio de disputa fornecedor×seller,
 * não devolução.
 *
 * Fase 2 (2026-10-30): trava o dinheiro automaticamente (sem clique do admin) quando o
 * pedido resolvido tem `ledger_id` — e destrava sozinho se a reclamação do ML fechar sem
 * virar devolução de verdade e ninguém (fornecedor) tiver mexido ainda. Usa o `fornecedorId`
 * resolvido via catálogo (não o `financial_ledger.fornecedor_id`, que pode estar errado —
 * achado real: Galileus conectado ao Consenso mas vende produto Djulios).
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  getValidMercadoLivreAccessToken,
  mlBuscarReclamacoesAbertas,
  mlBuscarMotivoReclamacao,
  mlBuscarEvidenciasReclamacao,
  mlReclamacaoAindaAberta,
  type MercadoLivreReclamacao,
} from "@/lib/mercadoLivreApiClient";
import { resolverPedidoEFornecedorPorReclamacao } from "@/lib/mercadoLivreClaimResolucao";
import { notifySellerPedidoAtencao } from "@/lib/notifySellerPedidoAtencao";
import { notifyAdminsDevolucaoMl } from "@/lib/notifyAdminsDevolucaoMl";
import { notifyFornecedorDevolucao } from "@/lib/notifyFornecedorDevolucao";

type Criterio = "repentant" | "sem_evidencia";

async function classificarReclamacao(
  reclamacao: MercadoLivreReclamacao,
  ctx: { accessToken: string; mlUserId: string }
): Promise<{ criterio: Criterio; rulesEngineTriage: string[] } | null> {
  const [motivo, evidencias] = await Promise.all([
    mlBuscarMotivoReclamacao(reclamacao.reasonId, ctx).catch(() => null),
    mlBuscarEvidenciasReclamacao(reclamacao.id, ctx).catch(() => []),
  ]);
  const rulesEngineTriage = motivo?.rulesEngineTriage ?? [];
  if (rulesEngineTriage.includes("repentant")) return { criterio: "repentant", rulesEngineTriage };
  if (evidencias.length === 0) return { criterio: "sem_evidencia", rulesEngineTriage };
  return null;
}

export async function detectarDevolucaoMl(sellerId: string, orgId: string, sellerNome: string | null): Promise<void> {
  const ctx = await getValidMercadoLivreAccessToken(sellerId);
  if (!ctx) return;

  const reclamacoes = await mlBuscarReclamacoesAbertas(ctx);
  if (reclamacoes.length === 0) return;

  const claimIds = reclamacoes.map((r) => String(r.id));
  const { data: existentes } = await supabaseAdmin.rpc("fn_ml_devolucao_detectada_claim_ids_existentes", {
    p_ml_claim_ids: claimIds,
  });
  const jaConhecidos = new Set((existentes ?? []) as string[]);

  for (const r of reclamacoes) {
    if (jaConhecidos.has(String(r.id))) continue;

    const classificacao = await classificarReclamacao(r, ctx);
    if (!classificacao) continue;

    const { pedido, fornecedorId } = await resolverPedidoEFornecedorPorReclamacao(sellerId, r, ctx);

    const { data: registro } = await supabaseAdmin
      .rpc("fn_ml_devolucao_detectada_registrar", {
        p_org_id: orgId,
        p_seller_id: sellerId,
        p_ml_claim_id: String(r.id),
        p_ml_resource: r.resource,
        p_ml_resource_id: r.resourceId,
        p_ml_reason_id: r.reasonId,
        p_ml_rules_engine_triage: classificacao.rulesEngineTriage,
        p_criterio: classificacao.criterio,
        p_pedido_id: pedido?.id ?? null,
        p_ledger_id: pedido?.ledger_id ?? null,
        p_fornecedor_id: fornecedorId,
      })
      .single();

    const linha = registro as { ja_existia: boolean; devolucao_id: string } | null;
    if (!linha || linha.ja_existia) continue;

    // Trava automática — só existe dinheiro pra travar quando o pedido tem ledger_id (nem
    // todo pedido resolvido tem: ex. "produto fora do catálogo" nunca gerou saldo).
    if (pedido?.ledger_id) {
      const { data: travaResultado } = await supabaseAdmin
        .rpc("fn_devolucao_auto_travar", { p_ledger_id: pedido.ledger_id })
        .single();
      const travou = (travaResultado as { ok: boolean } | null)?.ok ?? false;

      if (travou && !fornecedorId) {
        // Travou o dinheiro, mas não dá pra saber de qual fornecedor é o produto (SKU não
        // mapeado em lugar nenhum) — mesmo padrão visual de "produto fora do catálogo":
        // mostra o problema no card do pedido em vez de silenciosamente escolher errado.
        await supabaseAdmin
          .from("pedidos")
          .update({
            status: "devolucao_sem_fornecedor",
            motivo_bloqueio:
              "Devolução detectada, mas não foi possível confirmar automaticamente qual fornecedor fabricou/despachou esse item. Peça pro admin resolver.",
          })
          .eq("id", pedido.id);
      }
    }

    await Promise.all([
      notifySellerPedidoAtencao({
        org_id: orgId,
        seller_id: sellerId,
        pedido_id: pedido?.id ?? null,
        tipo: "devolucao_ml_provavel_seller",
        motivo:
          classificacao.criterio === "repentant"
            ? "O Mercado Livre classificou uma reclamação sua como arrependimento de compra (possível devolução)."
            : "Identificamos uma reclamação sem foto/evidência no Mercado Livre — padrão comum de devolução.",
      }),
      notifyAdminsDevolucaoMl({
        org_id: orgId,
        seller_id: sellerId,
        seller_nome: sellerNome,
        pedido_id: pedido?.id ?? null,
        ml_claim_id: String(r.id),
        criterio: classificacao.criterio,
      }),
      fornecedorId && pedido?.ledger_id
        ? notifyFornecedorDevolucao({ org_id: orgId, fornecedor_id: fornecedorId, ledger_id: pedido.ledger_id })
        : Promise.resolve(),
    ]);

    await supabaseAdmin.rpc("fn_ml_devolucao_detectada_marcar_notificado", { p_id: linha.devolucao_id });
  }
}

/** Entry point chamado pelo webhook do ML (tópico "claims") — resolve o seller pelo
 * `ml_user_id` e roda a detecção. Nunca propaga erro: o webhook já respondeu 200 antes
 * disso rodar (via `after()`), um erro aqui não pode derrubar nada. */
export async function detectarDevolucaoMlPorMlUserId(mlUserId: string): Promise<void> {
  try {
    const { data: integ } = await supabaseAdmin
      .from("seller_mercadolivre_integrations")
      .select("seller_id")
      .eq("ml_user_id", mlUserId)
      .maybeSingle();
    if (!integ?.seller_id) return;

    const { data: sellerRow } = await supabaseAdmin
      .from("sellers")
      .select("org_id, nome")
      .eq("id", integ.seller_id)
      .maybeSingle();
    if (!sellerRow?.org_id) return;

    await detectarDevolucaoMl(integ.seller_id, sellerRow.org_id, sellerRow.nome ?? null);
  } catch (e) {
    console.error("[webhook mercadolivre] erro ao detectar devolução:", e);
  }
}

/** Destrava sozinho devoluções travadas automaticamente cuja reclamação do ML já fechou sem
 * o fornecedor ter confirmado/contestado nada — roda junto com a detecção a cada webhook de
 * "claims" desse seller (claim pode fechar por desistência do comprador). */
export async function reavaliarDevolucoesAbertasPorMlUserId(mlUserId: string): Promise<void> {
  try {
    const { data: integ } = await supabaseAdmin
      .from("seller_mercadolivre_integrations")
      .select("seller_id")
      .eq("ml_user_id", mlUserId)
      .maybeSingle();
    if (!integ?.seller_id) return;

    const ctx = await getValidMercadoLivreAccessToken(integ.seller_id);
    if (!ctx) return;

    const { data: abertas } = await supabaseAdmin
      .from("seller_ml_devolucoes_detectadas")
      .select("id, ml_claim_id, ledger_id, financial_ledger!inner(status, fornecedor_confirmou_recebimento_em, fornecedor_contestou_em)")
      .eq("seller_id", integ.seller_id)
      .not("ledger_id", "is", null)
      .eq("financial_ledger.status", "EM_DEVOLUCAO");

    for (const row of (abertas ?? []) as unknown as Array<{
      ledger_id: string;
      ml_claim_id: string;
      financial_ledger: { fornecedor_confirmou_recebimento_em: string | null; fornecedor_contestou_em: string | null };
    }>) {
      if (row.financial_ledger.fornecedor_confirmou_recebimento_em || row.financial_ledger.fornecedor_contestou_em) continue;

      const aindaAberta = await mlReclamacaoAindaAberta(row.ml_claim_id, ctx);
      if (aindaAberta) continue;

      await supabaseAdmin.rpc("fn_devolucao_auto_destravar", { p_ledger_id: row.ledger_id });
    }
  } catch (e) {
    console.error("[webhook mercadolivre] erro ao reavaliar devoluções abertas:", e);
  }
}
