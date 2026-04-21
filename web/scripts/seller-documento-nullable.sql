-- Permite criar seller só com nome (documento preenchido depois pelo seller no painel).
-- Rode no Supabase SQL editor se a coluna estiver NOT NULL.

ALTER TABLE public.sellers
  ALTER COLUMN documento DROP NOT NULL;
