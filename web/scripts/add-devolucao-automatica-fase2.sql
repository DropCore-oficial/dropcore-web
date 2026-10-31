-- Devolução ML — fase 2 (2026-10-30): trava automática sem clique do admin, atribuição
-- certa de fornecedor via catálogo (achado real: Galileus conectado ao Consenso mas vende
-- Djulios — pedido vinha sempre carimbado com o fornecedor errado), caminho "devolução não
-- procede" (dinheiro volta pro fornecedor), e visibilidade de valor retido nas 3 pontas
-- (seller/fornecedor/admin). Regra 9 do CLAUDE.md: mutação financeira nova sempre por RPC
-- SECURITY DEFINER.

-- =============================================================================
-- 1) fornecedor_id na tabela de devoluções detectadas (fase 1 não persistia isso)
-- =============================================================================
alter table public.seller_ml_devolucoes_detectadas
  add column if not exists fornecedor_id uuid references public.fornecedores(id);

-- CREATE OR REPLACE não permite mudar a lista de parâmetros (Postgres trata como função
-- diferente, deixaria a versão de 10 args órfã) — dropa a assinatura antiga antes.
drop function if exists public.fn_ml_devolucao_detectada_registrar(
  uuid, uuid, text, text, text, text, text[], text, uuid, uuid
);

create or replace function public.fn_ml_devolucao_detectada_registrar(
  p_org_id uuid,
  p_seller_id uuid,
  p_ml_claim_id text,
  p_ml_resource text,
  p_ml_resource_id text,
  p_ml_reason_id text,
  p_ml_rules_engine_triage text[],
  p_criterio text,
  p_pedido_id uuid,
  p_ledger_id uuid,
  p_fornecedor_id uuid
)
returns table(ja_existia boolean, devolucao_id uuid)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_id uuid;
begin
  insert into public.seller_ml_devolucoes_detectadas (
    org_id, seller_id, ml_claim_id, ml_resource, ml_resource_id, ml_reason_id,
    ml_rules_engine_triage, criterio, pedido_id, ledger_id, fornecedor_id
  )
  values (
    p_org_id, p_seller_id, p_ml_claim_id, p_ml_resource, p_ml_resource_id, p_ml_reason_id,
    coalesce(p_ml_rules_engine_triage, '{}'), p_criterio, p_pedido_id, p_ledger_id, p_fornecedor_id
  )
  on conflict (ml_claim_id) do nothing
  returning id into v_id;

  if v_id is not null then
    return query select false, v_id;
    return;
  end if;

  select d.id into v_id from public.seller_ml_devolucoes_detectadas d where d.ml_claim_id = p_ml_claim_id;
  return query select true, v_id;
end;
$function$;

revoke all on function public.fn_ml_devolucao_detectada_registrar from public;
grant execute on function public.fn_ml_devolucao_detectada_registrar to service_role;

-- =============================================================================
-- 2) Trava automática / destrava / "não procede" — financial_ledger + pedidos.status
-- =============================================================================
alter table public.financial_ledger
  add column if not exists em_devolucao_status_anterior text;

alter table public.pedidos
  drop constraint if exists pedidos_status_check,
  add constraint pedidos_status_check check (status = any (array[
    'enviado', 'aguardando_repasse', 'entregue', 'devolvido', 'cancelado',
    'erro_saldo', 'pendente_estoque', 'bloqueado', 'produto_nao_vinculado',
    'anuncio_sem_sku', 'em_devolucao', 'devolucao_sem_fornecedor'
  ]));

-- Trava automática: chamada pela detecção (sem clique do admin). Atômica via `for update`.
create or replace function public.fn_devolucao_auto_travar(p_ledger_id uuid)
returns table(ok boolean, motivo text)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_status text;
  v_pedido_id uuid;
begin
  select status, pedido_id into v_status, v_pedido_id
    from public.financial_ledger
   where id = p_ledger_id
   for update;

  if not found then
    return query select false, 'Registro não encontrado.';
    return;
  end if;
  if v_status not in ('BLOQUEADO', 'ENTREGUE', 'AGUARDANDO_REPASSE') then
    return query select false, 'Status atual não permite travar automático.';
    return;
  end if;

  update public.financial_ledger
     set status = 'EM_DEVOLUCAO',
         em_devolucao_desde = now(),
         em_devolucao_status_anterior = v_status
   where id = p_ledger_id;

  if v_pedido_id is not null then
    update public.pedidos set status = 'em_devolucao' where id = v_pedido_id;
  end if;

  return query select true, null::text;
end;
$function$;

-- Destrava sozinho se a reclamação do ML fechar sem virar devolução de verdade — só se
-- ninguém (fornecedor) mexeu ainda.
create or replace function public.fn_devolucao_auto_destravar(p_ledger_id uuid)
returns table(ok boolean, motivo text)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_row record;
begin
  select status, em_devolucao_status_anterior, pedido_id,
         fornecedor_confirmou_recebimento_em, fornecedor_contestou_em
    into v_row
    from public.financial_ledger
   where id = p_ledger_id
   for update;

  if not found then
    return query select false, 'Registro não encontrado.';
    return;
  end if;
  if v_row.status <> 'EM_DEVOLUCAO' then
    return query select false, 'Registro não está mais em devolução.';
    return;
  end if;
  if v_row.fornecedor_confirmou_recebimento_em is not null or v_row.fornecedor_contestou_em is not null then
    return query select false, 'Fornecedor já agiu — não destrava automático.';
    return;
  end if;

  update public.financial_ledger
     set status = coalesce(v_row.em_devolucao_status_anterior, 'ENTREGUE'),
         em_devolucao_desde = null,
         em_devolucao_status_anterior = null
   where id = p_ledger_id;

  if v_row.pedido_id is not null then
    update public.pedidos set status = 'entregue' where id = v_row.pedido_id and status = 'em_devolucao';
  end if;

  return query select true, null::text;
end;
$function$;

-- Admin decide que a devolução não procede — mesma reversão, ação humana (loga fora, na rota).
create or replace function public.fn_devolucao_admin_manter_venda(p_ledger_id uuid)
returns table(ok boolean, motivo text)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_row record;
begin
  select status, em_devolucao_status_anterior, pedido_id
    into v_row
    from public.financial_ledger
   where id = p_ledger_id
   for update;

  if not found then
    return query select false, 'Registro não encontrado.';
    return;
  end if;
  if v_row.status <> 'EM_DEVOLUCAO' then
    return query select false, 'Registro não está em devolução.';
    return;
  end if;

  update public.financial_ledger
     set status = coalesce(v_row.em_devolucao_status_anterior, 'ENTREGUE'),
         em_devolucao_desde = null,
         em_devolucao_status_anterior = null
   where id = p_ledger_id;

  if v_row.pedido_id is not null then
    update public.pedidos set status = 'entregue' where id = v_row.pedido_id and status = 'em_devolucao';
  end if;

  return query select true, null::text;
end;
$function$;

revoke all on function public.fn_devolucao_auto_travar from public;
grant execute on function public.fn_devolucao_auto_travar to service_role;
revoke all on function public.fn_devolucao_auto_destravar from public;
grant execute on function public.fn_devolucao_auto_destravar to service_role;
revoke all on function public.fn_devolucao_admin_manter_venda from public;
grant execute on function public.fn_devolucao_admin_manter_venda to service_role;

-- Pedido para DEVOLVIDO também precisa espelhar pedidos.status — reaproveitando as 3 RPCs já
-- criadas na fase 1 (fn_devolucao_fornecedor_confirmar, fn_devolucao_liberar_automatico):
create or replace function public.fn_devolucao_fornecedor_confirmar(
  p_ledger_id uuid,
  p_fornecedor_id uuid
)
returns table(ok boolean, motivo text, devolucao_ledger_id uuid)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_row record;
  v_dev_id uuid;
begin
  select id, org_id, status, fornecedor_id, seller_id, pedido_id,
         valor_fornecedor, valor_dropcore, valor_total, ciclo_repasse
    into v_row
    from public.financial_ledger
   where id = p_ledger_id
   for update;

  if not found then
    return query select false, 'Registro não encontrado.', null::uuid;
    return;
  end if;
  -- Dono pode ser o fornecedor do ledger OU o fornecedor resolvido via catálogo na
  -- detecção ML (achado 2026-10-30: o ledger pode estar com fornecedor_id errado — ex.
  -- seller vende produto de um fornecedor diferente do "oficialmente conectado").
  if v_row.fornecedor_id is distinct from p_fornecedor_id
     and not exists (
       select 1 from public.seller_ml_devolucoes_detectadas d
       where d.ledger_id = p_ledger_id and d.fornecedor_id = p_fornecedor_id
     )
  then
    return query select false, 'Esse registro não pertence à sua conta.', null::uuid;
    return;
  end if;
  if v_row.status <> 'EM_DEVOLUCAO' then
    return query select false, 'Esse registro não está aguardando confirmação.', null::uuid;
    return;
  end if;

  update public.financial_ledger
     set status = 'DEVOLVIDO', fornecedor_confirmou_recebimento_em = now()
   where id = p_ledger_id;

  if v_row.pedido_id is not null then
    update public.pedidos set status = 'devolvido' where id = v_row.pedido_id;
  end if;

  insert into public.financial_ledger (
    org_id, seller_id, fornecedor_id, pedido_id, tipo,
    valor_fornecedor, valor_dropcore, valor_total, status, ciclo_repasse, referencia
  ) values (
    v_row.org_id, v_row.seller_id, v_row.fornecedor_id, v_row.pedido_id, 'DEVOLUCAO',
    v_row.valor_fornecedor, v_row.valor_dropcore, v_row.valor_total, 'DEVOLVIDO', v_row.ciclo_repasse,
    'devolucao confirmada pelo fornecedor do ledger ' || p_ledger_id
  )
  returning id into v_dev_id;

  return query select true, null::text, v_dev_id;
end;
$function$;

create or replace function public.fn_devolucao_liberar_automatico(p_ledger_id uuid)
returns table(ok boolean, motivo text, devolucao_ledger_id uuid)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_row record;
  v_dev_id uuid;
begin
  select id, org_id, status, fornecedor_id, seller_id, pedido_id,
         valor_fornecedor, valor_dropcore, valor_total, ciclo_repasse,
         em_devolucao_desde, fornecedor_contestou_em
    into v_row
    from public.financial_ledger
   where id = p_ledger_id
   for update;

  if not found then
    return query select false, 'Registro não encontrado.', null::uuid;
    return;
  end if;
  if v_row.status <> 'EM_DEVOLUCAO' then
    return query select false, 'Registro não está mais em devolução.', null::uuid;
    return;
  end if;
  if v_row.fornecedor_contestou_em is not null then
    return query select false, 'Fornecedor contestou — não libera automático.', null::uuid;
    return;
  end if;
  if v_row.em_devolucao_desde is null or v_row.em_devolucao_desde > now() - interval '48 hours' then
    return query select false, 'Ainda não venceu o prazo de 48h.', null::uuid;
    return;
  end if;

  update public.financial_ledger
     set status = 'DEVOLVIDO'
   where id = p_ledger_id;

  if v_row.pedido_id is not null then
    update public.pedidos set status = 'devolvido' where id = v_row.pedido_id;
  end if;

  insert into public.financial_ledger (
    org_id, seller_id, fornecedor_id, pedido_id, tipo,
    valor_fornecedor, valor_dropcore, valor_total, status, ciclo_repasse, referencia
  ) values (
    v_row.org_id, v_row.seller_id, v_row.fornecedor_id, v_row.pedido_id, 'DEVOLUCAO',
    v_row.valor_fornecedor, v_row.valor_dropcore, v_row.valor_total, 'DEVOLVIDO', v_row.ciclo_repasse,
    'devolucao liberada automaticamente (48h sem resposta do fornecedor) do ledger ' || p_ledger_id
  )
  returning id into v_dev_id;

  return query select true, null::text, v_dev_id;
end;
$function$;

-- Mesma correção de dono (ledger OU detecção ML) na RPC de contestar, criada ontem.
create or replace function public.fn_devolucao_fornecedor_contestar(
  p_ledger_id uuid,
  p_fornecedor_id uuid,
  p_texto text,
  p_foto_path text
)
returns table(ok boolean, motivo text)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_status text;
  v_fornecedor_id uuid;
begin
  select status, fornecedor_id into v_status, v_fornecedor_id
    from public.financial_ledger
   where id = p_ledger_id
   for update;

  if not found then
    return query select false, 'Registro não encontrado.';
    return;
  end if;
  if v_fornecedor_id is distinct from p_fornecedor_id
     and not exists (
       select 1 from public.seller_ml_devolucoes_detectadas d
       where d.ledger_id = p_ledger_id and d.fornecedor_id = p_fornecedor_id
     )
  then
    return query select false, 'Esse registro não pertence à sua conta.';
    return;
  end if;
  if v_status <> 'EM_DEVOLUCAO' then
    return query select false, 'Esse registro não está aguardando confirmação.';
    return;
  end if;

  update public.financial_ledger
     set fornecedor_contestou_em = now(),
         fornecedor_contestacao_texto = p_texto,
         fornecedor_contestacao_foto_path = p_foto_path
   where id = p_ledger_id;

  return query select true, null::text;
end;
$function$;

-- =============================================================================
-- 3) Visibilidade de valor retido — seller (saldo_bloqueado_devolucao)
-- =============================================================================
alter table public.sellers
  add column if not exists saldo_bloqueado_devolucao numeric not null default 0;

-- CREATE OR REPLACE não permite mudar as colunas de RETURNS TABLE — precisa dropar primeiro.
drop function if exists public.fn_seller_saldo_from_ledger(uuid);

create or replace function public.fn_seller_saldo_from_ledger(p_seller_id uuid)
returns table(saldo_disponivel numeric, saldo_bloqueado numeric, saldo_total numeric, saldo_bloqueado_devolucao numeric)
language plpgsql
stable
set search_path to 'public'
as $function$
declare
  v_credito numeric;
  v_bloqueado numeric;
  v_bloqueado_devolucao numeric;
  v_pago numeric;
  v_devolucao numeric;
begin
  select coalesce(sum(valor_total), 0) into v_credito
  from public.financial_ledger
  where seller_id = p_seller_id and tipo = 'CREDITO';

  select coalesce(sum(valor_total), 0) into v_bloqueado
  from public.financial_ledger
  where seller_id = p_seller_id
    and tipo in ('BLOQUEIO', 'VENDA')
    and status in ('BLOQUEADO', 'ENTREGUE', 'AGUARDANDO_REPASSE', 'EM_DEVOLUCAO');

  select coalesce(sum(valor_total), 0) into v_bloqueado_devolucao
  from public.financial_ledger
  where seller_id = p_seller_id
    and tipo in ('BLOQUEIO', 'VENDA')
    and status = 'EM_DEVOLUCAO';

  select coalesce(sum(valor_total), 0) into v_pago
  from public.financial_ledger
  where seller_id = p_seller_id
    and tipo in ('BLOQUEIO', 'VENDA')
    and status = 'PAGO';

  select coalesce(sum(valor_total), 0) into v_devolucao
  from public.financial_ledger
  where seller_id = p_seller_id and tipo = 'DEVOLUCAO' and valor_total > 0;

  saldo_bloqueado := v_bloqueado;
  saldo_bloqueado_devolucao := v_bloqueado_devolucao;
  saldo_disponivel := greatest(0, v_credito - v_bloqueado - v_pago + v_devolucao);
  saldo_total := saldo_disponivel + saldo_bloqueado;
  return next;
end;
$function$;

-- Achado de segurança (2026-10-30, incidental enquanto mexia nessa função pra esta feature):
-- estava aberta pra anon/authenticated — qualquer usuário, logado ou não, podia chamar com o
-- seller_id de outro e ver o saldo financeiro dele. Mesma classe de bug já corrigida em
-- 2026-10-11 (lockdown-security-definer-rpc-execute-grants.sql). Fechando aqui.
revoke all on function public.fn_seller_saldo_from_ledger from public, anon, authenticated;
grant execute on function public.fn_seller_saldo_from_ledger to service_role;

create or replace function public.fn_sync_seller_saldo_from_ledger()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r record;
  sid uuid;
begin
  sid := coalesce(new.seller_id, old.seller_id);
  if sid is null then return coalesce(new, old); end if;
  for r in select * from public.fn_seller_saldo_from_ledger(sid)
  loop
    update public.sellers
    set saldo_atual = r.saldo_disponivel,
        saldo_bloqueado = r.saldo_bloqueado,
        saldo_bloqueado_devolucao = r.saldo_bloqueado_devolucao,
        atualizado_em = now()
    where id = sid;
    exit;
  end loop;
  return coalesce(new, old);
end;
$function$;

-- Backfill único pra sellers existentes (não é reconciliação recorrente, só preenche a
-- coluna nova a partir do estado atual do ledger).
do $$
declare
  s record;
  r record;
begin
  for s in select id from public.sellers loop
    for r in select * from public.fn_seller_saldo_from_ledger(s.id) loop
      update public.sellers set saldo_bloqueado_devolucao = r.saldo_bloqueado_devolucao where id = s.id;
    end loop;
  end loop;
end $$;

-- =============================================================================
-- 4) Visibilidade de valor retido — admin (fn_org_dashboard_pro_30d.retido_devolucao)
-- =============================================================================
create or replace function public.fn_org_dashboard_pro_30d(p_org_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_d30 timestamptz := (now() - interval '30 days');
  v_total_pedidos int;
  v_volume_total float8;
  v_volume_dropcore float8;
  v_volume_fornecedor float8;
  v_top_sellers jsonb;
  v_top_forn jsonb;
  v_vendas_dia jsonb;
  v_receita_pago float8;
  v_receita_pendente float8;
  v_retido_devolucao float8;
  v_ticket float8;
  v_margem float8;
begin
  select
    count(*)::int,
    coalesce(sum(coalesce(valor_total, 0)), 0),
    coalesce(sum(coalesce(valor_dropcore, 0)), 0),
    coalesce(sum(coalesce(valor_fornecedor, 0)), 0)
  into v_total_pedidos, v_volume_total, v_volume_dropcore, v_volume_fornecedor
  from public.pedidos
  where org_id = p_org_id
    and criado_em >= v_d30
    and status not in ('cancelado', 'erro_saldo', 'pendente_estoque', 'bloqueado')
    and e_teste = false;

  v_ticket := case when v_total_pedidos > 0 then v_volume_total / v_total_pedidos else 0 end;
  v_margem := case when v_volume_total > 0 then (v_volume_dropcore / v_volume_total) * 100 else 0 end;

  select coalesce(jsonb_agg(row_to_json(t)::jsonb order by t.total desc), '[]'::jsonb)
  into v_top_sellers
  from (
    select
      p.seller_id as id,
      coalesce(s.nome, '—') as nome,
      sum(coalesce(p.valor_total, 0))::float8 as total,
      count(*)::int as pedidos
    from public.pedidos p
    left join public.sellers s on s.id = p.seller_id
    where p.org_id = p_org_id
      and p.criado_em >= v_d30
      and p.status not in ('cancelado', 'erro_saldo', 'pendente_estoque', 'bloqueado')
      and p.e_teste = false
    group by p.seller_id, s.nome
    order by sum(coalesce(p.valor_total, 0)) desc
    limit 5
  ) t;

  select coalesce(jsonb_agg(row_to_json(t)::jsonb order by t.total desc), '[]'::jsonb)
  into v_top_forn
  from (
    select
      p.fornecedor_id as id,
      coalesce(f.nome, '—') as nome,
      sum(coalesce(p.valor_total, 0))::float8 as total,
      sum(coalesce(p.valor_dropcore, 0))::float8 as dropcore,
      count(*)::int as pedidos
    from public.pedidos p
    left join public.fornecedores f on f.id = p.fornecedor_id
    where p.org_id = p_org_id
      and p.criado_em >= v_d30
      and p.status not in ('cancelado', 'erro_saldo', 'pendente_estoque', 'bloqueado')
      and p.e_teste = false
    group by p.fornecedor_id, f.nome
    order by sum(coalesce(p.valor_total, 0)) desc
    limit 5
  ) t;

  select coalesce(jsonb_agg(row_to_json(t)::jsonb order by t.dia), '[]'::jsonb)
  into v_vendas_dia
  from (
    select
      to_char((p.criado_em at time zone 'UTC')::date, 'YYYY-MM-DD') as dia,
      sum(coalesce(p.valor_total, 0))::float8 as total,
      sum(coalesce(p.valor_dropcore, 0))::float8 as dropcore,
      count(*)::int as count
    from public.pedidos p
    where p.org_id = p_org_id
      and p.criado_em >= v_d30
      and p.status not in ('cancelado', 'erro_saldo', 'pendente_estoque', 'bloqueado')
      and p.e_teste = false
    group by (p.criado_em at time zone 'UTC')::date
    order by (p.criado_em at time zone 'UTC')::date
  ) t;

  select
    coalesce(sum(case when status = 'PAGO' then coalesce(valor_dropcore, 0) else 0 end), 0),
    coalesce(
      sum(
        case
          when status not in ('PAGO', 'CANCELADO', 'DEVOLVIDO') then coalesce(valor_dropcore, 0)
          else 0
        end
      ),
      0
    ),
    coalesce(sum(case when status = 'EM_DEVOLUCAO' then coalesce(valor_dropcore, 0) else 0 end), 0)
  into v_receita_pago, v_receita_pendente, v_retido_devolucao
  from public.financial_ledger fl
  where fl.org_id = p_org_id
    and fl.tipo in ('BLOQUEIO', 'VENDA')
    and fl.data_evento >= v_d30
    and not exists (
      select 1 from public.pedidos p
      where p.id = fl.pedido_id and p.e_teste = true
    );

  return jsonb_build_object(
    'periodo', '30d',
    'total_pedidos', v_total_pedidos,
    'volume_total', v_volume_total,
    'volume_fornecedor', v_volume_fornecedor,
    'volume_dropcore', v_volume_dropcore,
    'ticket_medio', round(v_ticket::numeric, 2),
    'margem_media_pct', round(v_margem::numeric, 2),
    'receita_pago', v_receita_pago,
    'receita_pendente', v_receita_pendente,
    'retido_devolucao', v_retido_devolucao,
    'top_sellers', v_top_sellers,
    'top_fornecedores', v_top_forn,
    'vendas_por_dia', v_vendas_dia
  );
end;
$function$;

-- =============================================================================
-- 5) Contador "Devolução (N)" nas listas de pedido — total independente do filtro ativo
-- =============================================================================
-- CREATE OR REPLACE não permite mudar as colunas de RETURNS TABLE — precisa dropar primeiro.
drop function if exists public.fn_fornecedor_pedidos_lista(uuid, uuid, text, int, int);

create or replace function public.fn_fornecedor_pedidos_lista(
  p_org_id uuid,
  p_fornecedor_id uuid,
  p_status text,
  p_limit int,
  p_offset int
)
returns table (
  id uuid,
  seller_id uuid,
  fornecedor_id uuid,
  sku_id uuid,
  nome_produto text,
  preco_venda numeric,
  valor_fornecedor numeric,
  status text,
  motivo_bloqueio text,
  motivo_bloqueio_responsavel text,
  cancelado_motivo text,
  criado_em timestamptz,
  etiqueta_pdf_url text,
  etiqueta_pdf_base64 text,
  etiqueta_impressa_em timestamptz,
  etiqueta_liberada_em timestamptz,
  marketplace_numero text,
  marketplace_pack_id text,
  comprador_nome text,
  comprador_cidade text,
  comprador_uf text,
  comprador_fone text,
  referencia_externa text,
  metodo_envio text,
  tracking_codigo text,
  canal_venda text,
  e_teste boolean,
  total_count bigint,
  total_count_devolucao bigint
)
language sql
security definer
set search_path to 'public'
as $function$
  select
    p.id, p.seller_id, p.fornecedor_id, p.sku_id, p.nome_produto,
    p.preco_venda, p.valor_fornecedor, p.status,
    p.motivo_bloqueio, p.motivo_bloqueio_responsavel, p.cancelado_motivo,
    p.criado_em, p.etiqueta_pdf_url, p.etiqueta_pdf_base64,
    p.etiqueta_impressa_em, p.etiqueta_liberada_em,
    p.marketplace_numero, p.marketplace_pack_id,
    p.comprador_nome, p.comprador_cidade, p.comprador_uf, p.comprador_fone,
    p.referencia_externa, p.metodo_envio, p.tracking_codigo, p.canal_venda,
    p.e_teste,
    count(*) over()::bigint as total_count,
    count(*) filter (where p.status in ('em_devolucao', 'devolvido', 'devolucao_sem_fornecedor')) over()::bigint as total_count_devolucao
  from public.pedidos p
  where p.org_id = p_org_id
    and p.fornecedor_id = p_fornecedor_id
    and p.e_teste = false
    and p.status not in ('produto_nao_vinculado', 'anuncio_sem_sku')
    and (p_status is null or p.status = p_status)
  order by
    case when p.status = 'enviado'
      and p.etiqueta_impressa_em is null
      and (p.etiqueta_pdf_url is not null or p.etiqueta_pdf_base64 is not null)
      then p.etiqueta_liberada_em end desc nulls last,
    p.criado_em desc
  limit p_limit offset p_offset;
$function$;

revoke all on function public.fn_fornecedor_pedidos_lista from public;
grant execute on function public.fn_fornecedor_pedidos_lista to service_role;

-- CREATE OR REPLACE não permite mudar as colunas de RETURNS TABLE — precisa dropar primeiro.
drop function if exists public.fn_seller_pedidos_lista(uuid, uuid, text, int, int);

create or replace function public.fn_seller_pedidos_lista(
  p_org_id uuid,
  p_seller_id uuid,
  p_status text,
  p_limit int,
  p_offset int
)
returns table (
  id uuid,
  nome_produto text,
  valor_total numeric,
  preco_venda numeric,
  status text,
  motivo_bloqueio text,
  motivo_bloqueio_responsavel text,
  cancelado_motivo text,
  criado_em timestamptz,
  referencia_externa text,
  tracking_codigo text,
  metodo_envio text,
  marketplace_numero text,
  marketplace_pack_id text,
  comprador_nome text,
  comprador_cidade text,
  comprador_uf text,
  comprador_fone text,
  canal_venda text,
  etiqueta_pdf_url text,
  etiqueta_pdf_base64 text,
  etiqueta_tentativas int,
  etiqueta_impressa_em timestamptz,
  etiqueta_liberada_em timestamptz,
  total_count bigint,
  total_count_devolucao bigint
)
language sql
security definer
set search_path to 'public'
as $function$
  select
    p.id, p.nome_produto, p.valor_total, p.preco_venda, p.status,
    p.motivo_bloqueio, p.motivo_bloqueio_responsavel, p.cancelado_motivo,
    p.criado_em, p.referencia_externa, p.tracking_codigo, p.metodo_envio,
    p.marketplace_numero, p.marketplace_pack_id,
    p.comprador_nome, p.comprador_cidade, p.comprador_uf, p.comprador_fone,
    p.canal_venda, p.etiqueta_pdf_url, p.etiqueta_pdf_base64, p.etiqueta_tentativas,
    p.etiqueta_impressa_em, p.etiqueta_liberada_em,
    count(*) over()::bigint as total_count,
    count(*) filter (where p.status in ('em_devolucao', 'devolvido', 'devolucao_sem_fornecedor')) over()::bigint as total_count_devolucao
  from public.pedidos p
  where p.org_id = p_org_id
    and p.seller_id = p_seller_id
    and (
      case
        when p_status = 'etiqueta_buffer_ml' then
          p.status = 'enviado' and p.canal_venda = 'mercado_livre'
          and p.etiqueta_pdf_url is null and p.etiqueta_pdf_base64 is null
        when p_status is not null then p.status = p_status
        else true
      end
    )
  order by
    case when p.status = 'enviado'
      and p.etiqueta_impressa_em is null
      and (p.etiqueta_pdf_url is not null or p.etiqueta_pdf_base64 is not null)
      then p.etiqueta_liberada_em end desc nulls last,
    p.criado_em desc
  limit p_limit offset p_offset;
$function$;

revoke all on function public.fn_seller_pedidos_lista from public;
grant execute on function public.fn_seller_pedidos_lista to service_role;
