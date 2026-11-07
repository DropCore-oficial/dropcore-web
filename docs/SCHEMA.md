# SCHEMA.md — fonte de verdade do schema técnico

> Este arquivo documenta tabelas/policies/funções à medida que são criadas ou alteradas.
> Não é um dump completo do schema — para o restante, ver `web/scripts/*.sql`.
> Última atualização: correção de segurança de 2026-07-08 (ver
> `web/scripts/fix-security-*.sql`).

## ⚠️ `revoke ... from public` NÃO revoga de `anon`/`authenticated` — achado 2026-09-30

O Supabase concede `EXECUTE` em função nova pra `anon`/`authenticated`/`service_role`
**direto** via ACL padrão do schema `public` (`pg_default_acl`), não por herança de
`public` (o role genérico do Postgres). Rodar só `revoke all on function X from public;`
deixa a função **continuar executável por qualquer usuário anônimo via REST**
(`/rest/v1/rpc/...`), mesmo com o `grant ... to authenticated` mais embaixo parecendo
"restringir". Confirmado com `has_function_privilege('anon', oid, 'EXECUTE')` — `fn_seller_ai_runs_list`
(já em produção) tem esse mesmo padrão (inofensivo ali porque a função checa
`auth.uid()` por dentro e nega sem sessão), mas uma função de **escrita** sem checagem
própria (ex: `fn_seller_ai_chat_gravar_mensagem`) ficaria aberta de verdade pra qualquer
um mandar `POST` sem login.

**Regra daqui pra frente:** toda função nova que não deva ser pública precisa de
`revoke all on function ... from public, anon;` no mínimo — e se for só pro backend
(service role), `revoke ... from public, anon, authenticated;` também, concedendo só a
`service_role`. Nunca confiar que "não dei grant pra anon" seja suficiente — sempre revogar
explícito.

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

## Pedido `erro_saldo` — retry automático e expiração em 48h

Quando `executeBlockSale`/`blockSale` retorna `SALDO_INSUFICIENTE` (saldo do
seller não cobre `valor_fornecedor`/`valor_dropcore`), o pedido é marcado
`pedidos.status = "erro_saldo"` (pontos de entrada em
`web/lib/erp/submitSellerErpPedido.ts`, `web/app/api/org/pedidos/route.ts` e
`web/app/api/erp/pedidos/route.ts`) e um evento `erro_saldo` é gravado em
`pedido_eventos`. **O estoque já debitado não é revertido nesse momento** — é
tratado como venda confirmada aguardando resolução financeira, diferente do
status `bloqueado`/`pendente_estoque` (estoque ainda não debitado).

### `bloqueado`/`pendente_estoque` — TTL de 72h (adicionado 2026-11-06)

Até 2026-11-06 esses dois status não tinham expiração própria: ficavam em
retry indefinido a cada 15min via
`web/lib/pedidosBloqueadosRetry.ts`/`pedidosPendenteEstoqueRetry.ts` (cron
`web/app/api/cron/pedidos-bloqueados-retry/route.ts`), sem nunca cancelar
sozinhos. Corrigido com `SEM_ESTOQUE_TTL_MS = 72h` em
`web/lib/order/pedidoSemEstoqueExpira.ts` (`separarPedidosExpirados` +
`expirarPedidoSemEstoque`), chamado pelos dois arquivos de retry acima no
mesmo cron de 15min. Prazo de 72h escolhido por consistência com o TTL já
existente de `estoque_reservas` (`web/lib/order/estoqueReservaExpira.ts`,
`RESERVA_TTL_MS` — esse é um mecanismo **separado**, sobre a tabela
`estoque_reservas`/reserva Olist "em aberto", não toca `pedidos.status`).

Como o estoque nunca foi debitado nesses dois status, expirar é só cancelar:
`pedidos.status = "cancelado"`, evento
`pedido_cancelado_sem_estoque_expirado` em `pedido_eventos`, notificação
`pedido_sem_estoque_expirado` pro seller
(`web/lib/notifySellerPedidoAtencao.ts`) e `motivo: "bloqueado"` pro
fornecedor (`notifyFornecedorPedidoParaPostar`) — sem reversão de estoque
(diferente de `erro_saldo`, que debita e precisa reverter).

- **Retry pontual:** sempre que o saldo do seller pode ter mudado (recarga
  manual em `web/app/api/org/sellers/[id]/add-credit/route.ts`, ou depósito PIX
  aprovado em `web/lib/depositoPixProcessor.ts`), o sistema chama
  `runPedidosErroSaldoRetry({ seller_id })` na hora, sem esperar o cron.
- **Cron catch-all:** `web/app/api/cron/pedidos-erro-saldo-retry/route.ts`,
  agendado via `pg_cron` a cada 1 minuto
  (`web/scripts/add-pedidos-erro-saldo-retry-cron.sql`, `'* * * * *'`), com
  lock advisory Postgres (`dropcore_try_pedidos_erro_saldo_retry_lock`, id
  `913012`) pra não sobrepor execuções. Processa até 200 pedidos por rodada
  (`MAX_PEDIDOS_PER_RUN`) com concorrência 3 (`RETRY_CONCURRENCY`), ambos em
  `web/lib/pedidosErroSaldoRetry.ts`.
- **Expiração (TTL 48h):** `ERRO_SALDO_TTL_MS = 48 * 60 * 60 * 1000` em
  `web/lib/pedidosErroSaldoRetry.ts`. Pedido `erro_saldo` com `criado_em` mais
  antigo que 48h é cancelado automaticamente em `expirarPedidoErroSaldo`
  (mesmo arquivo): reverte o estoque de verdade (só agora, via
  `reverterEstoquePedido`), muda `pedidos.status` para `"cancelado"`, grava
  evento `pedido_cancelado_erro_saldo_expirado` e notifica seller
  (`erro_saldo_expirado`) e fornecedor (motivo "bloqueado"/seller não
  recarregou a tempo). 48h é mais curto que o TTL de 72h da reserva em aberto
  porque aqui já é venda confirmada com estoque debitado — não pode ficar
  preso indefinidamente.

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
| `financial_mensalidades` | `org_id` (+ `entidade_id`/`tipo` polimórfico) | `rls_financial_mensalidades_select` — `fn_user_can_access_org` | owner/admin da org vê todas as mensalidades da org; já existe `UNIQUE (tipo, entidade_id, ciclo)` (`financial_mensalidades_tipo_entidade_id_ciclo_key`) — impede ciclo duplicado, usado pelo `onConflict` do upsert em `gerarMensalidadesCicloOrg.ts` |
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

## `seller_ulisses_preferencias` — Ulisses (Ads/Preço/Promoção), preferência do seller (2026-08-29)

`web/scripts/create-seller-ulisses-preferencias.sql`: 1 linha por seller (`seller_id
unique`), guarda `margem_minima_pct` (`> 0`, nunca zero/negativo), `margem_maxima_pct`
(opcional, `CHECK >= margem_minima_pct` quando preenchida), `imposto_pct`, `perda_pct`, e
3 blocos liga/desliga+parâmetro: `ads_ativo`/`ads_tacos_pct`/`ads_teto_valor`/
`ads_teto_periodo` (`CHECK` em `dia`/`mes`), `afiliado_ativo`/`afiliado_pct`,
`cupom_ativo`/`cupom_pct`. Perguntado ao seller na primeira vez que ele abre
`/seller/gestores-ia/ulisses` (wizard, tabela ainda sem linha); editável por ele depois a
qualquer momento — não é "configurou uma vez e travou" (diferente do
`seller_ai_preferences` genérico, esse aqui é só do Ulisses).

RLS: **deny-all**, mesmo padrão RPC-only de `seller_ai_preferences`:
- `fn_seller_ulisses_preferencias_get(p_seller_id uuid)` — leitura.
- `fn_seller_ulisses_preferencias_upsert(p_seller_id, p_margem_minima_pct,
  p_margem_maxima_pct, p_imposto_pct, p_perda_pct, p_ads_ativo, p_ads_tacos_pct,
  p_ads_teto_valor, p_ads_teto_periodo, p_afiliado_ativo, p_afiliado_pct, p_cupom_ativo,
  p_cupom_pct)` — `INSERT ... ON CONFLICT (seller_id) DO UPDATE`.

O motor de cálculo de margem/preço em si (`calcularMargem`, extraído da calculadora) fica
em `web/lib/margemCalculo.ts` — não é dado de banco, é lib compartilhada entre a
calculadora, o Andrey (preço-âncora de anúncio novo) e o Ulisses (margem real/promoção).
Ver memória de projeto "Briefing Gestores de IA" pro desenho completo (margem
mínima/máxima como faixa, não só piso; teto de gasto de ads como trava de segurança;
cupom/afiliado sempre com valor definido pelo seller, nunca decisão autônoma do gestor).

## `seller_ai_runs` — Gestores de IA, resultado por rodada (2026-08-18)

`web/scripts/create-seller-ai-runs.sql`: 1 linha por rodada de gestor (`gestor` travado por
`CHECK` nos 6 valores fechados no briefing: `preco_concorrencia`, `anuncios_seo`,
`estoque_fulfillment`, `reputacao`, `ads`, `atendimento`; `marketplace` travado em
`mercado_livre`/`shopee`/`tiktok_shop`). `resultado jsonb` guarda o output estruturado
(veredito/top 3/etc, pra virar componente no front, não texto solto). `origem_chave`
(`casa`/`byok`) registra se aquela rodada saiu da chave da DropCore ou da do próprio seller
(BYOK) — auditoria, nunca cobra duas vezes. `creditos_debitados` é coluna de um modelo de
cobrança por rodada que nunca foi pra frente — ver nota em "Billing" mais abaixo.

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

## Gestores de IA — 2º gestor (Anúncios & SEO), vínculo SKU↔ML, correções (2026-08-21/22)

`gestor = 'preco_concorrencia'` foi **removido do código** (não é mais valor válido na
prática, embora o `CHECK` do banco ainda liste — sem migration só por isso, nenhum código
insere essa linha): testado ao vivo, a API do Mercado Livre não abre preço de concorrente
pra catálogo não catalogado (`price_to_win` exige `catalog_product_id`, moda/marca própria
não tem; `/sites/{site}/search` devolve 403 pra app de terceiro).

**`custom_id` da Batch API corrigido:** era só `seller_id` (colidia assim que um seller
tinha 2 gestores pendentes no mesmo batch — `Map` sobrescrevia a primeira linha). Agora
`${seller_id}__${gestor}` (`customIdGestorSeller()` em `gestorBatchSubmit.ts`) — `__` como
separador porque a Batch API só aceita `[a-zA-Z0-9_-]` no `custom_id` (sem `:`).

**`web/lib/mercadoLivreApiClient.ts`** — cliente autenticado da API do ML pro lado
servidor: `getValidMercadoLivreAccessToken(sellerId)` decripta/renova o token salvo (5min
de folga antes de expirar), + wrappers `mlBuscarItensAtivos`, `mlBuscarItensDetalhe`
(multiget, lotes de 20), `mlBuscarDescricao`, `mlBuscarVisitas30d`. Reutilizável por
qualquer gestor futuro que precise da API do ML.

**Gestor "Anúncios & SEO"** (`gestorAnunciosSeoDados.ts`) — amostra de até 20 anúncios
ativos com pior venda histórica (só os com 30+ dias no ar, evita julgar anúncio novo),
diagnostica título/descrição/fotos fracos e sugere título melhorado. Catálogo pode ter
centenas de anúncios (563 na conta de teste) — só faz as chamadas caras (descrição +
visitas, 1 por item) nos 20 selecionados, não no catálogo inteiro.

**Gestor "Risco de Ruptura & Fulfillment" ganhou enriquecimento pós-IA** (código puro, não
gasta token — `enriquecerResultadoRuptura()` em `gestorRupturaFulfillmentDados.ts`,
chamado em `gestorBatchResultado.ts` só quando `gestor === 'estoque_fulfillment'`):
`dias_ate_ruptura` (estoque ÷ velocidade diária), `pedidos_aguardando_estoque` (cruza com
`pedidos.status = 'pendente_estoque'`), `fornecedor_nome` (via `skus.fornecedor_id`), e
`piorou_desde_ontem` (compara `risco` com a rodada `status='ok'` anterior do mesmo
seller+gestor). Dado recalculado **fresco** no momento do resultado, não usa o que foi
mandado no submit (batch pode levar horas).

**`web/lib/ai/gestorRequestBuilders.ts`** — `montarRequestEstoqueFulfillment(sellerId)` /
`montarRequestAnunciosSeo(sellerId)` centralizam os params da Anthropic (model/thinking/
schema/prompt) por gestor, usados tanto pelo cron em lote (`gestorBatchSubmit.ts`, Batch
API) quanto pelo botão "Rodar de novo agora" do seller (`POST
/api/seller/gestores-ia/rodar`, chamada síncrona `messages.create`, sem Batch — o seller
espera na hora, cooldown de 6h por seller+gestor pra evitar spam/custo).
`gestorParseResposta.ts` extrai o JSON estruturado (ou erro) da resposta da Anthropic —
mesma lógica pro resultado de Batch e pra chamada síncrona.

**Notificação in-app** (`gestorNotificacao.ts`, tabela `notifications` já existente) quando
uma rodada termina (ok ou erro). **Bug real corrigido:** `lib/notificationContextFilter.ts`
tem lista fechada de `tipo` permitido por portal (evita misturar alerta de admin com
seller/fornecedor) — faltava `gestor_ia_concluido` na lista do `seller`, então a
notificação existia no banco mas o sino filtrava em silêncio. Sempre que um `tipo` novo de
notificação for criado, conferir esse allowlist.

## `seller_mercadolivre_sku_map` — vínculo SKU (DropCore) ↔ anúncio ML (2026-08-22)

**Correção 2026-09-16** (`fix-seller-mercadolivre-sku-map-permite-sku-repetido.sql`):
o unique original `(seller_id, sku)` assumia 1 produto = 1 anúncio — errado, seller
republica anúncio do mesmo produto normalmente, com o mesmo SKU, e o sync silenciosamente
ignorava o 2º anúncio em diante (achado investigando itens sem custo numa oferta relâmpago
da Galileus). Trocado pra `(seller_id, ml_item_id, ml_variation_id)` — agora SKU pode
repetir entre anúncios, cada anúncio+variação é a linha única. `ml_variation_id` passou a
ser `0` (não `null`) quando não há variação — `null` não conflita com `null` no Postgres,
geraria linha duplicada a cada sync. `sincronizarSkuMercadoLivre` (`lib/ai/mercadoLivreSkuSync.ts`)
ajustado no mesmo espírito: chave por `ml_item_id:ml_variation_id`, não mais por `sku`.

`web/scripts/create-seller-mercadolivre-sku-map.sql`: `(seller_id, sku)` único →
`ml_item_id` (+ `ml_variation_id` opcional, guardado mesmo sem uso ainda). Resolve o
handoff Gestor1→Gestor2 e a futura ação semiautomática (pausar anúncio), que precisam saber
qual anúncio corresponde a qual SKU — SKU interno e `item_id` do ML não tinham nenhum elo
antes disso.

**Achado real (testado, não assumido):** o Mercado Livre tem um atributo `SELLER_SKU`
(`id: "SELLER_SKU"` dentro de `attributes` no nível do item, ou de `attribute_combinations`
por variação) onde o seller guarda o próprio código — **não** é `seller_custom_field`
(testado primeiro nesse campo, veio `null` em 100% da amostra, conclusão errada descartada
depois). Cobertura real numa amostra de 100 anúncios ativos: **92 já tinham `SELLER_SKU`
preenchido batendo com o padrão `DJU...`** do DropCore — vínculo é majoritariamente
automático, não precisou virar tela de "vincular manualmente" como caminho principal.

RLS: deny-all, sem RPC de leitura ainda (só `supabaseAdmin` lê/escreve — nenhuma tela do
seller expõe isso diretamente por enquanto). Job de sync que popula a tabela: **escrito e no
ar** (`/api/cron/gestores-ia-sync-sku-ml`).

**Billing por crédito por rodada: decisão fechada, não é mais o modelo (2026-10-02).**
`creditos_debitados` fica sempre `null` de propósito — a cobrança virou add-on flat mensal
(R$600/700) com teto diário compartilhado de R$4 (gestores + chat do Tiago) e recarga via
PIX quando estoura, não débito de crédito por rodada individual. Ver
`gestorTiagoChatOrcamentoDia.ts` e `tiago/credito-extra-pix/route.ts`. Não preencher essa
coluna.

**Cron dos Gestores de IA: ligado em produção** (`dropcore-gestores-ia-submeter` 07:00 UTC,
`dropcore-gestores-ia-resultado` a cada 15min) — `ANTHROPIC_API_KEY` configurada, custo real
protegido pelo teto diário acima.

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

## `seller_ai_acoes` — auditoria de ação executada pelos gestores de IA (2026-08-23)

`web/scripts/create-seller-ai-acoes.sql`: registra toda tentativa de ação que um gestor
executa de fato num sistema externo (não é o resultado da análise — isso já mora em
`seller_ai_runs.resultado` — é "isso foi escrito de verdade, por quem, quando, deu certo?").
Colunas: `org_id`, `seller_id`, `run_id` (nullable, FK `seller_ai_runs`), `gestor` (mesmo
check de `seller_ai_runs`, sem `preco_concorrencia`), `alvo_tipo`/`alvo_id`/`acao` (texto
livre, não `CHECK` fechado — serve qualquer gestor futuro sem migration nova), `status`
(`confirmado`/`executado`/`erro`), `detalhes jsonb`, `actor_user_id`, `ip_address`,
`user_agent`, `criado_em`, `executado_em`.

RLS: deny-all, mesmo padrão RPC-only de `seller_ai_runs` — leitura só via
`fn_seller_ai_acoes_list(p_seller_id, p_limit default 20, p_before default null)`
(`SECURITY DEFINER`, reaproveita `fn_user_can_access_seller`); escrita só via
`supabaseAdmin` dentro da API route que executa a ação (não RPC de insert exposta).

**Primeiro uso: "aplicar título sugerido" do Gestor 2 (Andrey)** —
`POST /api/seller/gestores-ia/aplicar-titulo`. Antes de escrever, consulta
`GET /items/{id}` no Mercado Livre (`mlBuscarItemTituloEstado` em
`mercadoLivreApiClient.ts`) e recusa (409, grava `erro` em `seller_ai_acoes`) se
`family_name` estiver preenchido OU `sold_quantity > 0` — **achado real testando ao vivo**:
o ML bloqueia `PUT title` nos dois casos, não só família (mensagem de erro do ML é
`"Cannot update title when item has bids"`, herança de nomenclatura de leilão, mas dispara
pra qualquer venda já registrada). Numa amostra de 100 anúncios ativos da conta real, só 1
estava livre pra edição — a maioria dos anúncios que o Andrey sinaliza (pior venda, não
necessariamente zero venda) vai cair no bloqueio; UI mostra "Copiar sugestão" como
alternativa sempre disponível.

Checagem de dono do anúncio usa `estado.seller_id` (devolvido pela própria API do ML,
comparado com `ctx.mlUserId` da conexão OAuth do seller) — **não** usa
`seller_mercadolivre_sku_map` pra isso (cobertura parcial, ~59%, rejeitaria anúncio
legítimo que o Andrey já analisou direto pela API).

**Mais 2 ações do Andrey (2026-08-23, mesmo dia): `aplicar_descricao` e
`aplicar_caracteristicas`.** Diferente de título, `PUT /items/{id}/description` e `PUT
/items/{id}` com `attributes` **não têm** a trava de família nem de venda (testado ao
vivo) — por isso essas duas rotas escrevem em **todos os `item_ids` do grupo de uma vez**,
não só no representante:
- `POST /api/seller/gestores-ia/aplicar-descricao` (`{item_ids, descricao_nova}`) —
  `mlAtualizarDescricao`.
- `POST /api/seller/gestores-ia/aplicar-caracteristicas` (`{item_ids, caracteristicas}`) —
  `mlAtualizarAtributos`. Revalida cada valor contra o schema real da categoria do item
  antes de escrever (não confia só no `valorValido` calculado no enriquecimento) — atributo
  tipo `list` só escreve se o valor bater exato com uma opção real de
  `mlBuscarAtributosCategoria`; tipo texto livre sempre passa.

Ambas fazem 1 linha de auditoria por `item_id` (não 1 linha por chamada) — dá pra ver na
`seller_ai_acoes` exatamente quais variações de uma família pegaram a escrita e quais não.

## `seller_ai_disputas_fornecedor` — disputa fornecedor x seller detectada pela Amanda (2026-08-25)

`web/scripts/create-seller-ai-disputas-fornecedor.sql`: quando a Amanda (Gestor 6,
Reputação & Atendimento) detecta uma reclamação/devolução real do Mercado Livre com
evidência (foto) anexada pelo comprador, monta um "caso" nessa tabela — evidência
coletada, comparação da IA (anúncio vs. foto), resposta do fornecedor (se contestar) e
decisão final do admin. **Admin-only, nunca visível pro seller.**

Colunas: `org_id`, `seller_id`, `fornecedor_id`/`pedido_id`/`ledger_id` (nullable até
resolvidos — `pedido_id` casado via `pedidos.marketplace_numero = claim.resource_id`),
`ml_claim_id` (unique), `ml_item_id`, `ml_order_id`, `evidencia jsonb`, `analise_ia jsonb`,
`veredito_ia` (`fornecedor_provavel`/`seller_provavel`/`indeterminado`), `status`
(`aberto`/`aguardando_fornecedor`/`decidido`), `fornecedor_resposta`,
`fornecedor_respondeu_em`, `decisao_admin`
(`reverter_repasse`/`manter_repasse`/`sem_acao`), `decisao_detalhes`, `decidido_por`,
`decidido_em`, `criado_em`.

**Sem função financeira nova de propósito.** Quando o admin decide reverter, ele usa o
fluxo de devolução que já existe em produção (`/admin/devolucoes`,
`PATCH /api/org/financial/ledger/[id]` status `EM_DEVOLUCAO`→`DEVOLVIDO`, e
`POST /api/org/financial/devolucao-pos-repasse` pra ledger já `PAGO`) — `ledger_id` nessa
tabela só registra qual linha do ledger o admin de fato mexeu, é rastro/auditoria, não
gatilho de movimentação.

RLS: deny-all, **não** é RPC-only (padrão diferente de `seller_ai_acoes`) — segue o mesmo
modelo de `financial_ledger`: acesso só via `supabaseAdmin` (service role) dentro de rotas
admin (`requireAdmin`) e da rota do fornecedor (`getFornecedorContextFromBearer`, valida
que o `fornecedor_id` do caso bate com o fornecedor autenticado antes de aceitar resposta).

**Origem do dado — API de reclamação do Mercado Livre, testada ao vivo 2026-08-25 (mesma
conexão OAuth já usada pelos outros gestores, sem escopo novo):**
- `GET /post-purchase/v1/claims/search?player_role=respondent&player_user_id={id}` — lista
  reclamações (parâmetro é `player_role`/`player_user_id`, **com underscore**, não
  `player.role`/`player.user_id` como a doc sugere à primeira vista). Filtro
  `status=opened` pra só as ativas.
- `GET /post-purchase/v1/claims/{id}` — detalhe, inclui `available_actions` do lado
  `respondent` (seller): `send_message_to_complainant`, `refund`, `open_dispute`.
- `GET /post-purchase/v1/claims/{id}/evidences` — lista de evidência anexada (testado: foto
  real de um comprador). **Endpoint de download do arquivo em si ainda não resolvido**
  (`/attachments/{filename}` devolveu 404 num teste rápido — pendência, não bloqueia o
  resto).
- `GET /post-purchase/v1/claims/{id}/messages` — chat da reclamação (endpoint existe,
  testado retornando vazio no caso de teste).

## `fn_cron_job_status()` + healthcheck de crons (2026-09-14)

Função `SECURITY DEFINER` (só `service_role`, `REVOKE ALL FROM PUBLIC`) que expõe status
de `cron.job`/`cron.job_run_details` (schema não acessível via API normal) — usada pelo
cron novo `dropcore-cron-healthcheck` (`web/app/api/cron/cron-healthcheck/route.ts` +
`web/lib/cronHealthCheck.ts`) pra conferir diariamente se todo cron esperado
(`CRONS_ESPERADOS` em `cronHealthCheck.ts`) existe, rodou recentemente e com sucesso —
avisa owner/admin (notificação interna, tipo `cron_saude`) se achar problema. Existe pra
não repetir o que aconteceu com `dropcore-gestores-ia-sync-sku-ml` (12 dias sem rodar) e
`dropcore-mensalidades-mp-sync` (nunca chegou a ser aplicado, apesar de estar no script
como se estivesse ativo) sem ninguém perceber.

**Achado no caminho**: `cron.job_run_details` tem 415k linhas, sem índice em
`(jobid, start_time)` e sem limpeza nenhuma — mesma classe de bloat do
`net._http_response` (incidente 2026-08-17). Não deu pra criar índice (tabela é do
pg_cron, `must be owner of table job_run_details` até pra `service_role`) — contornado
reescrevendo a função pra 1 scan (`DISTINCT ON`) em vez de N subqueries correlacionadas
(ver `web/scripts/fix-fn-cron-job-status-single-pass.sql`). Fica ~5s por chamada (aceitável
pra cron 1x/dia, não é rota user-facing).

**Limpeza resolvida em 2026-10-03** (`web/scripts/cleanup-cron-job-run-details.sql`):
`cron.job_run_details` tinha chegado a 519.951 linhas / 197 MB (banco todo em 339 MB).
Rodado `DELETE` (mantém só 7 dias) + `VACUUM FULL` nela e em `net._http_response` (que já
tinha `DELETE` diário mas nunca `VACUUM`, por isso voltava a acumular bloat — mesma classe
do incidente 2026-08-17). Banco caiu pra 181 MB. Dois crons novos de manutenção permanente:
`dropcore-cleanup-cron-job-run-details` (03:10 UTC, mantém 7 dias) e
`dropcore-vacuum-cron-logs` (03:20 UTC, `VACUUM FULL` nas duas tabelas — trava a tabela por
poucos segundos, ACCESS EXCLUSIVE, só atrasa o registro de um cron que termine nesse
instante exato, não afeta a execução do cron em si).

## `fn_seller_dashboard_analytics_30d` — analytics do dashboard do seller sem cap de linha (2026-09-22)

Função `SECURITY DEFINER` (só `service_role`, `REVOKE ALL FROM PUBLIC`,
`web/scripts/add-seller-dashboard-analytics-rpc.sql`) que agrega direto em `pedidos`
(`SUM`/`COUNT`/`GROUP BY`, sem limite de linha) pra alimentar o card "Lucro"/"Receita"/
"Margem" e os KPIs de mês calendário do dashboard do seller (`GET /api/seller/me`).

**Achado ao vivo**: o extrato (`financial_ledger`) que alimentava `GET /api/seller/me` é
buscado com `.limit(200)` (linha 108) — cap correto pra lista visual "Extrato recente",
mas o cálculo antigo de analytics (`analytics30d`, `pedidosMes`/`totalMes`,
`custoMedioPedidosRecentes`) reduzia esse MESMO array de 200 linhas em JavaScript no
front. Qualquer seller com mais de 200 lançamentos no período (ex.: import em lote, ou
seller de alto volume de verdade) tinha Lucro/Receita/Pedidos(mês) subcontados
silenciosamente, sem erro nenhum. Confirmado testando com 683 pedidos importados (seller
de teste): dashboard mostrava R$4.352,38 de lucro quando o real era R$13.444,56.

`GET /api/seller/me` agora chama a RPC (`analytics_30d` na resposta) e usa o resultado
pra: analytics de 30 dias corridos, KPIs de mês calendário (`kpis.pedidos_mes`/
`kpis.total_mes`) e a média de custo por pedido usada em `saldo_alerta` (quantos pedidos
o saldo ainda cobre). O extrato capado em 200 linhas continua existindo só pra lista
visual — não alimenta mais nenhuma conta agregada. Fallback pro cálculo antigo em JS
existe só pro caso raro da RPC falhar (rede/erro), não é o caminho normal.

## `pedidos.marketplace_pack_id` — agrupar pack do Mercado Livre (2026-09-23)

`web/scripts/add-marketplace-pack-id-to-pedidos.sql`: coluna nullable (`text`) + índice
parcial em `(org_id, seller_id, marketplace_pack_id)`. Comprador que leva >1 unidade num
único checkout às vezes gera vários `order_id` separados no ML, todos com o mesmo
`pack_id` e o mesmo `shipping_id` (1 pacote, 1 etiqueta só — confirmado ao vivo com pedido
real da LINA1745173: 3 `order_id`, mesmo `pack_id` **e** mesmo `shipping_id`). Cada
`order_id` continua virando seu próprio `pedidos` (sem merge, sem tocar `pedido_itens`,
sem recálculo de `valor_fornecedor`/`valor_dropcore`/`valor_total`) — a coluna só permite
`web/app/api/seller/pedidos/route.ts` e `web/app/api/fornecedor/pedidos/route.ts`
agruparem na resposta pra tela mostrar 1 card e o fornecedor imprimir/postar 1 vez só, não
3. Gravada em `web/lib/erp/submitSellerErpPedido.ts` (ambos os caminhos de insert),
populada a partir do `pack_id` que `web/lib/mercadoLivrePedidoIngest.ts` já lê do
`/orders/{orderId}` do ML. Escopo só ML direto (`canal_venda = 'mercado_livre'`) — Olist/
Bling não mostraram esse padrão.

## `seller_olist_integrations.olist_sync_locked_until`/`olist_sync_locked_by` — lock de concorrência por seller (2026-09-24)

`web/scripts/add-olist-sync-lock-to-seller-integrations.sql`: 2 colunas nullable
(`timestamptz`, `text`). Evita `olist-sync` (1min), `etiqueta-olist-retry` (15min) e
`olist-sync-precos` (10min) baterem no token Olist do MESMO seller ao mesmo tempo (a Tiny
tem um erro específico pra "excesso de requisições concorrentes", diferente do rate limit
de volume já coberto por `olist_rate_limited_until`/`olistRateLimitCooldown.ts`).
`fornecedor-olist-sync-estoque` fica de fora de propósito — usa token do FORNECEDOR
(`fornecedor_olist_integrations`), bucket diferente. Lock via coluna com TTL, não advisory
lock do Postgres: `supabaseAdmin` fala com o banco via PostgREST (HTTP), então "pegar" e
"soltar" em chamadas separadas não garante a mesma conexão/sessão — premissa que o
`pg_try_advisory_lock`/`pg_advisory_unlock` exige. Lib única:
`web/lib/olistSyncSellerLock.ts` (`tryLockSellerOlistSync`/`releaseSellerOlistSync`),
self-healing (TTL expira sozinho se o release não rodar, ex.: crash no meio do cron).

## `pedidos.sla_prazo_despacho`/`sla_atraso_notificado_em` — SLA de postagem por marketplace (2026-09-24)

`web/scripts/add-sla-despacho-to-pedidos.sql`: 2 colunas nullable (`timestamptz`) + índice
parcial em `(status, sla_prazo_despacho)`. Fase 2 da frente de etiqueta/SLA (pausada em
2026-09-22, retomada depois da ingestão direta do ML existir) — **v1 só notifica, sem
penalidade financeira**. Regra de desenho: o relógio conta a partir da ETIQUETA
DISPONÍVEL (`etiqueta_impressa_em`), nunca da criação do pedido — atraso causado pela
etiqueta demorar (buffer do próprio ML, fila da Olist) não pode virar "culpa do
fornecedor". Fórmulas por `canal_venda` (valores canônicos de `normalizeCanalVenda()`,
`olistTinyApi.ts`) em `web/lib/pedidoSlaDespacho.ts`, confirmadas com o Sr Stark em
2026-09-24 e validadas com casos de teste antes de commitar:
- `mercado_livre`: usa o prazo real que a própria API do ML devolve
  (`estimated_handling_limit`, via `mlBuscarPrevisaoLiberacaoEtiqueta`) — independe de
  etiqueta impressa, busca de novo a cada rodada do `etiqueta-ml-retry` (a data pode mudar
  até a véspera do despacho).
- `shopee`: etiqueta impressa até 13h → despachar no mesmo dia até 23:59 (vale sábado
  também); depois das 13h → dia seguinte até 23:59, pulando domingo (nunca é dia de
  despacho válido).
- `shein`: 24h em dias úteis — equivale a "1 dia útil depois, mesma hora" (sábado, domingo
  e feriado nacional não contam).
- `tiktok_shop`: 2 dias úteis a partir do dia da etiqueta (esse dia não conta como um dos
  2), prazo final 23:59:59 do 2º dia útil seguinte.
- Feriados nacionais calculados programaticamente (fixos + móveis via algoritmo de Páscoa
  de Meeus/Jones/Butcher) — não precisa de lista atualizada ano a ano; cobre só feriados
  NACIONAIS (não estaduais/municipais), limitação conhecida e aceita pra v1.

Gravada em dois pontos: `web/app/api/fornecedor/pedidos/etiquetas-combinadas/route.ts`
(Shopee/Shein/TikTok, no momento em que `etiqueta_impressa_em` é setado) e
`web/lib/etiquetaMlRetry.ts` (ML, a cada rodada do retry). Checada pelo cron
`web/app/api/cron/pedidos-sla-despacho-check/route.ts` (a cada 30 min,
`web/scripts/add-pedidos-sla-despacho-check-cron.sql`) — pedido "enviado" com prazo
vencido e ainda não notificado (`sla_atraso_notificado_em IS NULL`) notifica fornecedor
(`notifyFornecedorSlaAtraso.ts`) + admin (`notifyAdminsSlaAtraso.ts`) e marca
`sla_atraso_notificado_em` (nunca notifica o mesmo pedido 2x). Novos tipos de notificação:
`pedido_sla_atrasado` (fornecedor) e `sla_atraso_admin` (admin) — registrados em
`web/lib/notificationContextFilter.ts` e `web/components/NotificationBell.tsx`.

## `sellers.mensalidade_valor_travado`/`gestores_ia_addon_ativo`/`gestores_ia_addon_ativado_em` — reprecificação Pro + add-on Gestores de IA (2026-09-30)

`web/scripts/add-gestores-ia-addon-e-preco-pro.sql`. Pro sobe de R$147,90 pra R$197,90
(`financial_planos.Pro.valor_seller`); os 5 sellers que já pagavam Pro antes da mudança
ficaram com `mensalidade_valor_travado = 147.90` (grandfathering — `gerarMensalidadesCicloOrg.ts`
usa esse valor no lugar do preço da tabela quando não for `null`). Start não muda
(R$97,90).

`gestores_ia_addon_ativo` é o add-on "Gestores de IA" (Diogo/Andrey/Amanda + futuros
gestores — Ulisses já é liberado de graça só pro Pro, sem precisar do add-on). Preço do
add-on depende do plano base: **+R$700/mês no Start, +R$600/mês no Pro** — os dois casos
chegam no mesmo total (R$797,90), Pro só chega lá com 1 gestor a menos pra pagar porque o
Ulisses já vem incluso. `gestores_ia_addon_ativado_em` é só auditoria/histórico, não entra
em cálculo nenhum.

Start deixou de ter cap de 15 pares produto+cor e ganhou o bloco Desempenho
(receita/custo/margem) que antes era exclusivo do Pro — a única diferença real entre Start
e Pro hoje é o Ulisses de graça.

**`mensalidade_valor_travado` é o TOTAL final (2026-10-01):** quando preenchido,
`gerarMensalidadesCicloOrg.ts` usa esse valor como a mensalidade inteira do seller — o
add-on (se `gestores_ia_addon_ativo`) **não** soma em cima. Só soma em cima do preço de
tabela do plano quando `mensalidade_valor_travado` é `null`. Motivo: Galileus (conta de
teste do Sr Stark) e Segatto (`e_teste = true`) precisavam do add-on ativo com mensalidade
R$0 — `mensalidade_valor_travado = 0` nos dois. Sem essa mudança, qualquer seller com valor
travado e add-on ativo pagaria base travada + R$600/700 do add-on em cima, mesmo quando o
valor travado já deveria ser o preço final combinado.

## `sellers.plano_ciclo`/`plano_ciclo_carencia_fim`/`plano_desconto_tipo`/`plano_desconto_valor` — ciclo de compromisso + desconto do plano principal (2026-11-02)

`web/scripts/add-seller-plano-ciclo-desconto.sql`. Plano Start/Pro ganha ciclo de
compromisso (`plano_ciclo`: `mensal` | `semestral` | `anual`, default `mensal`) + desconto
manual, definidos só pelo **admin** em `/admin/sellers` (botão "Plano, ciclo e desconto" na
tela de detalhe do seller) — não há escolha self-service de ciclo/desconto pelo seller, só
de plano no onboarding (`PATCH /api/seller/plano`, inalterado).

Ciclo **não muda o valor da parcela** — só define a carência (dias sem cobrança) antes da
1ª mensalidade, mesmo racional do contrato anual do pacote Gestores de IA avulso
(`GESTORES_IA_AVULSO_CONTRATO_ANUAL_CARENCIA_DIAS`): semestral = 30 dias, anual = 60 dias
(`SELLER_PLANO_CICLO_CARENCIA_DIAS` em `web/lib/sellerPlanoCicloDesconto.ts`).
`plano_ciclo_carencia_fim` é a data resolvida (`data_entrada + dias`), calculada uma vez
pela RPC `fn_seller_plano_ciclo_desconto_set` — `gerarMensalidadesCicloOrg.ts` pula a
geração de mensalidade enquanto `hoje <= plano_ciclo_carencia_fim` (seller em ciclo
`mensal`, que é o padrão/legado, nunca é afetado: `carencia_fim` fica sempre `null`).

`plano_desconto_tipo` (`valor` | `percentual`) + `plano_desconto_valor` são ortogonais ao
ciclo — desconto manual do admin sobre `financial_planos.valor_seller`, mesmo cálculo do
pacote Gestores de IA avulso (`calcularValorMensalSellerPlano`, arredonda a 2 casas).
`mensalidade_valor_travado` (grandfathering, acima) continua tendo prioridade quando
preenchido — ignora ciclo e desconto, é o total final travado.

**Upgrade Start→Pro no meio de um ciclo semestral/anual não reinicia a carência** — a RPC
`fn_seller_plano_upgrade_pro_set` só muda `plano` para `Pro`; `plano_ciclo`/
`plano_ciclo_carencia_fim` ficam intocados de propósito, as parcelas restantes do
compromisso passam a cobrar o valor do Pro a partir do próximo ciclo
(`recalcularMensalidadeCicloAtualParaPro`, já existia). Pra isso, o seller em ciclo
semestral/anual precisa confirmar um aceite leve (`plano_ciclo_upgrade_termos_versao`/
`_aceite_em`) antes do upgrade — checkbox em `/seller/plano`, igual padrão de
`credito_termos_versao`/`credito_aceite_em` em `seller_depositos_pix`. O texto aceito
trafega em `seller_depositos_pix.upgrade_termos_versao` (coluna nova, mesma tabela do PIX
de upgrade) até a confirmação do pagamento, quando `upgradeProPixProcessor.ts` grava o
aceite junto com a troca de plano.

**Contrato jurídico fica fora do DropCore** (decisão do Sr Stark, 2026-11-02): o aceite em
tela é só rastro interno de que o seller confirmou a consequência do upgrade — o contrato
formal (PDF/assinatura) é feito por fora, sem integração no sistema.

**Preço travado durante o compromisso (`web/scripts/add-seller-plano-ciclo-valor-travado.sql`,
corretivo do script acima, 2026-11-02):** colunas `plano_ciclo_valor_travado` (numeric) e
`plano_ciclo_compromisso_fim` (date). Decisão do Sr Stark: quem assina semestral/anual não
pode ser pego de surpresa por reajuste de `financial_planos` no meio do compromisso — a RPC
`fn_seller_plano_ciclo_desconto_set` agora também calcula e grava o valor final (tabela +
desconto) no momento em que o admin define/edita o ciclo, travado até
`plano_ciclo_carencia_fim + 6 meses` (semestral) ou `+ 12 meses` (anual)
(`SELLER_PLANO_CICLO_COMPROMISSO_MESES` em `web/lib/sellerPlanoCicloDesconto.ts`, só
referência/documentação — o cálculo real roda em SQL). `gerarMensalidadesCicloOrg.ts` usa
esse valor travado em vez do cálculo ao vivo (tabela + desconto) enquanto
`plano_ciclo_compromisso_fim >= hoje`; depois disso volta a acompanhar `financial_planos`
normalmente, como antes. Precedência final: `mensalidade_valor_travado` (grandfathering
legado, sempre vence) > `plano_ciclo_valor_travado` (dentro do compromisso) > tabela ao vivo
+ desconto. Ciclo mensal nunca grava essas duas colunas (ficam `null`).

Ambas as RPCs são `SECURITY DEFINER`, só `grant execute` pra `service_role` (regra 9 do
CLAUDE.md) — chamadas por `POST /api/org/sellers/[id]/plano-ciclo` (admin) e por
`upgradeProPixProcessor.ts` (confirmação de PIX), nunca `.from("sellers").update(...)`
direto nesses dois fluxos.

## `seller_ai_chat_sessions`/`seller_ai_chat_mensagens` — chat com o Tiago Silva (Gestor Mestre, 2026-09-30)

`web/scripts/create-seller-ai-chat-tiago.sql`. Chat síncrono (Messages API, não Batch) onde o Tiago Silva orquestra os outros gestores via
tool-calling, lendo só `seller_ai_runs` (nunca dispara rodada nova de gestor no meio da
conversa, por custo/latência). Parte do add-on "Gestores de IA" (mesmo gate de
Diogo/Andrey/Amanda — `gestores_ia_addon_ativo`).

**Streaming token-a-token real desde 2026-10-02**
(`app/api/seller/gestores-ia/tiago/chat/route.ts`): cada iteração do loop de tool-calling
usa `client.messages.stream(...)` da SDK oficial, repassando cada delta de texto pro
cliente em tempo real. Corpo da resposta é **NDJSON** (1 evento JSON por linha), não
SSE/`EventSource` — o endpoint é POST com `Authorization` no header, que `EventSource` não
suporta; o client (`SellerGestorTiagoChatPanel.tsx`) lê via `fetch` + `ReadableStream`
manualmente. Eventos: `delta` (texto), `tool_status` (rótulo tipo "Consultando o
Andrey…" enquanto uma tool roda, limpo no próximo delta), `error`, `done` (fecha a rodada,
dispara a gravação da mensagem/orçamento no banco). Texto que o modelo solta antes de
decidir chamar uma tool já estream normal (não é tudo-ou-nada por iteração).

- `seller_ai_chat_sessions` (id, seller_id, org_id, titulo, criado_em, atualizado_em) e
  `seller_ai_chat_mensagens` (id, session_id, role, content, tokens_input, tokens_output,
  criado_em) — deny-all, RPC-only, mesmo padrão de `seller_ai_runs`.
- Orçamento mensal (reserva-e-concilia) **não usa `api_rate_limits`** — essa tabela tem
  `CHECK` travando `key_type` em `'ip'/'api_key'` e nenhum índice único pra upsert, não serve
  pra isso. Em vez de criar tabela nova, 2 colunas direto em `sellers`:
  `gestor_mestre_chat_custo_mes` (numeric, R$ gasto no mês corrente) e
  `gestor_mestre_chat_mes_ref` (date, zera o contador quando o mês muda). Controlado em
  **reais**, não tokens brutos (input/output da Anthropic têm preço bem diferente).
- RPCs: `fn_seller_ai_chat_historico` (1 função só pra tela: sessões + mensagens da ativa),
  `fn_seller_ai_chat_criar_sessao`, `fn_seller_ai_chat_gravar_mensagem`,
  `fn_seller_ai_chat_orcamento_reservar`/`_conciliar`/`_status` — **as 6 são
  `service_role`-only** (só o backend chama, já autenticou o seller via
  `getSellerFromToken` antes). Nenhuma checa `auth.uid()` por dentro — diferente de
  `fn_seller_ai_runs_list` (pensada pro browser chamar direto), aqui é sempre o servidor,
  e `auth.uid()` vem sempre `null` em chamada por `service_role` (achado real no mesmo dia,
  quebrava a checagem se deixasse).
- **Achado de segurança no mesmo dia** (ver seção "`revoke from public` não basta" no topo
  deste arquivo): todas as 6 estavam executáveis por `anon`/`authenticated` até eu revogar
  explícito desses 2 roles — não só de `public`.
- Teto: R$120/mês por seller (custo real, banco pela margem do add-on R$600/700) — decisão
  confirmada 2026-09-30, ver [[project_gestores_ia_chat_elite_pendente]].
- **Bloqueio DIÁRIO real (2026-09-30, mesmo dia, sessão seguinte):** além do teto mensal
  acima (rede de segurança), o chat bloqueia de verdade quando o gasto de hoje atinge
  `TETO_CHAT_TIAGO_REAIS_DIA` (R$4 = R$120/30) — calculado por agregação read-only em cima
  de `seller_ai_chat_mensagens` (`gestorTiagoChatOrcamentoDia.ts`), sem coluna/contador novo
  (o corte por data BRT já é o reset). Tela mostra % + tokens equivalentes (não R$), com
  "Redefine às 00:00" — nunca mostra o valor em dinheiro gasto (só o teto mensal antigo
  mostrava R$, isso foi removido da UI por pedido explícito, a trava em si continua real).
- **Crédito extra do chat via PIX** (`web/scripts/add-credito-extra-chat-tiago.sql`):
  2 colunas novas em `sellers` — `gestor_mestre_chat_credito_extra_reais` (numeric, R$ de
  uso liberado) e `gestor_mestre_chat_credito_extra_dia_ref` (date, expira se não for hoje
  em BRT — não acumula pro dia seguinte). Reaproveita `seller_depositos_pix` (mesmo padrão
  do add-on "Gestores de IA", sem tabela nova): `referencia = CREDITO_CHAT_IA`,
  `external_reference = chatia-{id}`. 2 pacotes fixos com margem de 100%: pago R$10 →
  libera R$5; pago R$20 → libera R$10 (`web/lib/creditoChatIaPixProcessor.ts`,
  `PACOTES_CREDITO_CHAT_IA`). Processor plugado em 2 lugares — esquecer um dos dois quebra
  o fluxo local/produção silenciosamente:
  1. Webhook do Mercado Pago (`app/api/webhooks/mercadopago/route.ts`), branch do prefixo
     `chatia-`.
  2. **`lib/depositoPixMercadoPagoSync.ts`** (fallback de sync manual/local, usado pelo botão
     de polling quando o webhook não alcança `localhost`) — tem um `if/else` explícito por
     tipo de depósito; sem branch próprio pro `CREDITO_CHAT_IA` ele caía no `else` genérico
     e creditava **saldo de pedido** em vez do crédito do chat (bug real encontrado e
     corrigido na mesma sessão, antes de qualquer teste ao vivo).

## `seller_mercadolivre_integrations.linked_seller_id` — 2 sellers compartilhando 1 conexão ML (2026-10-01)

`web/scripts/add-linked-seller-mercadolivre-integrations.sql`. Caso de uso: Galileus e
Segatto são as 2 contas de demonstração internas do Sr Stark — Galileus já estava
conectada na conta ML real "Djulios"; a Segatto precisava ver dado da mesma conta sem ter
uma conexão OAuth própria.

`ml_user_id` é `UNIQUE` e o `refresh_token` do Mercado Livre é de uso único (renovar
invalida o anterior) — duplicar o token em 2 linhas quebraria uma das duas assim que a
outra renovasse. Em vez disso, a linha "secundária" (Segatto) fica com
`ml_user_id`/tokens **sempre `null`** e só preenche `linked_seller_id` apontando pra linha
"dona" de verdade (Galileus). `getValidMercadoLivreAccessToken` (`mercadoLivreApiClient.ts`)
segue esse link antes de ler/renovar — nunca duplica token, 1 nível só (sem encadear
link→link). `GET /api/seller/mercadolivre` também resolve o link pra mostrar o status real
(ml_user_id/validade) da linha dona, não da própria linha vazia.

Efeito colateral aceito de propósito: ação "aplicar" disparada do painel da Segatto escreve
na mesma conta ML real que o Galileus usa — não é espelho isolado, as duas são contas de
teste internas, sem seller de verdade nos dois lados. Webhook em tempo real (pergunta/
reclamação) só dispara pelo `ml_user_id` de verdade (Galileus) — a Segatto recebe a mesma
atualização via cron diário/botão manual, não instantânea.

**Pedido novo NÃO ingere pra Segatto** — `lib/mercadoLivrePedidosReconciliacao.ts` pula
toda linha de `seller_mercadolivre_integrations` com `ml_user_id` nulo (`if
(!integ.ml_user_id) continue`), e a da Segatto é exatamente essa. Pedido real da conta
"Djulios" só é importado pelo Galileus (que já tinha 32 pedidos reais via fornecedor
**Consenso** antes dessa mudança — inverter a posse do `ml_user_id` pra Segatto quebraria
esse fluxo real e ativo; por isso não foi essa a escolha). Ver próxima seção pra como a
Segatto ganha pedido novo sem depender do ML real.

## `cron/segatto-pedido-demo` — pedido fictício novo periódico pra conta demo (2026-10-01)

`web/lib/segattoPedidoDemo.ts` + job `dropcore-segatto-pedido-demo` em
`web/scripts/supabase-cron-jobs.sql`. A Segatto
é a conta usada pra mostrar pra possíveis sellers como o DropCore funciona — precisava
continuar parecendo "viva" (pedido novo chegando) sem depender de venda real nenhuma e sem
duplicar o pedido real que já entra pelo Galileus (ver seção anterior).

Cron a cada 3h (`dropcore-segatto-pedido-demo`) chama `gerarPedidoDemoSegatto()`: sorteia 1
SKU ativo real do fornecedor Djulios, monta 1 pedido com comprador fictício (nome/cidade
aleatórios de uma lista curta) e `status: "enviado"`, sempre `e_teste = true`. De propósito
**não** reusa `submitSellerErpPedido` (lib/erp/submitSellerErpPedido.ts) — aquele fluxo
debitaria estoque real do catálogo da Djulios e dispararia webhook/notificação real pro
fornecedor, o que não pode acontecer aqui. Também não grava `financial_ledger` — o pedido
fica visível pro fornecedor sem mexer no saldo fictício da Segatto.

## Gestores de IA avulso (standalone, fora do hub) — reaberto 2026-10-04

Produto novo: pacote "Calculadora + Gestores de IA" (R$797,90/mês, só por convite, mesmo
fluxo de `calculadora_invites`) pra qualquer seller do Mercado Livre, **sem precisar virar
seller/fornecedor do hub**. Calculadora sozinha continua existindo à parte (R$14,99/mês,
`calculadora_assinantes.inclui_gestores_ia = false`).

**Decisão de arquitetura (2026-10-04): isolamento total de `sellers`/`skus`/`pedidos`** —
descartada a alternativa de dar um `sellers` row "fake" pro assinante avulso (seria mais
rápido, reaproveitaria os gestores do hub quase sem mexer, mas o Sr Stark rejeitou
explicitamente por risco de contaminar relatório/MRR do hub). Lógica de julgamento de cada
gestor (prompt, scoring) é compartilhada com o hub; só a camada de busca/gravação de dado é
100% separada, batendo direto na API do Mercado Livre (nunca em dado sincronizado do hub).

**Gestores inclusos:** Andrey (Anúncios & SEO), Amanda (Reputação & Atendimento), Ulisses
(Ads — assinante digita o próprio custo/taxa, sem `skus.custo_base`) e Tiago Silva (Gestor
Mestre/chat). **Diogo fica de fora por enquanto** — depende de estoque/venda interna
(Olist/Bling/fornecedor) que o assinante avulso não tem; entraria só com uma fonte
alternativa via `available_quantity` do ML + agregação de `/orders/search`, mais trabalho e
menos preciso — adiado de propósito, não esquecido.

**Schema aplicado em 2026-10-04**
(`web/scripts/create-calculadora-assinante-gestores-ia-avulso.sql`):
- `calculadora_assinantes` ganhou `inclui_gestores_ia`, `gestores_custo_mes`,
  `gestores_limite_mes` (começa em 120), `gestores_mes_ref`, `anthropic_api_key_encriptada`,
  `anthropic_api_key_configurada_em`.
- `calculadora_assinante_mercadolivre_integrations` (nova, deny-all) — conexão OAuth do ML
  presa em `assinante_id`, nunca em `seller_id`.
- `calculadora_assinante_ai_runs` (nova, deny-all) — resultado de cada rodada, `gestor in
  ('anuncios_seo', 'reputacao_atendimento', 'ads', 'gestor_mestre')`.
- `calculadora_recebimentos` ganhou `tipo` (`'renovacao'` | `'credito_extra_gestores'`) —
  reaproveitada pro histórico de crédito extra em vez de criar tabela nova.

**Orçamento de IA — corrigido 2026-10-06 pra bater 1:1 com o padrão do chat do Tiago Silva
do hub:** teto é **diário** (R$4 = R$120/30, `TETO_AVULSO_REAIS_DIA` em
`lib/ai/gestorAvulsoOrcamento.ts`, reaproveita `TETO_CHAT_TIAGO_REAIS_DIA` do hub como fonte
única do número), não mensal acumulado — bloqueia quando o gasto real de hoje atinge o teto,
libera de novo à meia-noite (BRT). Calculado por **agregação read-only** a partir de
`calculadora_assinante_ai_runs.tokens_input`/`tokens_output` (colunas adicionadas em
`web/scripts/add-tokens-calculadora-assinante-ai-runs.sql`) desde a meia-noite BRT — sem
acumulador separado, sem risco de drift. Compartilhado entre **todos** os gestores avulso
(hoje só o Andrey; Amanda/Ulisses/Tiago entram no mesmo pote quando forem construídos),
igual o hub compartilha entre chat + os 4 gestores diários. Primeira versão (mensal, via
`gestores_custo_mes`/`gestores_limite_mes`) ficou sem uso — colunas continuam na tabela
(sem necessidade de dropar), mas o código não escreve mais nelas.

**BYOK opcional**: se o assinante configurar a própria chave Anthropic
(`anthropic_api_key_encriptada`, criptografia AES-256-GCM própria — replicar
`lib/sellerErpSecretBox.ts`, mas com chave de ambiente separada da do ERP, não reaproveitar a
mesma por isolamento), o teto diário não vale e a rodada não grava tokens (não é custo do
DropCore) — gasto sai 100% da chave dele, sem limite.

**`web_search_requests` (2026-10-07, `web/scripts/add-web-search-requests-calculadora-assinante-ai-runs.sql`)**:
coluna nova em `calculadora_assinante_ai_runs` — "Ideias pra anúncio novo" (Andrey avulso)
ganhou a ferramenta `web_search` nativa da Anthropic (pesquisa real antes de sugerir
título/modelo/ocasiões/estilos, em vez de só vocabulário técnico do ML/conhecimento de
treino). Busca web é cobrada **separado** dos tokens (US$10/1.000 buscas,
`calcularCustoReaisWebSearch` em `lib/ai/gestorTiagoChatCusto.ts`) — `gastoAvulsoHojeReais`
soma esse custo junto com tokens pra bater o orçamento diário real. Contagem real vem de
`message.usage.server_tool_use.web_search_requests` (nunca estimada). BYOK grava `null`
igual tokens (gasto não é do DropCore).

**Ainda não construído:** Tiago avulso, fluxo de compra de crédito extra (o diário que
estourou só libera de novo à meia-noite, sem opção de pagar pra liberar mais cedo ainda). Ver
memória de projeto "Gestores de IA avulso (standalone)" pro estado mais atualizado da
decisão/construção.

### Ulisses avulso (Ads & Preço) construído — 2026-10-07, v1 enxuto (RPC, 1º uso real no projeto)

Escopo v1 combinado com o Sr Stark — bem menor que o hub (`gestorAdsDados.ts`, 950+ linhas
com gasto real de Ads, afiliado, cupom, classificação de campanha): **só margem** (preço −
custo digitado − frete real − comissão − imposto − perda). Sem Ads/afiliado/cupom/campanha —
fica pra v2, depois de validar o core. 100% código, zero chamada à Anthropic (mesma decisão
do hub 2026-09-07: margem atual vs. mínima/máxima é comparação de número).

**Diferença estrutural vs. hub:** avulso não tem `skus.custo_base` (sem catálogo de
fornecedor) — o assinante digita o custo manualmente por anúncio/família, tela própria
(`/seller/gestores-ia-avulso/ulisses/custos`).

**Primeiro uso real de RPC (`security definer`) no produto avulso** — decisão explícita do Sr
Stark depois de uma conversa longa sobre RLS/RPC/organização (não é consistência técnica
forçada: confirmado que nenhum lugar do sistema, nem o hub, chama RPC direto do navegador —
`fn_seller_ulisses_preferencias_get/upsert` do hub existe mas nunca é usada, o wizard do hub
usa `.from()` via rota igual o resto. RPC aqui é só a ROTA chamando `supabaseAdmin.rpc(...)`
em vez de `.from()`, pelo motivo "fica organizado" do Sr Stark, não por ganho de
segurança/performance — os dois são igualmente seguros, RLS sempre ligada nos dois). Não
confere `auth.uid()` por dentro da função (confia em quem chamou, que já validou via
`getAssinanteFromToken`) — por isso as funções são `revoke all from public` + `grant execute
to service_role` só, mesmo padrão de `rpc_debitar_estoque_sku` (nunca `grant ... to
authenticated`, isso abriria a função pra qualquer usuário logado chamar com `assinante_id`
de outra pessoa).

- `calculadora_assinante_ulisses_preferencias` (margem mínima/máxima, imposto, perda) e
  `calculadora_assinante_ulisses_custos` (chave = item_id/family_id do ML → custo) — ambas
  deny-all, acesso só via RPC:
  `fn_gestores_ia_avulso_ulisses_preferencias_get/upsert`,
  `fn_gestores_ia_avulso_ulisses_custos_list`, `_custo_upsert`, `_custo_delete`.
- `lib/ai/gestorAdsDadosAvulso.ts` — reaproveita `calcularMargemRealizada`
  (`lib/margemCalculo.ts`) e `calcularPrecoMinimoSeguro` (exportada de `gestorAdsDados.ts`
  pro hub) — mesmas fórmulas, zero duplicação. Catálogo agrupado por família (mesma
  convenção do Andrey), diagnóstico `sem_custo | margem_abaixo_minima | margem_saudavel |
  margem_acima_maxima`.
- `lib/ai/gestorAvulsoUlissesRodar.ts` — cooldown 6h, sem orçamento/BYOK (zero custo de IA).
- Rotas: `GET /api/gestores-ia-avulso/ulisses` (status), `POST .../rodar`, `GET/POST
  .../preferencias` (wizard), `GET/POST/DELETE .../custos` (catálogo + custo por item).
- Cron `gestores-ia-avulso-ulisses` (`30 8 * * *`, síncrono, mesmo padrão do cron do
  Andrey/Amanda antes do batch).
- Telas: `/seller/gestores-ia-avulso/ulisses` (wizard + resultado, reaproveita
  `SellerGestorRunShell`) e `/seller/gestores-ia-avulso/ulisses/custos` (digitar custo por
  anúncio, separa "sem custo" de "já cadastrados"). Portal (`/seller/gestores-ia-avulso`)
  ganhou o card de link + status real no escritório 3D.

**Aplicar promoção de verdade — porte do hub, 2026-10-16.** O hub já tinha essa feature
inteira testada contra conta real (ago/set 2026); o avulso só tinha o diagnóstico (detectar
desconto ativo), sem a ação de aplicar, decisão deliberada de v1 ("fica pra v2" no comentário
original). Entrega:
- `app/api/gestores-ia-avulso/ulisses/aplicar-promocao-lote/route.ts` — réplica do
  `.../seller/gestores-ia/ulisses-aplicar-promocao-lote`, mesmas funções do ML
  (`mlBuscarLimitesPromocaoPrecoDesconto`/`mlCriarPromocaoPrecoDesconto`), token avulso
  (`getValidMercadoLivreAvulsoAccessToken`), sem auditoria em tabela (avulso não tem
  `seller_ai_acoes`).
- `SkuResultadoAdsAvulso` ganhou `membros: {item_id, titulo}[]` (todos os anúncios da
  família, não só o representante — aplica a promoção em todos, mesmo cuidado do botão de
  pausar do Estoque) e `risco_ruptura_estoque` (lido da última rodada do Estoque avulso via
  `fn_gestores_ia_avulso_ai_runs_recentes` com `p_gestor: "estoque"`, mesma chave de
  família — avisa sem bloquear quando o SKU está em risco alto de ruptura).
- Tela: nova seção "Sem promoção ativa — pode entrar sem furar a margem" na aba Promoções,
  com botão que cria a promoção (preço editável, trava de confirmação se furar o piso —
  mesma UX do hub).
- **Fora de escopo de propósito (v2 futuro)**: estimar lucro "mais unidades × menos margem"
  (o hub nunca modelou isso, só margem vs. piso) e calendário de datas fortes com
  antecedência (sem dado de calendário real).

**Retrofit da leitura do resto do avulso pra RPC (mesmo dia, pedido explícito do Sr Stark de
"organizar" o avulso em partes):** 3 funções novas —
`fn_gestores_ia_avulso_ai_runs_recentes(p_assinante_id, p_gestor, p_limit)` (genérica,
substitui o `.from("calculadora_assinante_ai_runs").select()...` que cada rota de status
fazia), `fn_gestores_ia_avulso_ml_status_get(p_assinante_id)` (devolve a linha inteira de
`...mercadolivre_integrations`, inclusive token — só roda no servidor, nunca serializado pro
front) e `fn_gestores_ia_avulso_byok_anthropic_configurado(p_assinante_id)` (boolean puro, sem
decriptar nada). Aplicadas em `andrey/route.ts`, `amanda/route.ts`, `ulisses/route.ts`,
`mercadolivre/route.ts` (GET), `byok/route.ts` (GET) **e também a checagem "ML conectado?"
nos 3 `rodar/route.ts`** (Andrey/Amanda/Ulisses — mesma leitura simples de `ml_user_id` antes
de rodar, achada numa auditoria pedida pelo Sr Stark depois do retrofit inicial, confirmada
com grep que não sobrou nenhuma ocorrência igual no resto do código). **Escopo deliberadamente só leitura
de status pra UI** — gravação de rodada nova (`rodarAndreyAvulsoParaAssinante` etc.), conectar/
desconectar ML, salvar/testar chave BYOK, cooldown check interno e `gastoAvulsoHojeReais`
continuam em `.from()`, não entraram nesse retrofit (mexem com token real/criptografia ou são
cálculo de agregação, risco maior pra reescrever sem necessidade concreta).

### Margem — piso de preço formal no Ulisses avulso, 2026-10-16 (último item do roadmap do doc de 13 gestores)

Fórmula do doc externo: `piso = (custo + embalagem + custo Full + devolução esperada) ÷
(1 − comissão% − imposto% − margem mínima% − ACOS alvo%)`, substituindo o
`calcularPrecoMinimoSeguro` antigo (que só considerava custo+frete real, sem embalagem/Full/
devolução/ACOS).

**Achado importante antes de codar**: `embalagem_brl`/`custo_full_brl` já existiam em
`calculadora_assinante_ulisses_preferencias` desde `add-embalagem-custo-full-ulisses-
preferencias.sql` (2026-10-11) — mas **nenhum código lia ou escrevia esses 2 campos**, ficaram
órfãos (banco pronto, UI/lógica nunca ligada). Esta entrega termina isso, em vez de criar
campo novo duplicado.

- `web/scripts/add-devolucao-acos-ulisses-preferencias-avulso.sql` — 3 colunas novas na mesma
  tabela (`devolucao_taxa_pct`, `devolucao_custo_brl`, `acos_alvo_pct`, todas `numeric not
  null default 0`) + `fn_gestores_ia_avulso_ulisses_preferencias_upsert` recriada com os 3
  parâmetros novos (drop+create, mudança de assinatura). `_get` não precisou de alteração
  (`RETURNS calculadora_assinante_ulisses_preferencias` + `select *` acompanha coluna nova da
  tabela automaticamente). `revoke all from public/anon/authenticated` + `grant execute to
  service_role`, conferido via `information_schema.routine_privileges` depois de aplicar.
- `web/lib/margemCalculo.ts` — `calcularPrecoPisoFormal()` nova, convergindo por ponto fixo
  (`custoOperacionalPorPreco(precoCandidato)` como função injetada, até 20 iterações ou
  `null`) — existe pra suportar uma tabela real de faixa de custo operacional do ML no
  futuro, mas hoje `gestorAdsDadosAvulso.ts` passa uma função constante (frete real já
  buscado da API, igual sempre foi) porque a API do ML **não simula custo/frete pra um preço
  candidato hipotético** — só devolve o custo real do preço publicado hoje. Documentado como
  aproximação, não precisão inventada (mesma régua do resto do roadmap).
- `web/lib/ai/gestorAdsDadosAvulso.ts` — `UlissesPreferenciasAvulso` ganhou os 5 campos
  (embalagemBrl/custoFullBrl/devolucaoTaxaPct/devolucaoCustoBrl/acosAlvoPct); troca
  `calcularPrecoMinimoSeguro` (import do hub) por `calcularPrecoPisoFormal`.
- `components/seller/SellerGestorUlissesWizard.tsx` — **compartilhado com o hub**
  (`endpoint` prop já diferenciava tabela); ganhou prop nova `avulso?: boolean` (default
  `false`) pra só mostrar/enviar os 5 campos novos no avulso, sem mudar nada do hub (hub não
  passa essa prop, zero campo novo no body, comportamento idêntico a antes). Seção "Piso de
  preço avançado" fica atrás de um toggle fechado por padrão, pra não poluir o wizard simples.
- **Bug pré-existente achado e corrigido no caminho** (não causado por esta entrega, mas no
  mesmo arquivo): `app/api/gestores-ia-avulso/ulisses/preferencias/route.ts` devolvia o
  objeto de preferências em camelCase (saída de `buscarPreferenciasUlissesAvulso`) enquanto
  o wizard sempre esperou snake_case (`UlissesPreferenciasForm`) — ao editar preferência já
  salva, os campos apareciam em branco. Corrigido com um mapper `paraFormSnakeCase()` na
  borda da rota (GET e POST), sem mudar a representação interna (camelCase) do resto do lib.
- `app/seller/gestores-ia-avulso/ulisses/page.tsx` — texto do "preço mínimo seguro" atualizado
  pra deixar claro que já conta embalagem/Full/devolução/ACOS quando configurados.

**Fecha o roadmap completo de absorção do doc "13 Gestores de IA pra Mercado Livre"** — ver
também a memória `project_doc_13_gestores_absorcao_avulso` (Estoque, SAC, ADS, Anúncio, Gestor
já fechados antes deste item).

### Amanda avulsa (Reputação & Atendimento) construída — 2026-10-07

Mesmo princípio dos outros: lógica de julgamento compartilhada com o hub
(`lib/ai/gestorReputacaoAtendimentoDados.ts`, que ganhou `export` em `buscarPerguntasContexto`,
`classificarReputacao`, `responderPerguntasComIA` e no tipo `PerguntaRespostaIA` pra virar
reaproveitável), busca de dado 100% isolada via API do ML.

- `lib/ai/gestorReputacaoAtendimentoDadosAvulso.ts` — `buscarDadosReputacaoAtendimentoAvulso`
  (reputação + perguntas pendentes via `getValidMercadoLivreAvulsoAccessToken`) e
  `montarResultadoReputacaoAtendimentoAvulso`. **Sem cruzamento com atraso de postagem do
  fornecedor** (`fornecedoresAtraso` sempre `[]`) — essa sinergia depende de
  `pedido_eventos`/`fornecedores`, exclusivos do hub; o avulso não tem fornecedor vinculado.
- **Sem Batch API**, igual a decisão do hub de 2026-09-07 pra esse gestor: diagnóstico de
  reputação é código puro (zero custo), só chama a Anthropic quando há pergunta pendente de
  verdade — não compensa a complexidade de batch assíncrono (até 24h) pra uma chamada rara.
  `lib/ai/gestorAvulsoAmandaRodar.ts` (cooldown 6h, reaproveitado pelo botão manual e pelo
  cron) busca os dados primeiro (grátis) e só decide gastar com IA (chave da casa, respeitando
  orçamento diário, ou BYOK) se `perguntas.length > 0` — erro na resposta a pergunta nunca
  derruba o diagnóstico (try/catch isolado).
- Rotas: `GET /api/gestores-ia-avulso/amanda` (status + uso diário), `POST
  .../amanda/rodar` (clique manual), `POST .../amanda/aplicar-resposta-pergunta` (responde de
  verdade no ML via `mlResponderPergunta` — mesmo padrão do hub
  `app/api/seller/gestores-ia/aplicar-resposta-pergunta`, sem a auditoria em
  `seller_ai_acoes`, que é tabela só do hub).
- Cron `app/api/cron/gestores-ia-avulso-amanda/route.ts` (síncrono, itera assinantes, mesmo
  padrão do cron do Andrey antes do batch) — schedule em
  `web/scripts/add-cron-gestores-ia-avulso-amanda.sql` (`15 8 * * *`, não competir com os
  outros crons de gestores), **ainda não aplicado** (aguardando aprovação, é infra).
- **Termômetro previsto de reputação (2026-10-16)** — item do doc externo "13 Gestores de IA
  pra ML" absorvido (ver [[project_doc_13_gestores_absorcao_avulso]]). A API do ML só devolve
  reputação agregada por conta inteira (sem mediação separada, sem SKU, sem limite de cor) —
  por isso o que entrou foi só o que tem dado real: `calcularTendenciaReputacaoAvulso`
  (`gestorReputacaoAtendimentoDadosAvulso.ts`) extrapola linearmente (mínimos quadrados) as 3
  taxas a partir do histórico de rodadas já salvo em `calculadora_assinante_ai_runs` (RPC
  genérica `fn_gestores_ia_avulso_ai_runs_recentes` com `p_limit=30`, zero banco novo, zero
  chamada nova à API do ML), projetando 7/30 dias. `null` com menos de 2 rodadas com resultado
  válido — nunca inventa número. Campo novo e opcional `tendencia?` em
  `ResultadoReputacaoAtendimentoEnriquecido` (`gestorReputacaoAtendimentoDados.ts`, tipo
  compartilhado com o hub) — hub nunca preenche, não afetado. Exibido em
  `SellerGestorReputacaoAtendimentoPanel.tsx` como linha de texto simples (sem caixa), igual o
  SKILL `dropcore-gestores-ia` pede pra sinal secundário. **Ficou de fora de propósito**:
  ranking de SKU que mais prejudica reputação e "quantos eventos faltam pra sair do verde" —
  exigiriam API do ML não testada / hardcodar limite de cor que não vem da API.
- Tela `app/seller/gestores-ia-avulso/amanda/page.tsx` — reaproveita `SellerGestorRunShell`
  (mesmo componente do Andrey/hub) e os mesmos badges/cards do painel do hub
  (`SellerGestorReputacaoAtendimentoPanel.tsx`), sem o bloco de fornecedor-atraso e sem
  `DisputasParaFoto` (feature de disputa com foto depende de `seller_ai_disputas_fornecedor`,
  tabela do hub). Portal (`/seller/gestores-ia-avulso`) ganhou o card de link + status real no
  escritório 3D (`statusAmanda`), substituindo o placeholder "Em breve".
- **Gate de maturidade/aplicar automático não existe** — mesma régua do Andrey, só sugestão;
  o assinante revisa (pode editar o texto) e confirma antes de enviar pro comprador de
  verdade.

**Cron diário do Andrey avulso (2026-10-07, `web/scripts/add-cron-gestores-ia-avulso-andrey.sql`)**:
antes dessa data o diagnóstico principal do Andrey avulso só rodava via clique manual
("Rodar de novo agora") — nenhum cron cobria `calculadora_assinantes` (os crons
`gestores-ia-submeter`/`gestores-ia-resultado` existentes são só do hub, filtrados "por
seller"). Job `gestores-ia-avulso-andrey` (`cron.schedule`, `0 8 * * *` = 05:00 BRT) chama
`/api/cron/gestores-ia-avulso-andrey`. **Substituído no mesmo dia pelo caminho em batch** —
ver seção seguinte; o botão manual continua usando `rodarAndreyAvulsoParaAssinante` direto.

### Batch API (desconto 50%) no cron do Andrey avulso, inclusive BYOK — 2026-10-07

Bug achado pelo Sr Stark testando o botão "Rodar de novo agora": `foraDoCooldownAndreyAvulso`
(cooldown de 6h) não pulava as linhas de "Ideias pra anúncio novo" (`resultado.tipo ===
"ideias_produto_novo"`, grava no mesmo `gestor: "anuncios_seo"` só pra contar orçamento) —
testar essa feature bloqueava o botão do diagnóstico de verdade mesmo sem nenhuma rodada real
ter rodado ("ainda não processamos sua loja" + "aguarde pra rodar de novo" ao mesmo tempo).
Corrigido em `lib/ai/gestorAvulsoAndreyRodar.ts` (`foraDoCooldownAndreyAvulso`, extraída da
função de rodar, reaproveitada pelo batch submit também).

Investigando o custo (~R$0,59/rodada no caminho síncrono vs. ~R$0,27/rodada do hub via
Batch API), achado que **o cron do Andrey avulso nunca usou Batch API** — só o botão manual
precisa de resposta síncrona, mas o cron (que ninguém está esperando na tela) também rodava
síncrono, pagando preço cheio à toa. Corrigido:

- `calculadora_assinante_ai_runs` ganhou `batch_id text`
  (`web/scripts/add-batch-id-calculadora-assinante-ai-runs.sql`, aplicada).
- `lib/ai/gestorAnunciosSeoDadosAvulso.ts` ganhou `montarRequestAnunciosSeoAvulso` (monta os
  params da Anthropic, mesmo formato do `montarRequestAnunciosSeo` do hub).
- `lib/ai/gestorAvulsoBatchSubmit.ts` (cron A) — assinante **com a chave da casa**: entra
  num batch único (`client.messages.batches.create`), grava `status: "pendente"` +
  `batch_id`. Assinante **BYOK**: ganha os 50% também, só que num **batch próprio** (1
  request, criado com a `Anthropic` client da chave dele) — Batch API é por client/chave, não
  dá pra misturar a chave da casa com a de um assinante na mesma submissão.
- `lib/ai/gestorAvulsoBatchResultado.ts` (cron B) — confere os `batch_id` pendentes; resolve
  por `assinante_id` se o batch é da casa ou de uma chave BYOK (consulta
  `calculadora_assinantes.anthropic_api_key_encriptada`) e usa o client certo pra
  `retrieve`/`results` (a Anthropic só deixa ler um batch com a mesma chave que criou).
  BYOK não grava `tokens_input`/`tokens_output` (mesmo princípio do caminho síncrono).
- `app/api/cron/gestores-ia-avulso-andrey/route.ts` agora só chama `submeterAndreyAvulsoDiario`
  (não lê resultado). Rota nova `app/api/cron/gestores-ia-avulso-andrey-resultado/route.ts`
  chama `processarAndreyAvulsoBatchesPendentes` — cron novo
  (`gestores-ia-avulso-andrey-resultado`, `*/15 * * * *`,
  `web/scripts/add-cron-gestores-ia-avulso-andrey-resultado.sql`, aplicada), mesmo padrão do
  cron B do hub (`dropcore-gestores-ia-resultado`).

**Conexão BYOK agora funciona de ponta a ponta (2026-10-07)**: antes só existia a coluna
(`anthropic_api_key_encriptada`) e a leitura — nenhuma tela deixava o assinante cadastrar a
própria chave. `app/api/gestores-ia-avulso/byok/route.ts` (GET status / POST salva / DELETE
remove) — no POST, a chave é **testada de verdade** (1 chamada mínima, `max_tokens: 1`) antes
de criptografar (`encryptCalculadoraAssinanteSecret`) e gravar, pra nunca salvar chave
inválida/revogada em silêncio. Card novo em
`app/seller/gestores-ia-avulso/integracoes/page.tsx` (input + salvar/remover). Nunca devolve
a chave em texto puro pro front, nem na GET.

**Andrey construído 2026-10-06** — `lib/ai/gestorAnunciosSeoDadosAvulso.ts` (dado via API do
ML, mesma lógica de julgamento do hub, `tabelaMedidasFaltando` sempre `false` por não ter
`produto_tabela_medidas`), rota síncrona `app/api/gestores-ia-avulso/andrey/rodar` (cooldown
6h, sem Batch API), tela `/seller/gestores-ia-avulso/andrey`. V1 é só diagnóstico — sem botão
de aplicar título/descrição/característica direto no Mercado Livre (assinante copia e cola
manual), fora de escopo por enquanto.

### Conexão Mercado Livre do assinante avulso — construído 2026-10-05, app próprio

**App do Mercado Livre PRÓPRIO do avulso, não reaproveita o app do hub** (decisão explícita
de segurança 2026-10-05: vazamento/abuso de um não afeta o outro, rate limit separado,
escopo mínimo — esse app só pede leitura, o do hub tem leitura e escrita). Credenciais em
`GESTORES_IA_AVULSO_MERCADOLIVRE_CLIENT_ID`/`GESTORES_IA_AVULSO_MERCADOLIVRE_CLIENT_SECRET`
(ainda não configuradas no ambiente — aguardando o Sr Stark cadastrar o app no DevCenter).
`redirect_uri` fixo: `/seller/gestores-ia-avulso/conectar-ml`.

- `lib/mercadoLivreOAuthAvulso.ts` — cópia isolada de `mercadoLivreOAuth.ts` (não reaproveita
  o arquivo do hub, mesmo princípio de isolamento), só muda as env vars e o redirect_uri.
- `lib/calculadoraAssinanteSecretBox.ts` — criptografia AES-256-GCM do token ML (e, no
  futuro, da chave BYOK Anthropic) do assinante avulso, com chave de ambiente PRÓPRIA
  (`CALCULADORA_ASSINANTE_CREDENTIALS_KEY`, ainda não configurada) — nunca reaproveita
  `SELLER_ERP_CREDENTIALS_KEY` do hub, nem a chave de criptografia é compartilhada.
- `lib/calculadoraAssinanteSessionAuth.ts` (`getAssinanteFromToken`) — mesmo padrão de
  `sellerSessionAuth.ts`, mas pra `calculadora_assinantes`.
- `lib/mercadoLivreAvulsoToken.ts` (`getValidMercadoLivreAvulsoAccessToken`) — getter com
  renovação automática, espelho de `getValidMercadoLivreAccessToken` do hub, lendo/gravando
  só em `calculadora_assinante_mercadolivre_integrations`.
- Rotas: `GET/POST /api/gestores-ia-avulso/mercadolivre/connect|oauth`,
  `GET/DELETE /api/gestores-ia-avulso/mercadolivre` — espelho das rotas do hub
  (`/api/seller/mercadolivre/*`), sempre na tabela do avulso.
- `app/seller/gestores-ia-avulso/conectar-ml/page.tsx` — página de callback do OAuth (o
  `redirect_uri` em si), troca o `code` e volta pro portal.
- Portal (`/seller/gestores-ia-avulso`) já mostra o card real de "Conectar Mercado Livre" /
  "Conectado, conta #id" + desconectar, no lugar do placeholder estático.

**Bloqueado até o Sr Stark cadastrar o app no DevCenter e configurar as 2 env vars
novas** (`GESTORES_IA_AVULSO_MERCADOLIVRE_CLIENT_ID/SECRET`) **+ uma 3ª
(`CALCULADORA_ASSINANTE_CREDENTIALS_KEY`, qualquer string aleatória longa, igual o padrão da
`SELLER_ERP_CREDENTIALS_KEY` do hub)** — sem isso o botão "Conectar" quebra com erro 503.
Próximo passo real depois disso: o Andrey em si (lógica de análise, reaproveitando o prompt
`PROMPT_ANUNCIOS_SEO`/`SCHEMA_ANUNCIOS_SEO` de `gestorAnunciosSeoDados.ts` — mesmo
"julgamento", só a busca de dado muda pra ir direto na API do ML sem nenhuma tabela do hub).

### Login/portal/convite — construído 2026-10-04

**Login próprio, separado do da Calculadora** (decisão explícita: "não vamos usar o
calculadora vamos criar GESTORES IA", mas mantendo a marca "DropCore" no cabeçalho, igual
ao resto do sistema — confirmado visualmente):
- `app/gestores-ia/login/page.tsx` — mesma lógica de auth de `app/calculadora/login/page.tsx`
  (mesmo Supabase Auth, mesma checagem via `/api/calculadora/me`), só muda o título
  ("Gestores de IA") e o destino pós-login (`/seller/gestores-ia-avulso`, não
  `/seller/calculadora`). A `/calculadora/login` original continua 100% intocada.
- `app/seller/gestores-ia-avulso/page.tsx` — portal do assinante do pacote. Hoje só
  placeholder ("em construção") — nenhum gestor real ainda. Se `inclui_gestores_ia=false`
  (assinante só da calculadora tentando entrar aqui), mostra aviso em vez do conteúdo.
- `SellerNav.tsx` (`calcOnly` + novo prop `temGestoresIa`) ganhou a aba "Gestor de IA" ao
  lado de "Calculadora" — reaproveita o mesmo nav mínimo que a calculadora avulsa já usava,
  só acrescenta o link quando o assinante tem o pacote.
- `middleware.ts`/`lib/portalPublicPaths.ts`: `/seller/gestores-ia-avulso` e
  `/gestores-ia/login` seguem o mesmo padrão de exceção que `/seller/calculadora` e
  `/calculadora/login` já tinham (controlado por `/api/calculadora/me`, não por cookie de
  sessão no middleware).
- `GET /api/calculadora/me` agora devolve `inclui_gestores_ia` também no `access: "calc_only"`.

**Convite com o pacote completo, pelo admin — página PRÓPRIA, não dentro da calculadora:**
`calculadora_invites` ganhou `inclui_gestores_ia boolean` (migration
`calculadora_invites_inclui_gestores_ia`, 2026-10-04). Primeira versão colocou um checkbox
dentro de `/admin/calculadora-convites` — Sr Stark pediu pra tirar de lá ("não quero que
fique dentro de calculadora-convites, tem que ter uma própria"). Corrigido:
`/admin/gestores-ia-convites` é uma página nova e separada (sempre manda
`inclui_gestores_ia: true`, sem checkbox) — `/admin/calculadora-convites` voltou a ser só
calculadora, sem nenhuma referência ao pacote. `GET /api/org/calculadora/assinantes` ganhou
`?inclui_gestores_ia=true` pra cada página listar só os assinantes dela. O cadastro via
convite grava em `calculadora_assinantes.inclui_gestores_ia` (nunca desliga se a conta já
tinha — só liga) e redireciona pro portal certo (`/seller/gestores-ia-avulso` vs
`/seller/calculadora`) conforme o pacote.

### Tiago Silva avulso (Gestor Mestre/chat) construído — 2026-10-07, 4º gestor avulso

Mesmo princípio dos outros: lógica compartilhada com o hub, dado isolado. Chat com streaming
NDJSON (mesmo padrão de `app/api/seller/gestores-ia/tiago/chat/route.ts`), tool-calling que só
lê `calculadora_assinante_ai_runs` (nunca dispara rodada nova).

- `calculadora_assinante_ai_chat_sessions`/`calculadora_assinante_ai_chat_mensagens` — deny-
  all, nascem já em RPC (`fn_gestores_ia_avulso_ai_chat_historico/criar_sessao/
  gravar_mensagem`, `revoke all` + `grant` só pra `service_role`, mesmo padrão do hub e das
  RPC do Ulisses).
- `lib/ai/gestorTiagoChatToolsAvulso.ts` — reaproveita `resumirResultado`/
  `criarOrcamentoResultadoChat` do hub (`gestorTiagoChatTools.ts`, que ganhou `export` em
  `resumirResultado`), só troca a busca de dado (`calculadora_assinante_ai_runs`) e a lista de
  gestores.
- `lib/ai/gestorTiagoChatPromptAvulso.ts` — system prompt adaptado (sem menção a
  hub/org/fornecedor).

**Resumo diário de 3 ações (2026-10-16) — último item do roadmap de absorção do doc dos 13
gestores de ML.** Formato padrão de proposta do doc (Gestor/SKU/Ação/Motivo/Severidade/
Confiança/Esforço), adaptado ao que os 4 gestores avulso realmente expõem — "impacto em R$"
não é comparável entre eles (só o ADS tem margem real; Estoque e Anúncio só têm severidade de
risco/gap), então a pontuação usa severidade (0-3, da escala de risco que cada gestor já
calcula) em vez de inventar valor monetário universal.

- **Bug achado e corrigido no caminho**: `GESTORES_CONSULTAVEIS_AVULSO`
  (`gestorTiagoChatToolsAvulso.ts`) e o roster "Sua equipe" do prompt nunca tinham ganhado o
  Estoque, apesar dele já estar em produção desde 2026-10-15/16 — o comentário antigo dizia
  "avulso não tem esse gestor" (verdade só até o Estoque avulso existir). Corrigido: Tiago
  agora consulta os 4 (Andrey/Amanda/Ulisses/Estoque).
- `lib/ai/gestorTiagoResumoDiarioAvulso.ts` (novo) — lê a última rodada dos 4 gestores via
  `fn_gestores_ia_avulso_ai_runs_recentes` (zero banco novo), extrai candidatos a proposta
  de cada um (Estoque: SKU com risco alto/médio; ADS: margem abaixo do mínimo; Anúncio:
  diagnóstico com problema, cruzado com pergunta/reclamação já existentes; SAC: pergunta
  pendente + diagnóstico crítico da conta), pontua por `severidade × confiança ÷ esforço` e
  devolve as 3 maiores. Esforço é escala fixa documentada no código (1 = já existe botão de 1
  clique no painel pra resolver — pausar anúncio, aplicar promoção, responder pergunta,
  aplicar título/descrição; 2 = exige decisão manual fora de botão existente; 3 = depende de
  dado externo). Confiança reaproveita sinal que cada gestor já calcula (`piorou_desde_ontem`,
  tendência do SAC, resposta já rascunhada pela IA) — nunca percentual inventado.
- Tool nova `resumo_diario_acoes` em `gestorTiagoChatToolsAvulso.ts` — chat usa quando o
  assinante pergunta "como está hoje"/"resumo do dia", avisando quando algum gestor ainda não
  rodou (`gestores_sem_rodada`).
- `GET /api/gestores-ia-avulso/tiago/resumo-diario` (novo) — mesma função, servindo um card no
  painel do Tiago (`app/seller/gestores-ia-avulso/tiago/page.tsx`) sem precisar perguntar no
  chat; cada ação linka direto pra tela do gestor responsável (nunca executa nada ali — regra
  3 do prompt do Tiago, só o assinante clica).
- **Achado importante de orçamento, corrigido antes de implementar**: o pote diário
  compartilhado do avulso (`gastoAvulsoHojeReais`) sempre assumia preço **Sonnet 5** — mas o
  chat do Tiago usa **Haiku 4.5** (igual o hub, 2026-09-30, ~2-3x mais barato). Gravar tokens
  do chat na mesma tabela que Andrey/Amanda teria cobrado errado do orçamento. Corrigido
  separando as duas fontes dentro de `gestorAvulsoOrcamento.ts` (mesma arquitetura do hub:
  `gastoHojeReais` = `gastoChatHojeReais` + `gastoGestoresHojeReais`):
  - `gastoGestoresAvulsoHojeReais` (nova, renomeada da função antiga) — Sonnet, lê
    `calculadora_assinante_ai_runs`.
  - `gastoChatAvulsoHojeReais` (nova) — Haiku, lê `calculadora_assinante_ai_chat_mensagens`.
  - `gastoAvulsoHojeReais` (assinatura pública mantida) — soma os dois. Andrey/Amanda/Ulisses
    não precisaram de nenhuma mudança de código, continuam chamando a mesma função.
- **Sem reserva-e-concilia atômica** (diferente do hub, que usa lock de linha em `sellers` pra
  evitar corrida de 2 mensagens simultâneas) — avulso faz checagem simples antes de chamar
  (`temOrcamentoDisponivelHoje`), mesmo padrão síncrono do Andrey/Amanda/Ulisses avulso. Risco
  de corrida aceito conscientemente (produto de baixo tráfego, 1 assinante por vez numa janela
  de chat, mesmo risco que já existe nos outros 3 gestores).
- BYOK funciona igual aos outros — chave própria não grava tokens (não é custo do DropCore).
- Rotas: `GET /api/gestores-ia-avulso/tiago/historico`, `POST .../nova-sessao`, `POST .../chat`
  (streaming). Tela `/seller/gestores-ia-avulso/tiago` — mesmo layout do painel do hub
  (`SellerGestorTiagoChatPanel.tsx`), sem o modal de compra de crédito extra via PIX (ainda não
  existe pro avulso). Portal ganhou o card de link; sem slot na maquete 3D (Tiago não é um
  "bonequinho" de mesa, o componente só visualiza Diogo/Andrey/Amanda/Ulisses).

### Desconectar ML avulso agora revoga de verdade no Mercado Livre — 2026-10-08

**Achado real construindo o frete do Ulisses**: mudar permissão de um app no DevCenter
**não expande** o consentimento que um usuário já deu antes — reconectar sem revogar
primeiro reaproveita o grant antigo, com o escopo velho (confirmado ao vivo: trocamos
"Venda e envios" pra Leitura no DevCenter, reconectamos, e `GET /users/{id}/applications`
continuava sem `urn:ml:mktp:orders-shipments` até revogar de propósito). Doc oficial
confirma `DELETE https://api.mercadolibre.com/users/{user_id}/applications/{app_id}`
(usando o access token do próprio usuário) pra revogar programaticamente.

`app/api/gestores-ia-avulso/mercadolivre/route.ts` (`DELETE`) agora chama esse endpoint
**antes** de apagar a linha local — best-effort (se falhar, desconecta local mesmo assim).
Resultado: o assinante nunca mais precisa ir manualmente nas configurações da própria conta
do Mercado Livre pra "resetar" a autorização — Desconectar + Conectar aqui dentro já basta,
mesmo depois de expandir permissão no DevCenter. Vale considerar o mesmo fix pro ML do hub
(`app/api/seller/mercadolivre`) se o mesmo problema aparecer lá — não aplicado ainda, fora
de escopo dessa sessão (só mexemos no avulso).

**Com isso, os 4 gestores avulso planejados estão completos** (Andrey, Amanda, Ulisses, Tiago
Silva) — Diogo segue de fora por decisão de escopo (depende de estoque interno que o avulso
não tem). Próximas pendências reais: descartar rascunho de teste na conta Djulios, replicar
"Ideias pra anúncio novo" pro hub, fluxo de crédito extra via PIX pro avulso.

## `fn_pedido_cancelar_estorno_ml` — cancelamento no ML sem sync (achado 2026-10-09)

**Achado real** (seller Vinz Collection, pedido `91b6f93b-3992-4e51-a666-16dd16c17ac2`): o
ML cancela a venda quando a nota fiscal não é emitida a tempo (etiqueta nunca liberada), mas
o DropCore nunca ficava sabendo — o pedido travava em `status = "enviado"` pra sempre e o
`financial_ledger` continuava `BLOQUEADO`, sem estornar o saldo do seller nem avisar ele.

**Causa raiz:** o webhook do ML só assinava `questions`/`claims`; o tópico de pedido era
ignorado de propósito, e não existia nenhum reconciliador que casasse "pedido cancelado no
ML" com "pedido já importado como venda real" — o único mecanismo de estorno existente
(`PATCH /api/org/financial/ledger/[id]`, EM_DEVOLUCAO→DEVOLVIDO) é pra devolução física de
produto, não pra "nunca chegou a ser postado".

**Correção (abordagem híbrida):**
1. Webhook `app/api/webhooks/mercadolivre/route.ts` passou a assinar também o tópico
   `orders_v2` (registrar no DevCenter: aba Tópicos → marcar também "Pedidos"). Ao notificar,
   rebusca o status real do pedido na API do ML (nunca confia no payload) e, se
   `status: "cancelled"`, aciona a reconciliação.
2. `web/lib/etiquetaMlRetry.ts` (cron de retry de etiqueta) ganhou uma rede de segurança: a
   cada tentativa sem etiqueta, confere o status real do pedido no ML antes de só contar mais
   uma tentativa — se já cancelado, reconcilia em vez de alertar "etiqueta pendente".
3. `web/lib/cancelamentoMlReconciliacao.ts` orquestra os dois gatilhos: acha o pedido pelo
   `marketplace_numero` + `seller_id`, confirma o cancelamento na API do ML, chama a RPC.

**RPC nova** (`web/scripts/fn-pedido-cancelar-estorno-ml.sql`), regra 9 do CLAUDE.md:
```sql
fn_pedido_cancelar_estorno_ml(p_pedido_id uuid, p_org_id uuid)
  RETURNS TABLE(ok boolean, already_cancelled boolean, seller_id uuid, valor_estornado numeric)
```
- `SECURITY DEFINER`, `SET search_path = public`; `revoke all from public` + `grant execute
  to service_role` (nunca `authenticated` — só chamada por `supabaseAdmin.rpc(...)` depois do
  TS já ter confirmado o cancelamento de verdade na API do ML).
- Idempotente: trava o pedido (`FOR UPDATE`) e só age se `status = 'enviado'` e
  `canal_venda = 'mercado_livre'`; senão retorna `already_cancelled = true` sem tocar em nada
  (webhook e cron podem concorrer na mesma rodada).
- `pedidos.status = 'cancelado'`; `financial_ledger.status = 'CANCELADO'` nas linhas
  `tipo IN ('BLOQUEIO','VENDA')` com `status = 'BLOQUEADO'` desse pedido.
- **Não insere linha nova tipo `DEVOLUCAO`** — `CANCELADO` já existe no enum
  `financial_ledger_status` desde `financial-module-v2.sql` e `fn_seller_saldo_from_ledger`
  já exclui esse status tanto do saldo bloqueado quanto do pago, então só mudar o status já
  libera o saldo. O trigger `tr_financial_ledger_sync_seller` (mesmo arquivo) já resincroniza
  `sellers.saldo_atual`/`saldo_bloqueado` sozinho em qualquer `UPDATE` no ledger — nenhuma
  função de saldo precisou mudar.

**Escopo deliberadamente restrito:** só aciona o estorno automático quando o pedido ainda
está intacto do lado DropCore (`status = 'enviado'`, ledger ainda `BLOQUEADO`, nunca chegou a
`ENTREGUE`/`AGUARDANDO_REPASSE`). Cancelamento do ML depois de já `ENTREGUE` é mais raro e
mais delicado (fornecedor pode já ter trabalhado) — fica de fora do automático, cai pro fluxo
manual de devolução que já existe.

**Correção aplicada em produção** (`web/scripts/fix-fn-pedido-cancelar-estorno-ml-ambiguidade-e-motivo.sql`
— não reescreveu o script original, regra de migrations do CLAUDE.md): a 1ª versão dava
`column reference "seller_id" is ambiguous` (`SELECT id, seller_id, status, canal_venda` sem
alias colidia com a coluna de saída `seller_id` do `RETURNS TABLE`) — corrigido qualificando
com `p.` antes das colunas da tabela.

**`pedidos.cancelado_motivo`** (mesma correção, achado 2026-10-09): a tela de Pedidos mostrava
"Cancelado" genérico igual a qualquer outro cancelamento (admin manual, erro de saldo) — Sr
Stark pediu mais ênfase visual e que admin/fornecedor também vissem, não só o seller. Coluna
`text` com `CHECK (... IN ('ml_sem_sync'))`, só preenchida por `fn_pedido_cancelar_estorno_ml`
(`null` em todo outro cancelamento). Nas 3 telas de pedidos (`fornecedor`, `seller`, `admin`):
badge "Cancelado" passou de cinza neutro pra vermelho (`bg-red-100 text-red-800
dark:bg-red-950/40 dark:text-red-300`, mesma família de `bloqueado`/`erro_saldo`); fornecedor
e seller ganharam um banner vermelho no card explicando o cancelamento (mesmo padrão visual
do banner "Sem etiqueta" já existente); admin (tela em tabela, sem espaço pra banner) mostra
label "Cancelado (ML)" + tooltip (`title`) com o texto completo.

Três avisos disparados (todos em `web/lib/cancelamentoMlReconciliacao.ts`, best-effort em
paralelo): `notifySellerPedidoAtencao` (tipo `pedido_cancelado_ml`, com o valor estornado),
`notifyAdminsPedidoCanceladoMl` (novo arquivo, owners/admins da org, mesmo padrão de
`notifyAdminsEtiquetaMlFalha`) e `notifyFornecedorPedidoCanceladoMl` (novo arquivo, mesmo
padrão de `notifyFornecedorPedidoParaPostar`, nunca menciona valor — é só aviso de status).

## `fn_pedido_cancelar_estorno` — generalização ML → Olist/Bling (2026-10-12)

**Achado:** o mesmo buraco do achado 2026-10-09 (acima) existia igual no Olist e no Bling —
cada canal pode cancelar um pedido depois de já importado/postado no DropCore, e o hub nunca
ficava sabendo (pedido travado em `enviado`, ledger travado `BLOQUEADO` pra sempre). A RPC e
os `notify*` helpers eram hardcoded pro ML (`canal_venda = 'mercado_livre'`, nome de arquivo
`...Ml.ts`); generalizados em vez de duplicados por canal.

**RPC** `fn_pedido_cancelar_estorno_ml(uuid,uuid)` → `fn_pedido_cancelar_estorno(p_pedido_id
uuid, p_org_id uuid, p_motivo text)` (`web/scripts/generalize-fn-pedido-cancelar-estorno.sql`,
drop+create por mudança de assinatura): removida a restrição `canal_venda = 'mercado_livre'`
(só confere `status = 'enviado'`, válido pra qualquer canal); `p_motivo` passou a ser
parâmetro em vez de fixo `'ml_sem_sync'`. Mesmas garantias de antes (`SECURITY DEFINER`,
`revoke all from public` + `grant execute to service_role`, idempotente via `FOR UPDATE`).

**Core de execução compartilhado:** `web/lib/pedidoCancelarEstorno.ts` (`cancelarPedidoEEstornar`)
— chama a RPC e dispara os 3 avisos (seller/admin/fornecedor). Cada canal só implementa a
parte de **detectar** o cancelamento e chama essa função compartilhada:
- ML: `web/lib/cancelamentoMlReconciliacao.ts` (rebusca status real na API do ML).
- Olist: `web/lib/sellerOlistPedidoImport.ts`, branch `isSituacaoTextoCancelada` — além de
  liberar a reserva de estoque já existente, agora busca `pedidos` com `referencia_externa`
  igual + `status = 'enviado'` e estorna se achar.
- Bling: `web/lib/sellerBlingPedidoImport.ts`, `is_delete_event` — `aguardando_repasse`/
  `entregue`/`devolvido` continuam manual-only (sem ledger a liberar ou já liquidado);
  `enviado` agora estorna via RPC; status anteriores a `enviado` (`bloqueado`,
  `pendente_estoque` etc.) seguem com cancelamento simples **sem** estorno — confirmado em
  `submitSellerErpPedido.ts` que `executeBlockSale` (quem cria a linha `BLOQUEADO` no ledger)
  só roda na promoção pra `enviado`, nunca antes, então não há saldo bloqueado a liberar
  nesses status iniciais.

`notifyAdminsPedidoCanceladoMl`/`notifyFornecedorPedidoCanceladoMl` → `notifyAdminsPedidoCancelado`/
`notifyFornecedorPedidoCancelado` (arquivos renomeados, ganharam `canal_label: string` em vez
de texto fixo "Mercado Livre"). `notifySellerPedidoAtencao` ganhou o tipo genérico
`pedido_cancelado_erp` (mantém `pedido_cancelado_ml` pra granularidade de quem já filtra por
esse tipo).

**Constraint corrigida no mesmo achado** (`web/scripts/allow-olist-bling-cancelado-motivo.sql`):
`pedidos_cancelado_motivo_check` só permitia `'ml_sem_sync'` — sem ajustar, qualquer
cancelamento via Olist/Bling batia na constraint, a RPC dava erro, e `cancelarPedidoEEstornar`
engolia o erro no catch e retornava `cancelado: false` sem avisar ninguém (falha silenciosa
descoberta antes do deploy). Ampliada pra `IN ('ml_sem_sync', 'olist_sem_sync', 'bling_sem_sync')`.

## `fn_org_repasse_fornecedor_desfazer_pago` — desfazer "marcar como pago" (2026-10-12)

**Achado:** `/admin/a-pagar-fornecedores` tinha "Marcar como pago" sem nenhuma confirmação e
sem forma de reverter se o admin clicasse na linha errada. RPC nova
(`web/scripts/add-fn-org-repasse-fornecedor-desfazer-pago.sql`): só sai de `status = 'pago'`
pra `'pendente'` (limpa `pago_em`), nunca mexe em outro status — `SECURITY DEFINER`,
`revoke all from public` + `grant execute to service_role`. Chamada por
`web/app/api/org/financial/repasse-fornecedor/[id]/desfazer-pago/route.ts`. UI: modal de
confirmação (`ModalOverlay`) antes de marcar pago + botão "Desfazer" novo em
`web/app/admin/a-pagar-fornecedores/page.tsx`.

## `ux_skus_org_sku` + `financial_mensalidades.cobranca_pix_iniciada_em` — race conditions do fornecedor (2026-10-13)

**Achado** (auditoria de lógica de backend das rotas `/api/fornecedor/*`): três rotas de
criação de SKU (`produtos/route.ts`, `produtos/multivariante/route.ts`,
`produtos/grupo-adicionar-variantes/route.ts`) geravam o próximo código de SKU lendo o
máximo existente e só depois inserindo, sem lock — duplo clique (ou duas abas) podia criar
dois SKUs com o mesmo código no mesmo `org_id`. Corrigido com
`CREATE UNIQUE INDEX ux_skus_org_sku ON skus (org_id, sku)` (`web/scripts/fix-race-sku-duplicado-e-pix-mensalidade-duplicado.sql`,
sem conflito — confirmado 0 duplicatas nas 272 linhas existentes antes de aplicar); as 3
rotas agora capturam `error.code === "23505"` e devolvem 409 com mensagem amigável em vez
do erro cru do Postgres.

Mesma auditoria achou `POST /api/fornecedor/mensalidades/[id]/cobranca-pix` sem claim
atômico — duplo clique gerava duas cobranças PIX reais (Mercado Pago) pra mesma
mensalidade. Corrigido com coluna nova `financial_mensalidades.cobranca_pix_iniciada_em`
(timestamptz, nullable) + update condicional (`is null OR < now() - 2 min`) antes de
chamar o Mercado Pago — janela de 2 min cobre tentativa abandonada sem travar reemissão
legítima depois que o PIX expira. Mesmo padrão dos processors de depósito PIX corrigidos
na Fase 2 da varredura (`depositoPixProcessor.ts`), adaptado pra claim de criação (não de
confirmação de pagamento).

Também achado e corrigido na mesma auditoria (sem precisar de banco):
`grupo-adicionar-variantes/route.ts` copiava `estoque_atual` do SKU pai (que guarda a soma
de todos os filhos, não um valor por variante) pra cada variante nova — risco de oversell.
Agora a variante nova nasce com `estoque_atual: 0` (ainda não tem estoque próprio
registrado). E `promoverPedidoParaPostado` (`web/lib/pedidoPostadoPromote.ts`, compartilhado
por fornecedor/admin/checker automático) ganhou o mesmo tipo de claim — `.eq("status", "enviado")`
+ checar se a linha foi realmente afetada antes de seguir pro ledger/evento — pra corrida
entre clique manual e checker automático não duplicar evento de auditoria.

## `ux_seller_depositos_pix_singleton_pendente` + `cobranca_cartao_iniciada_em` — race conditions do seller (2026-10-14)

**Achado** (auditoria de lógica de backend das rotas `/api/seller/*`, mesma varredura que já
tinha corrigido Fornecedor e Admin): `plano/upgrade-pro-pix`, `plano/ativar-addon-gestores-ia-pix`
e `gestores-ia/tiago/credito-extra-pix` conferiam "já existe um PIX pendente desse tipo?" e só
depois inseriam — duplo clique podia passar pelos dois e gerar duas cobranças PIX reais do
mesmo tipo (`referencia` fixa) pro mesmo seller. Corrigido com
`CREATE UNIQUE INDEX ux_seller_depositos_pix_singleton_pendente ON seller_depositos_pix
(seller_id, referencia) WHERE status = 'pendente' AND referencia IN ('UPGRADE_PRO',
'ADDON_GESTORES_IA', 'CREDITO_CHAT_IA')` (`web/scripts/fix-race-seller-depositos-pix-singleton-pendente.sql`,
sem conflito — confirmado 0 duplicatas antes de aplicar, testado ao vivo que a 2ª tentativa
quebra com `23505`); as 3 rotas capturam o código e devolvem 409 amigável. **Não se aplica**
à recarga comum (`deposito-pix/route.ts`) — ali um seller pode legitimamente ter vários PIX
pendentes de valores diferentes ao mesmo tempo, então o índice não cobre esse caso; a
correção lá foi só em código (bloqueia repetição exata de seller+valor+método nos últimos 15s).

Mesma auditoria achou `depositoPixCobrancaResolve.ts` (cobrança por cartão de um depósito já
existente) sem claim atômico — duplo clique podia cobrar o cartão duas vezes pro mesmo
depósito. Corrigido com coluna nova `seller_depositos_pix.cobranca_cartao_iniciada_em`
(timestamptz, nullable) + update condicional (janela de 2 min), mesmo padrão já usado em
`financial_mensalidades.cobranca_pix_iniciada_em`. `mensalidadeCobrancaResolve.ts` (resolver
compartilhado seller+fornecedor de cobrança cartão/checkout) e
`/api/seller/mensalidades/[id]/cobranca-pix` ganharam o mesmo claim reaproveitando essa
coluna já existente (propósito igual, apesar do nome ser "pix").

Também corrigido na mesma passada, sem precisar de banco:
- **CSRF real no OAuth do Bling** (P0) — diferente do Mercado Livre, o DropCore não controla
  o início do fluxo (o seller autoriza inteiramente dentro do painel do Bling), então o
  padrão state+cookie do ML não serve aqui. Mitigação: `/api/seller/bling/oauth` não salva
  mais em silêncio — resolve a empresa (nome + ID) e devolve um `confirm_token` criptografado
  (`encryptSellerErpSecret`, mesma chave já usada pros tokens ERP); só
  `/api/seller/bling/oauth/confirmar` persiste, depois do seller confirmar vendo o nome da
  empresa. Token embute `seller_id` (confere contra quem está autenticado) + expiração de 10
  min; adulteração quebra o auth tag do AES-GCM (testado).
- **Guard-rail de margem ausente em `ulisses-aplicar-preco-seguro`** (item único) — as rotas
  irmãs (lote, promoção, lightning) recalculam o preço mínimo seguro no servidor antes de
  aplicar; essa não recalculava nada, confiava 100% no `preco_novo` do front. Alinhada ao
  mesmo padrão (sem caller no front hoje, mas a rota continua exposta/chamável).

## `calculadora_assinantes.logo_url` — logo do assinante avulso (2026-10-15)

Pedido do Sr Stark: Dashboard avulso (`/seller/gestores-ia-avulso/dashboard`) ganhou
cabeçalho no mesmo estilo do `/seller/dashboard` real (chip de logo/inicial + rótulo
"GESTOR DE IA" + título + data por extenso) e a conta avulsa (`calculadora_assinantes`, sem
`sellers` nem org) ganhou upload de logo própria em "Meus dados"
(`/seller/meus-dados`) — equivalente ao `sellers.logo_url` que o hub já tinha.

- `web/scripts/add-calculadora-assinante-logo.sql` — `alter table calculadora_assinantes add
  column logo_url text` + 2 funções novas, seguindo a regra 9 (endpoint novo = RPC, nunca
  `.from()`): `fn_calculadora_assinante_logo_get(p_assinante_id)` e
  `fn_calculadora_assinante_logo_set(p_assinante_id, p_logo_url)`, ambas `SECURITY DEFINER`,
  `revoke all from public` + `grant execute to service_role` (a rota já valida o dono via
  `getAssinanteFromToken` antes de chamar).
- `POST/DELETE /api/gestores-ia-avulso/logo` — mesmo padrão de `/api/seller/logo` (bucket
  público `produto-imagens`), path `calculadora-assinante/{assinante_id}/brand/logo.{ext}`
  (namespace próprio, nunca colide com `{seller_id}/brand/logo.{ext}` do hub).
- `GET /api/calculadora/me` (rota já existente, não é endpoint novo) passou a devolver
  `logo_url` — busca via a RPC `_get` **à parte** do `.from("calculadora_assinantes").select(...)`
  que já existia ali, e tolera a RPC ainda não existir (erro vira só `logo_url: null`, não
  quebra o bootstrap de acesso de toda conta avulsa enquanto o script acima não é aplicado em
  produção).

## `calculadora_assinantes` — dados comerciais opcionais (2026-10-15)

Mesmo pedido do Sr Stark, mesma sessão do logo acima: a tela "Meus dados" do avulso ganhou o
formulário inteiro de "Dados comerciais" que o `/seller/cadastro` do hub já tinha (razão
social/nome fantasia, CNPJ ou CPF com consulta na Receita, e-mail comercial, telefone, CEP
com autofill via ViaCEP, endereço, responsável opcional) — só que **opcional**, não bloqueia
nada (o hub trava o painel até o cadastro ficar completo; o avulso não).

- `web/scripts/add-calculadora-assinante-cadastro-comercial.sql` — 9 colunas novas em
  `calculadora_assinantes` (`nome`, `tipo_documento` default `'CNPJ'` com check
  `in ('CNPJ','CPF')`, `documento`, `email_comercial`, `telefone`, `cep`, `endereco`,
  `nome_responsavel`, `cpf_responsavel`, `data_nascimento`) + 2 funções RPC (regra 9):
  `fn_gestores_ia_avulso_cadastro_get(p_assinante_id)` (devolve a linha inteira) e
  `fn_gestores_ia_avulso_cadastro_upsert(p_assinante_id, p_nome, p_tipo_documento,
  p_documento, p_email_comercial, p_telefone, p_cep, p_endereco, p_nome_responsavel,
  p_cpf_responsavel, p_data_nascimento)` (sempre `update`, nunca `insert` — a linha já existe
  desde o registro da assinatura). Ambas `SECURITY DEFINER`, `revoke all from public` +
  `grant execute to service_role`.
- `GET/PATCH /api/gestores-ia-avulso/cadastro` — mesma validação do `/api/seller/cadastro`
  (reaproveita `normalizeSellerDocDigits`/`documentoSellerValido` de `lib/sellerDocumento.ts`,
  genéricas, não acopladas a `sellers`), chama as RPCs acima em vez de `.from()`.
- `GET /api/gestores-ia-avulso/cadastro/cnpj` — mesma consulta BrasilAPI/ReceitaWS do
  `/api/seller/cadastro/cnpj` (`consultarCnpjNaReceitaFederal`, chamada HTTP externa, exceção
  da regra 9), só troca a autenticação pra `getAssinanteFromToken`.
- `components/seller/GestorAvulsoDadosComerciaisForm.tsx` — mesmo form/UX do
  `/seller/cadastro` (máscara de CNPJ/CPF, "Validar na Receita" com checkbox de
  sobrescrever, autofill de endereço por CEP), sem o fluxo de onboarding obrigatório (sem
  `cadastro_pendente`, sem redirect de plano) — vive dentro de `/seller/meus-dados`, abaixo
  da seção de logo.

## Planos do pacote avulso "Gestores de IA" — autoatendimento via PIX (2026-10-15)

Até aqui o pacote (R$797,90/mês, inclui a Calculadora) só era ativado manualmente, por
convite do admin (`/admin/gestores-ia-convites`, grava `calculadora_invites.inclui_gestores_ia`
→ `calculadora_assinantes.inclui_gestores_ia` no cadastro). Pedido do Sr Stark: adicionar um
segundo caminho, **self-serve via PIX**, sem remover o convite (admin continua podendo
conceder/comp).

**Modelo final (corrigido no mesmo dia — a primeira versão cobrava R$7.979,00 à vista no
anual; Sr Stark corrigiu: nada de cartão parcelado nem PIX de valor cheio, só PIX mês a mês,
sempre R$797,90):**
- **Mensal** — paga uma parcela de R$797,90 por vez, sem compromisso, renova quando quiser.
- **Anual** — é um **compromisso de 12 parcelas mensais de R$797,90 via PIX** (mesmo valor do
  mensal, não um valor cheio à vista), com os primeiros 60 dias sem cobrança. Cobrança
  **manual** (o assinante entra e gera o PIX a cada mês, igual ao mensal — não existe
  cron/cobrança automática pra nenhum produto do DropCore hoje). Exige aceite explícito
  (checkbox) do compromisso antes de liberar.

### Schema
- `web/scripts/add-gestores-ia-avulso-planos.sql` (1ª migration) — 3 colunas em
  `calculadora_assinantes`: `gestores_ia_ciclo` (check `in ('mensal','anual')`),
  `mp_gestores_ia_pendente_id`, `mp_gestores_ia_ultimo_aprovado_id` (colunas próprias,
  separadas das de renovação da Calculadora, pra não colidir os dois produtos).
- `web/scripts/add-gestores-ia-avulso-contrato-anual.sql` (2ª migration, mesmo dia — corrige
  o modelo) — coluna `gestores_ia_contrato_aceite_em timestamptz` (registro de quando o
  compromisso de 12 parcelas foi aceito); `drop + recreate` de
  `fn_gestores_ia_avulso_pix_confirmar` **sem** o parâmetro `p_ciclo` (toda
  parcela paga é o mesmo valor/extensão de 1 mês, não importa o ciclo da conta — `gestores_ia_ciclo`
  só é setado por quem decide: `coalesce(gestores_ia_ciclo, 'mensal')` na própria confirmação,
  ou a RPC de início de contrato abaixo); nova RPC
  `fn_gestores_ia_avulso_contrato_anual_iniciar(p_user_id)` — sem PIX, libera
  o pacote na hora com `valido_ate = now() + 60 dias` (hardcoded na função, não confia em
  parâmetro do client), `gestores_ia_ciclo = 'anual'`, grava `gestores_ia_contrato_aceite_em`.
- Todas as RPCs (regra 9): `SECURITY DEFINER`, `revoke all from public` + `grant execute to
  service_role`. Inventário completo:
  - `fn_gestores_ia_avulso_pix_pendente_set(p_user_id, p_mp_pendente_id)` —
    upsert por `user_id` (já é `unique`), grava o pagamento pendente antes de mostrar o QR.
  - `fn_gestores_ia_avulso_pix_get(p_user_id)` — leitura mínima usada pelo
    processor (idempotência + base pra estender `valido_ate`) e pela rota de sync.
  - `fn_gestores_ia_avulso_pix_confirmar(p_user_id, p_novo_valido_ate,
    p_mp_payment_id, p_external_reference, p_valor_pago, p_pago_em)` — ativa/renova o pacote +
    grava `calculadora_recebimentos` num único `plpgsql` atômico; idempotente comparando
    `mp_gestores_ia_ultimo_aprovado_id` com o `mp_payment_id` recebido.
  - `fn_gestores_ia_avulso_contrato_anual_iniciar(p_user_id)` — início do
    contrato anual, sem PIX (ver acima).

### Código
- `web/lib/gestoresIaAvulsoPlanos.ts` — `VALOR_GESTORES_IA_AVULSO_MENSAL` (797,90, único
  preço real), `GESTORES_IA_AVULSO_CONTRATO_ANUAL_PARCELAS` (12),
  `GESTORES_IA_AVULSO_CONTRATO_ANUAL_CARENCIA_DIAS` (60, só exibição — quem manda é o
  hardcoded na RPC), sem dependência de servidor.
- `web/lib/calculadoraRenovacaoValidoAte.ts` — `computeCalendarCycleValidoAte(curIso,
  paymentMs, meses)` genérico (meses civis); `computeCalculadoraRenovacaoValidoAte`
  (Calculadora) é um wrapper fino com `meses=1`, mesmo comportamento de antes.
- `web/lib/gestoresIaAvulsoPixProcessor.ts` — `external_reference` próprio, prefixo `giapix` +
  UUID compacto (32 hex) + nonce (8 hex) = 46 chars (sem ciclo embutido — toda parcela é o
  mesmo valor). `processarGestoresIaAvulsoPlanoPago(extRef, mpPaymentId)` busca o pagamento na
  API do MP (`fetch`, exceção da regra 9), confere `status=approved` + `external_reference`
  batendo + valor = `VALOR_GESTORES_IA_AVULSO_MENSAL`, estende 1 mês civil.
- `GET/POST /api/gestores-ia-avulso/planos` — GET devolve só `{mensal}`; POST (auth) gera a
  parcela via PIX, vale tanto pro mensal avulso quanto pra pagar uma parcela do contrato anual.
- `POST /api/gestores-ia-avulso/planos/contrato-anual` — inicia o contrato anual (RPC acima,
  sem PIX); o front só chama depois do assinante marcar o checkbox de aceite.
- `POST /api/gestores-ia-avulso/planos/sync` — mesmo padrão de
  `/api/calculadora/renovacao-pix/sync` (poll direto no MP, fallback ao webhook em
  localhost).
- `app/api/webhooks/mercadopago/route.ts` — dispatch: `external_reference` começando com
  `giapix` → `processarGestoresIaAvulsoPlanoPago`.
- `app/api/calculadora/me/route.ts` — `GET` devolve `gestores_ia_ciclo` e
  `gestores_ia_contrato_aceite_em` também.
- `app/seller/gestores-ia-avulso/planos/page.tsx` — card "Mensal" (PIX direto, fluxo de
  QR/contagem/polling **replicado 1:1** de `/seller/calculadora`) + card "Anual" que, ao
  clicar "Assinar", abre um resumo do compromisso + checkbox de aceite antes de chamar
  `/contrato-anual` (sem QR nessa etapa — só libera o acesso). Quem já está no contrato anual
  vê status "Contrato ativo" no lugar do card e paga as parcelas seguintes pelo card
  "Mensal" (mesmo valor, mesmo endpoint). Lista todos os benefícios do pacote nos dois cards.
- `app/seller/gestores-ia-avulso/page.tsx` (tela "sem pacote"), `app/seller/meus-dados/page.tsx`
  (linha "Pacote") e `app/seller/SellerNav.tsx` (aba "Planos", rail desktop + menu "Mais" no
  mobile, reaproveitando `NavKey "plano"` e `IconPlano` já usados no hub) apontam pra
  `/seller/gestores-ia-avulso/planos`.
- **Não construído**: cobrança automática (cron que gera/cobra PIX sozinho todo mês — decisão
  explícita de manter manual), penalidade por quebra de contrato, proração ao trocar de ciclo
  no meio do período — nada disso foi pedido.

## Pedido fake fora das métricas reais + etiqueta recém-liberada priorizada no topo (2026-10-15)

Dois ajustes pedidos pelo Sr Stark na mesma sessão da investigação do pedido preso do Vinz
Collection (ver `web/lib/etiquetaMlRetry.ts`, teto de retry 50→500):

**1. Pedido de conta de teste (Segatto/Djulios, `e_teste=true`) parou de subir métrica/lista
real** — só o fornecedor Djulios tinha pedido fake (817, confirmado por query), nenhum
fornecedor real era afetado, mas mesmo assim:
- `app/api/org/dashboard-stats/route.ts` — os 3 contadores que não filtravam
  (`pedidos_aguardando_envio`, `pedidos_hoje`, `vendas_mes`) ganharam `.eq("e_teste", false)`.
  `vendas_mes` era o mais sério — alimenta o limite real do plano Starter (200/mês).
- `app/api/fornecedor/pedidos/route.ts` — lista do fornecedor (query principal + fallback)
  também ganhou `.eq("e_teste", false)`; o badge "Pedido de teste" que existia em
  `app/fornecedor/pedidos/page.tsx` foi removido por ficar morto (API nunca mais devolve
  pedido de teste pra lá).
- `/seller/pedidos` **não foi filtrado** de propósito — o seller Segatto (conta de
  demonstração) ainda precisa ver os próprios pedidos fake pra servir de demo.

**2. Etiqueta recém-liberada (saiu do buffer) sobe pro topo da lista** —
`web/scripts/add-etiqueta-liberada-prioridade.sql`:
- Coluna nova `pedidos.etiqueta_liberada_em timestamptz` — gravada uma única vez, no momento
  em que `etiqueta_pdf_url`/`etiqueta_pdf_base64` deixam de ser null (sucesso do cron ML,
  sucesso do cron Olist, ou colagem manual do seller via `/etiqueta-link`). Limpa de novo
  (`null`) quando o fornecedor reporta "etiqueta errada"
  (`reportar-etiqueta-errada/route.ts`), senão ficaria um timestamp velho pendurado numa
  etiqueta que nem existe mais.
- 2 RPCs novas (regra 9, `SECURITY DEFINER`, só `service_role`):
  `fn_fornecedor_pedidos_lista(p_org_id, p_fornecedor_id, p_status, p_limit, p_offset)` e
  `fn_seller_pedidos_lista(p_org_id, p_seller_id, p_status, p_limit, p_offset)` — mesmos
  filtros que as rotas já tinham (incluindo o filtro sintético `etiqueta_buffer_ml` do
  seller), só que a ordenação virou RPC porque o `CASE WHEN` de prioridade não dá pra fazer
  só com `.order()` do PostgREST (não aceita expressão computada). Regra de prioridade (2
  grupos, sem janela de tempo arbitrária — se autocorrige sozinho): quem tem `status=enviado`
  + etiqueta pronta + `etiqueta_impressa_em` ainda null sobe pro topo, ordenado por
  `etiqueta_liberada_em desc`; o resto (sem etiqueta ainda, já impressa, ou outro status)
  continua por `criado_em desc`, como sempre foi.
- `app/api/fornecedor/pedidos/route.ts` e `app/api/seller/pedidos/route.ts` trocaram o
  `.from("pedidos")...order()...range()` (+ fallback de coluna ausente, que não existe mais
  nas RPCs novas) pela chamada `supabaseAdmin.rpc(...)` — todo o pós-processamento que já
  existia depois (agrupamento por `marketplace_pack_id`, join de `pedido_itens`, previsão de
  etiqueta ML) ficou intocado, só a busca inicial mudou de fonte.
- Selo visual "Etiqueta liberada" (emerald, `ETIQUETA_LIBERADA_BADGE_CLASS`) adicionado em
  `app/fornecedor/pedidos/page.tsx` e `app/seller/pedidos/page.tsx`, ao lado do status pill,
  nos pedidos que caem no grupo prioritário — a ordenação sozinha podia não deixar óbvio por
  que o pedido subiu.

## Estoque avulso (5º gestor avulso) construído — 2026-10-15, 1º 100% RPC

Decisão: absorver o doc externo "13 Gestores de IA pra Mercado Livre" dentro dos gestores
avulso existentes em vez de criar 13 novos — ordem combinada: Margem (plano feito, vira
`web/lib/margemCalculo.ts`, ainda não codado) → **Estoque** (gestor novo, equivalente ao
Diogo do hub, só a parte de ruptura/cobertura — sem ponto de pedido com prazo de fornecedor,
sem curva ABC, sem custo de armazenagem Full acumulado, porque o avulso não tem fornecedor
cadastrado) → depois incrementos em SAC/ADS/Anúncio/Gestor. Dado vem 100% da API do Mercado
Livre (`available_quantity` + `/orders/search` 30d agrupado por `family_id`, mesmo padrão do
Ulisses avulso), nunca input manual — diferente do Margem/Ulisses, que precisa de custo
digitado porque isso não existe no ML.

`web/scripts/add-rpc-ai-run-insert-e-gestor-estoque.sql` (aplicado em produção
2026-10-15) prepara o banco:
- `calculadora_assinante_ai_runs_gestor_check` — valor `'estoque'` liberado na constraint
  (antes só `anuncios_seo | reputacao_atendimento | ads | gestor_mestre`).
- `fn_gestores_ia_avulso_ai_run_insert(p_assinante_id, p_gestor, p_status, p_resultado,
  p_erro)` — 1ª RPC de **escrita** pra essa tabela (o retrofit de 2026-10-07 só tinha migrado
  leitura — `fn_gestores_ia_avulso_ai_runs_recentes`/`_ml_status_get`/
  `_byok_configurado`/`_por_user_id` — pra RPC; gravar rodada nova continuava em `.from()`
  nos 3 gestores existentes, que não foram migrados agora, só o código novo do Estoque usa
  RPC desde já). `SECURITY DEFINER` + `search_path=public`, `revoke all from
  public/anon/authenticated`, `grant execute` só pra `service_role` — conferido depois de
  aplicar via `information_schema.routine_privileges` (só `postgres`/`service_role`
  aparecem).
- Código reaproveita as RPCs de leitura já existentes (`_ai_runs_recentes`,
  `_ml_status_get`, `_byok_configurado` — essa última no lugar de buscar a chave BYOK crua
  via `.from()`, diferente do padrão do Ulisses) — zero RPC de leitura nova precisou ser
  criada. `getAssinanteFromToken` (resolução do assinante a partir do JWT) já é
  infraestrutura compartilhada pelos 4 gestores existentes, não foi tocada.

**Dado 100% via API do Mercado Livre, nunca input manual** (diferente do Margem/Ulisses, que
depende de custo digitado porque isso não existe no ML):
- `lib/ai/gestorEstoqueDadosAvulso.ts` — `available_quantity` (via `mlBuscarItensDetalhe`) +
  soma de `quantity` nos últimos 30 dias (`mlBuscarResumoPedidosPeriodo`, já usado no resumo
  financeiro do Dashboard avulso), agrupado por `family_id` (mesma convenção do Ulisses),
  somando estoque/venda entre variações em vez de pegar só o representante. Réplica dos
  limiares de risco do Diogo do hub (`DIAS_RUPTURA_RISCO_ALTO=7`, `_MEDIO=20`,
  `gestorRupturaFulfillmentDados.ts`) — sem ponto de pedido com prazo de fornecedor, curva
  ABC ou custo de armazenagem Full acumulado (dado que o avulso não tem). `no_full` só
  marca visualmente (`shipping.logistic_type === "fulfillment"`), não entra no cálculo de
  risco.
- `lib/ai/gestorAvulsoEstoqueRodar.ts` — cooldown 6h + orçamento compartilhado (nova
  `temOrcamentoDisponivelHojeComByokBooleano` em `gestorAvulsoOrcamento.ts`, aceita o
  booleano da RPC em vez do objeto com a chave crua) + grava via
  `fn_gestores_ia_avulso_ai_run_insert`.
- `components/seller/SellerGestorEstoquePanelAvulso.tsx` — painel segue o SKILL
  `dropcore-gestores-ia` (borda neutra, 1 badge só) e tem ação real, não só diagnóstico:
  botão "Pausar anúncio" (confirmação inline no card, sem modal — réplica 1:1 do
  `PausarAnuncioBotao` do hub). **Corrigido 2026-10-16:** o botão não decide mais pelo
  agregado da família — cada `SkuEstoqueResultadoAvulso.membros[]` traz o
  `item_id`/`estoque`/`titulo` de cada item individual do ML dentro do grupo
  (`gestorEstoqueDadosAvulso.ts`, preenchido em `agruparParaEstoque`), e o card renderiza 1
  botão por membro com `estoque <= 1` — nunca mais o `item_id_representante` (que é só o
  membro de MAIOR estoque, escolhido pra nome/permalink de exibição, nunca foi pra decidir
  o que pausar). Com 1 membro só (caso comum), o resultado visual é idêntico a antes; com
  mais de 1 membro zerado, cada um aparece com seu próprio botão e o título como legenda.
- Rota nova `POST /api/gestores-ia-avulso/estoque/alterar-status-anuncio` — espelha
  `app/api/seller/gestores-ia/alterar-status-anuncio/route.ts` do hub (`mlAtualizarStatus`),
  com token do assinante avulso (`getValidMercadoLivreAvulsoAccessToken`) e checagem de
  dono via `mlBuscarItemDono` antes de mutar; sem auditoria em `seller_ai_acoes` (tabela só
  do hub — mesma decisão já tomada pra `amanda/aplicar-resposta-pergunta`). Aceita
  `status: "paused" | "active"` no mesmo endpoint (reativar já funciona, só não tem botão na
  UI porque anúncio pausado sai do agrupamento — `agruparParaEstoque` só considera
  `item.status === "active"`).
- Rotas: `GET /api/gestores-ia-avulso/estoque` (status), `POST .../estoque/rodar`.
- Cron `app/api/cron/gestores-ia-avulso-estoque/route.ts` — schedule em
  `web/scripts/add-cron-gestores-ia-avulso-estoque.sql` (`45 8 * * *`), **aplicado em
  produção em 2026-10-16**. Listagem de
  assinantes elegíveis nesse cron continua em `.from()` (mesmo padrão dos 3 irmãos, é
  agregação multi-linha sem RPC equivalente, não a leitura "1 linha, 1 dono" que a regra 9
  cobre).
- Tela `/seller/gestores-ia-avulso/estoque` (sem wizard de preferências — não precisa de
  config do assinante, é só ML). `GestorAvulsoIcons.tsx` ganhou `IconEstoque`;
  `gestorAvulsoStatusResumo.ts` ganhou `EstoqueRun`/`resumoStatusEstoque`/
  `severidadeEstoque`. Portal (`/seller/gestores-ia-avulso`) ganhou o 5º card na lista de
  pendências e o `statusDiogo` real do personagem 3D (antes fixo em "Em breve").

### Anúncio avulso (andrey) — cruzamento com perguntas/reclamação (doc 13 Gestores) — 2026-10-16

Entrega do item "Anúncio" do roadmap de absorver o doc externo dos 13 gestores (ver memória
de projeto `doc-13-gestores-absorcao-avulso`). Achado da investigação: a API de reclamações
do ML (`mlBuscarReclamacoesAbertas`) **não é risco** — já testada ao vivo em produção desde
2026-08-25 (hoje só usada pra disputa de fornecedor no hub), e as perguntas pendentes que a
Amanda já busca (`buscarPerguntasContexto`) já vêm com texto completo + `item_id`. Zero API
nova, zero banco/RPC novo — só cruzamento de dado já buscado/testado.

- `web/lib/ai/gestorAnunciosSeoDados.ts` — `AnuncioSeoContexto` ganhou 2 campos opcionais,
  só preenchidos pelo avulso hoje (hub não cruza isso, por isso são opcionais e não afetam o
  hub): `perguntaReforcaGap` (pergunta pendente real cujo texto reforça um gap estrutural já
  detectado, por correspondência simples de palavra-chave — nome do atributo aparece no texto
  da pergunta) e `reclamacaoAbertaCodigo` (código bruto `reason_id` do ML, nunca traduzido —
  não existe dicionário confiável pra categoria humana desses códigos). `formatarAnunciosSeo`
  e 2 bullets novos em `PROMPT_ANUNCIOS_SEO.tarefa` passam isso pra IA: perguntas pendentes
  entram como evidência forte; reclamação em aberto é só sinal de risco, a IA é instruída a
  **nunca inventar o motivo** a partir do código.
- `web/lib/ai/gestorAnunciosSeoDadosAvulso.ts` — busca perguntas pendentes
  (`buscarPerguntasContexto`, reaproveitado do arquivo da Amanda) e reclamações abertas
  (`resolverReclamacoesAbertasPorItemAvulso`, mesma técnica de `gestorDisputasFornecedorDados.ts`
  — `resourceId` da reclamação é o `order_id`) **1x por rodada**, não por grupo. Novo campo
  `pergunta_reforca_gap` exposto no resultado enriquecido.
- `web/components/seller/SellerGestorAnunciosSeoPanel.tsx` — `PerguntaReforcaGapAviso`, texto
  simples sem caixa (SKILL `dropcore-gestores-ia` seção 2), exibido junto dos outros avisos do
  card quando o backend detecta a pergunta.
- **Fora de escopo, pro v2** (mesma régua de não inventar dado): dicionário `reason_id` →
  categoria humana, e "perguntas repetidas" como série histórica (hoje só pega pendentes do
  momento).

## "Reunião matinal" dos gestores avulso + notificação proativa (v2, 2026-10-16)

Primeiro item do backlog de v2 do roadmap dos 13 gestores (ver `docs/SCHEMA.md` seção
"Estoque avulso" e a memória `project_doc_13_gestores_absorcao_avulso`). Até aqui o resumo
diário do Gestor (`montarResumoDiarioAvulso`) só calculava quando o assinante abria o chat ou
a tela — nunca rodava por conta própria. Entrega: cron que roda depois que os 4 gestores já
terminaram (Anúncio 8h, SAC 8h15, ADS 8h30, Estoque 8h45) e notifica de verdade.

- `web/lib/ai/gestorNotificacaoAvulso.ts` — `notificarAssinanteResumoDiarioAvulso(assinanteId,
  top3)`, espelha `gestorNotificacao.ts` do hub trocando `sellers`→`calculadora_assinantes`.
  Grava em `notifications` (sino) e chama `notifyUserEmail` (`lib/notifyEmail.ts`, já em
  produção via Resend) — e-mail de verdade, não só sino. **Só notifica quando `top3.length >
  0`** — não manda "nada pra ver hoje" todo dia, seria ruído.
- `web/app/api/cron/gestores-ia-avulso-resumo-diario/route.ts` — mesmo padrão de
  `CRON_SECRET` e filtro de assinante elegível (`inclui_gestores_ia = true` com
  `calculadora_assinante_mercadolivre_integrations!inner`) dos crons irmãos. Zero banco novo:
  `notifications` já é chaveada por `user_id`, que `calculadora_assinantes` já tem.
- `web/scripts/add-cron-gestores-ia-avulso-resumo-diario.sql` — `9 9 * * *` (depois dos 4
  gestores). **Aplicado em produção em 2026-10-16.**

## Tela admin "Gestores de IA avulso" com métricas (v2, 2026-10-17)

Item do backlog de v2 (ver memória `project_doc_13_gestores_absorcao_avulso`): dar
visibilidade pro admin de quais assinantes da Calculadora têm o pacote avulso ativo. Achado
no caminho: a listagem em si **já existia** dentro de `admin/gestores-ia-convites/page.tsx`
(seção "Assinantes do pacote"), só nunca tinha link no menu — não era uma tela nova, era um
item de menu faltando + melhoria da tela já existente.

- `fn_gestores_ia_avulso_assinantes_list(p_limit, p_offset)`
  (`web/scripts/add-fn-calculadora-assinantes-gestores-ia-list.sql`) — RPC nova (regra 9 do
  CLAUDE.md: tabela/rota nova nunca usa `.from()` direto), `SECURITY DEFINER` +
  `GRANT ... TO service_role`. Devolve `id, user_id, nome, ativo, gestores_ia_ciclo,
  valido_ate, gestores_ia_contrato_aceite_em, created_at, total_count` (window `count(*)
  over()`) de `calculadora_assinantes where inclui_gestores_ia = true`, paginado.
- `web/app/api/org/gestores-ia-avulso/assinantes/route.ts` (`GET`) — `requireAdmin(req)` →
  `supabaseAdmin.rpc(...)` → resolve e-mail de cada `user_id` via
  `supabaseAdmin.auth.admin.getUserById` (mesmo padrão de `notifyEmail.ts`).
- `web/app/admin/gestores-ia-convites/page.tsx` — a tabela de assinantes passou a consumir
  essa rota nova (antes usava `/api/org/calculadora/assinantes?inclui_gestores_ia=true`,
  rota legada `.from()` direto, mantida intocada pra quem ainda a usa em
  `calculadora-convites`) — ganhou colunas `Nome`/`Ciclo` e um grid de 4 métricas (Total,
  Ativos, Mensal, Anual) acima da tabela. Badge de status e botões de ação corrigidos pro
  padrão travado (`dropcore-layout`: badge sem borda com bolinha, botão escala compacta)
  enquanto a tela estava sendo tocada.
- `web/components/AdminNav.tsx` — item novo "Gestores de IA avulso" no grupo **Financeiro**
  (antes a página só era acessível por link direto, sem nenhum item de menu).

## Desconto por assinante no pacote avulso "Gestores de IA" (2026-10-17)

Pedido do Sr Stark depois de ver a tela de métricas (onda anterior): admin poder dar
desconto — valor fixo em R$, percentual, ou preço cheio — pra um assinante específico.
Preço base continua fixo em `lib/gestoresIaAvulsoPlanos.ts`
(`VALOR_GESTORES_IA_AVULSO_MENSAL`); as colunas novas só guardam a REGRA do desconto, o
valor final é sempre calculado em código (`calcularValorMensalGestoresIaAvulso`), nunca
guardado como número solto.

- `calculadora_assinantes.gestores_ia_desconto_tipo` (`'valor'|'percentual'|null`) +
  `.gestores_ia_desconto_valor numeric` — `web/scripts/add-calculadora-assinante-gestores-ia-desconto.sql`.
- `fn_gestores_ia_avulso_desconto_set(p_assinante_id, p_tipo, p_valor)` —
  `SECURITY DEFINER`, só `service_role`. Único caminho que escreve essas colunas.
- **Achado crítico corrigido no mesmo commit**: o processor do webhook do PIX
  (`lib/gestoresIaAvulsoPixProcessor.ts`, função `processarGestoresIaAvulsoPlanoPago`)
  comparava o valor pago no Mercado Pago contra a constante fixa — com desconto, o
  assinante pagaria menos e o webhook **recusaria silenciosamente** reconhecer o
  pagamento (dinheiro entraria, conta nunca renovaria). Corrigido pra buscar o desconto do
  assinante (`fn_gestores_ia_avulso_assinante_por_user_id`, já devolve as colunas novas por ser
  `select *`) e comparar contra o valor esperado dele, não mais o fixo.
- `app/api/gestores-ia-avulso/planos/route.ts` — `GET` agora exige auth (antes era público,
  sem uso real no front) e devolve o valor real do assinante; `POST` cobra esse mesmo valor
  no PIX em vez da constante. Valor nunca vem do client — sempre calculado no servidor a
  partir do que está no banco.
- `app/seller/gestores-ia-avulso/planos/page.tsx` — busca o valor real via `GET` em vez de
  importar a constante direto, pros cards Mensal/Anual refletirem o desconto do assinante.
- `app/api/org/gestores-ia-avulso/assinantes/[id]/desconto/route.ts` (`POST`) —
  `requireAdmin`, valida tipo/valor (percentual ≤100, valor em R$ < preço cheio) antes de
  chamar a RPC.
- `app/admin/gestores-ia-convites/page.tsx` — coluna "Desconto" (mostra "X% off"/"RS off" +
  valor efetivo) + botão "Dar desconto"/"Editar desconto" abrindo modal (preço cheio / valor
  fixo / percentual, com preview do valor final antes de salvar).
- **Segurança conferida direto no banco antes de codar** (não assumida): `calculadora_assinantes`
  tem RLS ligada com zero policies — `anon`/`authenticated` têm `rolbypassrls: false`, então
  mesmo com grant de tabela (padrão Supabase) ficam 100% bloqueados; só `service_role`
  (`rolbypassrls: true`, nunca sai do servidor) acessa. RPC testada direto no banco (set +
  list + reset) antes de considerar pronta.

## Paginação real em `/api/org/sellers` (performance, 2026-10-17)

Parte da onda de performance (ver `project_performance_sistema_pesado` na memória): rota
buscava todos os sellers da org sem `.range()`/limite. Corrigido com `page`/`limit` +
`count: "exact"`, resposta virou `{items, total_count}` (antes era array solto — único
consumidor, `app/admin/sellers/page.tsx`, atualizado junto, com a mesma barra de paginação
já usada em `fornecedor/pedidos`/`seller/pedidos`).

**Por que as outras 3 rotas do plano original ficaram de fora desta leva**
(`seller/catalogo`, `fornecedor/produtos`, `org/catalogo/search`): as telas que consomem
essas três (`seller/produtos`, `fornecedor/produtos`, `admin/catalogo`) fazem busca e
agrupamento (SKU-pai + variantes) **client-side**, em cima do catálogo inteiro carregado de
uma vez. Paginar a API sem redesenhar a busca/agrupamento quebraria a forma como a tela
agrupa variante por produto hoje — não é um fix mecânico de `.range()`, é mudança de
arquitetura de UI. Fica registrado como pendência que precisa de conversa de produto antes,
não entra em "performance" como ganho rápido.

## Rotas dos Gestores de IA: slug de pessoa → título genérico (2026-10-17)

Em 2026-10-11 os gestores trocaram de nome de pessoa (Diogo/Andrey/Amanda/Ulisses/Laura/
Tiago Silva) pra título genérico de função (Estoque/Anúncio/SAC/ADS/Design/Gestor) **só na
UI** — rota, slug, cron job e arquivo interno continuaram com o nome antigo de propósito,
pra evitar o custo/risco do rename (ver skill `dropcore-gestores-ia`). Em 2026-10-17 essa
decisão foi revertida a pedido do Sr Stark: rota, pasta, cron e a maior parte dos arquivos
internos agora usam o nome genérico também. **Referências a "Andrey"/"Amanda"/"Ulisses"/
"Diogo"/"Tiago Silva" em entradas de changelog anteriores a esta seção continuam como
estavam na época** (histórico, não reescrito) — não são mais os nomes reais de rota/arquivo
hoje.

- **Slug novo** (fonte única: `web/lib/ai/gestorPerfis.ts`, tipo `GestorSlug`): `diogo`→
  `estoque`, `andrey`→`anuncio`, `amanda`→`sac`, `ulisses`→`ads`, `tiago-silva`→`gestor`,
  `laura`→`design` (gestor ainda `ativo: false`, sem rota avulso).
- **Hub** (`/seller/gestores-ia/[gestor]`): só a comparação de slug mudou
  (`perfil.slug === "estoque"` etc. em `[gestor]/page.tsx`); rota já era dinâmica via
  `gestorPerfis.ts`, não tinha pasta física por gestor.
- **Avulso**: pastas de página e de API renomeadas juntas (`git mv`, histórico preservado):
  `app/seller/gestores-ia-avulso/{andrey,amanda,ulisses,tiago}` →
  `{anuncio,sac,ads,gestor}` (estoque já era `estoque`) e o mesmo em
  `app/api/gestores-ia-avulso/`. Arquivos `lib/ai/gestorAvulso{Andrey,Amanda,Ulisses}Rodar.ts`
  viraram `gestorAvulso{Anuncio,Sac,Ads}Rodar.ts` (nomes de função internos não mudaram).
- **Cron em produção**: pg_cron não tem rename direto de job (`cron.alter_job` não muda
  nome) — os 4 jobs afetados foram recriados via `cron.unschedule` + `cron.schedule` com
  nome/URL novos, mesmo horário/lógica (`web/scripts/rename-cron-gestores-ia-avulso-rotas.sql`).
  `gestores-ia-avulso-estoque` e `gestores-ia-avulso-resumo-diario` já tinham nome genérico,
  não mudaram.
- **Redirects**: `next.config.ts` ganhou `redirects()` (308) de cada rota de página antiga
  do avulso pra nova — cobre favorito salvo e o CTA do e-mail de resumo diário já enviado
  pra assinante real antes do rename (o CTA em si também foi atualizado pro link novo em
  `lib/ai/gestorNotificacaoAvulso.ts`).
- **Escritório 3D e chat da IA**: `SellerGestoresIaEscritorio3D.tsx` teve o tipo interno
  `NomeGestor` e as chaves de config renomeadas junto (`Diogo`→`Estoque` etc. como string,
  não só label); `gestorTiagoChatTools.ts`/`gestorTiagoChatToolsAvulso.ts` tiveram a
  descrição/enum da tool `consultar_gestor` atualizados — o texto que o modelo Anthropic lê
  não cita mais nome de pessoa.
- **Fora do escopo do rename**: rotas de *ação* dentro de cada gestor (ex.
  `/api/seller/gestores-ia/ulisses-preferencias`, `/api/seller/gestores-ia/ulisses-aplicar-*`)
  continuam com o nome antigo — são endpoints internos, não a identidade/slug do gestor.
  Valores gravados em `seller_ai_runs.gestor`/`calculadora_assinante_ai_runs.gestor`
  (`estoque_fulfillment`, `anuncios_seo`, `reputacao`/`reputacao_atendimento`, `ads`) também
  não mudaram — já eram nomes funcionais, nunca usaram nome de pessoa.

## Log + retry de falha de sync com o Mercado Livre (2026-10-24)

Achado real: venda no anúncio do seller Vinz Collection (SKU DJU005003, item
`MLB5022127077`) nunca gerou pedido no DropCore — sem nenhum log/alerta, só descoberto
comparando manualmente o estoque real do ML (API) com o ledger do DropCore. Até aqui, falha
de push de estoque pro ML (`sellerMercadoLivreSyncEstoque.ts`) ou de ingestão de pedido do
ML (`mercadoLivrePedidosReconciliacao.ts`) só virava `console.error`, perdido em produção.

- **Tabela `ml_sync_falhas`** (`web/scripts/create-ml-sync-falhas-log-retry.sql`): log de
  falha, `tipo` (`estoque_push` | `pedido_ingest`), `sku`/`ml_item_id` ou
  `referencia_externa` (order id do ML, sem prefixo `ml:`), `tentativas`/`max_tentativas`,
  `status` (`pendente`/`resolvido`/`esgotado`). RLS: 1 policy `SELECT` usando
  `fn_user_can_access_seller` (mesma trava de `erp_event_logs`); escrita só via RPC
  `SECURITY DEFINER`, grant só `service_role` (regra 9 do CLAUDE.md).
- **RPCs**: `fn_ml_sync_falha_registrar` (insere ou soma tentativa numa falha pendente
  igual — unique index parcial em `seller_id, tipo, sku, referencia_externa WHERE
  status='pendente'`), `fn_ml_sync_falha_listar_pendentes`, `fn_ml_sync_falha_marcar_resultado`.
  Helpers TS em `web/lib/mlSyncFalhas.ts`.
- **Cron novo `dropcore-ml-sync-retry`** (a cada 15 min, lock advisory `913019`,
  `web/app/api/cron/ml-sync-retry/route.ts` → `web/lib/mlSyncRetry.ts`): reprocessa cada
  falha pendente reusando o pipeline real (`syncMercadoLivreEstoqueSkusSeller` ou
  `ingerirPedidoMercadoLivrePorSeller`), marca resolvido ou soma tentativa.
- **`mercadoLivrePedidosReconciliacao.ts`**: janela de busca de pedido recente foi de 3h→24h
  (3h não dava margem pra cobrir uma rodada perdida por erro pontual) + isolamento de erro
  por seller e por pedido dentro do loop (1 exceção não trava mais os sellers seguintes na
  mesma rodada) + toda falha de ingestão agora grava em `ml_sync_falhas`.
- **`mercadoLivreApiClient.ts`**: nova `mlBuscarTodosItensAtivosEPausados` (usada só pelo
  sync de vínculo SKU↔anúncio, `mercadoLivreSkuSync.ts`) — anúncio que o próprio ML pausa
  sozinho por `available_quantity` zerar (`sub_status: out_of_stock`) some da busca
  `status=active`; incluir `paused` garante que o vínculo não fique órfão quando reabastecer.

## Log de sync (sucesso ou falha) de estoque com o Mercado Livre (2026-10-25)

Achado real: fornecedor Djulios ajustou estoque de um SKU (DJU005013) e não havia forma do
admin confirmar que o push chegou no anúncio do seller (Vinz Collection) sem acesso à conta
Mercado Livre dele — `ml_sync_falhas` só registra problema (fila de retry), nunca sucesso.

- **Tabela `ml_sync_log`** (`web/scripts/create-ml-sync-log-estoque.sql`): uma linha por
  tentativa de push de estoque pro ML (sucesso ou falha) — `seller_id`, `fornecedor_id`,
  `sku`, `ml_item_id`, `estoque_enviado`, `sucesso` (bool), `erro`, `criado_em`. Tabela
  separada de `ml_sync_falhas` de propósito: aquela foi desenhada em torno de "toda linha é
  pendência" (índice único parcial + RLS parcial em `status='pendente'`), misturar log de
  sucesso ali quebraria essa suposição. RLS: 1 policy `FOR ALL` cobrindo
  `fn_user_can_access_seller` OU `fn_user_can_access_fornecedor` (fornecedor também lê o
  próprio histórico); escrita só via RPC `SECURITY DEFINER`, grant só `service_role`.
- **RPCs**: `fn_ml_sync_log_registrar` (insert simples) e
  `fn_ml_sync_log_listar_por_fornecedor` (lista por `fornecedor_id`, filtro opcional por
  `sku`, join com `sellers` pro nome). Helpers TS em `web/lib/mlSyncLog.ts`.
- **`sellerMercadoLivreSyncEstoque.ts`**: `syncMercadoLivreEstoqueSkusSeller` agora chama
  `registrarMlSyncLog` pra cada SKU de cada item pushado, sucesso ou falha (antes só
  gravava em caso de falha, via `registrarMlSyncFalha`).
- **UI**: painel colapsável "Últimos envios de estoque pro Mercado Livre" em
  `/fornecedor/produtos` (`web/components/fornecedor/FornecedorMlSyncLogPanel.tsx`, lido via
  `GET /api/fornecedor/ml-sync-log`) — mostra SKU, seller, valor enviado, horário e
  sucesso/erro sem precisar logar na conta ML do seller.

## Motivo real de falha ao buscar etiqueta ML (2026-10-27)

Achado investigando pedidos presos do seller Vinz Collection (nota fiscal do ML com erro na
emissão — etiqueta só libera depois dela, às vezes dias depois). `mlBuscarEtiquetaPdf`
(`mercadoLivreApiClient.ts`) descartava o corpo de erro da API e devolvia só `null`; o cron
(`etiquetaMlRetry.ts`) não tinha como saber *por quê* uma etiqueta não chegava, só contava
mais uma tentativa.

- **Coluna nova `pedidos.etiqueta_ml_ultimo_erro text`**
  (`web/scripts/add-etiqueta-ml-ultimo-erro.sql`) — texto/código devolvido pelo ML na última
  tentativa falha (ex.: `NOT_PRINTABLE_STATUS`, erro de nota fiscal), sobrescrito a cada
  rodada do cron; `null` quando a etiqueta chega.
- `mlBuscarEtiquetaPdf` passou a devolver `{ pdfBase64, erro }` em vez de só
  `string | null` — `erro` só é usado pra log/alerta, nunca pra decidir fluxo.
- `etiquetaMlRetry.ts` grava `etiqueta_ml_ultimo_erro` a cada tentativa sem sucesso, e passa
  o motivo pro alerta que já ia pro admin (`notifyAdminsEtiquetaMlFalha`, novo campo opcional
  `erro_ml` — entra na mensagem e no `metadata` da notificação).

**De quebra, mesmo achado (2026-10-27) — formato errado na impressora térmica do
fornecedor:** `GET /shipment_labels?response_type=pdf` com 1 `shipment_id` devolve 2
páginas — a etiqueta real + uma "lista de coleta" (resumo interno do ML pro centro de
distribuição, não é pra sair impresso) — sem nenhum parâmetro de API pra pedir só a
etiqueta. Era essa 2ª página (tamanho/formato diferente) que saía junto na impressora
térmica do fornecedor, divergindo do formato da UpSeller (que manda só a etiqueta).
`mlBuscarEtiquetaPdf` agora usa `pdf-lib` pra cortar o PDF pra só a página 1 antes de
salvar em `etiqueta_pdf_base64` — se o corte falhar por qualquer motivo, usa o PDF
original sem quebrar o fluxo (fallback silencioso, só loga). Não muda nada do caminho da
Olist (`olistTinyApi.ts`), que é uma API diferente.

**Correção no mesmo dia (2026-10-27, depois de comparar prints lado a lado com o Sr
Stark):** cortar a página não bastou — mesmo com só 1 página, a etiqueta do ML ainda saía
reta (sem rotação), diferente do formato físico da UpSeller (que sai rotacionada 90° pra
bater com a orientação da impressora térmica). Sr Stark confirmou que o problema real era
só a rotação, não a página extra em si nem anexar nota fiscal (DANFE) — isso NÃO foi
pedido, não replicar sem perguntar de novo. `mlBuscarEtiquetaPdf` agora sempre recria a
página 1 num doc novo com `pagina1.setRotation(degrees(90))`, independente de o PDF
original ter 1 ou 2 páginas.

## Detecção de devolução ML (2026-10-29)

Achado real: o seller Vinz Collection teve uma devolução no Mercado Livre que não apareceu
em nenhuma tabela do DropCore (`financial_ledger`, `pedido_eventos`,
`seller_ai_disputas_fornecedor`, `erp_event_logs`). Causa raiz: o único código que lia
"claims" (reclamações) do ML era o da Amanda (gestor de reputação), que descarta de
propósito reclamação sem foto/evidência anexada — e "sem foto" é exatamente o caso mais
comum de devolução real ("cliente mudou de ideia"). Além disso, o Vinz estava com o add-on
de Gestores de IA desligado, então o pipeline da Amanda nem rodava.

Solução: pipeline novo, determinístico (sem IA/gestor nenhum envolvido), que roda pra TODO
seller com `seller_mercadolivre_integrations` ativa, independente de add-on/saldo/teto de
gasto — devolução é risco financeiro, não feature paga. Deliberadamente separado do código
da Amanda (`gestorDisputasFornecedorDados.ts`), que continua intocado.

- **Tabela** `seller_ml_devolucoes_detectadas` (`add-seller-ml-devolucoes-detectadas.sql`):
  `org_id`, `seller_id`, `ml_claim_id` (unique), `ml_resource`, `ml_resource_id`,
  `ml_reason_id`, `ml_rules_engine_triage text[]`, `criterio`
  (`'repentant'|'sem_evidencia'`), `pedido_id`/`ledger_id` (nullable — pode não resolver
  pedido, ex. Olist quebrado), `notificado_em`. RLS ligada, sem policy (deny-all) — acesso
  só via RPC.
- **RPCs** (`SECURITY DEFINER`, `grant execute to service_role`, nunca `authenticated`):
  `fn_ml_devolucao_detectada_claim_ids_existentes` (batch lookup de claims já conhecidos),
  `fn_ml_devolucao_detectada_registrar` (insert atômico `ON CONFLICT (ml_claim_id) DO
  NOTHING`, retorna `ja_existia`/`devolucao_id` — evita notificação duplicada em corrida de
  webhooks), `fn_ml_devolucao_detectada_marcar_notificado`.
- **Índice** novo `idx_pedidos_seller_marketplace_numero` — lookup usado por mais de um
  pipeline (reconciliação de cancelamento, disputa fornecedor, e esta detecção).
- **Critério de classificação** (`web/lib/mlDevolucaoDeteccao.ts`): `rules_engine_triage`
  (de `mlBuscarMotivoReclamacao`) contém `"repentant"` OU zero evidências anexadas
  (`mlBuscarEvidenciasReclamacao`). Pode precisar calibração depois de ver volume real em
  produção — não há staging pra validar antes.
- **Gatilho**: `web/app/api/webhooks/mercadolivre/route.ts`, tópico `"claims"` — chama
  `detectarDevolucaoMlPorMlUserId` em paralelo com `reprocessarAmandaPorMlUserId`, sem
  nenhum gate de add-on/saldo/teto.
- **Resolução claim→pedido/fornecedor**: `web/lib/mercadoLivreClaimResolucao.ts` (novo,
  independente — não reaproveita nem altera `gestorDisputasFornecedorDados.ts`).
- **Notificações**: `devolucao_ml_provavel_seller` (seller, via
  `notifySellerPedidoAtencao.ts`, agora aceita `pedido_id: string | null`) e
  `devolucao_ml_provavel_admin` (admin, `web/lib/notifyAdminsDevolucaoMl.ts`) — registrados
  em `NOTIFICATION_TIPOS_POR_CONTEXTO` (`notificationContextFilter.ts`) e em severidade/
  ícone/link no `NotificationBell.tsx`.
- **V1 só notifica** — nenhuma mutação em `financial_ledger`/`pedidos.status`. Confirmação
  de devolução continua 100% manual via `/admin/devolucoes`.
- **Fora de escopo**: devolução via Olist/Bling (problema separado — Olist do Vinz está
  quebrado desde set/2026, `"Plano não tem acesso a API"`); cron de rede de segurança pro
  caso do webhook falhar pontualmente (a própria rotina já rebusca todos os claims abertos
  a cada chamada, não só o do payload, então a lacuna residual é pequena).

## Liberação automática de saldo em devolução — 48h (2026-10-29)

Decisão do Sr Stark: a liberação de dinheiro bloqueado numa devolução (`EM_DEVOLUCAO` →
`DEVOLVIDO` em `financial_ledger`) deixa de ser só manual. O fornecedor ganha ação direta no
portal dele pra confirmar recebimento "tudo certo" (libera na hora) ou contestar (defeito/
produto errado, com foto — trava a liberação automática, cai pro admin decidir manual como já
era antes). Se o fornecedor não fizer nada em **48h** contadas a partir do momento que o admin
registra `EM_DEVOLUCAO`, o sistema libera o valor pro seller sozinho. O gatilho é só
`em_devolucao_desde` (controlado por nós) — não existe confirmação do ML de que a devolução
chegou fisicamente no fornecedor.

- **Colunas novas em `financial_ledger`** (`add-financial-ledger-devolucao-prazo-fornecedor.sql`):
  `em_devolucao_desde`, `fornecedor_confirmou_recebimento_em`, `fornecedor_contestou_em`,
  `fornecedor_contestacao_texto`, `fornecedor_contestacao_evidencias_paths` (`text[]` — trocou
  de `fornecedor_contestacao_foto_path` (1 string) pra array em
  `add-devolucao-contestacao-multiplas-evidencias.sql`, 2026-11-03: fornecedor pode mandar
  várias fotos e vídeo, não só 1 foto).
- **RPCs** (`SECURITY DEFINER`, `grant execute to service_role`, atômicas via `for update`
  dentro da própria função — substitui o padrão insert-depois-rollback em nível de app usado
  no PATCH do admin):
  - `fn_devolucao_fornecedor_confirmar(p_ledger_id, p_fornecedor_id)` — fornecedor confirma,
    libera na hora.
  - `fn_devolucao_fornecedor_contestar(p_ledger_id, p_fornecedor_id, p_texto, p_evidencias_paths text[])` —
    registra contestação, **não muda status**, trava a liberação automática.
  - `fn_devolucao_liberar_automatico(p_ledger_id)` — chamada pelo cron, reconfere status/prazo/
    contestação de novo antes de mexer em dinheiro (defesa contra corrida com uma contestação
    de última hora).
- **Cron** `dropcore-devolucao-liberacao-automatica` (hora em hora) →
  `/api/cron/devolucao-liberacao-automatica` → `web/lib/devolucaoLiberacaoAutomatica.ts` —
  seleciona `EM_DEVOLUCAO` com `em_devolucao_desde` > 48h atrás e sem contestação, libera e
  notifica seller + fornecedor. Lock advisory `913020`.
- **Tela do fornecedor** `/fornecedor/devolucoes` (não está no menu principal, só acessível via
  link da notificação — mesmo padrão de `/fornecedor/disputas`) — lista `EM_DEVOLUCAO` do
  fornecedor logado com prazo visível, botões "Chegou tudo certo" / "Chegou com defeito/outra
  coisa" (texto + foto opcional, reaproveita o bucket `disputas-evidencias` já existente, path
  novo `fornecedor-contestacao/{ledger_id}/evidencia.ext`).
- **Rotas**: `GET /api/fornecedor/devolucoes`, `POST /api/fornecedor/devolucoes/[id]/confirmar`,
  `POST /api/fornecedor/devolucoes/[id]/contestar` (`FormData`, mesma validação de tipo/tamanho
  do upload de evidência da Amanda).
- **PATCH do admin** (`/api/org/financial/ledger/[id]`) passou a gravar `em_devolucao_desde` ao
  marcar `EM_DEVOLUCAO` e a notificar o fornecedor (`notifyFornecedorDevolucao.ts`).
- **Notificações novas**: `devolucao_registrada_fornecedor`, `devolucao_liberada_automatico_seller`,
  `devolucao_liberada_automatico_fornecedor` — registradas em `notificationContextFilter.ts` e
  `NotificationBell.tsx`.
- **Fora de escopo**: nenhuma mudança no fluxo manual do admin (continua podendo agir a
  qualquer momento, inclusive depois de uma contestação); decisão do admin sobre contestação
  continua manual, sem prazo.

## Devolução ML — fase 2: trava automática, atribuição certa, visibilidade (2026-10-30)

Testando a fase 1 com dado real do Galileus, achamos 3 problemas que mudaram o desenho:
`pedidos.fornecedor_id` sempre carimbado com o fornecedor "oficialmente conectado" do seller
mesmo quando o SKU é de outro fornecedor (Galileus conectado ao Consenso, mas vende produto
Djulios — confirmado 20/20 pedidos com SKU `DJU...` gravados com `fornecedor_id` errado); a
devolução física demora 10+ dias pra chegar no fornecedor, então nenhum prazo curto pode
ancorar em "quando travamos o dinheiro"; e `pedidos.status` nunca era escrito como
`'devolvido'` em lugar nenhum do código, diferente do padrão já usado pra cancelamento.

- **Atribuição de fornecedor corrigida**: `resolverPedidoEFornecedorPorReclamacao`
  (`mercadoLivreClaimResolucao.ts`) agora tenta o catálogo real
  (`seller_mercadolivre_sku_map`→`skus`) **antes** de `pedido.fornecedor_id` (antes era o
  contrário, e como sempre tem pedido, o catálogo nunca era consultado). `fornecedor_id`
  resolvido passa a ser persistido em `seller_ml_devolucoes_detectadas.fornecedor_id` (fase 1
  descartava com `void fornecedorId`). Quando não dá pra resolver nem pelo catálogo nem pelo
  pedido, `pedidos.status = 'devolucao_sem_fornecedor'` (mesmo padrão visual de "produto fora
  do catálogo": mostra o problema, não esconde nem escolhe errado, botão "Chamar Admin").
- **RPCs de confirmar/contestar do fornecedor** (`fn_devolucao_fornecedor_confirmar`/
  `_contestar`) agora aceitam como dono tanto `financial_ledger.fornecedor_id` quanto o
  `fornecedor_id` resolvido em `seller_ml_devolucoes_detectadas` — sem isso, o fornecedor
  certo (Djulios) via a devolução na tela dele mas a RPC rejeitava por não bater com o
  `fornecedor_id` (errado) do ledger.
- **Trava automática, sem clique do admin**: `fn_devolucao_auto_travar(p_ledger_id)` —
  chamada direto por `mlDevolucaoDeteccao.ts` quando o pedido resolvido tem `ledger_id`
  (nem todo pedido tem: "produto fora do catálogo" nunca gera saldo). Grava
  `financial_ledger.em_devolucao_status_anterior` (de onde veio) + `pedidos.status =
  'em_devolucao'`. Nova coluna `em_devolucao_status_anterior` existe só pra isso — reverter
  sem ter que adivinhar o estado de origem.
- **Destrava sozinho**: `fn_devolucao_auto_destravar(p_ledger_id)` — chamada por
  `reavaliarDevolucoesAbertasPorMlUserId` (roda junto com a detecção a cada webhook de
  "claims" desse seller), usando `mlReclamacaoAindaAberta` (já existia, testado) pra ver se a
  reclamação fechou sem o fornecedor ter confirmado/contestado nada — se fechou, reverte pro
  status anterior.
- **"Devolução não procede"**: `fn_devolucao_admin_manter_venda(p_ledger_id)` + rota
  `POST /api/org/financial/ledger/[id]/manter-venda` + botão em `/admin/devolucoes` — caminho
  que faltava (só existia "devolve pro seller"); dinheiro volta pro fluxo normal de repasse
  pro fornecedor.
- **Liberação automática por tempo (48h) pausada**: `LIBERACAO_AUTOMATICA_HABILITADA = false`
  em `devolucaoLiberacaoAutomatica.ts` — confirmado que devolução física demora 10+ dias,
  então qualquer prazo curto ancorado na trava (agora automática) dispararia antes da entrega
  real. Fica assim até calibrar um sinal real de entrega (log em `mlDevolucaoCalibracaoLog.ts`).
- **Visibilidade de valor retido** nas 3 pontas, tudo opcional/aditivo (ninguém que já lê os
  campos antigos quebra):
  - Seller: `fn_seller_saldo_from_ledger` ganha 4ª coluna `saldo_bloqueado_devolucao`;
    `sellers.saldo_bloqueado_devolucao` (coluna nova, sincronizada pela trigger
    `fn_sync_seller_saldo_from_ledger`); exposto em `/api/seller/me` e no card "Bloqueado" do
    dashboard.
  - Fornecedor: `fornecedorRepasseList.ts` passa a incluir `EM_DEVOLUCAO` na query de preview
    (antes só ENTREGUE/AGUARDANDO_REPASSE) e separa `valor_retido_devolucao`, mostrado no
    card "Repasses futuros".
  - Admin: `fn_org_dashboard_pro_30d` ganha `retido_devolucao` (3º agregado, mesmo filtro de
    janela/e_teste dos outros dois) — **replicado também no fallback TypeScript**
    `orgDashboardProLegacy.ts` (achado: esse fallback existe e duplicaria o bug se só o SQL
    fosse corrigido). Nova seção no dashboard admin, abaixo do grid PAGO/pendente existente
    (não mexe nele).
- **Selo "Em devolução"/"Devolvido" no card do pedido**: `pedidos.status` passa a ser escrito
  de verdade (`em_devolucao`/`devolvido`/`devolucao_sem_fornecedor`, novos valores na
  constraint) nas transições de ledger — antes nenhum código escrevia isso, diferente do
  padrão já usado em `fn_pedido_cancelar_estorno` pra `'cancelado'`. Refletido em
  `statusLabel`/`STATUS_PILL` nas 3 telas de Pedidos (seller/fornecedor/admin).
- **Filtro "Devolução (N)"**: `fn_seller_pedidos_lista`/`fn_fornecedor_pedidos_lista` ganham
  `total_count_devolucao` (contagem independente do filtro ativo, via `count(*) filter`) —
  chip novo nas telas de Pedidos, alterna o filtro pra `em_devolucao`.
- **Fora de escopo**: causa raiz da atribuição errada no pipeline de criação do pedido em si
  (`submitSellerErpPedido.ts`/sync Olist) — sistêmico, afeta todo o financeiro do Galileus,
  não só devolução, mudança grande demais pra essa entrega.

## Devolução sem claim — calibração + rastreabilidade do repasse pro fornecedor (2026-10-31)

Investigando uma devolução real da Vinz Collection (comprador devolveu direto na logística,
"me arrependi da compra", sem abrir reclamação formal), confirmamos um buraco estrutural: a
detecção inteira (fase 1/2) só escuta `claims` do ML — nunca veria esse caso. Travamos esse
ledger manualmente (`fn_devolucao_auto_travar`, já existia) e, em paralelo, discutindo o que
acontece quando a devolução só é percebida depois do repasse já ter saído, achamos que a
rastreabilidade pro fornecedor (por que recebeu menos) também tinha buraco.

- **Calibração "sem claim"**: cron novo `dropcore-calibracao-devolucao-sem-claim` (1x/dia,
  `add-calibracao-devolucao-sem-claim-cron.sql`, lock advisory 913021) roda
  `processarCalibracaoDevolucaoSemClaim` (`devolucaoSemClaimCalibracao.ts`) — snapshot
  (order + shipment, mesmo allowlist seguro da calibração de claim) de todo pedido
  entregue/em devolução sem repasse ainda (janela 60 dias), gravado em
  `ml_devolucao_calibracao_log` (tabela já existente). Só observa, não trava dinheiro, não
  notifica, não decide nada — objetivo é achar o campo real que sinaliza "devolução sem
  claim resolvida" quando a devolução real da Vinz se resolver (prevista entre 2 e 5/11), pra
  só então desenhar a regra de detecção de verdade.
- **Achado de segurança (recorrente)**: `GRANT EXECUTE ... TO postgres` sozinho não revoga
  `anon`/`authenticated` — toda função `SECURITY DEFINER` nasce aberta por default do
  Supabase, mesmo quando só recebe grant explícito pra outro role. Corrigido nos 2 locks
  novos (913021); os ~10 locks de cron já existentes (`dropcore_try_ml_pedidos_reconciliacao_lock`
  e similares) têm o mesmo problema — não corrigidos ainda (risco baixo: só dá pra
  travar/destravar o advisory lock do cron, não expõe dado), registrado como pendência.
- **`financial_debito_descontar.pedido_id` corrigido**: a coluna existia desde
  `financial-module-v2.sql` mas o único insert (`/api/org/financial/devolucao-pos-repasse`)
  nunca a preenchia — débito ficava sem referência ao pedido que causou ele. Agora grava.
- **Notificação no momento certo**: `notifyFornecedorDebitoDevolucao.ts` — dois avisos que
  não existiam: quando o débito é **registrado** (ciclo futuro, ainda vai descontar) e quando
  é **efetivamente descontado** no fechamento do `repasse-semanal` (resumo por fornecedor,
  um pedido por linha, nunca um valor solto sem explicação).
- **Extrato por ciclo pro fornecedor**: `fn_fornecedor_repasse_detalhe(p_org_id,
  p_fornecedor_id, p_ciclo_repasse)` — RPC nova (`add-fornecedor-repasse-detalhe-rpc.sql`),
  retorna vendas (`PAGO`) + débitos de devolução (`descontado=true`) daquele ciclo, cada um
  com o pedido original. Exposta via `GET /api/fornecedor/repasse-detalhe`. UI: cada linha de
  "Repasses" no dashboard do fornecedor agora expande (clique) mostrando pedido a pedido —
  débito em destaque vermelho, vendas normais embaixo. Resolve "por que recebi menos essa
  semana" sem precisar abrir chamado.
- **Fora de escopo (ainda)**: criação automática do débito pós-repasse continua manual
  (admin digita `ledger_id` em `/devolucao-pos-repasse`) — quando a detecção automática
  (claim + sem-claim) confirmar devolução de ledger já `PAGO`, deveria criar o débito sozinha;
  não construído ainda, fica pro próximo passo depois de calibrar o sinal real.

## Telas de Pedidos (fornecedor + seller) — abas, busca e período (2026-11-01)

A pedido direto do Sr Stark, consolidou a navegação de `/fornecedor/pedidos` e
`/seller/pedidos` (dropdown de status único + chip solto "Devolução (N)") numa barra de abas
no topo (ícone + label + contador, sublinhado verde no item ativo — formato copiado de um
print do próprio seletor de métricas do Mercado Livre), mais busca por texto e filtro de
período (presets + calendário personalizado).

- **`fn_fornecedor_pedidos_lista`** e **`fn_seller_pedidos_lista`**: `p_status` virou
  `text[]` (antes `text`) — cada aba pode cobrir vários status reais de uma vez (ex:
  "Devolução" = `em_devolucao`+`devolvido`+`devolucao_sem_fornecedor`). As duas ganharam
  `p_desde`/`p_ate` (período) + busca por texto: fornecedor usa `p_seller_nome` (busca por
  seller, já que atende vários); seller usa `p_produto` (busca em `pedidos.nome_produto` —
  `p_fornecedor_nome` foi cogitado e descartado, hoje cada seller só tem 1 fornecedor
  conectado, filtrar por ele não muda a lista em nada). Contagem de
  cada aba agora vem tudo numa RPC só (`total_count_geral`, `total_count_pra_enviar` etc.,
  calculados numa CTE `base` antes do filtro de `p_status`, pra não ficar errado quando o
  filtro de busca/período também está ativo) — regra 4 do CLAUDE.md (1 RPC por tela).
- **Fornecedor** ganhou `ledger_id` na RPC (não tinha) — o card do pedido em devolução agora
  mostra os botões "Chegou tudo certo"/"Chegou com defeito" direto ali (componente
  `FornecedorDevolucaoAcoes.tsx`), puxando o `ledger_id` certo. `/fornecedor/devolucoes`
  (a página) foi **removida** (2026-11-02: inicialmente virou redirect, depois confirmado
  que não sobrava link interno nenhum pra ela — mesmo achado do caso admin — e removida de
  vez, sem redirect). As rotas de API (`/api/fornecedor/devolucoes/...`) continuam existindo
  normalmente, só a tela própria que sumiu.
- **Seller**: o filtro sintético antigo "etiqueta_buffer_ml" (não é `pedidos.status` real, é
  `enviado` + sem etiqueta + canal ML) saiu do seletor — a aba "Pra enviar" agora cobre todo
  `enviado` junto; a info de buffer continua visível no banner do próprio card, só não é mais
  um filtro isolado. A reserva sintética "aguardando pagamento" (`estoque_reservas`, não é
  `pedidos.status` real) entra nas abas "Todos" e "Pendências" — a API soma a contagem dela
  por cima do que a RPC devolve (RPC não sabe nada sobre `estoque_reservas`). Busca do seller
  é por `p_produto` (`pedidos.nome_produto` — busca por fornecedor foi cogitada e descartada,
  hoje cada seller só tem 1 fornecedor conectado, não filtraria nada).
- **`PeriodoPersonalizadoModal.tsx`** (`components/fornecedor/`, reaproveitado também no
  seller): popover de calendário ancorado no botão "Personalizado" (não modal central) — clica
  no dia inicial, depois no final; replica o formato do seletor de data do Mercado Livre
  (mês/ano no meio, setas `‹ ›` nas pontas, DOM/SEG/TER/QUA/QUI/SEX/SÁB).
- **Achado de segurança (recorrente)**: as duas RPCs novas nasceram abertas pra
  `anon`/`authenticated` (mesmo bug de sempre — `GRANT ... TO service_role` sozinho não
  revoga os outros roles). Fechadas no mesmo commit com `revoke all ... from public, anon,
  authenticated` explícito.
- **Destinatário real do pedido ML** (`mercadoLivrePedidoIngest.ts`): `comprador_nome`
  gravava só `buyer.nickname` (usuário do comprador na plataforma, quase sempre mascarado tipo
  "FEFACGDHB58097" por privacidade do ML — não é o nome de quem recebe o pacote). A UpSeller
  mostra nome real porque usa outro campo da API: `shipment.receiver_address.receiver_name`
  (+ `city`/`state`), o destinatário de entrega de verdade — mesmo dado que já sai impresso na
  etiqueta oficial. Ingestão agora busca o shipment (`mlBuscarShipmentDetalheBruto`, 1 chamada
  extra best-effort — se falhar, cai pro nickname mesmo, nunca bloqueia o pedido) e preenche
  `comprador_nome`/`comprador_cidade`/`comprador_uf` com o destinatário real. Só vale pra
  pedido novo a partir de agora — não retroage nos já existentes. Endereço completo/CEP
  continua de fora da tela de propósito (só vai impresso na etiqueta, não solto na UI).
  Backfill rodado uma vez via `/api/cron/backfill-destinatario-ml`: 1082 de 1083 pedidos ML
  antigos atualizados (1 falha permanente — seller sem integração ML ativa mais).

## Auditoria de devolução no admin (2026-11-02)

A pedido do Sr Stark ("tudo sobre as devoluções"), conferida a tela `/admin/devolucoes` +
`/admin/pedidos` de ponta a ponta. Achado: admin não tinha como saber **qual pedido** gerou
cada linha de devolução/débito — só o `pedido_id` interno (uuid), nunca o número do pedido,
em nenhuma das 3 listas da tela (em análise, pós-repasse pago, débitos pendentes). Mesma
lacuna que já tinha sido fechada pro fornecedor em `fn_fornecedor_repasse_detalhe`.

- `fn_org_debitos_fornecedor_pendentes_list`: ganhou `marketplace_numero` (join com
  `pedidos`) — DROP+CREATE (muda RETURNS TABLE).
- `GET /api/org/financial/ledger`: ganhou `marketplace_numero` resolvido via `.from()` direto
  (arquivo já é `.from()` de antes de 2026-10-07, não retroage pra RPC — regra 9).
- `/admin/devolucoes/page.tsx`: coluna "Pedido" nas 3 listas (desktop + mobile) — **essa
  tela foi consolidada em `/admin/pedidos` logo em seguida, ver seção abaixo**; o trabalho
  de expor `marketplace_numero` continua válido, só mudou de lugar.
- Resto já estava certo: badge/filtro de `em_devolucao`/`devolvido`/`devolucao_sem_fornecedor`
  em `/admin/pedidos` (da Fase 2), fluxo de confirmar/contestar/manter-venda/registrar-débito
  todos funcionando.

## Consolidação de /admin/devolucoes em /admin/pedidos (2026-11-02)

Mesmo padrão aplicado a fornecedor/seller mais cedo: "não faz sentido ter página separada,
quero simples igual fornecedor/seller". `/admin/devolucoes` ("Bloqueios e devoluções", mais
ampla que só devolução — cobria `BLOQUEADO`/`ENTREGUE`/`AGUARDANDO_REPASSE`/`EM_DEVOLUCAO`/
`PAGO` do `financial_ledger`) foi **removida** (não virou redirect, diferente do caso do
fornecedor — conferido que não sobrava link interno nenhum pra ela, nem notificação com URL
antiga gravada; o link do sino é montado na hora a partir do `tipo`, não fica preso ao
código antigo). Todos os pontos que linkavam pra lá (menu admin, dashboard, disputas-
fornecedor, repasse-fornecedor, sino de notificação) foram atualizados pra
`/admin/pedidos?status=devolucao` direto.

- **`GET /api/org/pedidos`**: ganhou abas (`p_status` virou lista separada por vírgula,
  mesmo grupo de fornecedor/seller: pendências/pra_enviar/enviados/devolução/concluídos/
  cancelados), busca (`busca` — nome_produto/marketplace_numero direto na tabela +
  seller/fornecedor resolvidos por nome antes via `.ilike` e combinados num `.or()`) e
  período (`desde`/`ate`). Contagem por aba via N queries `count:exact,head:true` em
  paralelo (arquivo é `.from()` de antes de 2026-10-07 — não virou RPC, regra 9 não
  retroage; manter o padrão já estabelecido no arquivo). Bug real corrigido de
  passagem: o filtro de status antigo nem aceitava `em_devolucao` na allowlist — selecionar
  "Em devolução" no dropdown antigo não filtrava nada, silenciosamente.
- **Ações de bloqueio/devolução movidas pro card** (`AcoesLedgerPedido` em
  `/admin/pedidos/page.tsx`): em vez de reconstruir a lógica, a tela busca
  `/api/org/financial/ledger?include_pago=1` + `/api/org/financial/debitos-pendentes` (as
  MESMAS rotas que a antiga `/admin/devolucoes` já usava, sem alteração) e casa por
  `pedido_id` num `Map`, client-side. "Confirmar envio" (`p.status==='enviado'`) já existia
  na tela e foi mantido; "Registrar devolução"/"Fornecedor conferiu"/"Devolução não
  procede"/"Registrar débito" são novos aqui, mesmos handlers/mensagens de confirmação da
  tela antiga, só renderizados condicionalmente conforme o `status` do ledger casado.
- **Fora de escopo**: não criou RPC nova pra `/api/org/pedidos` (arquivo grandfathered);
  `/api/org/financial/ledger` continua limitado a `.limit(100)` sem paginação própria
  (limitação pré-existente da tela antiga, não introduzida agora).

## Aba "Buffer" separada de "Pra enviar" (fornecedor + seller, 2026-11-02)

Achado do Sr Stark testando impressão real: a aba "Pra enviar" misturava pedido com
etiqueta pronta (disponível de verdade) com pedido `enviado` ainda preso no buffer
automático do próprio ML (sem etiqueta liberada ainda) — o buffer empurrava os pedidos
prontos pra baixo da lista, difícil de achar o que realmente dava pra despachar.

- **`fn_fornecedor_pedidos_lista`** e **`fn_seller_pedidos_lista`**: ganharam `p_buffer_ml`
  (`'somente' | 'excluir' | null`) — DROP+CREATE (novo parâmetro + novas colunas
  `total_count_buffer`, mais `total_count_pra_enviar` recalculado excluindo buffer). Condição
  de buffer: `status = 'enviado' and canal_venda = 'mercado_livre' and etiqueta_pdf_url is
  null and etiqueta_pdf_base64 is null` (mesma lógica de `emBufferMl()` no front, agora
  também no banco pra contagem certa por aba).
- **Abas**: nova aba "Buffer" (ícone de relógio) inserida **antes** de "Pra enviar" nas duas
  telas. "Pra enviar" passa a mandar `buffer_ml=excluir`; "Buffer" manda `buffer_ml=somente`.
  No seller, "Pra enviar" é só `enviado` (pendências já tinham aba própria), então o buffer
  sai inteiro dali.
- **Rotas**: `GET /api/fornecedor/pedidos` e `GET /api/seller/pedidos` ganham o query param
  `buffer_ml` (`somente`/`excluir`), repassado direto pra RPC; resposta `abas` ganha campo
  `buffer`.

## Aba "Erro" separada de "Pra enviar" (só fornecedor, 2026-11-02)

Mesmo achado, seguida: `erro_saldo` (seller sem saldo — pedido nem chega a ter etiqueta,
problema completamente diferente de buffer do ML) também não é "pronto pra enviar". No
seller já tinha aba própria ("Pendências"); só o fornecedor misturava. `erro_saldo` é
`pedidos.status` real (não sintético como buffer), então filtra pelo mecanismo normal de
`p_status` — só precisou de mais uma coluna de contagem.

- **`fn_fornecedor_pedidos_lista`**: `total_count_pra_enviar` agora só soma
  `pendente_estoque`+`bloqueado`+`enviado sem buffer` — `erro_saldo` sai pra
  `total_count_erro` (coluna nova). DROP+CREATE de novo (muda RETURNS TABLE).
- **Aba nova "Erro"** (ícone de engrenagem) entre "Buffer" e "Pra enviar". "Pra enviar"
  perde `erro_saldo` do array de `statuses` no front.

## Aba "Buffer" separada de "Pra enviar" (admin, 2026-11-02)

Mesmo achado aplicado em `/admin/pedidos` — pedido confirmado explicitamente pelo Sr Stark
("quero, vamos deixar organizado né"). `erro_saldo` já estava corretamente isolado na aba
"Pendências" existente do admin, então essa rodada só cobre o buffer do ML.

- **`web/app/api/org/pedidos/route.ts`** é rota grandfathered (`.from()` direto, anterior à
  regra 9) — não ganhou RPC nova, a condição de buffer é aplicada via filtro encadeado do
  query builder (`aplicarFiltroBuffer()`), não SQL puro. Cuidado já tratado: `canal_venda.neq
  .mercado_livre` sozinho não pega linha com `canal_venda` nulo (semântica de 3 valores),
  então o modo `'excluir'` usa `.or("canal_venda.is.null,canal_venda.neq.mercado_livre,
  etiqueta_pdf_url.not.is.null,etiqueta_pdf_base64.not.is.null")`.
- SELECT principal ganhou `canal_venda, etiqueta_pdf_url, etiqueta_pdf_base64`. `contarGrupo`
  ganhou segundo parâmetro `bufferFiltro` pra separar a contagem de `pra_enviar` (`'excluir'`)
  da nova `buffer` (`'somente'`).
- **Aba nova "Buffer"** (ícone de relógio) entre "Pendências" e "Pra enviar" em
  `/admin/pedidos`; "Pra enviar" manda `buffer_ml=excluir`. Resposta `abas` ganha campo
  `buffer`.

## `fn_fornecedor_pedidos_lista` — contador por pacote + contador nunca depende da listagem (2026-11-04)

`web/scripts/fix-fornecedor-pedidos-contadores-pacote-e-aba-vazia.sql`. Dois bugs reais
achados ao vivo na tela `/fornecedor/pedidos`:

- **Contadores de todas as abas zeravam junto quando a aba ativa não tinha nenhum pedido.**
  Antes, os `total_count_*` só "pegavam carona" nas linhas que sobreviviam ao filtro da aba
  ativa + `LIMIT`/`OFFSET` (`CROSS JOIN` de `contagens` com `base` já filtrado) — se a aba
  clicada batia 0 linhas de verdade (ex.: "Pra enviar" com só 1 pedido naquele momento), o
  `CROSS JOIN` inteiro virava 0 linhas e **todos** os contadores (inclusive de abas sem
  relação nenhuma com o filtro clicado) caíam no fallback `?? 0` do `route.ts`. A lista
  ficava vazia junto, e como o selo "Etiqueta liberada" só existe dentro do `.map()` sobre os
  pedidos carregados, ele também sumia — sintoma, não um 3º bug. Corrigido separando
  `contagens`/`filtrado_total` (agregados sem `GROUP BY`, sempre 1 linha) de `paginado`
  (pode ter 0 linhas), ligados por `LEFT JOIN` — contador nunca mais depende de ter pedido
  na página atual.
- **Badge "Para retirar" mostrava um número maior que a quantidade de cards renderizados**
  (e o mesmo valia, estruturalmente, pra qualquer outra aba). Causa: o contador contava
  LINHA de `pedidos` (1 `order_id` = 1 linha), mas `route.ts:299-332` agrupa pedidos do
  mesmo `marketplace_pack_id` (comprador que leva >1 item no mesmo checkout do ML) num
  único card — ver seção "`pedidos.marketplace_pack_id`" acima. Corrigido contando por
  PACOTE (`coalesce(marketplace_pack_id, id::text)`, 1 linha representante por pacote via
  `DISTINCT ON`) em todos os `total_count_*` de aba. `total_count` (usado pra paginação e
  pro "Total X pedidos" do rodapé) continua contando linha crua de propósito — o `LIMIT`/
  `OFFSET` ainda opera em linha, o agrupamento em card só acontece depois, no `route.ts`.

`web/app/api/fornecedor/pedidos/route.ts` ajustado para ler os contadores sempre de
`rows[0]` (agora garantido existir, mesmo com a aba vazia — nesse caso vem com `id = null`)
e filtrar essa linha "sem pedido" antes de montar a listagem (`rows.filter(r => r.id !=
null)`).

**Mesmo bug confirmado e corrigido em `fn_seller_pedidos_lista`/`/api/seller/pedidos`**
(CTE irmã, mesmo desenho — `web/scripts/fix-seller-pedidos-contadores-pacote-e-aba-
vazia.sql`, mesmo ajuste em `route.ts`). As duas migrations foram aplicadas em produção em
2026-11-04. Validado com `fn_seller_pedidos_lista` chamada com org/seller inexistente: antes
teria devolvido 0 linhas (sem contador nenhum); agora devolve 1 linha com `id = null` e todos
os `total_count_*` em 0 — confirma que o `LEFT JOIN` nunca mais perde o contador.

## `fn_fornecedor_pedidos_lista` — aba "Sem estoque" separada de "Pra enviar" (2026-11-05)

`web/scripts/add-fornecedor-pedidos-aba-sem-estoque.sql`. Pedido com `status =
'pendente_estoque'` (SKU com `estoque_atual = 0`) estava dentro da aba "Pra enviar" junto
com pedido que já tem etiqueta liberada — mas não tem nada "pra enviar" nesse caso, o
fornecedor primeiro precisa reabastecer o SKU. Corrigido: `pendente_estoque` sai do filtro
`pra_enviar_status` (que agora só conta `bloqueado`) e ganha contador próprio
`total_count_sem_estoque`; `web/app/fornecedor/pedidos/page.tsx` ganhou a aba `sem_estoque`
(`statuses: ["pendente_estoque"]`) entre "Erro" e "Pra enviar"; `route.ts` repassa
`total_count_sem_estoque` em `abas.sem_estoque`.

## `fn_fornecedor_pedidos_lista` — contador por pacote com status misto (2026-11-05)

`web/scripts/fix-fornecedor-pedidos-contador-pacote-status-misto.sql`. Bug achado ao vivo
testando a aba "Sem estoque" acima: badge mostrava "Sem estoque (0)" com 1 card na lista.
Causa: pacote com >1 item (mesmo `marketplace_pack_id`) pode ter status diferente entre as
linhas — ex. pedido `2000015847033449` do fornecedor Djulios com uma linha já
`aguardando_repasse` (postada) e outra `pendente_estoque` (SKU zerado). A versão de
2026-11-04 contava o badge pegando só a linha MAIS RECENTE de cada pacote como
representante (`distinct on pack_key order by criado_em desc`) — o pacote inteiro "virava"
1 status só pro contador, mesmo tendo pendência real em outro status. Mesma classe de bug
provavelmente já afetava qualquer outro badge com pacote de status misto, não só "Sem
estoque". Corrigido trocando `distinct on` por `bool_or` agrupado por `pack_key` — o pacote
conta em TODO badge onde tiver pelo menos 1 linha daquele status. Um mesmo pacote pode
contar em >1 badge ao mesmo tempo agora, de propósito: a listagem (`filtrado`) já filtra por
linha crua, não por pacote deduplicado, então ele já aparecia (como cards diferentes) em
mais de uma aba antes dessa correção — só o contador que ficava errado. Validado ao vivo:
`total_count_sem_estoque` do pedido acima foi de 0 para 1, outros contadores (geral,
pra_enviar, enviados) continuaram iguais.

## `fornecedor_mercadolivre_integrations` — fornecedor conecta o próprio Mercado Livre, substitui Olist como fonte de estoque (2026-11-06)

`web/scripts/create-fornecedor-mercadolivre-integrations.sql`. Até aqui o fornecedor só
sincronizava `skus.estoque_atual` via Olist/Tiny (webhook + cron pull), e só o Djulios
usava isso, parado desde 2026-06-30. Problema de fundo: o fornecedor pode ter vendas FORA
do DropCore (direto no próprio Mercado Livre, ou em qualquer canal que ele reporte lá) que
corroem o estoque físico sem o DropCore nunca saber — risco real de overselling pros
sellers.

Troca: o fornecedor conecta a própria conta Mercado Livre (OAuth, mesmo padrão de
`seller_mercadolivre_integrations` mas tabela própria `fornecedor_mercadolivre_integrations`,
app ML separado — `MERCADOLIVRE_FORNECEDOR_CLIENT_ID`/`_SECRET`, mesmo precedente de
isolamento de `mercadoLivreOAuthAvulso.ts`). Um cron (`dropcore-fornecedor-mercadolivre-sync-estoque`,
a cada 5 min no piloto) lê os anúncios ativos/pausados do fornecedor no ML, extrai o
atributo `SELLER_SKU` de cada anúncio/variação (mesma lógica de
`mercadoLivreSkuSync.ts#extrairSkusDoItem`, sem tabela de mapeamento própria — lido em
tempo real a cada sync, único consumidor hoje é a escrita de estoque) e o `available_quantity`
correspondente, e substitui `skus.estoque_atual` pelo valor lido — sync completo do saldo,
não é baixa por venda (reflete reposição pra cima e venda pra baixo).

**Agregação quando o mesmo SKU aparece em >1 anúncio**: usa o MENOR valor (`Math.min`), não
soma nem usa o maior. Decisão fechada com o Sr Stark 2026-11-06: anúncios do mesmo produto
costumam ficar espelhados (ferramentas tipo Upseller sincronizam o mesmo número em todos);
se 1 anúncio ficar dessincronizado mostrando valor alto por engano, MAX inflaria estoque
fictício (overselling de verdade); MIN erra sempre pro lado seguro (subestima, nunca
superestima).

Escrita final em `skus` via RPC `fn_fornecedor_sku_estoque_mercadolivre_set` (regra 9 —
tabela/rota nova, SECURITY DEFINER, só `service_role`). As outras 4 RPCs
(`fn_fornecedor_mercadolivre_integracao_upsert/get/delete`,
`fn_fornecedor_mercadolivre_integracoes_conectadas_lista`) cobrem o CRUD da tabela de
integração. Propagação pros sellers reusa `syncOlistEstoqueFornecedorSkus`
(`web/lib/sellerOlistSyncEstoqueOnChange.ts`, genérica apesar do nome — já empurra pro ML
dos sellers também, `skipFornecedorPush: true` porque a mudança já veio do ML do
fornecedor).

Guard de exclusividade: conectar o ML é bloqueado (HTTP 409) se o fornecedor já tem Olist
ativa — evita dois crons escrevendo `estoque_atual` ao mesmo tempo com fontes divergentes.

Menu do fornecedor: aba "ERP" (`/fornecedor/integracoes-erp`) virou "Integrações"
(`/fornecedor/integracoes-marketplace`), mesmo padrão aplicado ao seller em 2026-11-04
(commit `fcd617b`) — `web/app/fornecedor/integracoes-erp/layout.tsx` novo faz `redirect()`,
`page.tsx` da Olist continua intacto por baixo, só saiu do `FornecedorNav`.

**Webhook em tempo real (2026-11-07)**: além do cron de 5 em 5 min, o fornecedor pode
assinar o tópico "Orders" no app ML próprio (`DropCore Fornecedor`,
`MERCADOLIVRE_FORNECEDOR_CLIENT_ID`) apontando pra
`web/app/api/webhooks/mercadolivre-fornecedor/route.ts` — toda notificação `orders_v2`
dispara de novo o MESMO `pullFornecedorEstoqueFromMercadoLivre` do cron, na hora em vez de
esperar até 5 min (não precisa interpretar o `resource` da notificação, `available_quantity`
do anúncio já reflete a venda). Sem debounce de propósito — é código determinístico, sem
custo de IA, rajada de vendas só gera pulls redundantes baratos. RPC nova pra resolver o
dono da notificação sem `.from()` direto (regra 9): `fn_fornecedor_mercadolivre_integracao_por_ml_user_id`
(`web/scripts/add-fn-fornecedor-mercadolivre-integracao-por-ml-user-id.sql`).

## Pendências conhecidas

- Leaked password protection (HaveIBeenPwned): **ativado** em 2026-07-09 no Supabase Auth (Sign In / Providers → Email → "Prevent use of leaked passwords").
