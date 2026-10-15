-- Planos mensal/anual do pacote avulso "Gestores de IA" (autoatendimento via PIX,
-- 2026-10-15). Até aqui o pacote (R$797,90/mês) só era ativado manualmente por convite do
-- admin (`calculadora_invites.inclui_gestores_ia`) — este script adiciona um segundo
-- caminho, self-serve, sem substituir o convite (admin continua podendo conceder/comp).
--
-- Anual = 10x o valor mensal (2 meses grátis) — ver web/lib/gestoresIaAvulsoPlanos.ts.
--
-- Regra 9 do CLAUDE.md: rota nova (`/api/gestores-ia-avulso/planos`) só fala com o banco via
-- RPC SECURITY DEFINER, nunca `.from()` direto — só `service_role` executa; as rotas Next.js
-- já validam o dono via token Supabase antes de chamar.

alter table public.calculadora_assinantes
  add column if not exists gestores_ia_ciclo text check (gestores_ia_ciclo in ('mensal', 'anual')),
  add column if not exists mp_gestores_ia_pendente_id text,
  add column if not exists mp_gestores_ia_ultimo_aprovado_id text;

-- Garante a linha do assinante e grava o pagamento PIX pendente (upsert por user_id, que já
-- é unique em calculadora_assinantes).
create or replace function public.fn_calculadora_assinante_gestores_ia_pix_pendente_set(
  p_user_id uuid,
  p_mp_pendente_id text
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  insert into public.calculadora_assinantes (user_id, valido_ate, ativo, mp_gestores_ia_pendente_id)
  values (p_user_id, now(), false, p_mp_pendente_id)
  on conflict (user_id) do update set
    mp_gestores_ia_pendente_id = excluded.mp_gestores_ia_pendente_id,
    updated_at = now();
end;
$function$;

-- Leitura mínima usada pelo processor (idempotência + base pra estender valido_ate) e pela
-- rota de sync (pendente_id).
create or replace function public.fn_calculadora_assinante_gestores_ia_pix_get(p_user_id uuid)
returns table (
  valido_ate timestamptz,
  mp_gestores_ia_pendente_id text,
  mp_gestores_ia_ultimo_aprovado_id text
)
language sql
security definer
set search_path to 'public'
as $function$
  select valido_ate, mp_gestores_ia_pendente_id, mp_gestores_ia_ultimo_aprovado_id
  from public.calculadora_assinantes
  where user_id = p_user_id;
$function$;

-- Confirma o pagamento: ativa/renova o pacote, grava o ciclo e o recebimento, tudo atômico.
-- Idempotente por mp_gestores_ia_ultimo_aprovado_id (retorna false se já tinha processado
-- esse mesmo mp_payment_id — webhook duplicado/concorrente não aplica 2x).
create or replace function public.fn_calculadora_assinante_gestores_ia_pix_confirmar(
  p_user_id uuid,
  p_ciclo text,
  p_novo_valido_ate timestamptz,
  p_mp_payment_id text,
  p_external_reference text,
  p_valor_pago numeric,
  p_pago_em timestamptz
)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_ultimo text;
begin
  select mp_gestores_ia_ultimo_aprovado_id into v_ultimo
  from public.calculadora_assinantes
  where user_id = p_user_id;

  if v_ultimo is not null and v_ultimo = p_mp_payment_id then
    return false;
  end if;

  update public.calculadora_assinantes set
    inclui_gestores_ia = true,
    gestores_ia_ciclo = p_ciclo,
    valido_ate = p_novo_valido_ate,
    ativo = true,
    mp_gestores_ia_ultimo_aprovado_id = p_mp_payment_id,
    mp_gestores_ia_pendente_id = null,
    updated_at = now()
  where user_id = p_user_id;

  insert into public.calculadora_recebimentos (user_id, mp_payment_id, valor, external_reference, pago_em)
  values (p_user_id, p_mp_payment_id, p_valor_pago, p_external_reference, p_pago_em)
  on conflict do nothing;

  return true;
end;
$function$;

revoke all on function public.fn_calculadora_assinante_gestores_ia_pix_pendente_set from public;
grant execute on function public.fn_calculadora_assinante_gestores_ia_pix_pendente_set to service_role;

revoke all on function public.fn_calculadora_assinante_gestores_ia_pix_get from public;
grant execute on function public.fn_calculadora_assinante_gestores_ia_pix_get to service_role;

revoke all on function public.fn_calculadora_assinante_gestores_ia_pix_confirmar from public;
grant execute on function public.fn_calculadora_assinante_gestores_ia_pix_confirmar to service_role;
