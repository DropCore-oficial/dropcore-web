# Auditoria de Segurança — DropCore

Documento de evidências: onde está no código, como testar e resultado esperado.

---

## 1) Segredos e ambiente

### 1.1 SUPABASE_SERVICE_ROLE_KEY só server-side (Route Handlers)

| Onde está | Arquivo(s) | Evidência |
|-----------|------------|-----------|
| Uso da chave | `web/app/api/org/**/*.ts`, `web/lib/supabaseAdmin.ts` | `process.env.SUPABASE_SERVICE_ROLE_KEY` aparece apenas em arquivos sob `app/api/` (Route Handlers) e em `lib/supabaseAdmin.ts`. Em Next.js, `app/api/*` roda apenas no servidor. |
| Import de supabaseAdmin | Nenhum arquivo `"use client"` importa `supabaseAdmin` ou acessa `SUPABASE_SERVICE_ROLE_KEY`. | Grep em `web`: imports de `supabaseAdmin` ou `SUPABASE_SERVICE_ROLE` só em `app/api/` e `lib/supabaseAdmin.ts`. Os arquivos com `"use client"` (dashboard, catalogo, admin/*, org/*) usam `supabaseBrowser` ou `supabase` (anon). |

**Como testar**
1. Build: `cd web && npm run build`.
2. No bundle do browser (ex.: DevTools → Sources, ou análise do output do build), buscar por `SUPABASE_SERVICE_ROLE` ou `service_role` em chunks de página (não em `node_modules`).  
**Resultado esperado:** nenhuma ocorrência da chave em código que vai para o cliente.

### 1.2 Service role não em client nem em console.log

| Verificação | Resultado |
|-------------|-----------|
| Grep `"use client"` + service role | Nenhum arquivo com `"use client"` referencia `SUPABASE_SERVICE_ROLE` ou `supabaseAdmin`. **OK** |
| Grep `console.log` em web (excl. node_modules) | Nenhum `console.log`/`console.debug`/`console.info` com a chave no código da app. (Há `console.error` em toggle-finance e em /api/org/me para erros genéricos, sem logar tokens.) **OK** |

**Como testar**  
Rodar: `grep -r "SUPABASE_SERVICE_ROLE\|service_role\|supabaseAdmin" web/app --include="*.tsx" --include="*.ts"` (excluindo `app/api`).  
**Resultado esperado:** nenhum match em arquivos de página/componente.

### 1.3 .env.local no .gitignore e chaves não commitadas

| Onde está | Evidência |
|-----------|-----------|
| .gitignore | `web/.gitignore` contém `.env*` (linha 36: `# env files (can opt-in for committing if needed)` e `.env*`). Arquivos `.env*` são ignorados. |

**Como testar**
1. `cd web && git check-ignore -v .env.local` → deve listar a regra do .gitignore.
2. `git log -p --all -- '*.env*' 'web/.env*'` → não deve mostrar conteúdo de `.env` ou `.env.local`.  
**Resultado esperado:** `.env.local` ignorado; nenhum commit com conteúdo de env (se já houve commit de .env no passado, a chave deve ser rotacionada).

**Risco:** O grep da auditoria encontrou `web/.env.local` com valor de `SUPABASE_SERVICE_ROLE_KEY` no workspace. Se esse arquivo estiver versionado em qualquer branch ou histórico, a chave deve ser considerada vazada e substituída no Supabase e em todos os ambientes.

---

## 2) Autenticação e sessão

### 2.1 Bloqueio de páginas privadas sem sessão

| Onde está | Evidência |
|-----------|-----------|
| Middleware | `web/middleware.ts`: após `supabase.auth.getUser()`, se `path` é `/dashboard`, `/admin`, `/catalogo` ou `/org` e `!user`, redireciona para `/login`. |

**Como testar**
1. Abrir uma aba anônima, acessar `https://seu-dominio/dashboard` (ou `/admin/empresas`, `/catalogo`, `/org/membros`).  
**Resultado esperado:** redirecionamento para `/login` (302 ou 307).

### 2.2 Refresh de token e logout/expiração

| Onde está | Evidência |
|-----------|-----------|
| Refresh | `web/app/dashboard/page.tsx`: `fetchMe()` usa `getSession()`, e se não houver token chama `refreshSession()` antes de chamar `/api/org/me`. O Supabase client faz refresh automático quando usa `getUser()`/`getSession()` em requisições. |
| Logout | Várias páginas (dashboard, catalogo, admin/catalogo, org/membros): botão “Sair” chama `supabase.auth.signOut()` e depois `router.push("/login")` ou `router.replace("/login")`. |
| Expiração | APIs que usam token: `/api/org/me` retorna 401 se `getUser(token)` falhar (“Token inválido ou expirado.”). O cliente deve redirecionar para login (hoje em parte feito via layouts que checam `/api/org/me`). |

**Como testar**
1. Logar, abrir DevTools → Application → Local Storage, remover/alterar chaves do Supabase; recarregar e tentar acessar uma rota protegida.  
**Resultado esperado:** 401 em chamadas de API e/ou redirecionamento para login.  
2. Clicar em “Sair”.  
**Resultado esperado:** sessão limpa e redirecionamento para `/login`.

### 2.3 Fluxo: getSession → token → Authorization Bearer

| Passo | Onde está |
|-------|-----------|
| 1. Obter sessão | Ex.: `web/app/admin/catalogo/page.tsx` linha ~202: `const { data: { session } } = await supabaseBrowser.auth.getSession();` |
| 2. Token | `session.access_token` |
| 3. Enviar nas rotas | Ex.: `fetch("/api/org/catalogo/search?..." , { headers: { Authorization: \`Bearer ${session.access_token}\` } })` |
| 4. API lê token | Ex.: `web/app/api/org/catalogo/search/route.ts`: `getBearerToken(req)` ou cookies; depois `supabaseAnon.auth.getUser(bearerToken)`. |

**Como testar**  
DevTools → Network: ao carregar catálogo admin, a requisição para `/api/org/catalogo/search` deve ter header `Authorization: Bearer <jwt>`.  
**Resultado esperado:** header presente e API retornando 200 (com sessão válida) ou 401 (sem/válida).

---

## 3) Autorização (rotas sensíveis)

Rotas consideradas: **catalogo/search** (GET), **catalogo/search/update** (PATCH), **catalogo/search/delete** (DELETE), **catalogo/search/ativar** (PATCH), **catalogo/search/inativar** (PATCH).

### 3.1 Matriz de testes (search, update, delete, ativar, inativar)

| Cenário | Onde validar | Como testar | Resultado esperado |
|---------|--------------|-------------|--------------------|
| (a) Sem token | Todas: checam user/token antes de usar org. | `curl -X GET '.../api/org/catalogo/search?orgId=...'` sem header Authorization. | 401 |
| (b) Token inválido | `/api/org/me` e rotas que dele dependem: `getUser(token)` falha. | `curl` com `Authorization: Bearer token_invalido`. | 401 |
| (c) Token válido, role operacional | search: permite operacional (só leitura; custo_base removido). update/delete/ativar/inativar: `getMe()` e checagem `role_base !== "owner" && role_base !== "admin"`. | Logar como usuário com `role_base = operacional`, chamar PATCH/DELETE para update/delete/ativar/inativar (ex.: via fetch no console ou Postman). | search: 200; update, delete, ativar, inativar: 403 |
| (d) Token válido, owner ou admin | getMe() retorna org_id e role; queries usam `.eq("org_id", org_id)`. | Logar como owner/admin, chamar as rotas com o org_id da própria org. | 200 (e dados apenas da própria org) |

**Evidência no código**
- **search:** `web/app/api/org/catalogo/search/route.ts`: sem token → 401; depois `org_members` com `org_id` + `user_id`; se não member ou role não owner/admin/operacional → 403; operacional recebe itens sem `custo_base`.
- **update/delete/ativar/inativar:** Ex.: `web/app/api/org/catalogo/search/update/route.ts`: `getMe(req)` (que usa token via /api/org/me); depois `if (role_base !== "owner" && role_base !== "admin") return 403`; update/delete com `.eq("org_id", org_id)`.

### 3.2 IDOR (orgId de outra org)

| Onde está | Evidência |
|-----------|-----------|
| catalogo/search | `orgId` vem do query string; a API faz `org_members` com `.eq("org_id", orgId).eq("user_id", user.id)`. Se o usuário não for da org informada, `member` é null → 403. |
| update/delete/ativar/inativar | Não usam `orgId` do body; usam `org_id` retornado por `getMe(req)` (sessão). O update/delete é `.eq("id", id).eq("org_id", org_id)`, então só altera linhas da própria org. **OK** |

**Como testar**  
Com token de usuário da org A, chamar `GET /api/org/catalogo/search?orgId=<org_id_da_org_B>`.  
**Resultado esperado:** 403 (Sem permissão).

---

## 4) RLS no Supabase

### 4.1 Tabelas com RLS habilitado

O projeto não define migrations de RLS no repositório. As referências estão em scripts de debug (`web/scripts/debug-permissions.sql`), que apenas consultam ou sugerem habilitar/desabilitar RLS em `org_members`.

**Como obter evidência**  
No Supabase Dashboard → SQL Editor:

```sql
SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('orgs', 'org_members', 'skus', 'repasses_fornecedor', 'fornecedores');
```

**Resultado esperado (recomendado):** `rowsecurity = true` para tabelas sensíveis (ex.: org_members, skus). Se estiver `false`, a proteção hoje é só via API (service role no servidor).

### 4.2 Policies exatas

Não há arquivos no repo que criem policies para `orgs`, `org_members`, `skus`, `repasses_fornecedor`. Para listar o que existe no banco:

```sql
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('orgs', 'org_members', 'skus', 'repasses_fornecedor', 'fornecedores');
```

**Resultado esperado (recomendado):** policies que restrinjam SELECT/UPDATE/INSERT/DELETE por `auth.uid()` e membership na org (ex.: join com `org_members`).

### 4.3 Uso de ANON vs service role

| Camada | Evidência |
|--------|-----------|
| Frontend | Páginas usam `supabaseBrowser` ou `supabase` (client com anon key) apenas para auth (getSession, signOut). Dados de catálogo vêm de **fetch** para `/api/org/catalogo/search`, não de select direto em `skus`. |
| API (servidor) | Rotas em `app/api/org/*` usam `createClient(..., SUPABASE_SERVICE_ROLE_KEY)` para acessar `org_members`, `skus`, `fornecedores`, etc. Ou seja: hoje o backend usa service role e não depende de RLS. |

**Conclusão:** Se RLS não estiver ativo ou não houver policies, o controle é só pela API. Para “prova real”, ativar RLS e policies e repetir testes com cliente autenticado (anon) direto no Supabase: usuário não deve ler/escrever dados de outra org.

---

## 5) RPCs Security Definer

### 5.1 rpc_toggle_finance_access

| Onde está | `web/scripts/check-rpc.sql` |
|-----------|-----------------------------|
| Definição | `CREATE OR REPLACE FUNCTION rpc_toggle_finance_access(p_org_id UUID, p_user_id UUID, p_enable BOOLEAN) RETURNS VOID ... SECURITY DEFINER`. No corpo: apenas `UPDATE org_members SET pode_ver_dinheiro = p_enable WHERE org_id = p_org_id AND user_id = p_user_id`. **Não há checagem de `auth.uid()` nem de role (owner/admin) dentro da função.** |
| Permissão | `GRANT EXECUTE ON FUNCTION ... TO authenticated;` |

**Risco:** Qualquer usuário autenticado pode chamar a RPC diretamente (pela anon key no client) e alterar `pode_ver_dinheiro` de qualquer membro de qualquer org.

**Como testar (exploração)**  
Com um usuário **operacional** logado, no console do browser:

```js
const { data: { session } } = await supabase.auth.getSession();
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const { data, error } = await supabase.rpc('rpc_toggle_finance_access', {
  p_org_id: '<org_id>',
  p_user_id: '<user_id_do_alvo>',
  p_enable: true
});
```

**Resultado esperado (seguro):** 403 ou erro de permissão. **Atual (inseguro):** a RPC pode executar com sucesso.

**Correção recomendada:**  
- Opção A: Dentro da RPC, verificar que `auth.uid()` existe e pertence a `org_members` com `role_base IN ('owner','admin')` para `p_org_id`; caso contrário, `RAISE EXCEPTION`.  
- Opção B: Revogar `GRANT EXECUTE ... TO authenticated` e deixar apenas o backend (service role) chamar a RPC (como já faz `toggle-finance/route.ts`).

### 5.2 rpc_add_org_member

Não encontrada no repositório. Se existir no banco, a mesma lógica se aplica: a RPC deve verificar que o chamador é owner/admin da org (via `auth.uid()` e `org_members`) antes de inserir.

---

## 6) Catálogo/SKUs — regras de permissão

### 6.1 Quem pode editar, inativar, ativar, apagar

| Ação | Rota | Quem pode | Onde está |
|------|------|-----------|------------|
| Buscar (leitura) | GET catalogo/search | owner, admin, operacional (operacional sem custo_base) | route.ts: isAdmin \|\| isOperacional |
| Editar (PATCH) | catalogo/search/update | owner, admin | getMe() + role_base check 403 |
| Ativar | catalogo/search/ativar | owner, admin | idem |
| Inativar | catalogo/search/inativar | owner, admin | idem |
| Apagar | catalogo/search/delete | owner, admin | idem |

Todas as mutações usam `org_id` de `getMe()`, não do body, e filtram por `.eq("org_id", org_id)`.

### 6.2 Fornecedor pode mexer em SKU?

Não há no código o conceito de “usuário fornecedor” com role próprio; há tabela `fornecedores` (org que fornece). A API de catálogo exige que o usuário esteja em `org_members` da **org do DropCore** (org_id do catálogo) com role owner/admin/operacional. Ou seja: quem mexe em SKU é sempre membro da org; “fornecedor” como outra org não tem rota própria de edição de SKU no fluxo atual.  
**Recomendação V1:** Garantir que nenhuma rota aceite mutação em nome de “fornecedor” sem ser via org_members (owner/admin). Hoje já é o caso para as rotas `catalogo/search/*`.

### 6.3 Validação no backend

Sim. update/delete/ativar/inativar checam role no servidor (getMe + 403 para não owner/admin) e filtram por `org_id` da sessão. A UI só esconde botões; a proteção efetiva é na API.

---

## 7) Segurança de dados financeiros (pode_ver_dinheiro)

### 7.1 Uso hoje

| Onde está | Evidência |
|-----------|-----------|
| API /api/org/me | Retorna `pode_ver_dinheiro` do `org_members` para o usuário. Frontend usa para exibir “Financeiro ON/OFF” e possivelmente esconder dados. |
| RLS / SELECT em tabelas financeiras | Não há no repo policies que usem `pode_ver_dinheiro` para restringir SELECT em colunas ou tabelas. Ou seja: a restrição hoje é **só no frontend e na lógica da API**, não no Supabase via RLS. |

**Conclusão:** “pode_ver_dinheiro” não restringe SELECT/UPDATE no banco via RLS; apenas é lido pela API e pode ser usado para esconder UI. Para restrição real no banco, seria necessário RLS (ou políticas por coluna) que leiam `org_members.pode_ver_dinheiro` para o usuário.

**Como testar**  
Usuário com `pode_ver_dinheiro = false`: chamar endpoints que retornam custo_base ou dados financeiros.  
**Resultado esperado (desejado):** 403 ou resposta sem campos financeiros. Hoje: catalogo/search já remove `custo_base` para operacional; endpoints que retornam custos (ex.: admin) não checam `pode_ver_dinheiro` no código auditado — vale implementar essa checagem se for requisito.

---

## 8) Logs e rastreabilidade

Não existe tabela `audit_logs` nem log estruturado de ações críticas (toggle finance, delete/inativar SKU) no código.

**Recomendação mínima:**  
Criar tabela, ex.:

```sql
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES orgs(id),
  actor_user_id UUID NOT NULL REFERENCES auth.users(id),
  action TEXT NOT NULL,
  payload JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

E em cada rota crítica (toggle-finance, catalogo/search/delete, inativar, update que altere custo/estoque) inserir uma linha (via service role ou RPC) com action e payload mínimo (ex.: `{ "target_user_id", "enable" }`, `{ "sku_id", "op": "delete" }`).

---

## 9) Ataques comuns

### 9.1 SQL injection

As queries usam o client Supabase (`.from().select().eq().or()`, etc.), que monta parâmetros de forma segura. O único uso de input em string é em `catalogo/search`: `query.or(\`sku.ilike.%${q}%,...\`)`. O `q` é sanitizado: `qRaw.slice(0, 200).replace(/[%_\\]/g, "")`. Não há concatenação de SQL raw com input. **OK** para as rotas auditadas.

### 9.2 XSS

Grep por `dangerouslySetInnerHTML` e `innerHTML` no código da app: **nenhum resultado**. Dados como `nome_produto` e `cor` são exibidos como texto no React (JSX), que escapa por padrão. **OK**.

### 9.3 Rate limit

Não há rate limiting em endpoints críticos (login, APIs de catálogo, toggle-finance). **Recomendação:** aplicar throttle/rate limit (ex.: Vercel, Cloudflare ou middleware) em produção, especialmente em login e em rotas de escrita.

---

## 10) Checklist final e veredito

### 10.1 Resumo por item

| # | Item | Status |
|---|------|--------|
| 1 | Segredos: service role só server-side; .env* no .gitignore | OK (confirmar .env.local nunca commitado) |
| 2 | Autenticação: bloqueio de rotas, refresh, logout, fluxo Bearer | OK |
| 3 | Autorização: 401/403/200 e IDOR (org_id) | OK nas rotas catalogo/search/* |
| 4 | RLS: políticas no Supabase | NOT OK — não gerenciadas no repo; depende do estado do banco |
| 5 | RPC Security Definer (rpc_toggle_finance_access) | NOT OK — executável por qualquer authenticated sem checagem de role |
| 6 | Catálogo: quem pode fazer o quê; fornecedor; backend | OK para catalogo/search/*; rotas /api/org/sku/* sem auth (ver abaixo) |
| 7 | pode_ver_dinheiro restringe no banco | NOT OK — só na API/front; sem RLS |
| 8 | Audit log de ações críticas | NOT OK — não existe |
| 9 | SQL injection, XSS, rate limit | OK (injection/XSS); rate limit ausente |

### 10.2 Riscos críticos adicionais

1. **Rotas /api/org/sku sem autenticação/autorização**  
   - `GET/POST/DELETE /api/org/sku` (route.ts) e `PATCH /api/org/sku/update`, `POST /api/org/sku/delete`, `PATCH /api/org/sku/inativar` **não verificam token nem org/role**. Qualquer pessoa que conheça a URL pode listar/inserir/apagar/atualizar SKUs.  
   - **Correção:** Exigir auth (e, onde fizer sentido, checagem org_id + owner/admin) em todas essas rotas, ou desativar/deprecar se não forem usadas.

2. **GET /api/org/sku/search com IDOR**  
   - Valida token e usa `org_id` do query string, mas **não verifica** se o usuário pertence a essa org.  
   - **Correção:** Consultar `org_members` com `org_id` + `user_id` e retornar 403 se não for membro.  
   - **Status:** Corrigido em `web/app/api/org/sku/search/route.ts`: checagem de membership antes da query em `skus`.

3. **RPC rpc_toggle_finance_access**  
   - Executável por qualquer authenticated.  
   - **Correção:** Verificar role dentro da RPC ou revogar EXECUTE de `authenticated` e chamar só pelo backend.  
   - **Script aplicável:** `web/scripts/secure-rpc-toggle-finance.sql` (REVOKE EXECUTE FROM authenticated).

4. **.env.local com chave no workspace**  
   - Se já foi commitado em algum momento, a chave deve ser rotacionada.

5. **Falta de RLS e de audit_log**  
   - Defesa em profundidade e auditoria dependem de RLS nas tabelas sensíveis e de tabela de audit_log.

### 10.3 Veredito

- **Seguro para time interno (uso controlado):** **Condicional** — desde que as rotas `/api/org/sku` (e variantes) não sejam expostas ou estejam protegidas e que a RPC de toggle seja corrigida.
- **Seguro para fornecedor:** **Condicional** — mesmo que o fornecedor não tenha rota própria de edição, as rotas SKU sem auth são um risco se acessíveis.
- **Seguro para produção:** **NÃO** — até corrigir: (1) rotas `/api/org/sku` com auth/org, (2) RPC com checagem de role ou sem EXECUTE para authenticated, (3) confirmação de que nenhuma chave foi commitada e (4) preferencialmente RLS + audit_log e rate limit.

---

*Documento gerado como evidência de auditoria de segurança. Recomenda-se revisão periódica e aplicação das correções indicadas.*
