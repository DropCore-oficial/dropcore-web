-- Religa a liberação automática de devolução (2026-11-10) — desligada desde 2026-10-30
-- porque o gatilho antigo era um timer cego de 48h a partir de `em_devolucao_desde`
-- (quando o ledger ENTROU em devolução), sem relação nenhuma com a peça ter chegado de
-- volta fisicamente (demora 10+ dias no mundo real). Achado novo: existe um sinal
-- confiável do próprio Mercado Livre pra entrega física real
-- (`/post-purchase/v2/claims/{id}/returns`, ver `mlDevolucaoEntregueFisicamente` em
-- web/lib/mercadoLivreApiClient.ts, testado ao vivo). O gatilho agora é esse sinal + 72h de
-- folga pro fornecedor conferir e confirmar — não mais a data de entrada em devolução.

ALTER TABLE public.financial_ledger
  ADD COLUMN IF NOT EXISTS em_devolucao_entrega_confirmada_ml_em timestamptz;

-- Grava (uma vez só, idempotente) o momento em que o ML confirmou a entrega física —
-- chamado pela varredura periódica, nunca pelo fornecedor/seller direto.
CREATE OR REPLACE FUNCTION public.fn_devolucao_marcar_entrega_confirmada_ml(p_ledger_id uuid)
RETURNS TABLE(ok boolean, ja_confirmada boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_status text;
  v_ja timestamptz;
BEGIN
  SELECT status, em_devolucao_entrega_confirmada_ml_em INTO v_status, v_ja
    FROM public.financial_ledger
   WHERE id = p_ledger_id
     FOR UPDATE;

  IF NOT FOUND OR v_status <> 'EM_DEVOLUCAO' THEN
    RETURN QUERY SELECT false, false;
    RETURN;
  END IF;

  IF v_ja IS NOT NULL THEN
    RETURN QUERY SELECT true, true;
    RETURN;
  END IF;

  UPDATE public.financial_ledger
     SET em_devolucao_entrega_confirmada_ml_em = now()
   WHERE id = p_ledger_id;

  RETURN QUERY SELECT true, false;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_devolucao_marcar_entrega_confirmada_ml FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_devolucao_marcar_entrega_confirmada_ml(uuid) TO service_role;

-- Troca o gatilho de `fn_devolucao_liberar_automatico`: de "48h desde que entrou em
-- devolução" pra "72h desde que o ML confirmou a entrega física". Resto da função (não
-- libera se fornecedor contestou, cria lançamento DEVOLVIDO) continua igual.
CREATE OR REPLACE FUNCTION public.fn_devolucao_liberar_automatico(p_ledger_id uuid)
RETURNS TABLE(ok boolean, motivo text, devolucao_ledger_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_row record;
  v_dev_id uuid;
BEGIN
  SELECT id, org_id, status, fornecedor_id, seller_id, pedido_id,
         valor_fornecedor, valor_dropcore, valor_total, ciclo_repasse,
         em_devolucao_entrega_confirmada_ml_em, fornecedor_contestou_em
    INTO v_row
    FROM public.financial_ledger
   WHERE id = p_ledger_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Registro não encontrado.', NULL::uuid;
    RETURN;
  END IF;
  IF v_row.status <> 'EM_DEVOLUCAO' THEN
    RETURN QUERY SELECT false, 'Registro não está mais em devolução.', NULL::uuid;
    RETURN;
  END IF;
  IF v_row.fornecedor_contestou_em IS NOT NULL THEN
    RETURN QUERY SELECT false, 'Fornecedor contestou — não libera automático.', NULL::uuid;
    RETURN;
  END IF;
  IF v_row.em_devolucao_entrega_confirmada_ml_em IS NULL
     OR v_row.em_devolucao_entrega_confirmada_ml_em > now() - interval '72 hours' THEN
    RETURN QUERY SELECT false, 'Entrega física ainda não confirmada pelo ML ou prazo de 72h não venceu.', NULL::uuid;
    RETURN;
  END IF;

  UPDATE public.financial_ledger
     SET status = 'DEVOLVIDO'
   WHERE id = p_ledger_id;

  IF v_row.pedido_id IS NOT NULL THEN
    UPDATE public.pedidos SET status = 'devolvido' WHERE id = v_row.pedido_id;
  END IF;

  INSERT INTO public.financial_ledger (
    org_id, seller_id, fornecedor_id, pedido_id, tipo,
    valor_fornecedor, valor_dropcore, valor_total, status, ciclo_repasse, referencia
  ) VALUES (
    v_row.org_id, v_row.seller_id, v_row.fornecedor_id, v_row.pedido_id, 'DEVOLUCAO',
    v_row.valor_fornecedor, v_row.valor_dropcore, v_row.valor_total, 'DEVOLVIDO', v_row.ciclo_repasse,
    'devolucao liberada automaticamente (72h sem resposta do fornecedor após entrega física confirmada pelo ML) do ledger ' || p_ledger_id
  )
  RETURNING id INTO v_dev_id;

  RETURN QUERY SELECT true, NULL::text, v_dev_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_devolucao_liberar_automatico FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_devolucao_liberar_automatico(uuid) TO service_role;
