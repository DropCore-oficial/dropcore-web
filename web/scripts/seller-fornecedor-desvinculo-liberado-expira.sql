-- =============================================================================
-- Coluna de suporte à janela de 5 dias pra escolher fornecedor (vencimento natural dos
-- 3 meses OU liberação antecipada do admin) — ver web/lib/sellerFornecedorTrocaJanelaExpira.ts.
--
-- Regra: quando o seller fica livre pra trocar de fornecedor (liberação antecipada do admin
-- em fornecedor_desvinculo_liberado, ou vencimento natural do compromisso mínimo), ele tem
-- DIAS_JANELA_ESCOLHA_FORNECEDOR (5) dias pra trocar ou desvincular. Se não agir nesse prazo,
-- o cron /api/cron/fornecedor-troca-janela-expira tranca de novo sozinho e reinicia o
-- compromisso mínimo de MESES_MINIMOS_COM_FORNECEDOR (3) com o fornecedor atual.
-- =============================================================================

ALTER TABLE public.sellers
  ADD COLUMN IF NOT EXISTS fornecedor_desvinculo_liberado_em timestamptz;

COMMENT ON COLUMN public.sellers.fornecedor_desvinculo_liberado_em IS
  'Timestamp de quando fornecedor_desvinculo_liberado virou true (admin concedeu liberação antecipada). Usado pelo cron fornecedor-troca-janela-expira pra fechar a liberação sozinha após 5 dias sem o seller trocar/desvincular. NULL quando não há liberação ativa.';
