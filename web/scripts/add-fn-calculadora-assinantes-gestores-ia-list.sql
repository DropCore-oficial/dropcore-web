-- Lista assinantes da Calculadora com o pacote Gestores de IA avulso ativo
-- (inclui_gestores_ia = true), pra tela nova em /admin. RPC-only (regra 9 do CLAUDE.md):
-- nenhum código novo acessa calculadora_assinantes via .from() direto.
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
    count(*) over () as total_count
  from public.calculadora_assinantes ca
  where ca.inclui_gestores_ia = true
  order by ca.created_at desc
  limit greatest(p_limit, 0)
  offset greatest(p_offset, 0);
$function$;

revoke all on function public.fn_calculadora_assinantes_gestores_ia_list from public;
grant execute on function public.fn_calculadora_assinantes_gestores_ia_list to service_role;
