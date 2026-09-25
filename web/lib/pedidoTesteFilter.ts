import { supabaseAdmin } from "@/lib/supabaseAdmin";

/** Remove linhas ligadas a pedido marcado `pedidos.e_teste` — dinheiro fictício (conta de
 * teste) nunca pode contar em repasse real (fechamento de ciclo ou preview de "a receber"),
 * mesmo que já tenha entrado no ledger. Só filtra em memória, nunca altera `pedidos` nem
 * `financial_ledger`. Usado tanto no fechamento de repasse quanto no preview do fornecedor.
 *
 * Busca TODOS os ids `e_teste=true` de uma vez (não filtra por `.in(pedido_id, rows...)`)
 * de propósito — um lote de teste grande (ex. 688 pedidos) gera uma URL longa demais pro
 * PostgREST e o Supabase devolve 400 "Bad Request" em silêncio; sem checar erro, a versão
 * antiga caía pra "nenhum é teste" e devolvia tudo sem filtrar (bug real encontrado ao vivo
 * 2026-09-24 — o filtro nunca excluiu nada). Falha alto (`throw`) se essa consulta de
 * segurança quebrar, em vez de seguir como se nada fosse teste. */
export async function semPedidosDeTeste<T extends { pedido_id: string | null }>(rows: T[]): Promise<T[]> {
  if (rows.length === 0) return rows;
  const { data: pedidosTeste, error } = await supabaseAdmin
    .from("pedidos")
    .select("id")
    .eq("e_teste", true)
    .limit(10000);
  if (error) throw new Error(`semPedidosDeTeste: falha ao checar pedido de teste — ${error.message}`);
  const idsTeste = new Set((pedidosTeste ?? []).map((p) => p.id));
  if (idsTeste.size === 0) return rows;
  return rows.filter((r) => !r.pedido_id || !idsTeste.has(r.pedido_id));
}
