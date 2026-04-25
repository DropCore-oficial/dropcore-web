# Revisão pré-próximo passo — DropCore

Revisão feita em fev/2026 antes de avançar para mapeamento SKU ↔ ERP e integrações.

---

## ✅ O que está OK

### Arquitetura e fluxo
- **DropCore não é ERP** — posicionamento claro
- **Fluxo definido**: Marketplace → ERP → DropCore (pedidos entram no ERP, ERP repassa ao DropCore)
- **Mapeamento em um lugar**: Opção 1 — SKU do fornecedor = SKU no ERP; seller importa catálogo do DropCore e mapeia só no ERP

### Autenticação e autorização
- Supabase Auth (bcrypt, JWT, refresh)
- Middleware protege `/dashboard`, `/admin`, `/catalogo`, `/org`
- APIs `/api/org/*` e `/api/seller/*` exigem token/sessão
- Checagem de `org_id` em operações sensíveis — IDOR mitigado
- Roles (owner, admin, operacional) respeitados

### Painel fornecedor
- `/fornecedor/login`, `/fornecedor/dashboard`, `/fornecedor/produtos`
- CRUD de produtos (único + multivariante)
- Campos: nome, cor, tamanho, SKU, link_fotos, descrição, dimensões (comp×larg×alt)
- APIs: GET/POST produtos, POST multivariante, PATCH edição

### Painel seller
- `/seller/login`, `/seller/dashboard`, catálogo, calculadora
- APIs protegidas por Bearer token

### Segurança
- `.env` no `.gitignore`
- Service Role só em server-side
- Sanitização da busca no catálogo (q limitado a 200 chars, remove `%`, `_`, `\`)
- Documentação de auditoria (`AUDITORIA-SEGURANCA.md`, `SEGURANCA.md`)

---

## ⚠️ Pontos que precisam de ação

### 1. RPC rpc_toggle_finance_access (CRÍTICO)
**Problema:** A RPC pode ser chamada por qualquer usuário autenticado (role `authenticated`) sem checagem de owner/admin.

**Ação:** Executar no Supabase SQL Editor:
```sql
REVOKE EXECUTE ON FUNCTION rpc_toggle_finance_access(UUID, UUID, BOOLEAN) FROM authenticated;
```
**Arquivo:** `web/scripts/secure-rpc-toggle-finance.sql`

---

### 2. Middleware não protege /fornecedor e /seller (MÉDIO)
**Problema:** As rotas `/fornecedor/dashboard`, `/fornecedor/produtos`, `/seller/dashboard` etc. não estão em `rotasProtegidas`. A página carrega e depois redireciona via client-side se não houver sessão — funciona, mas gera flash e é inconsistente.

**Ação:** Incluir `/fornecedor` e `/seller` no middleware (exceto `/fornecedor/login`, `/fornecedor/register/*`, `/seller/login`, `/seller/register/*`).

---

### 3. API /api/fornecedor/* não está no middleware (BAIXO)
**Problema:** O middleware não bloqueia cedo requisições sem auth em `/api/fornecedor/*`. As APIs fazem checagem internamente e retornam 401 — OK, mas poderia ser consistente.

**Ação (opcional):** Incluir `path.startsWith("/api/fornecedor/")` em `isApiProtected` para rejeitar sem Bearer antes de entrar no handler.

---

### 4. RLS no Supabase (RECOMENDADO)
**Problema:** A auditoria indica que pode não haver RLS ativo nas tabelas sensíveis. A proteção hoje é só via API (service role).

**Ação:** No Supabase, verificar:
```sql
SELECT schemaname, tablename, rowsecurity
FROM pg_tables WHERE schemaname = 'public'
AND tablename IN ('orgs', 'org_members', 'skus', 'fornecedores', 'sellers');
```
Se `rowsecurity = false`, considerar ativar RLS e criar policies para defesa em profundidade.

---

### 5. .env.local nunca commitado (VERIFICAR)
**Problema:** Se `.env.local` já foi commitado em algum momento, as chaves estão vazadas.

**Ação:** Rodar `git log -p --all -- web/.env.local` — se houver resultado, rotacionar `SUPABASE_SERVICE_ROLE_KEY` e `SUPABASE_ANON_KEY` no painel do Supabase.

---

## 📋 Checklist antes do próximo passo

| Item | Status | Ação |
|------|--------|------|
| Executar secure-rpc-toggle-finance.sql | ⬜ | Rodar no Supabase SQL Editor |
| Incluir /fornecedor e /seller no middleware | ⬜ | Editar middleware.ts |
| Incluir /api/fornecedor no isApiProtected | ⬜ | Editar middleware.ts (opcional) |
| Verificar RLS no Supabase | ⬜ | Query acima + ativar se necessário |
| Confirmar .env nunca commitado | ⬜ | git log |
| HTTPS em produção | ⬜ | Configurar no deploy |

---

## Próximos passos (implementado)

1. ~~**Integração ERP → DropCore**~~ — ✅ API POST /api/erp/pedidos criada
2. **Integração DropCore → ERP** — Push de estoque (Tiny, Bling) quando SKU vende
3. **Criptografia de credenciais ERP** — Ao salvar token Tiny / OAuth Bling (quando implementar push)

## Pendente

- **Mapeamento SKU** — Seller importa catálogo do DropCore (SKU fornecedor) no ERP e mapeia anúncio ML → produto no ERP

---

## Resumo

A base está sólida. Os itens críticos são:
1. **Executar** o script `secure-rpc-toggle-finance.sql` no Supabase.
2. **Proteger** rotas `/fornecedor` e `/seller` no middleware.

O resto pode ser feito em paralelo ou depois. Após isso, dá para seguir para mapeamento e integrações com ERP.
