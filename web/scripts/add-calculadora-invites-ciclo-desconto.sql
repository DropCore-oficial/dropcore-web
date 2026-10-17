-- Convite de Gestores de IA passa a carregar ciclo (mensal/anual) e desconto, decididos
-- pelo admin no momento de gerar o convite (antes só existiam pós-cadastro, editáveis na
-- tabela de assinantes). Aplicados na conta automaticamente quando o convite é aceito.

alter table public.calculadora_invites
  add column if not exists gestores_ia_ciclo text,
  add column if not exists gestores_ia_desconto_tipo text,
  add column if not exists gestores_ia_desconto_valor numeric;

alter table public.calculadora_invites
  drop constraint if exists calculadora_invites_gestores_ia_ciclo_check;
alter table public.calculadora_invites
  add constraint calculadora_invites_gestores_ia_ciclo_check
  check (gestores_ia_ciclo is null or gestores_ia_ciclo in ('mensal', 'anual'));

alter table public.calculadora_invites
  drop constraint if exists calculadora_invites_gestores_ia_desconto_tipo_check;
alter table public.calculadora_invites
  add constraint calculadora_invites_gestores_ia_desconto_tipo_check
  check (gestores_ia_desconto_tipo is null or gestores_ia_desconto_tipo in ('valor', 'percentual'));
