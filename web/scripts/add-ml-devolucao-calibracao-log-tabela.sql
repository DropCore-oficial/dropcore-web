-- Calibração do sinal de entrega da devolução (2026-10-31): o log via console.log se perde —
-- confirmado que esse projeto na Vercel não tem retenção/busca histórica de logs, só
-- streaming ao vivo. Como a próxima devolução real só deve acontecer daqui a uns dias,
-- precisa persistir o recorte seguro (sem dado pessoal do comprador) num lugar consultável
-- a qualquer momento, não depender de alguém estar "ao vivo" vendo acontecer.
-- Regra 9 do CLAUDE.md: tabela nova só por RPC SECURITY DEFINER.

create table public.ml_devolucao_calibracao_log (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.sellers(id),
  ml_claim_id text not null,
  tipo text not null check (tipo in ('claim', 'order', 'shipment')),
  recurso_id text not null,
  payload jsonb not null,
  criado_em timestamptz not null default now()
);

create index idx_ml_devolucao_calibracao_log_claim
  on public.ml_devolucao_calibracao_log (ml_claim_id, criado_em desc);

alter table public.ml_devolucao_calibracao_log enable row level security;
-- Sem policy: deny-all. Acesso só via RPC SECURITY DEFINER, chamada por supabaseAdmin
-- (webhook server-side) — e leitura direta via SQL (Supabase MCP) pra calibrar depois.
revoke all on public.ml_devolucao_calibracao_log from public, anon, authenticated;

create function public.fn_ml_devolucao_calibracao_log_registrar(
  p_seller_id uuid,
  p_ml_claim_id text,
  p_tipo text,
  p_recurso_id text,
  p_payload jsonb
)
returns void
language sql
security definer
set search_path to 'public'
as $function$
  insert into public.ml_devolucao_calibracao_log (seller_id, ml_claim_id, tipo, recurso_id, payload)
  values (p_seller_id, p_ml_claim_id, p_tipo, p_recurso_id, p_payload);
$function$;

revoke all on function public.fn_ml_devolucao_calibracao_log_registrar from public;
grant execute on function public.fn_ml_devolucao_calibracao_log_registrar to service_role;
