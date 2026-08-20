-- Resultado estruturado de cada rodada de gestor de IA (Preço & Concorrência, Anúncios &
-- SEO, Estoque & Fulfillment, Reputação, Ads, Atendimento). Gravado pelo cron diário via
-- supabaseAdmin (service role) — o seller nunca escreve aqui, só lê.
-- Ver docs/SCHEMA.md e memória de projeto "Briefing Gestores de IA".
--
-- Padrão RPC-only: deny-all na tabela, leitura só via fn_seller_ai_runs_list (SECURITY
-- DEFINER, checa fn_user_can_access_seller). Escrita: só supabaseAdmin (service role já
-- ignora RLS, sem precisar de RPC de insert exposta a authenticated).

create table public.seller_ai_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  seller_id uuid not null references public.sellers(id),
  gestor text not null check (gestor in (
    'preco_concorrencia', 'anuncios_seo', 'estoque_fulfillment',
    'reputacao', 'ads', 'atendimento'
  )),
  marketplace text not null check (marketplace in ('mercado_livre', 'shopee', 'tiktok_shop')),
  status text not null default 'ok' check (status in ('ok', 'erro')),
  resultado jsonb,
  erro_mensagem text,
  modelo text,
  origem_chave text not null default 'casa' check (origem_chave in ('casa', 'byok')),
  creditos_debitados numeric,
  executado_em timestamptz not null default now(),
  criado_em timestamptz not null default now()
);

create index idx_seller_ai_runs_seller_executado
  on public.seller_ai_runs (seller_id, executado_em desc);

alter table public.seller_ai_runs enable row level security;
-- Sem policy: deny-all. Leitura só via RPC; escrita só via supabaseAdmin no job do cron.

revoke all on public.seller_ai_runs from public, anon, authenticated;

create or replace function public.fn_seller_ai_runs_list(
  p_seller_id uuid,
  p_limit int default 20,
  p_before timestamptz default null
)
returns setof public.seller_ai_runs
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
begin
  select org_id into v_org_id from public.sellers where id = p_seller_id;
  if v_org_id is null or not public.fn_user_can_access_seller(v_org_id, p_seller_id) then
    raise exception 'acesso negado';
  end if;

  return query
    select *
    from public.seller_ai_runs r
    where r.seller_id = p_seller_id
      and (p_before is null or r.executado_em < p_before)
    order by r.executado_em desc
    limit greatest(1, least(p_limit, 50));
end;
$$;

revoke all on function public.fn_seller_ai_runs_list(uuid, int, timestamptz) from public;
grant execute on function public.fn_seller_ai_runs_list(uuid, int, timestamptz) to authenticated;
