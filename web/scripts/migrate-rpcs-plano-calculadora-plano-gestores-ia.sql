-- Fase B (parte banco) do plano "Desmembrar Calculadora x Gestores de IA avulso x HUB" —
-- repoonta as RPCs que liam/escreviam direto em calculadora_assinantes pras 2 tabelas novas
-- (ver add-plano-calculadora-plano-gestores-ia-tabelas.sql, Fase A). As colunas ainda EXISTEM
-- em calculadora_assinantes nesta fase (só saem na Fase C, script separado) — mas a partir
-- daqui o valor de verdade (lido e escrito) passa a ser o das tabelas novas.

-- 1) Trigger: toda vez que uma linha nova nasce em calculadora_assinantes (invite, PIX
--    pendente, contrato anual), garante que as 2 linhas-satélite já existem — sem isso, um
--    assinante novo criado por qualquer um desses caminhos ficaria sem linha na tabela nova,
--    e toda leitura (chave BYOK, orçamento, ciclo do plano) quebraria silenciosamente pra ele.
create or replace function public.fn_calculadora_assinante_planos_rows_ensure() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.calculadora_assinante_plano_calculadora (assinante_id) values (new.id) on conflict (assinante_id) do nothing;
  insert into public.calculadora_assinante_plano_gestores_ia (assinante_id) values (new.id) on conflict (assinante_id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_calculadora_assinante_planos_rows_ensure on public.calculadora_assinantes;
create trigger trg_calculadora_assinante_planos_rows_ensure
after insert on public.calculadora_assinantes
for each row execute function public.fn_calculadora_assinante_planos_rows_ensure();

-- 2) fn_calculadora_assinante_por_user_id — hoje devolve `calculadora_assinantes` inteira
--    (select *), mas os 3 callers só usam id/user_id/ativo/inclui_gestores_ia/desconto. Troca
--    pra um tipo próprio (desacopla do formato da tabela) via LEFT JOIN na tabela nova.
drop function if exists public.fn_calculadora_assinante_por_user_id(uuid);

create type public.calculadora_assinante_sessao as (
  id uuid,
  user_id uuid,
  ativo boolean,
  inclui_gestores_ia boolean,
  gestores_ia_desconto_tipo text,
  gestores_ia_desconto_valor numeric
);

create function public.fn_calculadora_assinante_por_user_id(p_user_id uuid)
returns public.calculadora_assinante_sessao
language sql
stable security definer
set search_path = public
as $$
  select a.id, a.user_id, a.ativo, a.inclui_gestores_ia, g.gestores_ia_desconto_tipo, g.gestores_ia_desconto_valor
  from public.calculadora_assinantes a
  left join public.calculadora_assinante_plano_gestores_ia g on g.assinante_id = a.id
  where a.user_id = p_user_id;
$$;

revoke all on function public.fn_calculadora_assinante_por_user_id from public, anon, authenticated;
grant execute on function public.fn_calculadora_assinante_por_user_id to service_role;

-- 3) BYOK Anthropic — ponto de leitura (configurado) repontado + 2 RPCs de escrita novas
--    (hoje a rota fazia .from().update() direto; passa a ir por RPC, igual o Gemini já é).
create or replace function public.fn_calculadora_assinante_byok_configurado(p_assinante_id uuid)
returns boolean
language sql
stable security definer
set search_path = public
as $$
  select anthropic_api_key_encriptada is not null
  from public.calculadora_assinante_plano_gestores_ia
  where assinante_id = p_assinante_id;
$$;

create or replace function public.fn_calculadora_assinante_byok_upsert(p_assinante_id uuid, p_key_encriptada text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.calculadora_assinante_plano_gestores_ia
  set anthropic_api_key_encriptada = p_key_encriptada, anthropic_api_key_configurada_em = now()
  where assinante_id = p_assinante_id;
$$;

create or replace function public.fn_calculadora_assinante_byok_delete(p_assinante_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.calculadora_assinante_plano_gestores_ia
  set anthropic_api_key_encriptada = null, anthropic_api_key_configurada_em = null
  where assinante_id = p_assinante_id;
$$;

revoke all on function public.fn_calculadora_assinante_byok_upsert from public, anon, authenticated;
revoke all on function public.fn_calculadora_assinante_byok_delete from public, anon, authenticated;
grant execute on function public.fn_calculadora_assinante_byok_upsert to service_role;
grant execute on function public.fn_calculadora_assinante_byok_delete to service_role;

-- 4) BYOK Gemini — já iam todos por RPC (construídas nesta sessão), só repontar o FROM/UPDATE.
create or replace function public.fn_calculadora_assinante_byok_gemini_configurado(p_assinante_id uuid)
returns boolean
language sql
stable security definer
set search_path = public
as $$
  select gemini_api_key_encriptada is not null
  from public.calculadora_assinante_plano_gestores_ia
  where assinante_id = p_assinante_id;
$$;

create or replace function public.fn_calculadora_assinante_byok_gemini_get(p_assinante_id uuid)
returns text
language sql
stable security definer
set search_path = public
as $$
  select gemini_api_key_encriptada
  from public.calculadora_assinante_plano_gestores_ia
  where assinante_id = p_assinante_id;
$$;

create or replace function public.fn_calculadora_assinante_byok_gemini_upsert(p_assinante_id uuid, p_key_encriptada text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.calculadora_assinante_plano_gestores_ia
  set gemini_api_key_encriptada = p_key_encriptada
  where assinante_id = p_assinante_id;
$$;

create or replace function public.fn_calculadora_assinante_byok_gemini_delete(p_assinante_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.calculadora_assinante_plano_gestores_ia
  set gemini_api_key_encriptada = null
  where assinante_id = p_assinante_id;
$$;

-- 5) PIX do pacote Gestores de IA — mp_gestores_ia_*/gestores_ia_ciclo saem de
--    calculadora_assinantes; valido_ate/ativo/inclui_gestores_ia continuam lá (núcleo).
create or replace function public.fn_calculadora_assinante_gestores_ia_pix_pendente_set(p_user_id uuid, p_mp_pendente_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assinante_id uuid;
begin
  insert into public.calculadora_assinantes (user_id, valido_ate, ativo)
  values (p_user_id, now(), false)
  on conflict (user_id) do update set updated_at = now()
  returning id into v_assinante_id;

  if v_assinante_id is null then
    select id into v_assinante_id from public.calculadora_assinantes where user_id = p_user_id;
  end if;

  update public.calculadora_assinante_plano_gestores_ia
  set mp_gestores_ia_pendente_id = p_mp_pendente_id
  where assinante_id = v_assinante_id;
end;
$$;

create or replace function public.fn_calculadora_assinante_gestores_ia_pix_get(p_user_id uuid)
returns table(valido_ate timestamptz, mp_gestores_ia_pendente_id text, mp_gestores_ia_ultimo_aprovado_id text)
language sql
security definer
set search_path = public
as $$
  select a.valido_ate, g.mp_gestores_ia_pendente_id, g.mp_gestores_ia_ultimo_aprovado_id
  from public.calculadora_assinantes a
  left join public.calculadora_assinante_plano_gestores_ia g on g.assinante_id = a.id
  where a.user_id = p_user_id;
$$;

create or replace function public.fn_calculadora_assinante_gestores_ia_pix_confirmar(
  p_user_id uuid,
  p_novo_valido_ate timestamptz,
  p_mp_payment_id text,
  p_external_reference text,
  p_valor_pago numeric,
  p_pago_em timestamptz
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assinante_id uuid;
  v_ultimo text;
begin
  select a.id, g.mp_gestores_ia_ultimo_aprovado_id into v_assinante_id, v_ultimo
  from public.calculadora_assinantes a
  left join public.calculadora_assinante_plano_gestores_ia g on g.assinante_id = a.id
  where a.user_id = p_user_id;

  if v_ultimo is not null and v_ultimo = p_mp_payment_id then
    return false;
  end if;

  update public.calculadora_assinantes set
    inclui_gestores_ia = true,
    valido_ate = p_novo_valido_ate,
    ativo = true,
    updated_at = now()
  where id = v_assinante_id;

  update public.calculadora_assinante_plano_gestores_ia set
    gestores_ia_ciclo = coalesce(gestores_ia_ciclo, 'mensal'),
    mp_gestores_ia_ultimo_aprovado_id = p_mp_payment_id,
    mp_gestores_ia_pendente_id = null
  where assinante_id = v_assinante_id;

  insert into public.calculadora_recebimentos (user_id, mp_payment_id, valor, external_reference, pago_em)
  values (p_user_id, p_mp_payment_id, p_valor_pago, p_external_reference, p_pago_em)
  on conflict do nothing;

  return true;
end;
$$;

-- 6) Contrato anual — gestores_ia_ciclo/gestores_ia_contrato_aceite_em saem do insert de
--    calculadora_assinantes, viram update na tabela nova (linha já garantida pelo trigger).
create or replace function public.fn_calculadora_assinante_gestores_ia_contrato_anual_iniciar(p_user_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_carencia_ate timestamptz := now() + interval '60 days';
  v_assinante_id uuid;
begin
  insert into public.calculadora_assinantes (user_id, valido_ate, ativo, inclui_gestores_ia)
  values (p_user_id, v_carencia_ate, true, true)
  on conflict (user_id) do update set
    valido_ate = greatest(public.calculadora_assinantes.valido_ate, v_carencia_ate),
    ativo = true,
    inclui_gestores_ia = true,
    updated_at = now()
  returning id into v_assinante_id;

  update public.calculadora_assinante_plano_gestores_ia
  set gestores_ia_ciclo = 'anual', gestores_ia_contrato_aceite_em = now()
  where assinante_id = v_assinante_id;

  return v_carencia_ate;
end;
$$;

-- 7) Desconto definido pelo admin.
create or replace function public.fn_calculadora_assinante_gestores_ia_desconto_set(p_assinante_id uuid, p_tipo text, p_valor numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_tipo is not null and p_tipo not in ('valor', 'percentual') then
    raise exception 'tipo de desconto inválido: %', p_tipo;
  end if;

  update public.calculadora_assinante_plano_gestores_ia
  set
    gestores_ia_desconto_tipo = p_tipo,
    gestores_ia_desconto_valor = case when p_tipo is null then null else p_valor end
  where assinante_id = p_assinante_id;
end;
$$;

-- 8) Listagem admin do pacote Gestores de IA.
create or replace function public.fn_calculadora_assinantes_gestores_ia_list(p_limit integer default 50, p_offset integer default 0)
returns table(
  id uuid, user_id uuid, nome text, ativo boolean, gestores_ia_ciclo text, valido_ate timestamptz,
  gestores_ia_contrato_aceite_em timestamptz, created_at timestamptz, gestores_ia_desconto_tipo text,
  gestores_ia_desconto_valor numeric, total_count bigint
)
language sql
security definer
set search_path = public
as $$
  select
    ca.id, ca.user_id, ca.nome, ca.ativo,
    g.gestores_ia_ciclo, ca.valido_ate, g.gestores_ia_contrato_aceite_em, ca.created_at,
    g.gestores_ia_desconto_tipo, g.gestores_ia_desconto_valor,
    count(*) over () as total_count
  from public.calculadora_assinantes ca
  left join public.calculadora_assinante_plano_gestores_ia g on g.assinante_id = ca.id
  where ca.inclui_gestores_ia = true
  order by ca.created_at desc
  limit greatest(p_limit, 0)
  offset greatest(p_offset, 0);
$$;
