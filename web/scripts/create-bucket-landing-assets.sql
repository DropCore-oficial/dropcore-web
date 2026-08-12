-- Bucket público pra asset institucional/marketing da landing page (vídeo do hero, etc).
-- Não confundir com o bucket `produto-imagens` (esse é específico de catálogo/produto).
-- Sem policy em storage.objects: mesmo padrão do `produto-imagens` já em produção — upload
-- só via service role (bypassa RLS), leitura pública vem do flag `public` do bucket, não de
-- policy.
insert into storage.buckets (id, name, public)
values ('landing-assets', 'landing-assets', true)
on conflict (id) do nothing;
