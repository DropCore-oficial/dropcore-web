-- Fase A (aditiva, zero risco) do plano "Desmembrar Calculadora avulsa x Gestores de IA
-- avulso x DropCore HUB" — cria as 2 tabelas novas e faz backfill por cópia. Nenhum código
-- aponta pra elas ainda (isso é a Fase B, script separado). Nada é removido de
-- calculadora_assinantes nesta fase.

create table public.calculadora_assinante_plano_calculadora (
  assinante_id uuid primary key references public.calculadora_assinantes(id) on delete cascade,
  mp_renovacao_pendente_id text,
  mp_renovacao_ultimo_aprovado_id text
);

create table public.calculadora_assinante_plano_gestores_ia (
  assinante_id uuid primary key references public.calculadora_assinantes(id) on delete cascade,
  gestores_custo_mes numeric not null default 0,
  gestores_limite_mes numeric not null default 120,
  gestores_mes_ref text,
  anthropic_api_key_encriptada text,
  anthropic_api_key_configurada_em timestamptz,
  gemini_api_key_encriptada text,
  gestores_ia_desconto_tipo text check (gestores_ia_desconto_tipo is null or gestores_ia_desconto_tipo = any (array['valor','percentual'])),
  gestores_ia_desconto_valor numeric,
  gestores_ia_ciclo text check (gestores_ia_ciclo is null or gestores_ia_ciclo = any (array['mensal','anual'])),
  mp_gestores_ia_pendente_id text,
  mp_gestores_ia_ultimo_aprovado_id text,
  gestores_ia_contrato_aceite_em timestamptz
);

alter table public.calculadora_assinante_plano_calculadora enable row level security;
alter table public.calculadora_assinante_plano_gestores_ia enable row level security;
-- Deny-all de propósito (mesmo padrão de calculadora_assinante_mercadolivre_integrations) —
-- acesso só via RPC SECURITY DEFINER chamada pelo service_role.

-- Backfill: copia o estado atual, não apaga nada da tabela antiga.
insert into public.calculadora_assinante_plano_calculadora (assinante_id, mp_renovacao_pendente_id, mp_renovacao_ultimo_aprovado_id)
select id, mp_renovacao_pendente_id, mp_renovacao_ultimo_aprovado_id
from public.calculadora_assinantes;

insert into public.calculadora_assinante_plano_gestores_ia (
  assinante_id, gestores_custo_mes, gestores_limite_mes, gestores_mes_ref,
  anthropic_api_key_encriptada, anthropic_api_key_configurada_em, gemini_api_key_encriptada,
  gestores_ia_desconto_tipo, gestores_ia_desconto_valor, gestores_ia_ciclo,
  mp_gestores_ia_pendente_id, mp_gestores_ia_ultimo_aprovado_id, gestores_ia_contrato_aceite_em
)
select
  id, gestores_custo_mes, gestores_limite_mes, gestores_mes_ref,
  anthropic_api_key_encriptada, anthropic_api_key_configurada_em, gemini_api_key_encriptada,
  gestores_ia_desconto_tipo, gestores_ia_desconto_valor, gestores_ia_ciclo,
  mp_gestores_ia_pendente_id, mp_gestores_ia_ultimo_aprovado_id, gestores_ia_contrato_aceite_em
from public.calculadora_assinantes;

-- RPCs de leitura (service_role só) pras duas tabelas novas — só pra conferência da Fase A
-- (ver "Verificação" do plano). As RPCs de ESCRITA ficam pra Fase B: cada caller real
-- (byok, planos/PIX, orçamento) precisa de uma gravação pontual no campo certo, não um
-- upsert genérico — não criar isso agora sem um consumidor real (schema enxuto).

create or replace function public.fn_calculadora_assinante_plano_calculadora_get(p_assinante_id uuid)
returns public.calculadora_assinante_plano_calculadora
language sql
stable security definer
set search_path = public
as $$
  select * from public.calculadora_assinante_plano_calculadora where assinante_id = p_assinante_id;
$$;

create or replace function public.fn_calculadora_assinante_plano_gestores_ia_get(p_assinante_id uuid)
returns public.calculadora_assinante_plano_gestores_ia
language sql
stable security definer
set search_path = public
as $$
  select * from public.calculadora_assinante_plano_gestores_ia where assinante_id = p_assinante_id;
$$;

revoke all on function public.fn_calculadora_assinante_plano_calculadora_get from public, anon, authenticated;
revoke all on function public.fn_calculadora_assinante_plano_gestores_ia_get from public, anon, authenticated;

grant execute on function public.fn_calculadora_assinante_plano_calculadora_get to service_role;
grant execute on function public.fn_calculadora_assinante_plano_gestores_ia_get to service_role;
