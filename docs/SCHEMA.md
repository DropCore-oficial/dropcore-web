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
pra cron 1x/dia, não é rota user-facing). **Limpeza de `cron.job_run_details` ainda não
decidida** — precisa de política de retenção (ex: apagar linha com mais de N dias), mesmo
padrão do cron `dropcore-cleanup-net-http-response` já existente.

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

## `seller_ai_chat_sessions`/`seller_ai_chat_mensagens` — chat com o Tiago Silva (Gestor Mestre, 2026-09-30)

`web/scripts/create-seller-ai-chat-tiago.sql`. Chat síncrono (Messages API, não Batch) onde o Tiago Silva orquestra os outros gestores via
tool-calling, lendo só `seller_ai_runs` (nunca dispara rodada nova de gestor no meio da
conversa, por custo/latência). Parte do add-on "Gestores de IA" (mesmo gate de
Diogo/Andrey/Amanda — `gestores_ia_addon_ativo`).

**v1 não tem streaming token-a-token de verdade** (`app/api/seller/gestores-ia/tiago/chat/route.ts`):
o endpoint roda o loop de tool-calling inteiro (até 4 idas-e-voltas com a Anthropic) e só
devolve a resposta final pronta — streaming exigiria multiplexar várias chamadas da API num
SSE só pro cliente, complexidade real que ficou pra depois. UX hoje é "Tiago está
digitando…" enquanto espera, não texto aparecendo aos poucos.

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

## Pendências conhecidas

- Leaked password protection (HaveIBeenPwned): **ativado** em 2026-07-09 no Supabase Auth (Sign In / Providers → Email → "Prevent use of leaked passwords").
