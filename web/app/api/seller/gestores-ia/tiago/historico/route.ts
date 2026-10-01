/**
 * GET /api/seller/gestores-ia/tiago/historico — carrega a tela do chat (sessões + mensagens
 * da sessão ativa) numa chamada só (fn_seller_ai_chat_historico) + saldo do orçamento do mês.
 * ?session_id=... pra trocar de conversa (senão pega a mais recente).
 *
 * Sessão nova automática por dia (2026-09-30): sem `session_id` explícito, se a sessão mais
 * recente não for de hoje (BRT), cria uma vazia antes de devolver — evita a mesma conversa
 * crescer pra sempre (cada turno reenvia o histórico inteiro como texto, então conversa
 * infinita = custo subindo aos poucos com o tempo). Histórico de dias anteriores continua
 * acessível pelo seletor de sessão, só não é mais o que carrega/recebe mensagem por padrão.
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSellerFromToken } from "@/lib/sellerSessionAuth";
import { gestoresIaSellerPermitido } from "@/lib/ai/gestoresIaAcesso";
import { temAddonGestoresIaAtivo } from "@/lib/planos";
import { TETO_CHAT_TIAGO_REAIS_MES, TOKENS_POR_REAL_ESTIMADO } from "@/lib/ai/gestorTiagoChatCusto";
import { gastoHojeReais, tetoHojeReais, hojeBrtIso, dataBrtDeIso } from "@/lib/ai/gestorTiagoChatOrcamentoDia";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type HistoricoData = {
  sessoes: { id: string; titulo: string | null; criado_em: string; atualizado_em: string }[];
  sessao_ativa_id: string | null;
  mensagens: unknown[];
};

export async function GET(req: Request) {
  const seller = await getSellerFromToken(req);
  if (!seller) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }
  if (!gestoresIaSellerPermitido(seller.id)) {
    return NextResponse.json({ error: "Recurso não disponível." }, { status: 403 });
  }

  const { data: sellerRow, error: sellerErr } = await supabaseAdmin
    .from("sellers")
    .select("gestores_ia_addon_ativo, nome_responsavel")
    .eq("id", seller.id)
    .maybeSingle();
  if (sellerErr) {
    return NextResponse.json({ error: "Erro ao carregar dados do seller." }, { status: 500 });
  }
  if (!temAddonGestoresIaAtivo(sellerRow)) {
    return NextResponse.json({ liberado: false });
  }

  const url = new URL(req.url);
  const sessionIdParam = url.searchParams.get("session_id") || null;

  const historicoRes = await supabaseAdmin.rpc("fn_seller_ai_chat_historico", {
    p_seller_id: seller.id,
    p_session_id: sessionIdParam,
  });
  if (historicoRes.error) {
    return NextResponse.json({ error: historicoRes.error.message }, { status: 400 });
  }
  let historicoData = historicoRes.data as HistoricoData;

  if (!sessionIdParam) {
    const sessaoAtiva = historicoData.sessoes.find((s) => s.id === historicoData.sessao_ativa_id);
    const sessaoEhDeHoje = sessaoAtiva ? dataBrtDeIso(sessaoAtiva.criado_em) === hojeBrtIso() : false;
    if (!sessaoEhDeHoje) {
      const { data: novaSessaoId, error: criarErr } = await supabaseAdmin.rpc("fn_seller_ai_chat_criar_sessao", {
        p_seller_id: seller.id,
      });
      if (!criarErr && novaSessaoId) {
        const historicoRes2 = await supabaseAdmin.rpc("fn_seller_ai_chat_historico", {
          p_seller_id: seller.id,
          p_session_id: novaSessaoId,
        });
        if (!historicoRes2.error) historicoData = historicoRes2.data as HistoricoData;
      }
    }
  }

  const [orcamentoRes, gastoHoje, tetoHoje] = await Promise.all([
    supabaseAdmin.rpc("fn_seller_ai_chat_orcamento_status", {
      p_seller_id: seller.id,
      p_teto: TETO_CHAT_TIAGO_REAIS_MES,
    }),
    gastoHojeReais(seller.id),
    tetoHojeReais(seller.id),
  ]);

  const tokensEquivalentesHoje = Math.round(gastoHoje * TOKENS_POR_REAL_ESTIMADO);
  const cotaTokensHoje = Math.round(tetoHoje * TOKENS_POR_REAL_ESTIMADO);

  return NextResponse.json({
    liberado: true,
    ...historicoData,
    orcamento: orcamentoRes.data ?? null,
    bloqueado_hoje: gastoHoje >= tetoHoje,
    uso_tokens_hoje: { tokens: tokensEquivalentesHoje, cota: cotaTokensHoje },
    nome_responsavel: sellerRow?.nome_responsavel ?? null,
  });
}
