-- Corrige race condition achada na auditoria de backend do seller (2026-10-14):
-- upgrade-pro-pix, ativar-addon-gestores-ia-pix e credito-extra-pix (tiago) conferem "já tem
-- pendente desse tipo?" e só depois inserem — duplo clique pode passar pelos dois e gerar
-- duas cobranças PIX reais do mesmo tipo pro mesmo seller.
--
-- Índice único parcial, só nos 3 tipos "singleton" (não afeta recarga comum, que pode ter
-- vários pendentes legítimos de valores diferentes ao mesmo tempo). Confirmado antes de
-- rodar: 0 conflito hoje (nenhum seller tem 2 pendentes desses tipos).

CREATE UNIQUE INDEX IF NOT EXISTS ux_seller_depositos_pix_singleton_pendente
ON seller_depositos_pix (seller_id, referencia)
WHERE status = 'pendente' AND referencia IN ('UPGRADE_PRO', 'ADDON_GESTORES_IA', 'CREDITO_CHAT_IA');
