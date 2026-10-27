-- Design (Laura) V2 — geração de foto nova via Gemini, pro assinante avulso "Gestores de IA".
-- Bucket privado (mesmo padrão de disputas-evidencias): sem policy em storage.objects, upload
-- e leitura só via service role (supabaseAdmin), nunca direto do navegador do seller — URL
-- assinada é devolvida pela rota de API.

insert into storage.buckets (id, name, public)
values ('design-fotos-geradas', 'design-fotos-geradas', false)
on conflict (id) do nothing;

create table public.calculadora_assinante_fotos_geradas (
  id uuid primary key default gen_random_uuid(),
  assinante_id uuid not null references public.calculadora_assinantes(id) on delete cascade,
  chave text not null,
  storage_path text not null,
  criado_em timestamptz not null default now()
);

create index idx_calculadora_assinante_fotos_geradas_assinante_chave
  on public.calculadora_assinante_fotos_geradas (assinante_id, chave, criado_em desc);

alter table public.calculadora_assinante_fotos_geradas enable row level security;
-- Deny-all de propósito (igual calculadora_assinante_ai_runs/mercadolivre_integrations) —
-- acesso só via RPC SECURITY DEFINER chamada pelo service_role.

create or replace function public.fn_calculadora_assinante_foto_gerada_insert(
  p_assinante_id uuid,
  p_chave text,
  p_storage_path text
) returns uuid
language sql
security definer
set search_path = public
as $$
  insert into public.calculadora_assinante_fotos_geradas (assinante_id, chave, storage_path)
  values (p_assinante_id, p_chave, p_storage_path)
  returning id;
$$;

create or replace function public.fn_calculadora_assinante_fotos_geradas_list(
  p_assinante_id uuid,
  p_chave text
) returns setof public.calculadora_assinante_fotos_geradas
language sql
stable security definer
set search_path = public
as $$
  select *
  from public.calculadora_assinante_fotos_geradas
  where assinante_id = p_assinante_id and chave = p_chave
  order by criado_em desc;
$$;

revoke all on function public.fn_calculadora_assinante_foto_gerada_insert from public, anon, authenticated;
revoke all on function public.fn_calculadora_assinante_fotos_geradas_list from public, anon, authenticated;

grant execute on function public.fn_calculadora_assinante_foto_gerada_insert to service_role;
grant execute on function public.fn_calculadora_assinante_fotos_geradas_list to service_role;
