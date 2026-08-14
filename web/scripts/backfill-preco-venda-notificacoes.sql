-- Backfill: acrescenta "Vendido por R$ X" nas notificações "Novo pedido recebido" já
-- enviadas antes da mensagem passar a incluir o preco_venda do pedido.
update public.notifications n
set mensagem = n.mensagem || ' Vendido por R$ ' || to_char(p.preco_venda, 'FM999999990.00') || '.'
from public.pedidos p
where p.id = (n.metadata->>'pedido_id')::uuid
  and n.tipo = 'pedido_novo'
  and n.mensagem not like '%Vendido por%'
  and p.preco_venda is not null
  and p.preco_venda > 0;
