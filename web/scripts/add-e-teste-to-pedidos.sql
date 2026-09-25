-- Marca pedidos fictícios (dinheiro/pedido de teste, não real) sem apagar nada — mostrados
-- com badge "Pedido de teste" no admin e no portal do fornecedor, excluídos das somas de
-- valor real (repasse/a pagar), mas visíveis na lista pra rastreabilidade. Não afeta a
-- visão do próprio seller (que não filtra por essa coluna).
ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS e_teste boolean NOT NULL DEFAULT false;

-- Backfill: os 702 pedidos fictícios criados durante testes no seller Segatto (antigo
-- teste.dropcore@gmail.com, id 2406e67b-09d7-42ab-90ae-ce42b95314c8) contra o fornecedor
-- real Djulios (id c0504495-7d9d-40fa-a0d3-b08480ba2abd) — combinação específica, não afeta
-- nenhum outro pedido real de nenhum dos dois lados.
UPDATE public.pedidos
SET e_teste = true
WHERE seller_id = '2406e67b-09d7-42ab-90ae-ce42b95314c8'
  AND fornecedor_id = 'c0504495-7d9d-40fa-a0d3-b08480ba2abd';

CREATE INDEX IF NOT EXISTS idx_pedidos_fornecedor_e_teste
  ON public.pedidos (fornecedor_id, e_teste);
