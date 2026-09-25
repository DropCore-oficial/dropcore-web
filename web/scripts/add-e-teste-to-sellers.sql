-- Marca seller cujo SALDO ATUAL não é dinheiro real (crédito manual de teste, não PIX
-- aprovado) — hoje só o seller Segatto (id 2406e67b-09d7-42ab-90ae-ce42b95314c8), cujos
-- R$1.673,48 vieram de 2 lançamentos "Crédito de teste" em seller_movimentacoes, nunca de
-- depósito PIX real (só 1 PIX aprovado na conta, de R$0,01).
--
-- IMPORTANTE: essa coluna significa "o saldo atual deste seller não é dinheiro real", NÃO
-- "este seller é uma conta de teste" — Galileus, Coimbra, Viniz e Majer também são
-- sellers usados pra teste de fluxo, mas o saldo_atual deles é 100% dinheiro real (PIX
-- aprovado de verdade) e NUNCA deve ser marcado aqui, senão a soma real do admin fica
-- errada. Confirmar sempre contra seller_depositos_pix (status='aprovado') antes de marcar
-- qualquer seller novo.
ALTER TABLE public.sellers
  ADD COLUMN IF NOT EXISTS e_teste boolean NOT NULL DEFAULT false;

UPDATE public.sellers
SET e_teste = true
WHERE id = '2406e67b-09d7-42ab-90ae-ce42b95314c8';
