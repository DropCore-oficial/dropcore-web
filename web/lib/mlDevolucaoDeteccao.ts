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
 * V1 só notifica (seller + admin da org) — nenhuma mutação em `financial_ledger`/
 * `pedidos.status`. A confirmação de devolução continua 100% manual via /admin/devolucoes.
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  getValidMercadoLivreAccessToken,
  mlBuscarReclamacoesAbertas,
  mlBuscarMotivoReclamacao,
  mlBuscarEvidenciasReclamacao,
  type MercadoLivreReclamacao,
} from "@/lib/mercadoLivreApiClient";
import { resolverPedidoEFornecedorPorReclamacao } from "@/lib/mercadoLivreClaimResolucao";
import { notifySellerPedidoAtencao } from "@/lib/notifySellerPedidoAtencao";
import { notifyAdminsDevolucaoMl } from "@/lib/notifyAdminsDevolucaoMl";

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
      })
      .single();

    const linha = registro as { ja_existia: boolean; devolucao_id: string } | null;
    if (!linha || linha.ja_existia) continue;

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
    ]);

    await supabaseAdmin.rpc("fn_ml_devolucao_detectada_marcar_notificado", { p_id: linha.devolucao_id });

    // fornecedorId resolvido mas não usado nesta v1 (notificação não é por fornecedor) —
    // mantido no retorno de resolverPedidoEFornecedorPorReclamacao pra uso futuro.
    void fornecedorId;
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
