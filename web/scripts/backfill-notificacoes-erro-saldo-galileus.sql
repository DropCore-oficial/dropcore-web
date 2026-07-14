-- Backfill: cria notificações de erro_saldo para pedidos de teste que foram inseridos
-- direto no banco (sem passar pela API), e por isso nunca dispararam notifySellerPedidoAtencao.
-- Execute no SQL Editor do Supabase. Idempotente (só insere se não existir notificação pro pedido).

insert into notifications (user_id, tipo, titulo, mensagem, metadata, criado_em)
select
  s.user_id,
  'erro_saldo',
  'Erro de saldo',
  'Saldo insuficiente para o pedido' || coalesce(' ' || p.referencia_externa, '') ||
    ' (R$ ' || to_char(p.valor_total, 'FM999999990.00') || '). Recarregue seus créditos DropCore.',
  jsonb_build_object('pedido_id', p.id),
  p.criado_em -- data real do pedido, não a hora do backfill — mantém a ordem cronológica no sininho
from pedidos p
join sellers s on s.id = p.seller_id
where p.status = 'erro_saldo'
  and s.user_id is not null
  and not exists (
    select 1 from notifications n where (n.metadata->>'pedido_id')::uuid = p.id
  );
