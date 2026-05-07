-- Renovação da calculadora via PIX (Mercado Pago): idempotência + sync local sem webhook.
-- Rode no SQL Editor do Supabase se ainda não existirem as colunas.

alter table public.calculadora_assinantes
  add column if not exists mp_renovacao_pendente_id text;

alter table public.calculadora_assinantes
  add column if not exists mp_renovacao_ultimo_aprovado_id text;

comment on column public.calculadora_assinantes.mp_renovacao_pendente_id is
  'Último payment_id MP da cobrança PIX de renovação pendente (polling / sync).';

comment on column public.calculadora_assinantes.mp_renovacao_ultimo_aprovado_id is
  'Último payment_id MP já creditado na renovação (evita duplicar webhook).';
