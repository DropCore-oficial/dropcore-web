-- seller_mercadolivre_integrations.linked_seller_id (2026-10-01) — permite 2 sellers
-- DropCore compartilharem a MESMA conexão real do Mercado Livre sem duplicar token.
--
-- Caso de uso: Segatto e Galileus são as 2 contas de demonstração internas do Sr Stark —
-- Galileus já estava conectada na conta ML real "Djulios"; a Segatto também precisava ver
-- dado dessa mesma conta. ml_user_id é UNIQUE (1 conta ML = 1 seller só) e o refresh_token
-- do Mercado Livre é de uso único — se os dois sellers guardassem cópia própria do token,
-- a renovação de um invalidaria o do outro. Em vez de duplicar, a linha "secundária"
-- (Segatto) não guarda token nenhum, só aponta pra linha "dona" de verdade (Galileus) via
-- linked_seller_id — getValidMercadoLivreAccessToken (mercadoLivreApiClient.ts) segue esse
-- link e sempre renova/lê o token da linha dona, nunca duplica.
--
-- Efeito colateral aceito de propósito: ação "aplicar" disparada do painel da Segatto
-- escreve na mesma conta ML real que o Galileus usa (não é espelho isolado) — as duas são
-- contas de teste internas, não tem seller de verdade nos dois lados.

alter table public.seller_mercadolivre_integrations
  add column linked_seller_id uuid references public.sellers(id) on delete set null;

alter table public.seller_mercadolivre_integrations
  add constraint seller_mercadolivre_integrations_linked_not_self
  check (linked_seller_id is null or linked_seller_id <> seller_id);

-- Segatto (2406e67b-09d7-42ab-90ae-ce42b95314c8) larga a conexão ML própria que tinha
-- (conta diferente da Djulios) e passa a apontar pra linha do Galileus
-- (4e46e749-8103-4a71-9b70-195ba73cba14), dona de verdade da conexão com "Djulios".
update public.seller_mercadolivre_integrations
set ml_user_id = null,
    ml_access_token = null,
    ml_refresh_token = null,
    ml_access_token_expires_at = null,
    linked_seller_id = '4e46e749-8103-4a71-9b70-195ba73cba14',
    updated_at = now()
where seller_id = '2406e67b-09d7-42ab-90ae-ce42b95314c8';
