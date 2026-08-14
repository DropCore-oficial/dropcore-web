-- Reduz validade dos créditos ativos de 12 para 6 meses (SELLER_CREDITO_MESES_VALIDADE).
-- Recalcula expira_em dos lotes ativos para creditado_em + 6 meses.
update public.seller_credit_lots
set expira_em = creditado_em + interval '6 months',
    atualizado_em = now()
where status = 'ativo';

-- Mantém a data exibida no dashboard (seller_depositos_pix.credito_expira_em) em sincronia
update public.seller_depositos_pix d
set credito_expira_em = l.expira_em
from public.seller_credit_lots l
where l.deposito_id = d.id
  and d.status = 'aprovado';
