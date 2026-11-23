-- Centro de Distribuição (CD) DropCore: histórico append-only de remessa declarada,
-- conferência de entrada e baixa manual (desligamento do CD ou avaria/perda). O "estoque
-- conferido atual" não é uma coluna própria — é SUM(conferencia_entrada) - SUM(baixa_manual)
-- por sku_id, calculado nas RPCs de leitura. skus.estoque_atual é o número que o resto do
-- sistema já lê/debita; as RPCs de conferência/baixa escrevem nele diretamente.
-- Execute no SQL Editor do Supabase (ou via MCP).

CREATE TABLE IF NOT EXISTS public.cd_movimentos_estoque (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  fornecedor_id uuid NOT NULL REFERENCES public.fornecedores(id) ON DELETE RESTRICT,
  sku_id uuid NOT NULL REFERENCES public.skus(id) ON DELETE RESTRICT,
  tipo text NOT NULL CHECK (tipo IN ('remessa_declarada', 'conferencia_entrada', 'baixa_manual')),
  quantidade numeric NOT NULL CHECK (quantidade > 0),
  motivo text CHECK (
    (tipo <> 'baixa_manual' AND motivo IS NULL) OR
    (tipo = 'baixa_manual' AND motivo IN ('saida_cd_fornecedor_desligado', 'avaria_perda_dropcore', 'defeito_fabrica_fornecedor'))
  ),
  responsavel_custo text CHECK (responsavel_custo IN ('dropcore', 'fornecedor', 'nenhum')),
  remessa_ref_id uuid REFERENCES public.cd_movimentos_estoque(id),
  observacao text,
  criado_por_user_id uuid NOT NULL,
  criado_por_tipo text NOT NULL CHECK (criado_por_tipo IN ('fornecedor', 'admin')),
  criado_em timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.cd_movimentos_estoque IS
  'Histórico auditável do CD: remessa declarada pelo fornecedor, conferência física pelo '
  'operador DropCore, e baixa manual (desligamento do CD ou avaria/perda, com motivo e '
  'responsável pelo custo). Fonte do estoque conferido = SUM(conferencia_entrada) - SUM(baixa_manual) por sku_id.';

CREATE INDEX IF NOT EXISTS idx_cd_mov_sku ON public.cd_movimentos_estoque (sku_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_cd_mov_fornecedor ON public.cd_movimentos_estoque (fornecedor_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_cd_mov_org ON public.cd_movimentos_estoque (org_id);
CREATE INDEX IF NOT EXISTS idx_cd_mov_remessa_pendente ON public.cd_movimentos_estoque (remessa_ref_id) WHERE tipo = 'remessa_declarada';

ALTER TABLE public.cd_movimentos_estoque ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_cd_mov_deny_all ON public.cd_movimentos_estoque;
CREATE POLICY rls_cd_mov_deny_all ON public.cd_movimentos_estoque
  FOR ALL
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON public.cd_movimentos_estoque FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.cd_movimentos_estoque TO service_role;
