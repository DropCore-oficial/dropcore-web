-- Formaliza o piso de preço completo do ADS/Ulisses (custo + embalagem + frete + custo Full),
-- adicionando os 2 campos que faltavam nas preferências (avulso + hub). Opcionais, default 0,
-- não quebra preferência já salva. Já aplicado em produção via MCP do Supabase (2026-10-11);
-- este arquivo é o registro, pra fonte única de schema (docs/SCHEMA.md).

alter table public.calculadora_assinante_ulisses_preferencias
  add column if not exists embalagem_brl numeric not null default 0,
  add column if not exists custo_full_brl numeric not null default 0;

alter table public.seller_ulisses_preferencias
  add column if not exists embalagem_brl numeric not null default 0,
  add column if not exists custo_full_brl numeric not null default 0;

-- `create or replace` não troca assinatura (vira overload novo) — precisa dropar a antiga
-- explicitamente antes de recriar com os 2 parâmetros novos.
drop function if exists public.fn_calculadora_assinante_ulisses_preferencias_upsert(
  uuid, numeric, numeric, numeric, numeric, boolean, numeric, numeric, text, boolean, numeric, boolean, numeric
);

create function public.fn_calculadora_assinante_ulisses_preferencias_upsert(
  p_assinante_id uuid,
  p_margem_minima_pct numeric,
  p_margem_maxima_pct numeric,
  p_imposto_pct numeric,
  p_perda_pct numeric,
  p_ads_ativo boolean default false,
  p_ads_tacos_pct numeric default null,
  p_ads_teto_valor numeric default null,
  p_ads_teto_periodo text default null,
  p_afiliado_ativo boolean default false,
  p_afiliado_pct numeric default null,
  p_cupom_ativo boolean default false,
  p_cupom_pct numeric default null,
  p_embalagem_brl numeric default 0,
  p_custo_full_brl numeric default 0
)
returns calculadora_assinante_ulisses_preferencias
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_row public.calculadora_assinante_ulisses_preferencias;
begin
  insert into public.calculadora_assinante_ulisses_preferencias
    (assinante_id, margem_minima_pct, margem_maxima_pct, imposto_pct, perda_pct,
     embalagem_brl, custo_full_brl,
     ads_ativo, ads_tacos_pct, ads_teto_valor, ads_teto_periodo,
     afiliado_ativo, afiliado_pct, cupom_ativo, cupom_pct)
  values
    (p_assinante_id, p_margem_minima_pct, p_margem_maxima_pct, p_imposto_pct, p_perda_pct,
     p_embalagem_brl, p_custo_full_brl,
     p_ads_ativo, p_ads_tacos_pct, p_ads_teto_valor, p_ads_teto_periodo,
     p_afiliado_ativo, p_afiliado_pct, p_cupom_ativo, p_cupom_pct)
  on conflict (assinante_id) do update set
    margem_minima_pct = excluded.margem_minima_pct,
    margem_maxima_pct = excluded.margem_maxima_pct,
    imposto_pct = excluded.imposto_pct,
    perda_pct = excluded.perda_pct,
    embalagem_brl = excluded.embalagem_brl,
    custo_full_brl = excluded.custo_full_brl,
    ads_ativo = excluded.ads_ativo,
    ads_tacos_pct = excluded.ads_tacos_pct,
    ads_teto_valor = excluded.ads_teto_valor,
    ads_teto_periodo = excluded.ads_teto_periodo,
    afiliado_ativo = excluded.afiliado_ativo,
    afiliado_pct = excluded.afiliado_pct,
    cupom_ativo = excluded.cupom_ativo,
    cupom_pct = excluded.cupom_pct,
    atualizado_em = now()
  returning * into v_row;
  return v_row;
end;
$function$;

revoke all on function public.fn_calculadora_assinante_ulisses_preferencias_upsert from public;
grant execute on function public.fn_calculadora_assinante_ulisses_preferencias_upsert to service_role;
