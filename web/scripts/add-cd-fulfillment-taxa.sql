-- Centro de Distribuição (CD) DropCore: taxa de fulfillment por pedido, configurável por
-- fornecedor (0 = isento), separada da comissão DropCore (valor_dropcore) que já existe.
-- Descontada do valor_fornecedor na hora do repasse, nunca do valor_total que o seller vê.
-- Execute no SQL Editor do Supabase (ou via MCP).

ALTER TABLE public.fornecedores ADD COLUMN IF NOT EXISTS cd_fulfillment_taxa_valor numeric NOT NULL DEFAULT 0 CHECK (cd_fulfillment_taxa_valor >= 0);

COMMENT ON COLUMN public.fornecedores.cd_fulfillment_taxa_valor IS
  'Taxa fixa (R$) cobrada do fornecedor 1x por pedido fulfilled pelo CD DropCore (picking/'
  'embalagem/despacho). 0 = isento. Separada da comissão DropCore (valor_dropcore) — nunca '
  'confundir as duas. Só tem efeito quando opera_no_cd = true.';

ALTER TABLE public.financial_ledger ADD COLUMN IF NOT EXISTS valor_fulfillment_dropcore numeric NOT NULL DEFAULT 0 CHECK (valor_fulfillment_dropcore >= 0);

COMMENT ON COLUMN public.financial_ledger.valor_fulfillment_dropcore IS
  'Taxa de fulfillment CD capturada no momento da criação da linha (cópia de '
  'fornecedores.cd_fulfillment_taxa_valor), pra não retroagir se a taxa mudar depois. '
  'Deduzida de valor_fornecedor no repasse — nunca altera valor_fornecedor/valor_dropcore/'
  'valor_total, que continuam representando o bruto.';

ALTER TABLE public.financial_repasse_fornecedor ADD COLUMN IF NOT EXISTS valor_bruto_fornecedor numeric NOT NULL DEFAULT 0 CHECK (valor_bruto_fornecedor >= 0);
ALTER TABLE public.financial_repasse_fornecedor ADD COLUMN IF NOT EXISTS valor_fulfillment_dropcore numeric NOT NULL DEFAULT 0 CHECK (valor_fulfillment_dropcore >= 0);

COMMENT ON COLUMN public.financial_repasse_fornecedor.valor_bruto_fornecedor IS
  'Soma de financial_ledger.valor_fornecedor do ciclo, antes de descontar fulfillment. '
  'valor_total (coluna já existente) é o líquido efetivamente pago = bruto - fulfillment.';
COMMENT ON COLUMN public.financial_repasse_fornecedor.valor_fulfillment_dropcore IS
  'Soma da taxa de fulfillment CD descontada do fornecedor nesse ciclo — receita DropCore '
  'separada da comissão (financial_ciclos_repasse.total_dropcore).';

ALTER TABLE public.financial_ciclos_repasse ADD COLUMN IF NOT EXISTS total_fulfillment_dropcore numeric NOT NULL DEFAULT 0 CHECK (total_fulfillment_dropcore >= 0);

COMMENT ON COLUMN public.financial_ciclos_repasse.total_fulfillment_dropcore IS
  'Receita de fulfillment CD do ciclo (soma de financial_repasse_fornecedor.valor_fulfillment_dropcore) '
  '— separada de total_dropcore (comissão).';
