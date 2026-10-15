-- Dados comerciais do assinante avulso (Calculadora/Gestores de IA) — mesmos campos que
-- `sellers` já tem (razão social/nome fantasia, CNPJ ou CPF, e-mail comercial, telefone,
-- CEP, endereço, responsável opcional), só que pra `calculadora_assinantes` (conta sem org/
-- seller completo). Preenchido na tela "Meus dados" (/seller/meus-dados) — opcional, não
-- bloqueia nada (diferente do onboarding obrigatório do hub).
--
-- Regra 9 do CLAUDE.md: endpoint novo de leitura/escrita simples (1 linha, 1 dono) vai por
-- RPC SECURITY DEFINER, nunca `.from()` direto — só `service_role` executa, a rota Next.js
-- (`/api/gestores-ia-avulso/cadastro`) já valida o dono via `getAssinanteFromToken` antes de
-- chamar.

alter table public.calculadora_assinantes
  add column if not exists nome text,
  add column if not exists tipo_documento text not null default 'CNPJ' check (tipo_documento in ('CNPJ', 'CPF')),
  add column if not exists documento text,
  add column if not exists email_comercial text,
  add column if not exists telefone text,
  add column if not exists cep text,
  add column if not exists endereco text,
  add column if not exists nome_responsavel text,
  add column if not exists cpf_responsavel text,
  add column if not exists data_nascimento date;

create or replace function public.fn_calculadora_assinante_cadastro_get(p_assinante_id uuid)
returns public.calculadora_assinantes
language sql
security definer
set search_path to 'public'
as $function$
  select * from public.calculadora_assinantes where id = p_assinante_id;
$function$;

create or replace function public.fn_calculadora_assinante_cadastro_upsert(
  p_assinante_id uuid,
  p_nome text,
  p_tipo_documento text,
  p_documento text,
  p_email_comercial text,
  p_telefone text,
  p_cep text,
  p_endereco text,
  p_nome_responsavel text,
  p_cpf_responsavel text,
  p_data_nascimento date
)
returns public.calculadora_assinantes
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_row public.calculadora_assinantes;
begin
  update public.calculadora_assinantes set
    nome = p_nome,
    tipo_documento = p_tipo_documento,
    documento = p_documento,
    email_comercial = p_email_comercial,
    telefone = p_telefone,
    cep = p_cep,
    endereco = p_endereco,
    nome_responsavel = p_nome_responsavel,
    cpf_responsavel = p_cpf_responsavel,
    data_nascimento = p_data_nascimento,
    updated_at = now()
  where id = p_assinante_id
  returning * into v_row;
  return v_row;
end;
$function$;

revoke all on function public.fn_calculadora_assinante_cadastro_get from public;
grant execute on function public.fn_calculadora_assinante_cadastro_get to service_role;

revoke all on function public.fn_calculadora_assinante_cadastro_upsert from public;
grant execute on function public.fn_calculadora_assinante_cadastro_upsert to service_role;
