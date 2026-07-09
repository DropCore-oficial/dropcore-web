-- Remove TRUNCATE de anon/authenticated em todo o schema public.
-- RLS não se aplica a TRUNCATE (é permissão de tabela inteira, não de linha),
-- então mesmo tabelas com RLS bem configurada podiam ser apagadas por completo
-- por qualquer requisição usando a anon key (pública, embutida no client).
REVOKE TRUNCATE ON ALL TABLES IN SCHEMA public FROM anon, authenticated;

-- Garante que tabelas futuras não herdem esse privilégio de novo.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE TRUNCATE ON TABLES FROM anon, authenticated;
