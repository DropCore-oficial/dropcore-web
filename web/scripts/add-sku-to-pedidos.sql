-- Adiciona sku_id, nome_produto e preco_venda à tabela pedidos
-- Execute no Supabase SQL Editor.

-- 1. Adiciona colunas na tabela pedidos (nullable — pedidos antigos não têm esses dados)
ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS sku_id uuid REFERENCES public.skus(id) ON DELETE SET NULL;

ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS nome_produto text;

ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS preco_venda numeric;

CREATE INDEX IF NOT EXISTS idx_pedidos_sku ON public.pedidos(sku_id);

-- 2. Garante que pedido_itens existe (já criada no create-pedidos.sql, mas por segurança)
CREATE TABLE IF NOT EXISTS public.pedido_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id uuid NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
  sku_id uuid REFERENCES public.skus(id) ON DELETE SET NULL,
  nome_produto text,
  quantidade int NOT NULL DEFAULT 1 CHECK (quantidade > 0),
  preco_unitario numeric NOT NULL DEFAULT 0,
  valor_total numeric NOT NULL DEFAULT 0,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pedido_itens_pedido ON public.pedido_itens(pedido_id);
CREATE INDEX IF NOT EXISTS idx_pedido_itens_sku ON public.pedido_itens(sku_id);
