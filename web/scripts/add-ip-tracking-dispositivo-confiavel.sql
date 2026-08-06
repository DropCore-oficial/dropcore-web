-- Colunas de IP que faltavam pro código já escrito em web/app/api/auth/solicitar-codigo-dispositivo
-- e web/app/api/auth/confirmar-dispositivo (rastreio de onde veio a solicitação/confirmação do
-- código de dispositivo confiável). fornecedor_dados_bancarios_historico já existe com ip_confirmacao
-- no mesmo padrão.

alter table public.login_verification_codes
  add column if not exists ip_solicitacao text;

alter table public.trusted_devices
  add column if not exists ip_confirmacao text;
