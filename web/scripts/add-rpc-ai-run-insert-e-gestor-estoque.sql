-- Aplicado em produção via mcp supabase apply_migration (add_rpc_ai_run_insert_e_gestor_estoque).
-- Prepara o banco pro 5º gestor avulso "Estoque": libera o valor 'estoque' na constraint de
-- gestor de calculadora_assinante_ai_runs e cria a 1ª RPC de ESCRITA pra essa tabela (leitura
-- já tinha sido migrada pra RPC no retrofit de 2026-10-07; escrita ficou de fora até agora).

-- 1) libera 'estoque' como valor válido de gestor em calculadora_assinante_ai_runs
alter table public.calculadora_assinante_ai_runs
  drop constraint calculadora_assinante_ai_runs_gestor_check;
alter table public.calculadora_assinante_ai_runs
  add constraint calculadora_assinante_ai_runs_gestor_check
  check (gestor = any (array['anuncios_seo','reputacao_atendimento','ads','gestor_mestre','estoque']));

-- 2) RPC genérica pra gravar rodada nova (escrita nunca entrou no retrofit de 2026-10-07;
--    gestores existentes ainda usam .from() aqui, mas código novo usa RPC desde a regra 9)
create or replace function public.fn_calculadora_assinante_ai_run_insert(
  p_assinante_id uuid,
  p_gestor text,
  p_status text,
  p_resultado jsonb default null,
  p_erro text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  insert into public.calculadora_assinante_ai_runs(assinante_id, gestor, status, resultado, erro)
  values (p_assinante_id, p_gestor, p_status, p_resultado, p_erro)
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.fn_calculadora_assinante_ai_run_insert from public;
revoke all on function public.fn_calculadora_assinante_ai_run_insert from anon;
revoke all on function public.fn_calculadora_assinante_ai_run_insert from authenticated;
grant execute on function public.fn_calculadora_assinante_ai_run_insert to service_role;

-- Conferido depois de aplicar: information_schema.routine_privileges só lista
-- postgres (owner) e service_role pra EXECUTE — sem anon/authenticated/public.
