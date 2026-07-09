# SCHEMA.md — fonte de verdade do schema técnico

> Este arquivo documenta tabelas/policies/funções à medida que são criadas ou alteradas.
> Não é um dump completo do schema — para o restante, ver `web/scripts/*.sql`.
> Última atualização: correção de segurança de 2026-07-08 (ver
> `web/scripts/fix-security-*.sql`).

## RLS — tabelas corrigidas em 2026-07-08

Estavam com RLS desligada (expostas por completo a `anon`/`authenticated` via API).
Ligadas em `web/scripts/fix-security-enable-rls-missing-tables.sql`.

| Tabela | Vínculo | Policy | Observação |
|---|---|---|---|
| `pedidos` | `org_id`, `seller_id` (FK `sellers`), `fornecedor_id` | `rls_pedidos_select` — `fn_user_can_access_seller` OR `fn_user_can_access_fornecedor` | |
| `pedido_itens` | via `pedido_id` → `pedidos` | `rls_pedido_itens_select` — join com `pedidos` | sem `org_id`/`seller_id` próprio |
| `pedido_eventos` | via `pedido_id` → `pedidos` | `rls_pedido_eventos_select` — join com `pedidos` | tem `org_id` próprio, mas a policy usa o join pra ser mais precisa |
| `erp_event_logs` | `org_id`, `seller_id` (FK `sellers`) | `rls_erp_event_logs_select` — `fn_user_can_access_seller` | |
| `sku_alteracoes_pendentes` | `org_id`, `fornecedor_id` | `rls_sku_alteracoes_pendentes_select` — `fn_user_can_access_org` OR `fn_user_can_access_fornecedor` | |
| `financial_mensalidades` | `org_id` (+ `entidade_id`/`tipo` polimórfico) | `rls_financial_mensalidades_select` — `fn_user_can_access_org` | owner/admin da org vê todas as mensalidades da org |
| `seller_invites` | `org_id`, `seller_id` | **sem policy (deny-all)** | tem coluna `token`; leitura só via `supabaseAdmin` em `web/app/api/seller/invite/[token]/route.ts` |
| `fornecedor_invites` | `org_id`, `fornecedor_id` | **sem policy (deny-all)** | idem, `web/app/api/fornecedor/invite/[token]/route.ts` |
| `calculadora_invites` | — (sem org/seller/fornecedor) | **sem policy (deny-all)** | idem, `web/app/api/calculadora/invite/[token]/route.ts` |
| `api_rate_limits` | — (infra global) | **sem policy (deny-all)** | só service role |
| `financial_planos` | — (referência global, PK `plano`) | **sem policy (deny-all)** | se alguma tela precisar ler direto do client, adicionar `SELECT` em migration separada |
| `produto_tabela_medidas` | — (referência global, PK `grupo_key`) | `rls_produto_tabela_medidas_select` — `USING (true)` só para `authenticated` | dado não sensível (medidas P/M/G/GG), sem vitrine pública no DropCore |

## Funções — hardening de 2026-07-08

Corrigidas em `web/scripts/fix-security-function-hardening.sql`:

- **`search_path` fixado** (`SET search_path = public`): `fn_segunda_feira_semana`, `fn_ciclo_repasse`, `fn_seller_saldo_from_ledger`, `fn_sync_seller_saldo_from_ledger`, `is_active_org_member`, `is_org_member`, `is_org_privileged`, `can_view_finance`, `rpc_add_org_member`.
- **Execução travada para `anon`/`authenticated`** (só `service_role`/`postgres`): `rpc_get_emails_by_user_ids`, `rpc_get_user_id_by_email` (lookup de PII, uso exclusivo via `supabaseAdmin` em `web/app/api/org/membros/route.ts`), `dropcore_cron_http_post` (dispara HTTP POST, uso exclusivo via `pg_cron`), `rpc_add_org_member` (não usada em nenhum lugar do app hoje).

## Privilégios — hardening de 2026-07-08

`web/scripts/fix-security-revoke-truncate.sql`: revogado `TRUNCATE` de `anon`/`authenticated` em todas as tabelas de `public` (atuais e futuras, via `ALTER DEFAULT PRIVILEGES`). RLS não se aplica a `TRUNCATE` — sem isso, qualquer requisição com a anon key podia apagar qualquer tabela por completo.

## RLS e privilégios — rodada 2 (2026-07-09)

`web/scripts/fix-security-round2.sql`:

- **`repasses_fornecedor`** (tabela legada, sem `CREATE TABLE` em nenhum script do repo, mantida a pedido — tem atividade real via cascade delete de `web/app/api/org/sellers/[id]/route.ts`): consolidadas as 3 policies sobrepostas em 2 — `repasses_fornecedor_write_privileged` (FOR ALL, owner/admin/operacional) e `rls_repasses_fornecedor_select` (FOR SELECT, membro ativo da org OR `can_view_finance(org_id)`). Mesmo acesso de antes, sem duplicidade.
- **18 funções `SECURITY DEFINER`** travadas para `service_role` só (`anon`/`authenticated` revogados), confirmado via busca no código que nenhuma é chamada do client — todas passam por `supabaseAdmin` em rotas server-side, são triggers, ou são órfãs: `dropcore_release_fornecedor_olist_estoque_sync_lock`, `dropcore_release_olist_sync_lock`, `dropcore_try_fornecedor_olist_estoque_sync_lock`, `dropcore_try_olist_sync_lock`, `fn_calculadora_recebimentos_totais`, `fn_fornecedor_dashboard_stats`, `fn_org_dashboard_pro_30d`, `fn_org_dashboard_stats_agg`, `fn_org_repasse_futuros_preview`, `fn_sync_seller_saldo_from_ledger`, `rpc_debitar_estoque_sku`, `rpc_liberar_reserva_estoque_sku`, `rpc_reservar_estoque_sku`, `rpc_reverter_estoque_sku`, `rpc_delete_sku_pai_safe`, `rpc_delete_sku_safe`, `rpc_set_member_active`, `rpc_set_member_role`.
  - As últimas 4 (`rpc_delete_sku_pai_safe`, `rpc_delete_sku_safe`, `rpc_set_member_active`, `rpc_set_member_role`) não aparecem em nenhum lugar do código local — travadas por segurança; reversível via `GRANT` se alguma automação externa ao repo depender delas.
  - As helpers `fn_user_can_access_org/seller/fornecedor/ledger` **não** foram tocadas — precisam manter `EXECUTE` para `anon` porque são invocadas durante a avaliação das policies com `roles: public`.

## Pendências conhecidas

- Leaked password protection (HaveIBeenPwned): **ativado** em 2026-07-09 no Supabase Auth (Sign In / Providers → Email → "Prevent use of leaked passwords").
