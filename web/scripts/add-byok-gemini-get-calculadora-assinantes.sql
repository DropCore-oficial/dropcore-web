-- RPC pra uso interno do servidor (nunca chamada por rota que responde o navegador): lê a
-- chave do Gemini ainda criptografada, pra rota de geração de foto descriptografar em
-- memória na hora de chamar a API do Gemini. Diferente de
-- fn_calculadora_assinante_byok_gemini_configurado (só true/false, chamada pelo front).

create or replace function public.fn_calculadora_assinante_byok_gemini_get(p_assinante_id uuid)
returns text
language sql
stable security definer
set search_path = public
as $$
  select gemini_api_key_encriptada
  from public.calculadora_assinantes
  where id = p_assinante_id;
$$;

revoke all on function public.fn_calculadora_assinante_byok_gemini_get from public, anon, authenticated;
grant execute on function public.fn_calculadora_assinante_byok_gemini_get to service_role;
