# DropCore — Regras do Projeto

Hub B2B de conexão e governança entre **sellers** e **fornecedores**. O DropCore não é
marketplace nem ERP e não intermedia pagamento do cliente final — ele conecta quem vende
(seller) a quem fabrica/despacha (fornecedor), com camada financeira própria (créditos,
mensalidades, repasses) e integrações com ERPs externos (Olist, Bling).

> DropCore é **multi-organização (B2B)**: cada `org` tem membros (`org_members`) com papéis
> (`owner`, `admin`) e vínculo a um `seller` ou `fornecedor`. Dado pertence à org/seller/
> fornecedor, não a um único `user_id` solto — não simplificar pra modelo single-user.

## Stack
- Front/back: Next.js 15 (App Router) + React 19 + TypeScript
- Estilo: Tailwind CSS
- DB / Auth / Storage: Supabase (Postgres)
- Hospedagem: Vercel — projeto oficial `dropcore-web`, domínio `www.dropcore.com.br`
- Pagamento: Mercado Pago (PIX)
- Integrações ERP: Olist e Bling (webhooks + sync de estoque)
- Testes: Vitest

## Comandos
- dev: `npm run dev`
- build: `npm run build`
- typecheck: `npm run typecheck`
- lint: `npm run lint`
- test: `npm run test`
- deploy: `npm run deploy:vercel` (ver `DEPLOY-VERCEL.txt`)

## Estilo / UI
- Tokens de cor, âmbar, sucesso/erro e modais têm fonte única em `web/lib/*Premium.ts` e
  `web/lib/dropcorePalette.ts` — nunca duplicar classes ad hoc nas páginas, sempre importar
  desses módulos.
- Modal/dialog sempre centralizado na viewport (vertical e horizontal), mobile e desktop.
  Nada de "bottom sheet" para formulário, PIX ou confirmação.

## Identidade e idioma
- **Jarvis** = o assistente de IA neste projeto; **Sr Stark** = o usuário/dono do projeto.
  Não confundir com telas ou funcionalidades do app.
- Toda comunicação com o usuário é em **português do Brasil**, nunca português de Portugal.

## Regra de ouro
Antes de QUALQUER alteração em código, banco, RLS, função ou infra: apresentar o plano
(Plan Mode) e aguardar aprovação. Exceção: typo e lint fix. Uma feature por vez; não
refatorar o que não foi pedido. Se algo for violar uma regra abaixo, pare e avise.

## Regras inegociáveis (NÃO violar)
1. **RLS sempre ligada.** Toda tabela nasce com RLS habilitada. Nada acessível por padrão.
   Nunca criar tabela sem policy.
2. **Privacidade do fornecedor.** O fornecedor NUNCA vê a taxa/porcentagem que o DropCore
   cobra (`valor_dropcore`, `valor_total`) — só `valor_fornecedor` (o que ele recebe), em
   tela, notificação ou API.
3. **Storage.** Documento/comprovante sensível (ex: documento de seller, comprovante de
   depósito) só em bucket privado via signed URL para o dono. Imagem de catálogo/produto
   pode ser pública (é vitrine), mas sempre passando pelo proxy de imagem já existente.
4. **Uma RPC por tela sempre que possível.** Dashboard e telas de listagem buscam de UMA
   função RPC que devolve tudo pronto (padrão `fn_org_dashboard_pro_30d` etc.) — evitar o
   front disparar vários selects soltos para montar uma tela.
5. **Lógica de negócio nunca no front.** Cálculo de saldo, repasse, crédito, taxa,
   validação financeira — tudo em RPC no Postgres ou em API route server-side. Front só
   exibe e chama.
6. **Schema enxuto.** Não criar tabela sem uso real. Dado derivado vira coluna/jsonb, não
   tabela nova.
7. **Deploy só no projeto `dropcore-web`.** Nunca usar/criar o projeto Vercel `web`. Nunca
   `vercel --prod` sem confirmar antes o link local para `dropcore-web`.
8. **PIX/Mercado Pago.** Nunca tratar o ambiente como "produção de verdade" sem confirmar
   `MERCADOPAGO_ACCESS_TOKEN` de produção e `MERCADOPAGO_TEST_MODE` desligado — enquanto
   isso não estiver confirmado, o PIX é sandbox, mesmo com o app deployado.

## Checklist obrigatório — banco de dados
Sempre que criar tabela, alterar RLS, criar função ou query, seguir:

1. **RLS — acesso**
   - UMA policy por tabela/role, cobrindo `FOR ALL`, usando o vínculo real (via
     `org_members`, `seller_id` ou `fornecedor_id` — não assumir `user_id` direto salvo
     onde a tabela realmente é por usuário).
   - NUNCA `USING (true)`. NUNCA múltiplas policies permissivas na mesma tabela/role
     (Postgres avalia todas com OR). Preferir `FOR ALL` a policies separadas por operação.

2. **Performance (initplan)**
   - Preferir `(select auth.uid())` em vez de `auth.uid()` direto na policy — avalia uma
     vez por query em vez de por linha. Código legado no repo ainda usa a forma direta;
     não copiar esse padrão em policy nova.

3. **Funções / RPC — segurança**
   - `SECURITY DEFINER` sempre com `SET search_path = public` (schema-qualificado dentro
     da função) e `REVOKE ALL ON FUNCTION ... FROM PUBLIC` (liberar só pro role que precisa).
   - Sempre checar `auth.uid()` e o vínculo (org/seller/fornecedor) dentro da função antes
     de retornar dado.

4. **Queries**
   - NUNCA `SELECT *` — só as colunas necessárias.
   - Paginação sempre (LIMIT/cursor) em listas.

5. **Índices**
   - Criar índice nas colunas usadas em WHERE, JOIN e ORDER BY. Conferir com
     `EXPLAIN ANALYZE`.

## Migrations
- Alteração de banco vira arquivo SQL em `web/scripts/`, nome descritivo do que faz
  (ex: `fix-fn-org-dashboard-pro-30d.sql`).
- NUNCA reescrever um script já aplicado em produção — criar um novo script corretivo.
- Por enquanto existe um único ambiente (sem staging) — validar com cuidado antes de rodar
  em produção; quando existir staging, testar lá antes.

## Schema = fonte de verdade
- Hoje o schema técnico vive espalhado em `web/scripts/*.sql`; `docs/` cobre regras de
  negócio (`01-regras-comerciais.md` etc.), não o schema.
- Ao mexer em tabela/coluna/policy/RPC nova, registrar em `docs/SCHEMA.md` (criar se não
  existir) no mesmo commit, pra virar fonte única de nomes e constraints.
- Antes de sugerir uma query, conferir `docs/SCHEMA.md` (ou os scripts mais recentes em
  `web/scripts/`) para confirmar nomes e constraints reais.

## Segredos
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` pode ir no front; `SUPABASE_SERVICE_ROLE_KEY` só em
  backend/API route, JAMAIS no front nem commitada.
- `MERCADOPAGO_ACCESS_TOKEN` e credenciais de Olist/Bling: só no servidor.
- `.env.local` no `.gitignore`. Nunca hardcodar chave em SQL ou código.

## TypeScript & código
- Tipagem sempre. Proibido `any`. Gerar e usar os tipos do Supabase.
- Componentes pequenos e focados, sem lógica de negócio dentro.
- Após mutation, revalidar os dados no padrão do App Router (`revalidatePath` /
  `router.refresh()`), não deixar tela com dado desatualizado em cache.

## Convenções
- Tabelas e colunas em `snake_case` (ex: `org_members`, `seller_credit_lots`).
- Componentes React em PascalCase; helpers/libs em camelCase (padrão já usado em
  `web/lib`).

## Schema (referência)
- **Organização:** `orgs`, `org_members` (papel + vínculo a seller/fornecedor).
- **Sellers:** `sellers`, `seller_invites`, `seller_credit_lots`, `seller_movimentacoes`,
  `seller_depositos_pix`, `seller_bling_integrations`, `seller_olist_integrations`.
- **Fornecedores:** `fornecedores`, `fornecedor_invites`, `fornecedor_olist_integrations`,
  `fornecedor_produto_rascunhos`.
- **Catálogo/estoque:** `skus`, `produto_tabela_medidas`, `sku_alteracoes_pendentes`,
  `estoque_reservas`.
- **Pedidos:** `pedidos`, `pedido_itens`, `pedido_eventos`.
- **Financeiro:** `financial_planos`, `financial_mensalidades`, `financial_ledger`,
  `financial_repasse_fornecedor`, `financial_ciclos_repasse`, `financial_debito_descontar`.
- **Infra/integrações:** `bling_webhook_logs`, `olist_webhook_logs`,
  `fornecedor_olist_webhook_logs`, `erp_event_logs`, `api_rate_limits`, `notifications`,
  `dropcore_design_tokens`, `calculadora_invites`.

## Depois (não agora)
Ambiente de staging ainda não existe (um único ambiente de produção). Quando for criado,
documentar aqui o fluxo de branch, deploy staging/produção e como isso se encaixa com o
projeto `dropcore-web` na Vercel. Não inventar esse fluxo antes de existir.
