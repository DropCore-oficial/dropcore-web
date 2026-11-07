-- Corrige add-skus-ml-sync-status.sql: `fn_fornecedor_sku_estoque_mercadolivre_marcar_sem_correspondencia`
-- tem 65 caracteres — acima do limite de 63 (NAMEDATALEN-1) do Postgres, que trunca nomes
-- de função longos demais SEM ERRO (a função foi criada de verdade, só que com o nome
-- cortado em "...correspondenc", sem o "ia" final). O código do app chama pelo nome
-- completo via PostgREST (busca exata por string, não reparsing de identificador SQL —
-- não sofre a mesma truncagem), então a chamada falhava com "function not found" e, como o
-- retorno dessa chamada específica não era checado, falhava em silêncio: a rodada de sync
-- terminava "ok" no resumo agregado, mas nenhum SKU era marcado 'sem_sku_no_ml' de verdade
-- (achado 2026-11-07, confirmado testando o RPC direto via REST).
--
-- Correção: função nova com nome mais curto (47 chars), `fn_fornecedor_sku_ml_marcar_sem_correspondencia`.
-- `web/lib/fornecedorMercadoLivreSyncEstoque.ts` já chama esse nome novo.

drop function if exists public.fn_fornecedor_sku_estoque_mercadolivre_marcar_sem_correspondencia(uuid, uuid, uuid);

create function public.fn_fornecedor_sku_ml_marcar_sem_correspondencia(
  p_sku_id uuid,
  p_org_id uuid,
  p_fornecedor_id uuid
)
returns public.skus
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_row public.skus;
begin
  update public.skus
  set ml_sync_status = 'sem_sku_no_ml',
      ml_sync_at = now()
  where id = p_sku_id and org_id = p_org_id and fornecedor_id = p_fornecedor_id
  returning * into v_row;
  return v_row;
end;
$function$;

revoke all on function public.fn_fornecedor_sku_ml_marcar_sem_correspondencia from public, anon, authenticated;
grant execute on function public.fn_fornecedor_sku_ml_marcar_sem_correspondencia to service_role;
