-- Desconto por assinante no pacote avulso "Gestores de IA" (admin dá valor fixo em R$,
-- percentual, ou nada = preço cheio). Preço base continua fixo em
-- lib/gestoresIaAvulsoPlanos.ts (VALOR_GESTORES_IA_AVULSO_MENSAL) — aqui só guarda a REGRA
-- de desconto, o valor final é calculado em código (calcularValorMensalGestoresIaAvulso).

alter table public.calculadora_assinantes
  add column if not exists gestores_ia_desconto_tipo text,
  add column if not exists gestores_ia_desconto_valor numeric;

alter table public.calculadora_assinantes
  drop constraint if exists calculadora_assinantes_gestores_ia_desconto_tipo_check;
alter table public.calculadora_assinantes
  add constraint calculadora_assinantes_gestores_ia_desconto_tipo_check
  check (gestores_ia_desconto_tipo is null or gestores_ia_desconto_tipo in ('valor', 'percentual'));

-- Admin define/remove o desconto de um assinante. p_tipo = null remove o desconto (preço cheio).
create or replace function public.fn_calculadora_assinante_gestores_ia_desconto_set(
  p_assinante_id uuid,
  p_tipo text,
  p_valor numeric
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if p_tipo is not null and p_tipo not in ('valor', 'percentual') then
    raise exception 'tipo de desconto inválido: %', p_tipo;
  end if;

  update public.calculadora_assinantes
  set
    gestores_ia_desconto_tipo = p_tipo,
    gestores_ia_desconto_valor = case when p_tipo is null then null else p_valor end,
    updated_at = now()
  where id = p_assinante_id;
end;
$function$;

revoke all on function public.fn_calculadora_assinante_gestores_ia_desconto_set from public;
grant execute on function public.fn_calculadora_assinante_gestores_ia_desconto_set to service_role;

-- Atualiza a RPC de listagem (onda 1, 2026-10-17) pra também trazer o desconto — precisa
-- dropar porque o retorno (returns table) ganhou colunas novas.
drop function if exists public.fn_calculadora_assinantes_gestores_ia_list(int, int);

create or replace function public.fn_calculadora_assinantes_gestores_ia_list(
  p_limit int default 50,
  p_offset int default 0
)
returns table (
  id uuid,
  user_id uuid,
  nome text,
  ativo boolean,
  gestores_ia_ciclo text,
  valido_ate timestamptz,
  gestores_ia_contrato_aceite_em timestamptz,
  created_at timestamptz,
  gestores_ia_desconto_tipo text,
  gestores_ia_desconto_valor numeric,
  total_count bigint
)
language sql
security definer
set search_path to 'public'
as $function$
  select
    ca.id,
    ca.user_id,
    ca.nome,
    ca.ativo,
    ca.gestores_ia_ciclo,
    ca.valido_ate,
    ca.gestores_ia_contrato_aceite_em,
    ca.created_at,
    ca.gestores_ia_desconto_tipo,
    ca.gestores_ia_desconto_valor,
    count(*) over () as total_count
  from public.calculadora_assinantes ca
  where ca.inclui_gestores_ia = true
  order by ca.created_at desc
  limit greatest(p_limit, 0)
  offset greatest(p_offset, 0);
$function$;

revoke all on function public.fn_calculadora_assinantes_gestores_ia_list from public;
grant execute on function public.fn_calculadora_assinantes_gestores_ia_list to service_role;
