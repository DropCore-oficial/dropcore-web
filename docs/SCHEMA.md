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

## `seller_ai_preferences` — Gestores de IA, preferência cacheada (2026-08-18)

`web/scripts/create-seller-ai-preferences.sql`: 1 linha por seller (`seller_id unique`),
guarda `nicho`, `momento_operacao`, `capital_disponivel`, `objetivo` (`CHECK` em
`margem`/`volume`/`reputacao`) e `tom_comunicacao`. Perguntado ao seller uma vez só;
os Gestores de IA reusam esse cache em vez de reperguntar a cada rodada.

RLS: **deny-all** (sem policy pra `anon`/`authenticated`, mesmo padrão de `seller_invites`).
Acesso só via duas funções `SECURITY DEFINER` (`search_path = public`, `REVOKE ALL FROM
PUBLIC`, `EXECUTE` só pra `authenticated`), cada uma checando `fn_user_can_access_seller`
por dentro antes de tocar na tabela:
- `fn_seller_ai_preferences_get(p_seller_id uuid)` — leitura.
- `fn_seller_ai_preferences_upsert(p_seller_id, p_nicho, p_momento_operacao,
  p_capital_disponivel, p_objetivo, p_tom_comunicacao)` — `INSERT ... ON CONFLICT
  (seller_id) DO UPDATE`, serve tanto pro primeiro cadastro quanto pra edição depois.

Front deve chamar sempre via `supabase.rpc(...)`, nunca `.from('seller_ai_preferences')`
(a tabela não libera acesso direto de propósito). Ver memória de projeto "Briefing Gestores
de IA" pro contexto completo da feature (planos, BYOK, roadmap).

## `seller_ai_runs` — Gestores de IA, resultado por rodada (2026-08-18)

`web/scripts/create-seller-ai-runs.sql`: 1 linha por rodada de gestor (`gestor` travado por
`CHECK` nos 6 valores fechados no briefing: `preco_concorrencia`, `anuncios_seo`,
`estoque_fulfillment`, `reputacao`, `ads`, `atendimento`; `marketplace` travado em
`mercado_livre`/`shopee`/`tiktok_shop`). `resultado jsonb` guarda o output estruturado
(veredito/top 3/etc, pra virar componente no front, não texto solto). `origem_chave`
(`casa`/`byok`) + `creditos_debitados` registram se aquela rodada saiu do ledger (Pro) ou da
chave do próprio seller (Elite) — auditoria, nunca cobra duas vezes.

RLS: **deny-all**, mesmo padrão de `seller_ai_preferences`. Única porta de entrada do client
é `fn_seller_ai_runs_list(p_seller_id, p_limit default 20, p_before default null)` —
paginada por cursor (`executado_em`), `limit` travado entre 1 e 50 mesmo se pedirem mais.
Escrita **não** passa por RPC: só o cron do backend grava, via `supabaseAdmin` (service role
já ignora RLS). Índice em `(seller_id, executado_em desc)` pra sustentar a paginação.

**Batch tracking (2026-08-18):** `web/scripts/add-batch-tracking-seller-ai-runs.sql` — a
Anthropic Batch API (usada pro desconto de 50%) é assíncrona e pode levar até 24h, então
submissão e processamento de resultado são **dois crons separados**, não cabe numa função
Vercel só. `status` ganhou o valor `'pendente'` (agora é o default) além de `'ok'`/`'erro'`,
e `batch_id text` guarda o ID do batch da Anthropic enquanto a linha está pendente. Índice
parcial `idx_seller_ai_runs_batch_pendente` em `(batch_id) WHERE status = 'pendente'` — o
cron de verificação varre só linhas pendentes agrupadas por batch. Fluxo: cron A insere a
linha com `status='pendente'` + `batch_id` na submissão; cron B (roda a cada ~10-15min)
confere `batches.retrieve(batch_id).processing_status === 'ended'`, busca resultado via
`batches.results(batch_id)` (sem ordem garantida, casar por `custom_id`) e faz `UPDATE` pra
`status='ok'`/`'erro'` + `resultado` + `creditos_debitados`.

## Gestores de IA — piloto "Risco de Ruptura & Fulfillment" implementado (2026-08-18)

`marketplace` em `seller_ai_runs` virou nullable (`ALTER COLUMN ... DROP NOT NULL`, aplicado direto via migration, sem script em `web/scripts/` — mudança de 1 linha) — esse gestor não é específico de um marketplace, o estoque é compartilhado entre os canais que o seller vende.

Código (`web/lib/ai/`):
- `gestorPrompts.ts` — `PROMPT_RISCO_RUPTURA_FULFILLMENT` (reformulado do "Estoque & Fulfillment" original do briefing: seller não repõe estoque, então a ação nunca é "compre mais", sempre algo que ele controla — pausar/despriorizar anúncio, redirecionar ads) + `SCHEMA_RISCO_RUPTURA_FULFILLMENT` (JSON Schema do output estruturado).
- `gestorRupturaFulfillmentDados.ts` — busca real: `skus.estoque_atual`/`estoque_minimo` (via `seller_skus_habilitados`) cruzado com venda dos últimos 30 dias de `pedido_itens` (fonte de verdade de item vendido — não `pedidos.sku_id`, que é campo legado de single-item), excluindo pedido `cancelado`.
- `gestorBatchSubmit.ts` / `gestorBatchResultado.ts` — dois jobs separados porque a Anthropic Batch API é assíncrona (até 24h): um monta e submete o batch (1 request por seller `Pro`/`Elite` elegível, `isPro()` de `@/lib/planos`), outro confere `processing_status === "ended"` e grava resultado real em `seller_ai_runs` (ou erro).
- Rotas: `/api/cron/gestores-ia-submeter` e `/api/cron/gestores-ia-resultado`, mesmo padrão de auth (`CRON_SECRET`) dos outros crons.
- **`@anthropic-ai/sdk` instalado** (`^0.117.1`) — usado direto, **não** via Vercel AI Gateway/pacote `ai`: a Batch API não é exposta pelo Gateway (que só cobre chamada síncrona/streaming), então essa parte específica precisa do SDK oficial da Anthropic com a chave configurada direto.

**Billing intencionalmente não implementado ainda**: `creditos_debitados` fica sempre `null` — o valor real de 1 crédito no ledger é item em aberto (não resolvido), não foi inventado número.

**Cron NÃO está agendado no pg_cron ainda** (`web/scripts/supabase-cron-jobs.sql` tem os dois `cron.schedule` comentados) — falta: `ANTHROPIC_API_KEY` configurada na Vercel, valor de crédito resolvido, e confirmação explícita antes de rodar em sellers reais.

## Conexão OAuth Mercado Livre (2026-08-19/20)

`web/scripts/create-seller-mercadolivre-integrations.sql` — tabela
`seller_mercadolivre_integrations` (`seller_id unique`, `org_id`, `ml_user_id unique`,
`ml_access_token`/`ml_refresh_token` cifrados com `SELLER_ERP_CREDENTIALS_KEY`, mesma chave
já usada pro Olist/Bling — não criou chave nova). RLS deny-all, mesmo padrão de
`seller_bling_integrations`/`seller_olist_integrations` — acesso só via `supabaseAdmin`.

App único no Mercado Livre DevCenter ("DropCore Marketplace", 1 client_id/secret) serve
**todos os gestores de IA e a futura ingestão de pedido** — não cria app novo por
feature, o seller autoriza uma vez só. Escopo inicial: só leitura (Usuários, Comunicações
pré/pós-venda, Publicação e sincronização); zero tópico de webhook marcado (isso só entra
quando a fase 2 — ingestão de pedido direto do ML, substituindo Olist pra quem não tem ERP —
for construída; ver memória de projeto "Briefing Gestores de IA").

Código: `web/lib/mercadoLivreOAuth.ts` (espelho de `blingOAuth.ts` — troca/renova token),
`POST /api/seller/mercadolivre/oauth` (troca código por token), `GET
/api/seller/mercadolivre` (status), `GET /api/seller/mercadolivre/connect` (redirect pra
autorização), `web/components/seller/SellerMercadoLivreIntegrationPanel.tsx` +
`web/app/seller/integracoes-marketplace/page.tsx` (tela nova, linkada a partir de
`/seller/integracoes-erp`). `redirect_uri` cadastrado no app do ML:
`https://www.dropcore.com.br/seller/integracoes-marketplace` (tem que bater exato).

Env vars novas: `MERCADOLIVRE_CLIENT_ID`, `MERCADOLIVRE_CLIENT_SECRET` (já configuradas na
Vercel, Production+Preview). **Nada disso foi commitado/deployado ainda** — só existe no
working directory local até aprovação explícita de deploy.

## Pendências conhecidas

- Leaked password protection (HaveIBeenPwned): **ativado** em 2026-07-09 no Supabase Auth (Sign In / Providers → Email → "Prevent use of leaked passwords").
