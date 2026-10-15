-- Logo da marca pro assinante avulso (Calculadora/Gestores de IA) — mesmo conceito que
-- `sellers.logo_url` já tem pro hub, só que pra `calculadora_assinantes` (conta sem org/
-- seller completo). Usado no header do Dashboard avulso e na tela "Meus dados".
--
-- Regra 9 do CLAUDE.md (2026-10-07): endpoint novo de leitura/escrita simples (1 linha, 1
-- dono) vai por RPC SECURITY DEFINER, nunca `.from()` direto — só `service_role` executa,
-- a rota Next.js (`/api/gestores-ia-avulso/logo`) já valida o dono via `getAssinanteFromToken`
-- antes de chamar.

alter table public.calculadora_assinantes
  add column if not exists logo_url text;

create or replace function public.fn_calculadora_assinante_logo_get(p_assinante_id uuid)
returns text
language sql
security definer
set search_path to 'public'
as $function$
  select logo_url from public.calculadora_assinantes where id = p_assinante_id;
$function$;

create or replace function public.fn_calculadora_assinante_logo_set(p_assinante_id uuid, p_logo_url text)
returns void
language sql
security definer
set search_path to 'public'
as $function$
  update public.calculadora_assinantes set logo_url = p_logo_url where id = p_assinante_id;
$function$;

revoke all on function public.fn_calculadora_assinante_logo_get from public;
grant execute on function public.fn_calculadora_assinante_logo_get to service_role;

revoke all on function public.fn_calculadora_assinante_logo_set from public;
grant execute on function public.fn_calculadora_assinante_logo_set to service_role;
