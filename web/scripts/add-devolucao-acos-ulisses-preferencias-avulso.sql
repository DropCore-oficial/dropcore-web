-- Aplicado em produção via mcp supabase apply_migration
-- (add_devolucao_acos_ulisses_preferencias_avulso), 2026-10-16.
-- Completa o piso de preço formal do Margem (item 1 do roadmap de absorção do doc dos 13
-- gestores — ver docs/SCHEMA.md e project_doc_13_gestores_absorcao_avulso na memória):
-- devolução esperada (taxa × custo) e ACOS alvo, junto dos 2 campos (embalagem/custo Full)
-- que já existiam desde add-embalagem-custo-full-ulisses-preferencias.sql (2026-10-11) mas
-- nunca tinham sido lidos por nenhum código até agora. Só na tabela avulso — não toca
-- seller_ulisses_preferencias (hub), fora de escopo deste item.

alter table public.calculadora_assinante_ulisses_preferencias
  add column if not exists devolucao_taxa_pct numeric not null default 0,
  add column if not exists devolucao_custo_brl numeric not null default 0,
  add column if not exists acos_alvo_pct numeric not null default 0;

drop function if exists public.fn_calculadora_assinante_ulisses_preferencias_upsert(
  uuid, numeric, numeric, numeric, numeric, boolean, numeric, numeric, text, boolean, numeric, boolean, numeric, numeric, numeric
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
  p_custo_full_brl numeric default 0,
  p_devolucao_taxa_pct numeric default 0,
  p_devolucao_custo_brl numeric default 0,
  p_acos_alvo_pct numeric default 0
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
     embalagem_brl, custo_full_brl, devolucao_taxa_pct, devolucao_custo_brl, acos_alvo_pct,
     ads_ativo, ads_tacos_pct, ads_teto_valor, ads_teto_periodo,
     afiliado_ativo, afiliado_pct, cupom_ativo, cupom_pct)
  values
    (p_assinante_id, p_margem_minima_pct, p_margem_maxima_pct, p_imposto_pct, p_perda_pct,
     p_embalagem_brl, p_custo_full_brl, p_devolucao_taxa_pct, p_devolucao_custo_brl, p_acos_alvo_pct,
     p_ads_ativo, p_ads_tacos_pct, p_ads_teto_valor, p_ads_teto_periodo,
     p_afiliado_ativo, p_afiliado_pct, p_cupom_ativo, p_cupom_pct)
  on conflict (assinante_id) do update set
    margem_minima_pct = excluded.margem_minima_pct,
    margem_maxima_pct = excluded.margem_maxima_pct,
    imposto_pct = excluded.imposto_pct,
    perda_pct = excluded.perda_pct,
    embalagem_brl = excluded.embalagem_brl,
    custo_full_brl = excluded.custo_full_brl,
    devolucao_taxa_pct = excluded.devolucao_taxa_pct,
    devolucao_custo_brl = excluded.devolucao_custo_brl,
    acos_alvo_pct = excluded.acos_alvo_pct,
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
revoke all on function public.fn_calculadora_assinante_ulisses_preferencias_upsert from anon;
revoke all on function public.fn_calculadora_assinante_ulisses_preferencias_upsert from authenticated;
grant execute on function public.fn_calculadora_assinante_ulisses_preferencias_upsert to service_role;

-- Conferido depois de aplicar: information_schema.routine_privileges só lista
-- postgres (owner) e service_role pra EXECUTE — sem anon/authenticated/public.
-- fn_calculadora_assinante_ulisses_preferencias_get não precisou de alteração: `RETURNS
-- calculadora_assinante_ulisses_preferencias` + `select *` já acompanha colunas novas da
-- tabela automaticamente.
