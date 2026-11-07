-- Conexão OAuth2 direta do FORNECEDOR com Mercado Livre — substitui o pull via Olist/Tiny
-- como fonte de skus.estoque_atual (ver docs/SCHEMA.md). Token cifrado com
-- SELLER_ERP_CREDENTIALS_KEY (web/lib/sellerErpSecretBox.ts, genérica apesar do nome, já
-- usada pelo fluxo Olist do fornecedor hoje — não cria chave nova).
--
-- Regra inegociável 9 do CLAUDE.md: tabela nova, todo acesso passa por RPC
-- (fn_fornecedor_mercadolivre_*), nunca .from() direto nas rotas Next.js.

create table public.fornecedor_mercadolivre_integrations (
  id uuid primary key default gen_random_uuid(),
  fornecedor_id uuid not null unique references public.fornecedores(id) on delete cascade,
  org_id uuid not null,
  ml_user_id text unique,
  ml_access_token text,
  ml_refresh_token text,
  ml_access_token_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.fornecedor_mercadolivre_integrations enable row level security;
-- Sem policy: deny-all pra anon/authenticated. Acesso só via supabaseAdmin.rpc(...).
revoke all on public.fornecedor_mercadolivre_integrations from public, anon, authenticated;

-- upsert (callback OAuth + renovação de token)
create function public.fn_fornecedor_mercadolivre_integracao_upsert(
  p_fornecedor_id uuid,
  p_org_id uuid,
  p_ml_user_id text,
  p_ml_access_token text,
  p_ml_refresh_token text,
  p_ml_access_token_expires_at timestamptz
)
returns public.fornecedor_mercadolivre_integrations
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_row public.fornecedor_mercadolivre_integrations;
begin
  insert into public.fornecedor_mercadolivre_integrations (
    fornecedor_id, org_id, ml_user_id, ml_access_token, ml_refresh_token,
    ml_access_token_expires_at, updated_at
  )
  values (
    p_fornecedor_id, p_org_id, p_ml_user_id, p_ml_access_token, p_ml_refresh_token,
    p_ml_access_token_expires_at, now()
  )
  on conflict (fornecedor_id) do update set
    org_id = excluded.org_id,
    ml_user_id = excluded.ml_user_id,
    ml_access_token = excluded.ml_access_token,
    ml_refresh_token = excluded.ml_refresh_token,
    ml_access_token_expires_at = excluded.ml_access_token_expires_at,
    updated_at = now()
  returning * into v_row;
  return v_row;
end;
$function$;

-- leitura de status/token
create function public.fn_fornecedor_mercadolivre_integracao_get(p_fornecedor_id uuid)
returns public.fornecedor_mercadolivre_integrations
language sql
security definer
set search_path to 'public'
as $function$
  select * from public.fornecedor_mercadolivre_integrations where fornecedor_id = p_fornecedor_id;
$function$;

-- desconectar
create function public.fn_fornecedor_mercadolivre_integracao_delete(p_fornecedor_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  delete from public.fornecedor_mercadolivre_integrations where fornecedor_id = p_fornecedor_id;
  return found;
end;
$function$;

-- lista pro cron (quem tem conexão ativa pra sincronizar)
create function public.fn_fornecedor_mercadolivre_integracoes_conectadas_lista()
returns setof public.fornecedor_mercadolivre_integrations
language sql
security definer
set search_path to 'public'
as $function$
  select * from public.fornecedor_mercadolivre_integrations where ml_user_id is not null;
$function$;

-- escrita final de estoque (1 linha, 1 dono — regra 9)
create function public.fn_fornecedor_sku_estoque_mercadolivre_set(
  p_sku_id uuid,
  p_org_id uuid,
  p_fornecedor_id uuid,
  p_novo_estoque integer
)
returns public.skus
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_row public.skus;
begin
  update public.skus
  set estoque_atual = p_novo_estoque
  where id = p_sku_id and org_id = p_org_id and fornecedor_id = p_fornecedor_id
  returning * into v_row;
  return v_row;
end;
$function$;

revoke all on function public.fn_fornecedor_mercadolivre_integracao_upsert from public, anon, authenticated;
revoke all on function public.fn_fornecedor_mercadolivre_integracao_get from public, anon, authenticated;
revoke all on function public.fn_fornecedor_mercadolivre_integracao_delete from public, anon, authenticated;
revoke all on function public.fn_fornecedor_mercadolivre_integracoes_conectadas_lista from public, anon, authenticated;
revoke all on function public.fn_fornecedor_sku_estoque_mercadolivre_set from public, anon, authenticated;

grant execute on function public.fn_fornecedor_mercadolivre_integracao_upsert to service_role;
grant execute on function public.fn_fornecedor_mercadolivre_integracao_get to service_role;
grant execute on function public.fn_fornecedor_mercadolivre_integracao_delete to service_role;
grant execute on function public.fn_fornecedor_mercadolivre_integracoes_conectadas_lista to service_role;
grant execute on function public.fn_fornecedor_sku_estoque_mercadolivre_set to service_role;
