/**
 * POST /api/webhooks/mercadolivre-fornecedor — notificação em tempo real de venda do
 * FORNECEDOR na própria conta Mercado Livre, pra não depender só do cron de 5 em 5 min
 * (dropcore-fornecedor-mercadolivre-sync-estoque). Registrar no DevCenter do app
 * "DropCore Fornecedor": aba Tópicos → marcar "Orders" → colar a URL desse endpoint no
 * campo "Callback URL de notificações".
 *
 * Diferente do webhook do seller (app/api/webhooks/mercadolivre/route.ts), não precisa
 * interpretar o `resource` da notificação — `available_quantity` do anúncio já reflete a
 * venda automaticamente no lado do ML, então qualquer notificação de orders_v2 só dispara
 * de novo o MESMO pull que o cron já faz (pullFornecedorEstoqueFromMercadoLivre), só que na
 * hora em vez de esperar até 5 min. Sem debounce de propósito: é código determinístico (sem
 * custo de IA como o webhook do seller), e o próprio pull já ignora SKU sem mudança —
 * rajada de vendas gera pulls redundantes baratos, não um problema de orçamento.
 *
 * Regra do ML: responder 200 em até 500ms, senão o tópico é desativado sozinho depois de
 * falhas repetidas — por isso o pull de verdade roda em `after()` (Next 15, nativo),
 * depois da resposta já ter sido enviada.
 */
import { NextResponse, after } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { pullFornecedorEstoqueFromMercadoLivre } from "@/lib/fornecedorMercadoLivreSyncEstoque";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const TOPICS_RELEVANTES = new Set(["orders_v2"]);

async function sincronizarEstoquePorMlUserId(mlUserId: string): Promise<void> {
  try {
    const { data: row, error } = await supabaseAdmin.rpc(
      "fn_fornecedor_mercadolivre_integracao_por_ml_user_id",
      { p_ml_user_id: mlUserId },
    );
    if (error) return;
    const integ = (Array.isArray(row) ? row[0] : row) as { fornecedor_id: string; org_id: string } | null;
    if (!integ?.fornecedor_id || !integ.org_id) return;

    await pullFornecedorEstoqueFromMercadoLivre({ fornecedorId: integ.fornecedor_id, orgId: integ.org_id });
  } catch (e) {
    console.error("[webhook mercadolivre-fornecedor] erro ao sincronizar estoque:", e);
  }
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    topic?: string;
    user_id?: number | string;
    application_id?: number | string;
  };

  const topic = String(body.topic ?? "");
  const mlUserId = String(body.user_id ?? "").trim();
  const applicationId = String(body.application_id ?? "").trim();
  const nossoClientId = process.env.MERCADOLIVRE_FORNECEDOR_CLIENT_ID?.trim() ?? "";

  // Sanity check barato (não é autenticação forte — o ML não assina esse payload) — só
  // evita gastar reprocessamento com notificação de app que não é o nosso, caso a URL
  // vaze/seja chamada por engano.
  const appConfere = !nossoClientId || !applicationId || applicationId === nossoClientId;

  if (appConfere && TOPICS_RELEVANTES.has(topic) && mlUserId) {
    after(() => sincronizarEstoquePorMlUserId(mlUserId));
  }

  return NextResponse.json({ received: true });
}
