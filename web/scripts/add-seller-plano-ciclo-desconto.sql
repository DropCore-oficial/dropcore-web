-- Ciclo de compromisso (mensal/semestral/anual) + desconto manual pro plano principal
-- Start/Pro do seller. Decisão 2026-11-02: ciclo não muda o valor da parcela — só define
-- carência (meses grátis) antes da 1ª cobrança, mesmo racional do contrato anual do pacote
-- Gestores de IA avulso (fn_gestores_ia_avulso_desconto_set). Desconto é ortogonal ao ciclo:
-- campo manual do admin (R$ ou %) sobre o valor de tabela do plano. Tudo definido/editado só
-- pelo admin em /admin/sellers — não há escolha self-service de ciclo/desconto pelo seller.
--
-- Upgrade Start→Pro no meio de um ciclo semestral/anual NÃO reinicia a carência — só passa a
-- cobrar as parcelas restantes no valor do plano novo (ver fn_seller_plano_upgrade_pro_set),
-- com um aceite leve do seller gravado no momento do upgrade (igual padrão de
-- credito_termos_versao/credito_aceite_em em seller_depositos_pix).

alter table public.sellers
  add column if not exists plano_ciclo text not null default 'mensal'
    check (plano_ciclo in ('mensal', 'semestral', 'anual')),
  add column if not exists plano_ciclo_carencia_fim date,
  add column if not exists plano_desconto_tipo text
    check (plano_desconto_tipo in ('valor', 'percentual')),
  add column if not exists plano_desconto_valor numeric,
  add column if not exists plano_ciclo_upgrade_termos_versao text,
  add column if not exists plano_ciclo_upgrade_termos_aceite_em timestamptz;

-- Define (ou edita) plano + ciclo + desconto de um seller. Chamada só por supabaseAdmin a
-- partir de rota que já validou requireAdmin (owner/admin da org) — por isso não checa
-- auth.uid() por dentro, mas só concede execute pro service_role (regra 9 do CLAUDE.md).
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
  v_ciclo text;
  v_desconto_tipo text;
  v_carencia_dias int;
  v_data_entrada date;
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

  select coalesce(data_entrada, criado_em::date)
    into v_data_entrada
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

  update public.sellers
     set plano = coalesce(v_plano, plano),
         plano_ciclo = v_ciclo,
         plano_ciclo_carencia_fim = case when v_carencia_dias > 0 then v_data_entrada + v_carencia_dias else null end,
         plano_desconto_tipo = v_desconto_tipo,
         plano_desconto_valor = case when v_desconto_tipo is null then null else p_desconto_valor end,
         atualizado_em = now()
   where id = p_seller_id;
end;
$$;

revoke all on function public.fn_seller_plano_ciclo_desconto_set(uuid, text, text, text, numeric) from public;
grant execute on function public.fn_seller_plano_ciclo_desconto_set(uuid, text, text, text, numeric) to service_role;

-- Upgrade Start→Pro: muda o plano e, se vier termos_versao (seller em ciclo semestral/anual),
-- grava o aceite leve de que as parcelas restantes passam a valer o preço do Pro, sem
-- carência nova — plano_ciclo/plano_ciclo_carencia_fim permanecem intocados de propósito.
create or replace function public.fn_seller_plano_upgrade_pro_set(
  p_seller_id uuid,
  p_termos_versao text
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  update public.sellers
     set plano = 'Pro',
         plano_ciclo_upgrade_termos_versao = coalesce(p_termos_versao, plano_ciclo_upgrade_termos_versao),
         plano_ciclo_upgrade_termos_aceite_em = case when p_termos_versao is not null then now() else plano_ciclo_upgrade_termos_aceite_em end,
         atualizado_em = now()
   where id = p_seller_id;
end;
$$;

revoke all on function public.fn_seller_plano_upgrade_pro_set(uuid, text) from public;
grant execute on function public.fn_seller_plano_upgrade_pro_set(uuid, text) to service_role;
