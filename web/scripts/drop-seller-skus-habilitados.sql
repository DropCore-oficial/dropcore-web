-- Dropa a tabela seller_skus_habilitados (2026-11-08).
-- Motivo: o toggle "Venda na API" por SKU/cor foi removido de vez (ver docs/SCHEMA.md,
-- seção "Fim do toggle seller_skus_habilitados") — todo SKU ativo do fornecedor vinculado
-- ao seller já conta como disponível pra venda, sem opt-in manual. Nenhum código lê ou
-- escreve mais nessa tabela; nenhuma outra tabela tem FK apontando pra ela (confirmado via
-- pg_constraint antes de rodar este script).
drop table if exists public.seller_skus_habilitados;
