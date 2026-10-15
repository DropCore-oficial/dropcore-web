-- Corrige o modelo do plano "Anual" do pacote avulso "Gestores de IA" (2026-10-15, mesmo
-- dia do add-gestores-ia-avulso-planos.sql): não é mais uma cobrança única de R$7.979,00.
-- Vira um COMPROMISSO de 12 parcelas mensais de R$797,90 via PIX (mesmo valor do plano
-- mensal), com os primeiros 60 dias sem cobrança. Sem cartão, sem cobrança automática — a
-- cada mês o assinante entra e gera o PIX da parcela, igual ao plano mensal.
--
-- Por isso `fn_calculadora_assinante_gestores_ia_pix_confirmar` não recebe mais `p_ciclo`:
-- toda parcela paga é o mesmo valor/extensão de 1 mês, não importa se o assinante está no
-- ciclo mensal avulso ou num contrato anual — `gestores_ia_ciclo` só é setado por quem
-- decide o ciclo (a própria RPC, se ainda não tinha, ou a RPC de início de contrato abaixo).

alter table public.calculadora_assinantes
  add column if not exists gestores_ia_contrato_aceite_em timestamptz;

drop function if exists public.fn_calculadora_assinante_gestores_ia_pix_confirmar(
  uuid, text, timestamptz, text, text, numeric, timestamptz
);

create or replace function public.fn_calculadora_assinante_gestores_ia_pix_confirmar(
  p_user_id uuid,
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
    gestores_ia_ciclo = coalesce(gestores_ia_ciclo, 'mensal'),
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

-- Inicia o contrato anual: libera o pacote na hora, sem PIX, com 60 dias de carência antes
-- da 1ª parcela (o front já exige aceite explícito de checkbox antes de chamar isto — o
-- `now()` gravado aqui é o registro de quando o compromisso foi assumido).
create or replace function public.fn_calculadora_assinante_gestores_ia_contrato_anual_iniciar(p_user_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_carencia_ate timestamptz := now() + interval '60 days';
begin
  insert into public.calculadora_assinantes (
    user_id, valido_ate, ativo, inclui_gestores_ia, gestores_ia_ciclo, gestores_ia_contrato_aceite_em
  )
  values (p_user_id, v_carencia_ate, true, true, 'anual', now())
  on conflict (user_id) do update set
    valido_ate = greatest(public.calculadora_assinantes.valido_ate, v_carencia_ate),
    ativo = true,
    inclui_gestores_ia = true,
    gestores_ia_ciclo = 'anual',
    gestores_ia_contrato_aceite_em = now(),
    updated_at = now();

  return v_carencia_ate;
end;
$function$;

revoke all on function public.fn_calculadora_assinante_gestores_ia_pix_confirmar from public;
grant execute on function public.fn_calculadora_assinante_gestores_ia_pix_confirmar to service_role;

revoke all on function public.fn_calculadora_assinante_gestores_ia_contrato_anual_iniciar from public;
grant execute on function public.fn_calculadora_assinante_gestores_ia_contrato_anual_iniciar to service_role;
