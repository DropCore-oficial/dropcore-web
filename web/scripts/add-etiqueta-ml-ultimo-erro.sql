-- Captura o motivo real de falha do ML ao buscar a etiqueta real de envio
-- (hoje mlBuscarEtiquetaPdf descarta o corpo de erro e devolve só null, o retry só conta
-- mais uma tentativa sem saber o porquê). Achado investigando pedidos presos do seller
-- Vinz Collection (nota fiscal do ML com erro na emissão, atraso de até dias na liberação).
alter table public.pedidos
  add column if not exists etiqueta_ml_ultimo_erro text;
