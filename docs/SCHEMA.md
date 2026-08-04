# SCHEMA.md — fonte de verdade do schema técnico

> Este arquivo documenta tabelas/policies/funções à medida que são criadas ou alteradas.
> Não é um dump completo do schema — para o restante, ver `web/scripts/*.sql`.
> Última atualização: correção de segurança de 2026-07-08 (ver
> `web/scripts/fix-security-*.sql`).

## Ciclo de repasse ao fornecedor (`fn_ciclo_repasse`) — corrigido em 2026-07-13

Regra de negócio: tudo vendido/postado de segunda a sábado é pago na
**terça-feira** da semana seguinte (não segunda, como a função calculava antes
de `web/scripts/fix-fn-ciclo-repasse-terca.sql`). `ciclo_repasse` (colunas em
`financial_ledger`, `financial_repasse_fornecedor`, `financial_debito_descontar`)
sempre guarda essa terça-feira.

O ciclo é **recalculado no momento da postagem** (quando o fornecedor marca o
pedido como postado, o admin confirma o envio, ou o ERP/marketplace confirma
via webhook), não reaproveitado do valor gravado quando o seller registrou a
venda (`lib/blockSale.ts`). Ver `web/app/api/fornecedor/pedidos/[id]/marcar-
postado/route.ts`, `web/app/api/org/pedidos/[id]/entregar/route.ts` e
`web/app/api/erp/pedidos/route.ts` (`updatePedidoPostado`) — os três chamam a
RPC `fn_ciclo_repasse` de novo nesse momento, sobrescrevendo o valor da venda.

Toda lógica de "próximo ciclo" em JS (fallback local, sem round-trip ao
Postgres) usa `web/lib/cicloRepasse.ts` (`proximoCicloRepasse`,
`proximosCiclos`, `ciclosAnteriores`) — fonte única, não duplicar essa conta em
rotas novas.

A correção da função **não é retroativa**: lançamentos que já tinham virado
`AGUARDANDO_REPASSE`/`ENTREGUE` antes do fix ficaram com `ciclo_repasse` na
segunda-feira antiga. `web/scripts/fix-ciclo-repasse-backfill-terca.sql`
corrigiu esses lançamentos uma única vez (recalculando a partir de
`atualizado_em`, que é o momento da postagem) e já foi aplicado em produção
em 2026-07-13. Não precisa rodar de novo.

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

## `estoque_reservas` — colunas de metadata (2026-07-25)

`web/scripts/add-metadata-estoque-reservas.sql`: adicionadas 3 colunas nullable
(`comprador_nome`, `marketplace_numero`, `canal_venda`) pra dar suporte à pré-visualização
"Aguardando pagamento" no `/seller/pedidos` (pedido Olist com situação "Em aberto"/"Dados
incompletos" — reserva estoque mas ainda não vira `pedidos`/`financial_ledger`). Gravadas
em `web/lib/order/pedidoReservaOlist.ts::processOlistPedidoReserva`, populadas a partir do
mesmo objeto `OlistPedidoDetalhe` que a importação real usa (`web/lib/sellerOlistPedidoImport.ts`).
Sem mudança de RLS — tabela já tinha policy própria, `SELECT`/`INSERT` seguem só via
`supabaseAdmin` (mesmo padrão de antes).

## `sellers.fornecedor_desvinculo_liberado_em` + janela de 5 dias pra trocar de fornecedor (2026-08-03)

`web/scripts/seller-fornecedor-desvinculo-liberado-expira.sql`: coluna nullable `timestamptz`
em `sellers`. Grava o instante em que `fornecedor_desvinculo_liberado` virou `true` (admin
concedeu liberação antecipada em `/admin/sellers`); volta a `null` quando a liberação fecha
(seller troca/desvincula, admin desliga o toggle, ou o cron expira sozinho). Escrita em
`web/app/api/org/sellers/[id]/route.ts` (PATCH), junto com qualquer mudança em
`fornecedor_desvinculo_liberado`.

Regra de negócio: quando o seller fica livre pra trocar de fornecedor — natural (venceram os
`MESES_MINIMOS_COM_FORNECEDOR`) ou por liberação antecipada do admin — ele tem
`DIAS_JANELA_ESCOLHA_FORNECEDOR` (5, `web/lib/sellerFornecedorVinculo.ts`) dias pra escolher
(trocar ou desvincular). Se não agir, o sistema tranca de novo sozinho com o **mesmo**
fornecedor, reiniciando os `MESES_MINIMOS_COM_FORNECEDOR` a partir dali — não fica aberto pra
sempre em nenhum dos dois casos.

Cron `dropcore-fornecedor-troca-janela-expira` (12:00 UTC, `web/scripts/supabase-cron-jobs.sql`)
chama `/api/cron/fornecedor-troca-janela-expira` → `web/lib/sellerFornecedorTrocaJanelaExpira.ts`,
que busca os dois casos separadamente (mesmo update nos dois): liberação antecipada com
`fornecedor_desvinculo_liberado_em` mais velho que a janela, e vínculo com
`fornecedor_vinculado_em` mais velho que `MESES_MINIMOS_COM_FORNECEDOR + DIAS_JANELA_ESCOLHA_FORNECEDOR`
sem liberação antecipada ativa. Sem mudança de RLS — leitura/escrita só via `supabaseAdmin`
(mesmo padrão das outras colunas de vínculo de fornecedor).

## Pendências conhecidas

- Leaked password protection (HaveIBeenPwned): **ativado** em 2026-07-09 no Supabase Auth (Sign In / Providers → Email → "Prevent use of leaked passwords").
