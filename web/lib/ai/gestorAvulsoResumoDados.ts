/**
 * Resumo financeiro do hub "Gestores de IA Avulso" (`/seller/gestores-ia-avulso`) — card
 * "Resultado · últimos 30 dias" (lucro estimado, faturamento, produto campeão). 100% código
 * determinístico, sem IA: faturamento vem de pedido PAGO de verdade (`/orders/search`, mesma
 * fonte primária que o Ulisses já usa pro TACoS — nunca o `sold_quantity` do item, que é
 * cumulativo desde sempre, não é "30 dias"). Lucro é uma ESTIMATIVA: não dá pra saber o custo
 * exato de cada unidade vendida sem reprocessar pedido por pedido com o histórico de preço de
 * cada item, então usamos a margem média dos SKUs que já têm custo cadastrado (Ulisses) como
 * proxy sobre o faturamento real do período — por isso sempre rotulado "estimado" na tela,
 * nunca como número contábil exato.
 */
import { getValidMercadoLivreAvulsoAccessToken } from "@/lib/mercadoLivreAvulsoToken";
import { mlBuscarResumoPedidosPeriodo } from "@/lib/mercadoLivreApiClient";
import { montarResultadoAdsAvulso } from "./gestorAdsDadosAvulso";

const DIA_MS = 24 * 60 * 60 * 1000;

export type ResumoFinanceiroAvulso = {
  faturamento30d: number;
  /** null quando não há como comparar (sem venda no período anterior). */
  faturamento30dVariacaoPct: number | null;
  vendas30d: number;
  /** null quando nenhum SKU tem custo cadastrado ainda (sem base pra estimar). */
  lucroEstimado30d: number | null;
  margemMediaPct: number | null;
  /** null quando não houve venda no período (sem como dividir). */
  ticketMedio30d: number | null;
  produtoCampeao: { itemId: string; nome: string; vendas: number } | null;
  /** Top 5 produtos por faturamento real no período (não só quantidade) — base do ranking
   * "Top produtos" do Dashboard. Vazio quando não houve venda no período. */
  topProdutos: { itemId: string; nome: string; vendas: number; faturamento: number }[];
  /** Faturamento por dia civil (BRT) dos últimos 30 dias — base do sparkline do Dashboard. */
  porDia30d: { dia: string; faturamento: number; vendas: number }[];
};

/** `null` quando a conta não tem Mercado Livre conectado — mesmo padrão dos outros gestores avulso. */
export async function buscarResumoFinanceiroAvulso(assinanteId: string): Promise<ResumoFinanceiroAvulso | null> {
  const ctx = await getValidMercadoLivreAvulsoAccessToken(assinanteId);
  if (!ctx) return null;

  const agora = new Date();
  const inicio30d = new Date(agora.getTime() - 30 * DIA_MS);
  const inicio60d = new Date(agora.getTime() - 60 * DIA_MS);

  const [periodoAtual, periodoAnterior, adsResultado] = await Promise.all([
    mlBuscarResumoPedidosPeriodo(ctx, inicio30d.toISOString(), agora.toISOString()),
    mlBuscarResumoPedidosPeriodo(ctx, inicio60d.toISOString(), inicio30d.toISOString()),
    montarResultadoAdsAvulso(assinanteId),
  ]);

  const skusComCusto = (adsResultado?.skus ?? []).filter(
    (s): s is typeof s & { margem_atual_pct: number } => s.custo !== null && s.margem_atual_pct !== null
  );
  const margemMediaPct =
    skusComCusto.length > 0
      ? skusComCusto.reduce((acc, s) => acc + s.margem_atual_pct, 0) / skusComCusto.length
      : null;

  const lucroEstimado30d = margemMediaPct !== null ? periodoAtual.faturamento * (margemMediaPct / 100) : null;

  const faturamento30dVariacaoPct =
    periodoAnterior.faturamento > 0
      ? ((periodoAtual.faturamento - periodoAnterior.faturamento) / periodoAnterior.faturamento) * 100
      : null;

  let produtoCampeao: { itemId: string; nome: string; vendas: number } | null = null;
  for (const item of periodoAtual.itens) {
    if (!produtoCampeao || item.quantidade > produtoCampeao.vendas) {
      produtoCampeao = { itemId: item.itemId, nome: item.titulo, vendas: item.quantidade };
    }
  }

  const topProdutos = [...periodoAtual.itens]
    .sort((a, b) => b.faturamento - a.faturamento)
    .slice(0, 5)
    .map((item) => ({ itemId: item.itemId, nome: item.titulo, vendas: item.quantidade, faturamento: item.faturamento }));

  const ticketMedio30d = periodoAtual.vendas > 0 ? periodoAtual.faturamento / periodoAtual.vendas : null;

  return {
    faturamento30d: periodoAtual.faturamento,
    faturamento30dVariacaoPct,
    vendas30d: periodoAtual.vendas,
    lucroEstimado30d,
    margemMediaPct,
    ticketMedio30d,
    produtoCampeao,
    topProdutos,
    porDia30d: periodoAtual.porDia,
  };
}
