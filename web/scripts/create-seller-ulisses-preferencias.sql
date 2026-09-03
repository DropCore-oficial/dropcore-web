-- Preferências do Ulisses (gestor de Ads/Preço/Promoção) — margem mínima/máxima, imposto,
-- perda, e liga/desliga+% de ads (com teto de gasto), afiliado e cupom. Perguntado ao
-- seller na primeira vez que ele abre a página do Ulisses; editável por ele a qualquer
-- momento depois (não é "configurou uma vez e travou").
-- Ver docs/SCHEMA.md e memória de projeto "Briefing Gestores de IA".
--
-- Padrão RPC-only, mesmo de seller_ai_preferences: tabela deny-all, acesso só pelas duas
-- funções abaixo (SECURITY DEFINER, checam o vínculo seller/org por dentro).

create table public.seller_ulisses_preferencias (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  seller_id uuid not null unique references public.sellers(id),
  margem_minima_pct numeric not null check (margem_minima_pct > 0),
  margem_maxima_pct numeric,
  imposto_pct numeric not null default 0 check (imposto_pct >= 0),
  perda_pct numeric not null default 0 check (perda_pct >= 0),
  ads_ativo boolean not null default false,
  ads_tacos_pct numeric check (ads_tacos_pct is null or ads_tacos_pct >= 0),
  ads_teto_valor numeric check (ads_teto_valor is null or ads_teto_valor >= 0),
  ads_teto_periodo text check (ads_teto_periodo is null or ads_teto_periodo in ('dia', 'mes')),
  afiliado_ativo boolean not null default false,
  afiliado_pct numeric check (afiliado_pct is null or afiliado_pct >= 0),
  cupom_ativo boolean not null default false,
  cupom_pct numeric check (cupom_pct is null or cupom_pct >= 0),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint seller_ulisses_preferencias_margem_max_ck
    check (margem_maxima_pct is null or margem_maxima_pct >= margem_minima_pct)
);

alter table public.seller_ulisses_preferencias enable row level security;
-- Sem policy: deny-all para anon/authenticated. Acesso só via RPC (SECURITY DEFINER) ou
-- supabaseAdmin (service role, usado pelo gestor no cron/rota "rodar").

revoke all on public.seller_ulisses_preferencias from public, anon, authenticated;

create or replace function public.fn_seller_ulisses_preferencias_get(p_seller_id uuid)
returns public.seller_ulisses_preferencias
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_row public.seller_ulisses_preferencias;
  v_org_id uuid;
begin
  select org_id into v_org_id from public.sellers where id = p_seller_id;
  if v_org_id is null or not public.fn_user_can_access_seller(v_org_id, p_seller_id) then
    raise exception 'acesso negado';
  end if;

  select * into v_row from public.seller_ulisses_preferencias where seller_id = p_seller_id;
  return v_row;
end;
$$;

create or replace function public.fn_seller_ulisses_preferencias_upsert(
  p_seller_id uuid,
  p_margem_minima_pct numeric,
  p_margem_maxima_pct numeric,
  p_imposto_pct numeric,
  p_perda_pct numeric,
  p_ads_ativo boolean,
  p_ads_tacos_pct numeric,
  p_ads_teto_valor numeric,
  p_ads_teto_periodo text,
  p_afiliado_ativo boolean,
  p_afiliado_pct numeric,
  p_cupom_ativo boolean,
  p_cupom_pct numeric
)
returns public.seller_ulisses_preferencias
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.seller_ulisses_preferencias;
  v_org_id uuid;
begin
  select org_id into v_org_id from public.sellers where id = p_seller_id;
  if v_org_id is null or not public.fn_user_can_access_seller(v_org_id, p_seller_id) then
    raise exception 'acesso negado';
  end if;

  insert into public.seller_ulisses_preferencias
    (org_id, seller_id, margem_minima_pct, margem_maxima_pct, imposto_pct, perda_pct,
     ads_ativo, ads_tacos_pct, ads_teto_valor, ads_teto_periodo,
     afiliado_ativo, afiliado_pct, cupom_ativo, cupom_pct)
  values
    (v_org_id, p_seller_id, p_margem_minima_pct, p_margem_maxima_pct, p_imposto_pct, p_perda_pct,
     p_ads_ativo, p_ads_tacos_pct, p_ads_teto_valor, p_ads_teto_periodo,
     p_afiliado_ativo, p_afiliado_pct, p_cupom_ativo, p_cupom_pct)
  on conflict (seller_id) do update set
    margem_minima_pct = excluded.margem_minima_pct,
    margem_maxima_pct = excluded.margem_maxima_pct,
    imposto_pct = excluded.imposto_pct,
    perda_pct = excluded.perda_pct,
    ads_ativo = excluded.ads_ativo,
    ads_tacos_pct = excluded.ads_tacos_pct,
    ads_teto_valor = excluded.ads_teto_valor,
    ads_teto_periodo = excluded.ads_teto_periodo,
    afiliado_ativo = excluded.afiliado_ativo,
    afiliado_pct = excluded.afiliado_pct,
    cupom_ativo = excluded.cupom_ativo,
    cupom_pct = excluded.cupom_pct,
    atualizado_em = now()
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.fn_seller_ulisses_preferencias_get(uuid) from public;
revoke all on function public.fn_seller_ulisses_preferencias_upsert(
  uuid, numeric, numeric, numeric, numeric, boolean, numeric, numeric, text, boolean, numeric, boolean, numeric
) from public;
grant execute on function public.fn_seller_ulisses_preferencias_get(uuid) to authenticated;
grant execute on function public.fn_seller_ulisses_preferencias_upsert(
  uuid, numeric, numeric, numeric, numeric, boolean, numeric, numeric, text, boolean, numeric, boolean, numeric
) to authenticated;
