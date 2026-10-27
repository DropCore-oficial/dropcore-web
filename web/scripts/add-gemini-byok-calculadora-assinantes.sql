-- BYOK do Google Gemini pro assinante avulso "Gestores de IA" (gestor Design/Laura, V2 —
-- geração de imagem). Mesmo padrão do BYOK da Anthropic (anthropic_api_key_encriptada), mas
-- código novo: escrita vai 100% por RPC desde já (regra 9 do CLAUDE.md), não .from().

alter table public.calculadora_assinantes
  add column gemini_api_key_encriptada text;

create or replace function public.fn_calculadora_assinante_byok_gemini_configurado(p_assinante_id uuid)
returns boolean
language sql
stable security definer
set search_path = public
as $$
  select gemini_api_key_encriptada is not null
  from public.calculadora_assinantes
  where id = p_assinante_id;
$$;

create or replace function public.fn_calculadora_assinante_byok_gemini_upsert(
  p_assinante_id uuid,
  p_key_encriptada text
) returns void
language sql
security definer
set search_path = public
as $$
  update public.calculadora_assinantes
  set gemini_api_key_encriptada = p_key_encriptada
  where id = p_assinante_id;
$$;

create or replace function public.fn_calculadora_assinante_byok_gemini_delete(p_assinante_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.calculadora_assinantes
  set gemini_api_key_encriptada = null
  where id = p_assinante_id;
$$;

revoke all on function public.fn_calculadora_assinante_byok_gemini_configurado from public, anon, authenticated;
revoke all on function public.fn_calculadora_assinante_byok_gemini_upsert from public, anon, authenticated;
revoke all on function public.fn_calculadora_assinante_byok_gemini_delete from public, anon, authenticated;

grant execute on function public.fn_calculadora_assinante_byok_gemini_configurado to service_role;
grant execute on function public.fn_calculadora_assinante_byok_gemini_upsert to service_role;
grant execute on function public.fn_calculadora_assinante_byok_gemini_delete to service_role;
