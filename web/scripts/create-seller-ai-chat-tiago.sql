-- Chat síncrono com o Tiago Silva (Gestor Mestre) — orquestra Diogo/Andrey/Amanda/Ulisses
-- via tool-calling, lendo só o resultado já gravado em seller_ai_runs (nunca dispara rodada
-- nova de gestor no meio da conversa). Parte do add-on "Gestores de IA" (mesmo gate de
-- Diogo/Andrey/Amanda). Ver docs/SCHEMA.md e memória de projeto
-- "Chat IA do Tiago Silva"/"Briefing Gestores de IA".
--
-- Padrão RPC-only: deny-all nas 2 tabelas. TODAS as 6 funções abaixo são só `service_role`
-- (chamadas pelo backend, que já validou o seller via getSellerFromToken antes de chegar
-- aqui) — nenhuma checa auth.uid() por dentro, porque service_role nunca tem JWT de usuário
-- (auth.uid() sempre viria null). Diferente de fn_seller_ai_runs_list (que é pensada pro
-- BROWSER chamar direto com o JWT do seller) — aqui é sempre o servidor chamando.
-- Execute no Supabase SQL Editor.

create table public.seller_ai_chat_sessions (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.sellers(id) on delete cascade,
  org_id uuid not null,
  titulo text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index idx_seller_ai_chat_sessions_seller
  on public.seller_ai_chat_sessions (seller_id, atualizado_em desc);

alter table public.seller_ai_chat_sessions enable row level security;
-- Sem policy: deny-all. Leitura/escrita só via RPC (fn_seller_ai_chat_*).
revoke all on public.seller_ai_chat_sessions from public, anon, authenticated;

create table public.seller_ai_chat_mensagens (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.seller_ai_chat_sessions(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  tokens_input integer,
  tokens_output integer,
  criado_em timestamptz not null default now()
);

create index idx_seller_ai_chat_mensagens_session
  on public.seller_ai_chat_mensagens (session_id, criado_em);

alter table public.seller_ai_chat_mensagens enable row level security;
revoke all on public.seller_ai_chat_mensagens from public, anon, authenticated;

-- Orçamento mensal (reserva-e-concilia) em REAIS (não tokens brutos — input/output têm
-- preço bem diferente, controlar em R$ é mais preciso pro teto de R$120/mês). A tabela
-- genérica api_rate_limits NÃO serve aqui (CHECK trava key_type em 'ip'/'api_key', sem
-- índice único pra upsert) — 2 colunas direto em sellers é mais enxuto que criar tabela nova
-- só pra isso.
alter table public.sellers
  add column if not exists gestor_mestre_chat_custo_mes numeric not null default 0,
  add column if not exists gestor_mestre_chat_mes_ref date;

comment on column public.sellers.gestor_mestre_chat_custo_mes is
  'Custo real (R$) gasto no chat do Tiago Silva no mês corrente (gestor_mestre_chat_mes_ref). Reseta quando o mês muda.';
comment on column public.sellers.gestor_mestre_chat_mes_ref is
  'Primeiro dia do mês de referência de gestor_mestre_chat_custo_mes — zera o contador quando o mês atual for diferente.';

-- fn_seller_ai_chat_historico: 1 RPC por tela (padrão do projeto) — devolve sessões +
-- mensagens da sessão ativa (a mais recente, ou a informada em p_session_id) num JSON só.
create or replace function public.fn_seller_ai_chat_historico(
  p_seller_id uuid,
  p_session_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_session_id uuid;
  v_result jsonb;
begin
  v_session_id := p_session_id;
  if v_session_id is null then
    select id into v_session_id
    from public.seller_ai_chat_sessions
    where seller_id = p_seller_id
    order by atualizado_em desc
    limit 1;
  else
    -- confere que a sessão pedida é mesmo desse seller antes de devolver as mensagens.
    if not exists (
      select 1 from public.seller_ai_chat_sessions
      where id = v_session_id and seller_id = p_seller_id
    ) then
      raise exception 'sessão não encontrada';
    end if;
  end if;

  select jsonb_build_object(
    'sessoes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'titulo', s.titulo, 'criado_em', s.criado_em, 'atualizado_em', s.atualizado_em
      ) order by s.atualizado_em desc)
      from public.seller_ai_chat_sessions s
      where s.seller_id = p_seller_id
    ), '[]'::jsonb),
    'sessao_ativa_id', v_session_id,
    'mensagens', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'role', m.role, 'content', m.content, 'criado_em', m.criado_em
      ) order by m.criado_em asc)
      from public.seller_ai_chat_mensagens m
      where m.session_id = v_session_id
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

-- IMPORTANTE: revoke só de `public` NÃO basta — o Supabase concede EXECUTE direto pra
-- `anon`/`authenticated` por ACL padrão do schema (achado real 2026-09-30, confirmado com
-- has_function_privilege; revoke de public não cobre esses 2 roles). Revoga explícito dos 3.
revoke all on function public.fn_seller_ai_chat_historico(uuid, uuid) from public, anon, authenticated;
grant execute on function public.fn_seller_ai_chat_historico(uuid, uuid) to service_role;

create or replace function public.fn_seller_ai_chat_criar_sessao(p_seller_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_id uuid;
begin
  select org_id into v_org_id from public.sellers where id = p_seller_id;
  if v_org_id is null then
    raise exception 'seller não encontrado';
  end if;

  insert into public.seller_ai_chat_sessions (seller_id, org_id)
  values (p_seller_id, v_org_id)
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.fn_seller_ai_chat_criar_sessao(uuid) from public, anon, authenticated;
grant execute on function public.fn_seller_ai_chat_criar_sessao(uuid) to service_role;

-- NÃO concedida a authenticated/anon — um seller nunca consegue forjar uma mensagem
-- "assistant" ou gravar tokens arbitrários direto do browser via REST.
create or replace function public.fn_seller_ai_chat_gravar_mensagem(
  p_session_id uuid,
  p_role text,
  p_content text,
  p_tokens_input integer default null,
  p_tokens_output integer default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.seller_ai_chat_mensagens (session_id, role, content, tokens_input, tokens_output)
  values (p_session_id, p_role, p_content, p_tokens_input, p_tokens_output)
  returning id into v_id;

  update public.seller_ai_chat_sessions
  set atualizado_em = now()
  where id = p_session_id;

  return v_id;
end;
$$;

revoke all on function public.fn_seller_ai_chat_gravar_mensagem(uuid, text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.fn_seller_ai_chat_gravar_mensagem(uuid, text, text, integer, integer) to service_role;

-- Orçamento: reserva ANTES de chamar a Anthropic (bloqueia se estourar o teto do mês),
-- concilia DEPOIS com o custo real devolvido pela API. Lock de linha (SELECT ... FOR UPDATE)
-- evita corrida se o mesmo seller mandar 2 mensagens em paralelo.
create or replace function public.fn_seller_ai_chat_orcamento_reservar(
  p_seller_id uuid,
  p_custo_estimado numeric,
  p_teto numeric default 120
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mes date := date_trunc('month', now())::date;
  v_usado numeric;
  v_mes_ref date;
begin
  select gestor_mestre_chat_custo_mes, gestor_mestre_chat_mes_ref
    into v_usado, v_mes_ref
  from public.sellers
  where id = p_seller_id
  for update;

  if not found then
    raise exception 'seller não encontrado';
  end if;

  if v_mes_ref is distinct from v_mes then
    v_usado := 0;
  end if;

  if v_usado + p_custo_estimado > p_teto then
    return jsonb_build_object('ok', false, 'usado', v_usado, 'teto', p_teto);
  end if;

  update public.sellers
  set gestor_mestre_chat_custo_mes = v_usado + p_custo_estimado,
      gestor_mestre_chat_mes_ref = v_mes
  where id = p_seller_id;

  return jsonb_build_object('ok', true, 'usado', v_usado + p_custo_estimado, 'teto', p_teto);
end;
$$;

revoke all on function public.fn_seller_ai_chat_orcamento_reservar(uuid, numeric, numeric) from public, anon, authenticated;
grant execute on function public.fn_seller_ai_chat_orcamento_reservar(uuid, numeric, numeric) to service_role;

create or replace function public.fn_seller_ai_chat_orcamento_conciliar(
  p_seller_id uuid,
  p_custo_estimado numeric,
  p_custo_real numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mes date := date_trunc('month', now())::date;
  v_delta numeric := p_custo_real - p_custo_estimado;
begin
  update public.sellers
  set gestor_mestre_chat_custo_mes = greatest(0, gestor_mestre_chat_custo_mes + v_delta)
  where id = p_seller_id
    and gestor_mestre_chat_mes_ref = v_mes;
end;
$$;

revoke all on function public.fn_seller_ai_chat_orcamento_conciliar(uuid, numeric, numeric) from public, anon, authenticated;
grant execute on function public.fn_seller_ai_chat_orcamento_conciliar(uuid, numeric, numeric) to service_role;

-- Status do orçamento — só leitura, devolvida pro seller ver na tela (nunca esconder gasto
-- real). Também service_role-only: o backend já sabe quem é o seller (getSellerFromToken) e
-- repassa pro front, não precisa o browser chamar a função direto.
create or replace function public.fn_seller_ai_chat_orcamento_status(
  p_seller_id uuid,
  p_teto numeric default 120
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_mes date := date_trunc('month', now())::date;
  v_usado numeric;
  v_mes_ref date;
begin
  select gestor_mestre_chat_custo_mes, gestor_mestre_chat_mes_ref
    into v_usado, v_mes_ref
  from public.sellers
  where id = p_seller_id;

  if not found then
    raise exception 'seller não encontrado';
  end if;

  if v_mes_ref is distinct from v_mes then
    v_usado := 0;
  end if;

  return jsonb_build_object('usado', coalesce(v_usado, 0), 'teto', p_teto);
end;
$$;

revoke all on function public.fn_seller_ai_chat_orcamento_status(uuid, numeric) from public, anon, authenticated;
grant execute on function public.fn_seller_ai_chat_orcamento_status(uuid, numeric) to service_role;
