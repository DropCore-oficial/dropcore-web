-- Marca quando o fornecedor efetivamente imprimiu a etiqueta oficial em lote.
-- Usado por: web/app/api/fornecedor/pedidos/etiquetas-combinadas/route.ts (grava),
-- web/app/api/fornecedor/pedidos/[id]/marcar-postado/route.ts (trava até existir),
-- web/app/api/fornecedor/pedidos/[id]/reportar-etiqueta-errada/route.ts (limpa de novo).
--
-- Antes disso, "Marcar como postado" só checava se existia etiqueta (etiqueta_pdf_url/
-- etiqueta_pdf_base64), mas nada garantia que o fornecedor realmente tinha imprimido ela
-- antes de postar o pacote fisicamente. Essa coluna fecha esse buraco.

ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS etiqueta_impressa_em timestamptz;

COMMENT ON COLUMN public.pedidos.etiqueta_impressa_em IS 'Quando o fornecedor imprimiu a etiqueta oficial em lote (menu "Imprimir etiqueta" > "Etiquetas de envio"). Null = ainda não imprimiu (ou etiqueta foi reportada como errada e precisa reimprimir). Trava "marcar como postado" até existir.';
