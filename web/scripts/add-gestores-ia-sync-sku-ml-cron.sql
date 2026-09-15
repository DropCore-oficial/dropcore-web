-- Agenda o sync de vínculo SKU↔item_id do Mercado Livre (nunca tinha sido ligado em
-- produção — última vez que rodou foi manual, 2026-09-02). Sem isso o Ulisses (e qualquer
-- outro gestor que precise do vínculo) trabalha com dado de até semanas de atraso.
-- Zero custo de IA (só leitura da API do ML + upsert), roda 1x/dia.

SELECT cron.schedule(
  'dropcore-gestores-ia-sync-sku-ml',
  '0 6 * * *',
  $$SELECT public.dropcore_cron_http_post('/api/cron/gestores-ia-sync-sku-ml');$$
);
