-- Corretivo de add-seller-plano-ciclo-desconto.sql (já aplicado em produção, não reescrever).
-- Trava o valor da mensalidade durante o compromisso semestral/anual (decisão 2026-11-02:
-- seller que assinou X meses não pode ser pego de surpresa por reajuste de tabela no meio
-- do compromisso). plano_ciclo_valor_travado é o valor final (tabela + desconto) calculado
-- uma vez no momento em que o admin define/edita o ciclo; plano_ciclo_compromisso_fim é até
-- quando essa trava vale (carência + 6 meses no semestral, +12 no anual). Depois disso, volta
-- a acompanhar `financial_planos` ao vivo (mesmo comportamento de antes). Independente do
-- mensalidade_valor_travado legado (grandfathering manual, sempre tem prioridade sobre tudo).
alter table public.sellers
  add column if not exists plano_ciclo_valor_travado numeric,
  add column if not exists plano_ciclo_compromisso_fim date;

create or replace function public.fn_seller_plano_ciclo_desconto_set(
  p_seller_id uuid,
  p_plano text,
  p_ciclo text,
  p_desconto_tipo text,
  p_desconto_valor numeric
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_plano text;
  v_plano_atual text;
  v_ciclo text;
  v_desconto_tipo text;
  v_carencia_dias int;
  v_compromisso_meses int;
  v_data_entrada date;
  v_valor_base numeric;
  v_valor_travado numeric;
  v_carencia_fim date;
  v_compromisso_fim date;
begin
  v_ciclo := lower(trim(p_ciclo));
  if v_ciclo not in ('mensal', 'semestral', 'anual') then
    raise exception 'ciclo inválido: %', p_ciclo;
  end if;

  v_desconto_tipo := case when p_desconto_tipo is null or trim(p_desconto_tipo) = '' then null else lower(trim(p_desconto_tipo)) end;
  if v_desconto_tipo is not null and v_desconto_tipo not in ('valor', 'percentual') then
    raise exception 'tipo de desconto inválido: %', p_desconto_tipo;
  end if;

  v_carencia_dias := case v_ciclo when 'semestral' then 30 when 'anual' then 60 else 0 end;
  v_compromisso_meses := case v_ciclo when 'semestral' then 6 when 'anual' then 12 else 0 end;

  select coalesce(data_entrada, criado_em::date), plano
    into v_data_entrada, v_plano_atual
    from public.sellers
   where id = p_seller_id;

  if v_data_entrada is null then
    raise exception 'seller não encontrado: %', p_seller_id;
  end if;

  if p_plano is null or trim(p_plano) = '' then
    v_plano := null;
  else
    v_plano := case lower(trim(p_plano))
      when 'pro' then 'Pro'
      when 'starter' then 'Starter'
      else null
    end;
    if v_plano is null then
      raise exception 'plano inválido: %', p_plano;
    end if;
  end if;

  select valor_seller into v_valor_base
    from public.financial_planos
   where plano = coalesce(v_plano, v_plano_atual);

  if v_valor_base is null then
    select valor_seller into v_valor_base from public.financial_planos where plano = 'default';
  end if;

  v_valor_travado := case
    when v_desconto_tipo = 'valor' then greatest(0, coalesce(v_valor_base, 0) - coalesce(p_desconto_valor, 0))
    when v_desconto_tipo = 'percentual' then coalesce(v_valor_base, 0) * (1 - least(100, coalesce(p_desconto_valor, 0)) / 100)
    else coalesce(v_valor_base, 0)
  end;
  v_valor_travado := round(v_valor_travado, 2);

  v_carencia_fim := case when v_carencia_dias > 0 then v_data_entrada + v_carencia_dias else null end;
  v_compromisso_fim := case
    when v_compromisso_meses > 0
      then (coalesce(v_carencia_fim, v_data_entrada) + (v_compromisso_meses || ' months')::interval)::date
    else null
  end;

  update public.sellers
     set plano = coalesce(v_plano, plano),
         plano_ciclo = v_ciclo,
         plano_ciclo_carencia_fim = v_carencia_fim,
         plano_desconto_tipo = v_desconto_tipo,
         plano_desconto_valor = case when v_desconto_tipo is null then null else p_desconto_valor end,
         plano_ciclo_valor_travado = case when v_compromisso_meses > 0 then v_valor_travado else null end,
         plano_ciclo_compromisso_fim = v_compromisso_fim,
         atualizado_em = now()
   where id = p_seller_id;
end;
$$;

revoke all on function public.fn_seller_plano_ciclo_desconto_set(uuid, text, text, text, numeric) from public;
grant execute on function public.fn_seller_plano_ciclo_desconto_set(uuid, text, text, text, numeric) to service_role;
