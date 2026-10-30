-- Detecção de devolução ML — roda pra TODO seller com integração direta ML ativa,
-- independente do add-on de Gestores de IA / saldo_atual / teto de R$4/dia (decisão
-- 2026-10-29: é risco financeiro, não feature premium — achado real: seller Vinz Collection
-- teve devolução que o DropCore não capturou em nenhuma tabela porque o único código que
-- tocava "claims" do ML era da Amanda, gated por add-on e que descarta de propósito
-- reclamação sem evidência). Regra 9 do CLAUDE.md: tabela nova só por RPC SECURITY DEFINER,
-- grant só pra service_role.

create table public.seller_ml_devolucoes_detectadas (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  seller_id uuid not null references public.sellers(id),
  ml_claim_id text not null,
  ml_resource text not null,
  ml_resource_id text not null,
  ml_reason_id text,
  ml_rules_engine_triage text[] not null default '{}',
  criterio text not null check (criterio in ('repentant', 'sem_evidencia')),
  pedido_id uuid references public.pedidos(id),
  ledger_id uuid references public.financial_ledger(id),
  notificado_em timestamptz,
  criado_em timestamptz not null default now()
);

create unique index idx_seller_ml_devolucoes_detectadas_claim
  on public.seller_ml_devolucoes_detectadas (ml_claim_id);

create index idx_seller_ml_devolucoes_detectadas_seller
  on public.seller_ml_devolucoes_detectadas (seller_id, criado_em desc);

alter table public.seller_ml_devolucoes_detectadas enable row level security;
-- Sem policy: deny-all por padrão. Acesso só via RPC SECURITY DEFINER abaixo, chamada
-- sempre por supabaseAdmin (código server-side do webhook), nunca por authenticated/anon.

revoke all on public.seller_ml_devolucoes_detectadas from public, anon, authenticated;

-- 1) Checagem em lote — claim "opened" continua aparecendo em /claims/search até o ML
-- fechar (pode levar dias); sem isso, cada novo webhook de "claims" pro mesmo seller
-- gastaria de novo as 2 chamadas extras (motivo + evidências) pro mesmo claim já conhecido.
create function public.fn_ml_devolucao_detectada_claim_ids_existentes(p_ml_claim_ids text[])
returns setof text
language sql
security definer
set search_path to 'public'
as $function$
  select ml_claim_id
  from public.seller_ml_devolucoes_detectadas
  where ml_claim_id = any(p_ml_claim_ids);
$function$;

-- 2) Registro atômico — ON CONFLICT garante que 2 webhooks concorrentes pro mesmo claim
-- nunca disparam notificação duplicada; quem perde a corrida recebe ja_existia=true.
create function public.fn_ml_devolucao_detectada_registrar(
  p_org_id uuid,
  p_seller_id uuid,
  p_ml_claim_id text,
  p_ml_resource text,
  p_ml_resource_id text,
  p_ml_reason_id text,
  p_ml_rules_engine_triage text[],
  p_criterio text,
  p_pedido_id uuid,
  p_ledger_id uuid
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
    ml_rules_engine_triage, criterio, pedido_id, ledger_id
  )
  values (
    p_org_id, p_seller_id, p_ml_claim_id, p_ml_resource, p_ml_resource_id, p_ml_reason_id,
    coalesce(p_ml_rules_engine_triage, '{}'), p_criterio, p_pedido_id, p_ledger_id
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

-- 3) Marca que a notificação (seller + admin) foi disparada — só chamado depois do insert
-- acima ter confirmado ja_existia=false.
create function public.fn_ml_devolucao_detectada_marcar_notificado(p_id uuid)
returns void
language sql
security definer
set search_path to 'public'
as $function$
  update public.seller_ml_devolucoes_detectadas set notificado_em = now() where id = p_id;
$function$;

revoke all on function public.fn_ml_devolucao_detectada_claim_ids_existentes from public;
grant execute on function public.fn_ml_devolucao_detectada_claim_ids_existentes to service_role;

revoke all on function public.fn_ml_devolucao_detectada_registrar from public;
grant execute on function public.fn_ml_devolucao_detectada_registrar to service_role;

revoke all on function public.fn_ml_devolucao_detectada_marcar_notificado from public;
grant execute on function public.fn_ml_devolucao_detectada_marcar_notificado to service_role;

-- Índice de apoio: o lookup seller_id+marketplace_numero é usado por mais de um pipeline
-- (reconciliação de cancelamento, resolução de disputa fornecedor, e agora esta detecção)
-- e hoje faz sequential scan dentro do subconjunto do seller.
create index if not exists idx_pedidos_seller_marketplace_numero
  on public.pedidos (seller_id, marketplace_numero);
