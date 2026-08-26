-- Auditoria de ações que os gestores de IA (ou o seller, via sugestão do gestor) executam
-- de fato em sistemas externos (ex: Andrey aplicando um título novo no Mercado Livre).
-- Não é o resultado da análise (isso já mora em seller_ai_runs.resultado) — é o registro de
-- "isso foi escrito de verdade num anúncio/pedido/etc, por quem, quando, e deu certo?".
-- Ver docs/SCHEMA.md e memória de projeto "Briefing Gestores de IA".
--
-- Padrão RPC-only: deny-all na tabela, leitura só via fn_seller_ai_acoes_list (SECURITY
-- DEFINER, mesma checagem fn_user_can_access_seller de seller_ai_runs). Escrita: só
-- supabaseAdmin (service role) dentro da API route que executa a ação, não RPC de insert
-- exposta a authenticated.

create table public.seller_ai_acoes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  seller_id uuid not null references public.sellers(id),
  run_id uuid references public.seller_ai_runs(id),
  gestor text not null check (gestor in (
    'anuncios_seo', 'estoque_fulfillment', 'reputacao', 'ads', 'atendimento'
  )),
  alvo_tipo text not null,
  alvo_id text not null,
  acao text not null,
  status text not null default 'confirmado' check (status in ('confirmado', 'executado', 'erro')),
  detalhes jsonb not null default '{}',
  actor_user_id uuid,
  ip_address text,
  user_agent text,
  criado_em timestamptz not null default now(),
  executado_em timestamptz
);

create index idx_seller_ai_acoes_seller_criado
  on public.seller_ai_acoes (seller_id, criado_em desc);

alter table public.seller_ai_acoes enable row level security;
-- Sem policy: deny-all. Leitura só via RPC; escrita só via supabaseAdmin na API route.

revoke all on public.seller_ai_acoes from public, anon, authenticated;

create or replace function public.fn_seller_ai_acoes_list(
  p_seller_id uuid,
  p_limit int default 20,
  p_before timestamptz default null
)
returns setof public.seller_ai_acoes
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
    from public.seller_ai_acoes a
    where a.seller_id = p_seller_id
      and (p_before is null or a.criado_em < p_before)
    order by a.criado_em desc
    limit greatest(1, least(p_limit, 50));
end;
$$;

revoke all on function public.fn_seller_ai_acoes_list(uuid, int, timestamptz) from public;
grant execute on function public.fn_seller_ai_acoes_list(uuid, int, timestamptz) to authenticated;
