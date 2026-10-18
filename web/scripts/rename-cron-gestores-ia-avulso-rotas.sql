-- Rename de rota dos Gestores de IA avulso (2026-10-17): slug de pessoa -> título genérico
-- (andrey->anuncio, amanda->sac, ulisses->ads). "estoque" e "resumo-diario" já usavam nome
-- genérico, não precisam de mudança. `cron.alter_job` não renomeia o job (só schedule/
-- command/etc) — por isso aqui é unschedule do nome antigo + schedule do nome novo, mesmo
-- horário e mesma lógica de cada um, só a URL/nome mudam. Rodar só depois que a pasta da
-- rota (app/api/cron/gestores-ia-avulso-*) já tiver sido renomeada no mesmo deploy, senão
-- o cron novo aponta pra uma rota que ainda não existe.

select cron.unschedule('gestores-ia-avulso-andrey');
select cron.schedule(
  'gestores-ia-avulso-anuncio',
  '0 8 * * *',
  $$ select public.dropcore_cron_http_post('/api/cron/gestores-ia-avulso-anuncio'); $$
);

select cron.unschedule('gestores-ia-avulso-amanda');
select cron.schedule(
  'gestores-ia-avulso-sac',
  '15 8 * * *',
  $$ select public.dropcore_cron_http_post('/api/cron/gestores-ia-avulso-sac'); $$
);

select cron.unschedule('gestores-ia-avulso-ulisses');
select cron.schedule(
  'gestores-ia-avulso-ads',
  '30 8 * * *',
  $$ select public.dropcore_cron_http_post('/api/cron/gestores-ia-avulso-ads'); $$
);

select cron.unschedule('gestores-ia-avulso-andrey-resultado');
select cron.schedule(
  'gestores-ia-avulso-anuncio-resultado',
  '*/15 * * * *',
  $$ select public.dropcore_cron_http_post('/api/cron/gestores-ia-avulso-anuncio-resultado'); $$
);
