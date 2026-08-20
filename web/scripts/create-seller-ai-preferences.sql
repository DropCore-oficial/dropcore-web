-- Preferência cacheada do seller pros Gestores de IA (nicho, momento, capital, objetivo, tom).
-- Perguntado ao seller uma vez só; reusado por todos os gestores em vez de reperguntar.
-- Ver docs/SCHEMA.md e memória de projeto "Briefing Gestores de IA".
--
-- Padrão RPC-only: a tabela não tem policy de acesso direto (deny-all, mesmo padrão de
-- seller_invites/fornecedor_invites/calculadora_invites em docs/SCHEMA.md). Toda leitura e
-- escrita passa pelas duas funções abaixo, que checam o vínculo por dentro.

create table public.seller_ai_preferences (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  seller_id uuid not null unique references public.sellers(id),
  nicho text,
  momento_operacao text,
  capital_disponivel text,
  objetivo text check (objetivo in ('margem', 'volume', 'reputacao')),
  tom_comunicacao text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

alter table public.seller_ai_preferences enable row level security;
-- Sem policy: deny-all para anon/authenticated. Acesso só via RPC (SECURITY DEFINER) ou
-- supabaseAdmin (service role).

revoke all on public.seller_ai_preferences from public, anon, authenticated;

create or replace function public.fn_seller_ai_preferences_get(p_seller_id uuid)
returns public.seller_ai_preferences
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_row public.seller_ai_preferences;
  v_org_id uuid;
begin
  select org_id into v_org_id from public.sellers where id = p_seller_id;
  if v_org_id is null or not public.fn_user_can_access_seller(v_org_id, p_seller_id) then
    raise exception 'acesso negado';
  end if;

  select * into v_row from public.seller_ai_preferences where seller_id = p_seller_id;
  return v_row;
end;
$$;

create or replace function public.fn_seller_ai_preferences_upsert(
  p_seller_id uuid,
  p_nicho text,
  p_momento_operacao text,
  p_capital_disponivel text,
  p_objetivo text,
  p_tom_comunicacao text
)
returns public.seller_ai_preferences
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.seller_ai_preferences;
  v_org_id uuid;
begin
  select org_id into v_org_id from public.sellers where id = p_seller_id;
  if v_org_id is null or not public.fn_user_can_access_seller(v_org_id, p_seller_id) then
    raise exception 'acesso negado';
  end if;

  insert into public.seller_ai_preferences
    (org_id, seller_id, nicho, momento_operacao, capital_disponivel, objetivo, tom_comunicacao)
  values
    (v_org_id, p_seller_id, p_nicho, p_momento_operacao, p_capital_disponivel, p_objetivo, p_tom_comunicacao)
  on conflict (seller_id) do update set
    nicho = excluded.nicho,
    momento_operacao = excluded.momento_operacao,
    capital_disponivel = excluded.capital_disponivel,
    objetivo = excluded.objetivo,
    tom_comunicacao = excluded.tom_comunicacao,
    atualizado_em = now()
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.fn_seller_ai_preferences_get(uuid) from public;
revoke all on function public.fn_seller_ai_preferences_upsert(uuid, text, text, text, text, text) from public;
grant execute on function public.fn_seller_ai_preferences_get(uuid) to authenticated;
grant execute on function public.fn_seller_ai_preferences_upsert(uuid, text, text, text, text, text) to authenticated;
