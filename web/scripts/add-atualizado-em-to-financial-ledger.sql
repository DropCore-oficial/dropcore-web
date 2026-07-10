-- financial_ledger nunca teve a coluna atualizado_em, mas 3 pontos do código já
-- esperavam ela existir (marcar pedido como postado manual/ERP/Olist, marcar entregue):
--   web/app/api/fornecedor/pedidos/[id]/marcar-postado/route.ts
--   web/app/api/erp/pedidos/route.ts (updatePedidoPostado)
--   web/app/api/org/pedidos/[id]/entregar/route.ts
-- Sem a coluna, o UPDATE de status falhava e o lançamento ficava travado em BLOQUEADO
-- pra sempre — o que faria o repasse semanal (só pega status ENTREGUE/AGUARDANDO_REPASSE)
-- nunca pagar o fornecedor por esses pedidos.

ALTER TABLE public.financial_ledger
  ADD COLUMN IF NOT EXISTS atualizado_em timestamptz NOT NULL DEFAULT now();

COMMENT ON COLUMN public.financial_ledger.atualizado_em IS 'Coluna esperada por vários pontos do código (marcar postado manual/ERP, marcar entregue) que faltava no schema — sem ela, o UPDATE de status falhava e o lançamento ficava travado em BLOQUEADO.';

-- Backfill pontual (já aplicado em produção em 2026-07-10): pedidos com status
-- 'aguardando_repasse' cujo lançamento BLOQUEIO ficou preso em BLOQUEADO por causa
-- do bug acima.
UPDATE public.financial_ledger l
SET status = 'AGUARDANDO_REPASSE', atualizado_em = now()
FROM public.pedidos p
WHERE l.pedido_id = p.id
  AND l.tipo = 'BLOQUEIO'
  AND l.status = 'BLOQUEADO'
  AND p.status = 'aguardando_repasse';
