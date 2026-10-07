-- "Ideias pra anúncio novo" (Andrey avulso) ganhou busca web real (ferramenta web_search da
-- Anthropic, 2026-10-07) — custo é cobrado separado dos tokens ($10/1000 buscas), por isso
-- precisa de uma coluna própria pra entrar na conta do orçamento diário (gastoAvulsoHojeReais).
alter table public.calculadora_assinante_ai_runs
  add column web_search_requests integer;
