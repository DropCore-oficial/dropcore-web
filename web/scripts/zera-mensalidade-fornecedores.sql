-- =============================================================================
-- Decisão de negócio 2026-10-11: fornecedor não paga mais mensalidade (Sr Stark pediu pra
-- zerar e "deixar eles livres"). Todo fornecedor usa o plano "default" pro valor de
-- mensalidade (ver web/lib/gerarMensalidadesCicloOrg.ts) — zerar esse único plano já cobre
-- todos, inclusive quem entrar depois. Guard contra linha de R$0 nascer todo mês adicionado
-- em gerarMensalidadesCicloOrg.ts (mesmo racional do mensalidade_valor_travado=0 do seller).
-- =============================================================================

UPDATE public.financial_planos
SET valor_fornecedor = 0
WHERE plano = 'default';

-- Mensalidades de fornecedor já em aberto no momento da decisão (pendente ou inadimplente) —
-- excluídas pra ninguém ficar devendo cobrança que a casa decidiu não fazer mais.
DELETE FROM public.financial_mensalidades
WHERE tipo = 'fornecedor'
  AND status IN ('pendente', 'inadimplente');
