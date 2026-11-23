-- Centro de Distribuição (CD) DropCore: repasse por item em vez de por pedido inteiro.
-- pedido_itens já existe e já é escrita/lida em todo pedido (ver submitSellerErpPedido.ts,
-- org/pedidos, erp/pedidos, fornecedor/pedidos) — faltam as 3 colunas de split financeiro.
-- Execute no SQL Editor do Supabase (ou via MCP). Backfill primeiro, CHECK por último
-- (NOT VALID + VALIDATE, pra não travar a tabela em produção).

ALTER TABLE public.pedido_itens ADD COLUMN IF NOT EXISTS fornecedor_id uuid REFERENCES public.fornecedores(id);
ALTER TABLE public.pedido_itens ADD COLUMN IF NOT EXISTS valor_fornecedor numeric NOT NULL DEFAULT 0 CHECK (valor_fornecedor >= 0);
ALTER TABLE public.pedido_itens ADD COLUMN IF NOT EXISTS valor_dropcore numeric NOT NULL DEFAULT 0 CHECK (valor_dropcore >= 0);

-- Backfill: histórico sempre foi 1 fornecedor por pedido, então fornecedor_id herda exato
-- de pedidos.fornecedor_id. valor_fornecedor é proporcional à mesma margem do pedido pai;
-- valor_dropcore é o resto (garante soma exata, evita erro de arredondamento em split).
UPDATE public.pedido_itens pi
SET
  fornecedor_id = p.fornecedor_id,
  valor_fornecedor = CASE
    WHEN p.valor_total > 0 THEN round(pi.valor_total * p.valor_fornecedor / p.valor_total, 2)
    ELSE 0
  END,
  valor_dropcore = pi.valor_total - CASE
    WHEN p.valor_total > 0 THEN round(pi.valor_total * p.valor_fornecedor / p.valor_total, 2)
    ELSE 0
  END
FROM public.pedidos p
WHERE p.id = pi.pedido_id;

ALTER TABLE public.pedido_itens
  ADD CONSTRAINT chk_pedido_item_valor_total
  CHECK (valor_total = valor_fornecedor + valor_dropcore) NOT VALID;

ALTER TABLE public.pedido_itens VALIDATE CONSTRAINT chk_pedido_item_valor_total;

CREATE INDEX IF NOT EXISTS idx_pedido_itens_fornecedor_id ON public.pedido_itens (fornecedor_id);

COMMENT ON COLUMN public.pedido_itens.fornecedor_id IS
  'Fornecedor real do item, resolvido por skus.fornecedor_id na ingestão (nunca por '
  'pedidos.fornecedor_id/seller) — permite repasse por item quando o pedido mistura '
  'fornecedores do CD.';
