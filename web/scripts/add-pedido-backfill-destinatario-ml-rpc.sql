-- Backfill único: preenche comprador_nome/cidade/uf dos pedidos ML já existentes que só
-- tinham o nickname mascarado (regra 9: write simples vai por RPC, mesmo em script de uma
-- vez só — a parte que depende da API do ML continua em TS, só a escrita final no banco
-- passa por aqui).

create or replace function public.fn_pedido_backfill_destinatario_ml(
  p_pedido_id uuid,
  p_comprador_nome text,
  p_comprador_cidade text,
  p_comprador_uf text
)
returns boolean
language sql
security definer
set search_path to 'public'
as $function$
  update public.pedidos
  set comprador_nome = coalesce(p_comprador_nome, comprador_nome),
      comprador_cidade = coalesce(p_comprador_cidade, comprador_cidade),
      comprador_uf = coalesce(p_comprador_uf, comprador_uf)
  where id = p_pedido_id
    and referencia_externa like 'ml:%'
    and comprador_cidade is null
  returning true;
$function$;

revoke all on function public.fn_pedido_backfill_destinatario_ml from public, anon, authenticated;
grant execute on function public.fn_pedido_backfill_destinatario_ml to service_role;
