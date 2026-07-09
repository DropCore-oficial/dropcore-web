-- Liga RLS nas 12 tabelas que estavam totalmente abertas para anon/authenticated
-- (SELECT/INSERT/UPDATE/DELETE sem nenhuma restrição de linha).
-- Reaproveita as funções fn_user_can_access_* já usadas em rls-financeiro.sql /
-- rls-core-catalog.sql, sem duplicar lógica de acesso.

-- pedidos: colunas org_id/seller_id/fornecedor_id próprias, sem join.
ALTER TABLE public.pedidos ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_pedidos_select ON public.pedidos
  FOR SELECT USING (
    public.fn_user_can_access_seller(org_id, seller_id)
    OR public.fn_user_can_access_fornecedor(org_id, fornecedor_id)
  );

-- pedido_itens: não tem org_id/seller_id próprio -> join com pedidos
-- (mesmo padrão de seller_movimentacoes em rls-financeiro.sql).
ALTER TABLE public.pedido_itens ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_pedido_itens_select ON public.pedido_itens
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.pedidos p
      WHERE p.id = pedido_itens.pedido_id
        AND (public.fn_user_can_access_seller(p.org_id, p.seller_id)
             OR public.fn_user_can_access_fornecedor(p.org_id, p.fornecedor_id))
    )
  );

-- pedido_eventos: join com pedidos (mais preciso que confiar só no org_id da
-- própria linha, já que não referencia seller_id/fornecedor_id diretamente).
ALTER TABLE public.pedido_eventos ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_pedido_eventos_select ON public.pedido_eventos
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.pedidos p
      WHERE p.id = pedido_eventos.pedido_id
        AND (public.fn_user_can_access_seller(p.org_id, p.seller_id)
             OR public.fn_user_can_access_fornecedor(p.org_id, p.fornecedor_id))
    )
  );

-- erp_event_logs: org_id + seller_id diretos.
ALTER TABLE public.erp_event_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_erp_event_logs_select ON public.erp_event_logs
  FOR SELECT USING (public.fn_user_can_access_seller(org_id, seller_id));

-- sku_alteracoes_pendentes: org_id + fornecedor_id diretos.
ALTER TABLE public.sku_alteracoes_pendentes ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_sku_alteracoes_pendentes_select ON public.sku_alteracoes_pendentes
  FOR SELECT USING (
    public.fn_user_can_access_org(org_id)
    OR public.fn_user_can_access_fornecedor(org_id, fornecedor_id)
  );

-- financial_mensalidades: org_id direto (owner/admin da org vê as mensalidades da org).
ALTER TABLE public.financial_mensalidades ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_financial_mensalidades_select ON public.financial_mensalidades
  FOR SELECT USING (public.fn_user_can_access_org(org_id));

-- seller_invites / fornecedor_invites / calculadora_invites: RLS ligada SEM
-- nenhuma policy (deny-all para anon/authenticated). Confirmado por busca no
-- código que toda leitura de convite -- inclusive nas páginas "use client" de
-- registro (seller/register/[token], fornecedor/register/[token],
-- calculadora/register/[token]) -- passa por fetch('/api/.../invite/[token]'),
-- que usa supabaseAdmin (service role) no servidor. Nenhum client-component lê
-- essas tabelas direto com a anon key. Isso fecha o vazamento da coluna token
-- sem afetar o fluxo de aceite de convite.
ALTER TABLE public.seller_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fornecedor_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calculadora_invites ENABLE ROW LEVEL SECURITY;

-- api_rate_limits: infra pura de rate limit, sem tenant, nunca lida pelo client.
-- Deny-all -- só service role mexe.
ALTER TABLE public.api_rate_limits ENABLE ROW LEVEL SECURITY;

-- financial_planos: tabela de referência global (preço por plano), sem coluna
-- de tenant. Deny-all por padrão, mesmo padrão já usado intencionalmente em
-- calculadora_assinantes/calculadora_recebimentos. Se alguma tela precisar ler
-- direto do client, adicionar uma policy de SELECT em migration separada.
ALTER TABLE public.financial_planos ENABLE ROW LEVEL SECURITY;

-- produto_tabela_medidas: referência global de medidas (P/M/G/GG), dado não
-- sensível -- mesmo padrão do dropcore_design_tokens, mas restrito a
-- authenticated (não anon, já que o DropCore não tem vitrine pública).
ALTER TABLE public.produto_tabela_medidas ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_produto_tabela_medidas_select ON public.produto_tabela_medidas
  FOR SELECT TO authenticated USING (true);
