-- =============================================================================
-- DROP CORE — MÓDULO FINANCEIRO OFICIAL (V2)
-- Execute no SQL Editor do Supabase.
-- Não simplificar: bloqueio pré-pago, repasse sincronizado, saldo derivado do ledger.
-- =============================================================================

-- Tipos de evento no ledger
DO $$ BEGIN
  CREATE TYPE financial_ledger_tipo AS ENUM (
    'VENDA',
    'BLOQUEIO',
    'REPASSE',
    'DEVOLUCAO',
    'AJUSTE',
    'CREDITO'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Status financeiro
DO $$ BEGIN
  CREATE TYPE financial_ledger_status AS ENUM (
    'VENDA_CRIADA',
    'BLOQUEADO',
    'ENTREGUE',
    'AGUARDANDO_REPASSE',
    'PAGO',
    'EM_DEVOLUCAO',  -- devolução registrada; valor fica bloqueado até fornecedor conferir
    'DEVOLVIDO',
    'A_DESCONTAR',
    'CANCELADO',
    'LIBERADO'  -- crédito/ajuste disponível no saldo
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
-- Se o tipo já existia sem LIBERADO, execute manualmente: ALTER TYPE financial_ledger_status ADD VALUE 'LIBERADO';

-- =============================================================================
-- LEDGER (fonte única da verdade — saldo é derivado daqui)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.financial_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  seller_id uuid NOT NULL REFERENCES public.sellers(id) ON DELETE RESTRICT,
  fornecedor_id uuid, -- pode ser null em crédito/ajuste
  pedido_id uuid,    -- pode ser null em crédito/ajuste
  tipo financial_ledger_tipo NOT NULL,
  valor_fornecedor numeric NOT NULL DEFAULT 0 CHECK (valor_fornecedor >= 0),
  valor_dropcore numeric NOT NULL DEFAULT 0 CHECK (valor_dropcore >= 0),
  valor_total numeric NOT NULL DEFAULT 0,
  status financial_ledger_status NOT NULL DEFAULT 'BLOQUEADO',
  data_evento timestamptz NOT NULL DEFAULT now(),
  ciclo_repasse date, -- segunda-feira do ciclo (semana em que será pago)
  referencia text,   -- ex: pedido_id para débitos, motivo de ajuste
  criado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_valor_total CHECK (valor_total = valor_fornecedor + valor_dropcore)
);

CREATE INDEX IF NOT EXISTS idx_financial_ledger_org_id ON public.financial_ledger(org_id);
CREATE INDEX IF NOT EXISTS idx_financial_ledger_seller_id ON public.financial_ledger(seller_id);
CREATE INDEX IF NOT EXISTS idx_financial_ledger_fornecedor_id ON public.financial_ledger(fornecedor_id);
CREATE INDEX IF NOT EXISTS idx_financial_ledger_pedido_id ON public.financial_ledger(pedido_id);
CREATE INDEX IF NOT EXISTS idx_financial_ledger_status ON public.financial_ledger(status);
CREATE INDEX IF NOT EXISTS idx_financial_ledger_data_evento ON public.financial_ledger(data_evento DESC);
CREATE INDEX IF NOT EXISTS idx_financial_ledger_ciclo_repasse ON public.financial_ledger(ciclo_repasse);

COMMENT ON TABLE public.financial_ledger IS 'Ledger financeiro V2 — fonte única da verdade. Saldo do seller é derivado daqui.';
COMMENT ON COLUMN public.financial_ledger.valor_fornecedor IS 'Valor que vai para o fornecedor (custo base)';
COMMENT ON COLUMN public.financial_ledger.valor_dropcore IS 'Taxa DropCore (ex: 15%)';
COMMENT ON COLUMN public.financial_ledger.ciclo_repasse IS 'Segunda-feira da semana em que o repasse será pago';

-- =============================================================================
-- CICLOS DE REPASSE (segunda a segunda)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.financial_ciclos_repasse (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  ciclo_repasse date NOT NULL, -- segunda-feira
  status text NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto', 'fechado', 'pago')),
  total_fornecedores numeric NOT NULL DEFAULT 0,
  total_dropcore numeric NOT NULL DEFAULT 0,
  fechado_em timestamptz,
  criado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id, ciclo_repasse)
);

CREATE INDEX IF NOT EXISTS idx_financial_ciclos_org ON public.financial_ciclos_repasse(org_id);
CREATE INDEX IF NOT EXISTS idx_financial_ciclos_data ON public.financial_ciclos_repasse(ciclo_repasse DESC);

-- =============================================================================
-- REPASSES POR FORNECEDOR (resumo por ciclo)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.financial_repasse_fornecedor (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  fornecedor_id uuid NOT NULL,
  ciclo_repasse date NOT NULL,
  valor_total numeric NOT NULL DEFAULT 0 CHECK (valor_total >= 0),
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'liberado', 'pago')),
  pago_em timestamptz,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE(fornecedor_id, ciclo_repasse)
);

CREATE INDEX IF NOT EXISTS idx_financial_repasse_fornecedor ON public.financial_repasse_fornecedor(fornecedor_id);
CREATE INDEX IF NOT EXISTS idx_financial_repasse_ciclo ON public.financial_repasse_fornecedor(ciclo_repasse);

-- =============================================================================
-- DÉBITOS A DESCONTAR (devolução após repasse)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.financial_debito_descontar (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  fornecedor_id uuid NOT NULL,
  ledger_id uuid REFERENCES public.financial_ledger(id) ON DELETE RESTRICT,
  pedido_id uuid,
  valor_fornecedor numeric NOT NULL DEFAULT 0,
  valor_dropcore numeric NOT NULL DEFAULT 0,
  valor_total numeric NOT NULL DEFAULT 0,
  ciclo_a_descontar date, -- ciclo em que será descontado
  descontado boolean NOT NULL DEFAULT false,
  descontado_em timestamptz,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_financial_debito_fornecedor ON public.financial_debito_descontar(fornecedor_id);
CREATE INDEX IF NOT EXISTS idx_financial_debito_descontado ON public.financial_debito_descontar(descontado) WHERE descontado = false;

-- =============================================================================
-- FUNÇÃO: Obter segunda-feira da semana de uma data
-- =============================================================================
CREATE OR REPLACE FUNCTION public.fn_segunda_feira_semana(d date)
RETURNS date
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT date_trunc('week', d)::date;
$$;

-- Segunda-feira da semana seguinte (tudo enviado seg-sáb é pago na segunda seguinte)
CREATE OR REPLACE FUNCTION public.fn_ciclo_repasse(data_evento timestamptz)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  d date := data_evento::date;
  dia_semana int;
  segunda_desta_semana date;
BEGIN
  dia_semana := extract(isodow from d); -- 1=segunda, 7=domingo
  segunda_desta_semana := d - (dia_semana - 1);
  RETURN segunda_desta_semana + 7; -- próxima segunda
END;
$$;

-- =============================================================================
-- FUNÇÃO: Calcular saldo do seller a partir do ledger (derivado)
-- Regra: saldo_disponivel = créditos - bloqueios ativos - já repassados (PAGO) + devoluções
--        saldo_bloqueado = soma dos bloqueios ainda não pagos
--        PAGO = dinheiro já foi para fornecedor + DropCore, não volta ao seller
-- =============================================================================
CREATE OR REPLACE FUNCTION public.fn_seller_saldo_from_ledger(p_seller_id uuid)
RETURNS TABLE(saldo_disponivel numeric, saldo_bloqueado numeric, saldo_total numeric)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_credito numeric;
  v_bloqueado numeric;
  v_pago numeric;
  v_devolucao numeric;
BEGIN
  SELECT COALESCE(SUM(valor_total), 0) INTO v_credito
  FROM public.financial_ledger
  WHERE seller_id = p_seller_id AND tipo = 'CREDITO' AND valor_total > 0;

  SELECT COALESCE(SUM(valor_total), 0) INTO v_bloqueado
  FROM public.financial_ledger
  WHERE seller_id = p_seller_id
    AND tipo IN ('BLOQUEIO', 'VENDA')
    AND status IN ('BLOQUEADO', 'ENTREGUE', 'AGUARDANDO_REPASSE', 'EM_DEVOLUCAO');

  SELECT COALESCE(SUM(valor_total), 0) INTO v_pago
  FROM public.financial_ledger
  WHERE seller_id = p_seller_id
    AND tipo IN ('BLOQUEIO', 'VENDA')
    AND status = 'PAGO';

  SELECT COALESCE(SUM(valor_total), 0) INTO v_devolucao
  FROM public.financial_ledger
  WHERE seller_id = p_seller_id AND tipo = 'DEVOLUCAO' AND valor_total > 0;

  saldo_bloqueado := v_bloqueado;
  saldo_disponivel := GREATEST(0, v_credito - v_bloqueado - v_pago + v_devolucao);
  saldo_total := saldo_disponivel + saldo_bloqueado;
  RETURN NEXT;
END;
$$;

-- =============================================================================
-- TRIGGER: Manter sellers.saldo_atual e sellers.saldo_bloqueado em sync com o ledger
-- (compatibilidade com APIs/UI que leem direto da tabela sellers)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.fn_sync_seller_saldo_from_ledger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  r RECORD;
  sid uuid;
BEGIN
  sid := COALESCE(NEW.seller_id, OLD.seller_id);
  IF sid IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  FOR r IN SELECT * FROM public.fn_seller_saldo_from_ledger(sid)
  LOOP
    UPDATE public.sellers
    SET saldo_atual = r.saldo_disponivel, saldo_bloqueado = r.saldo_bloqueado, atualizado_em = now()
    WHERE id = sid;
    EXIT;
  END LOOP;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS tr_financial_ledger_sync_seller ON public.financial_ledger;
CREATE TRIGGER tr_financial_ledger_sync_seller
  AFTER INSERT OR UPDATE OR DELETE ON public.financial_ledger
  FOR EACH ROW EXECUTE FUNCTION public.fn_sync_seller_saldo_from_ledger();

-- =============================================================================
-- RLS (segurança: owner/admin vê tudo; fornecedor só seu; seller só seu)
-- =============================================================================
ALTER TABLE public.financial_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_ciclos_repasse ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_repasse_fornecedor ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_debito_descontar ENABLE ROW LEVEL SECURITY;

-- Políticas criadas em rls-financeiro.sql (owner/admin vê org; seller/fornecedor via org_members.seller_id/fornecedor_id).
-- Com service role no backend, RLS é bypassado; use sempre server-side.
