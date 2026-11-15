-- Novo status de pedido `devolucao_nao_procede` — 2026-11-14. Até aqui, quando o admin
-- decidia "Manter venda" (devolução contestada negada, venda segue normal pro fornecedor),
-- `fn_devolucao_admin_manter_venda` jogava pedidos.status de volta pra 'entregue' — o
-- pedido virava indistinguível de um que nunca teve devolução, sumindo da aba Devolução
-- sem nenhum rastro (achado real: Sr Stark perguntou "não deveria continuar em devolução
-- porém resolvido?"). Segue o mesmo padrão já usado por 'devolvido' (ver commit 10ba1fe,
-- devolucaoPosRepasse.ts) — status final próprio, que mantém o pedido na aba Devolução
-- pra sempre, em vez de reverter pra um status genérico que apaga o histórico.

-- 1) Permitir o novo valor no check constraint de pedidos.status (texto puro, não enum).
alter table public.pedidos drop constraint pedidos_status_check;
alter table public.pedidos add constraint pedidos_status_check check (status = any (array[
  'enviado','aguardando_repasse','entregue','devolvido','cancelado','erro_saldo',
  'pendente_estoque','bloqueado','produto_nao_vinculado','anuncio_sem_sku',
  'em_devolucao','devolucao_sem_fornecedor','devolucao_nao_procede'
]));

-- 2) fn_devolucao_admin_manter_venda: pedidos.status final vira 'devolucao_nao_procede'
-- em vez de 'entregue' (financial_ledger.status continua revertendo pro status anterior
-- normal — isso não muda, é só o pedidos.status que ganha rastro próprio).
CREATE OR REPLACE FUNCTION public.fn_devolucao_admin_manter_venda(p_ledger_id uuid)
 RETURNS TABLE(ok boolean, motivo text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_row record;
begin
  select status, em_devolucao_status_anterior, pedido_id
    into v_row
    from public.financial_ledger
   where id = p_ledger_id
   for update;

  if not found then
    return query select false, 'Registro não encontrado.';
    return;
  end if;
  if v_row.status <> 'EM_DEVOLUCAO' then
    return query select false, 'Registro não está em devolução.';
    return;
  end if;

  update public.financial_ledger
     set status = coalesce(v_row.em_devolucao_status_anterior, 'ENTREGUE')::financial_ledger_status,
         em_devolucao_desde = null,
         em_devolucao_status_anterior = null
   where id = p_ledger_id;

  if v_row.pedido_id is not null then
    update public.pedidos set status = 'devolucao_nao_procede' where id = v_row.pedido_id and status = 'em_devolucao';
  end if;

  return query select true, null::text;
end;
$function$;

-- 3) fn_fornecedor_pedidos_lista e fn_seller_pedidos_lista: incluir o novo status no
-- bool_or de `tem_devolucao` (contador da aba Devolução) — sem isso o pedido conta certo
-- no admin mas some do contador do fornecedor/seller. Definições completas atualizadas
-- (CREATE OR REPLACE, mesmo corpo de antes + o novo status na lista de tem_devolucao) —
-- ver definição ao vivo no banco pra copiar se for recriar do zero.
