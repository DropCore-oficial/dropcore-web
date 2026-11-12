-- Cron de consistência dos contadores de aba de pedidos (seller/fornecedor) — 2026-11-11.
-- Achado real: fn_seller_pedidos_lista escolhia 1 pedido representante por pacote
-- (DISTINCT ON ... ORDER BY criado_em DESC) pra contar a aba "Devolução", e quando um
-- pacote tinha itens em status diferentes (1 devolvido, outro mais recente ainda
-- "entregue"), a devolução sumia da contagem — corrigido em
-- fix-seller-pedidos-contadores-pacote-status-divergente.sql. Essa rotina é a rede de
-- segurança genérica: recalcula a contagem de "devolução" por fora (ground truth
-- independente, ver add-pedidos-contadores-ground-truth-rpc.sql) e avisa o admin se algum
-- seller/fornecedor divergir — não importa a causa futura, não só esse bug específico.
-- Lock advisory 913024 (próximo livre; até 913023 já em uso por outros crons). Roda de hora
-- em hora — é só leitura interna (sem chamada de API externa), barato de sobra pra esse
-- ritmo, diferente da varredura de devolução (essa sim bate no ML, por isso 6h).

CREATE OR REPLACE FUNCTION public.dropcore_try_pedidos_contadores_consistencia_lock()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pg_try_advisory_lock(913024);
$$;

CREATE OR REPLACE FUNCTION public.dropcore_release_pedidos_contadores_consistencia_lock()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pg_advisory_unlock(913024);
$$;

REVOKE ALL ON FUNCTION public.dropcore_try_pedidos_contadores_consistencia_lock FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.dropcore_release_pedidos_contadores_consistencia_lock FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dropcore_try_pedidos_contadores_consistencia_lock() TO postgres;
GRANT EXECUTE ON FUNCTION public.dropcore_release_pedidos_contadores_consistencia_lock() TO postgres;

SELECT cron.schedule(
  'dropcore-pedidos-contadores-consistencia',
  '0 * * * *',
  $$SELECT public.dropcore_cron_http_post('/api/cron/pedidos-contadores-consistencia', 60000);$$
);
