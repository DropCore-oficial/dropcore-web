-- Dispositivo confiável no login: quando alguém loga de um computador não reconhecido,
-- ou o dispositivo já confiável expirou por inatividade, pede um código de 6 dígitos
-- por e-mail antes de liberar acesso às rotas protegidas (gate em web/middleware.ts).
-- Ver web/lib/sellerFornecedorVinculo.ts / seller_invites para o padrão de token que
-- inspirou isto — aqui guardo hash em vez de texto puro por ser mais sensível (sessão
-- de 30 dias, não um convite de uso único).

create table if not exists public.trusted_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_token_hash text not null unique,
  criado_em timestamptz not null default now(),
  ultimo_uso_em timestamptz not null default now(),
  expira_em timestamptz not null
);

create index if not exists idx_trusted_devices_user on public.trusted_devices(user_id);

alter table public.trusted_devices enable row level security;
-- Deny-all (mesmo padrão de seller_invites/fornecedor_invites): só service role e a
-- função rpc_touch_trusted_device (SECURITY DEFINER) tocam nesta tabela.

create table if not exists public.login_verification_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  code_hash text not null,
  tentativas int not null default 0,
  usado boolean not null default false,
  expira_em timestamptz not null,
  criado_em timestamptz not null default now()
);

create index if not exists idx_login_codes_user on public.login_verification_codes(user_id, criado_em desc);

alter table public.login_verification_codes enable row level security;
-- Deny-all, só service role.

-- rpc_touch_trusted_device: chamada pelo middleware com o client anon já autenticado
-- (mesmo client usado pra auth.getUser()). Usa auth.uid() internamente — nunca recebe
-- user_id por fora, evita IDOR. Se o dispositivo for válido, renova a validade (rolling
-- window de 30 dias) e retorna true; senão, false.
create or replace function public.rpc_touch_trusted_device(p_token_hash text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  update public.trusted_devices
  set ultimo_uso_em = now(), expira_em = now() + interval '30 days'
  where user_id = (select auth.uid())
    and device_token_hash = p_token_hash
    and expira_em > now();

  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$$;

revoke all on function public.rpc_touch_trusted_device(text) from public;
-- Supabase concede EXECUTE a anon/authenticated por padrão em função nova (default
-- privileges do schema public) — revoke all from public não cobre isso, precisa revogar
-- de anon explicitamente também (achado na verificação manual pós-deploy).
revoke execute on function public.rpc_touch_trusted_device(text) from anon;
grant execute on function public.rpc_touch_trusted_device(text) to authenticated;
