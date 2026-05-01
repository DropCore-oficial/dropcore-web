# Auditoria de APIs — DropCore (v1)

**Gerado:** leitura estática do código em `web/app/api/**/route.ts` (aprox. 120 rotas).  
**Objetivo:** mapear **quem pode** chamar cada família de endpoint e **como** a autorização é aplicada no servidor.

---

## Legenda de status

| Status | Significado |
|--------|-------------|
| **OK** | Padrão claro: auth + checagem de papel ou escopo (org/fornecedor/seller) documentada no código. |
| **OK-P** | OK com observação (ex.: duplica lógica em vez de usar `@/lib/apiOrgAuth`). |
| **REVISAR** | Depende de segredo público, query param `orgId` confiável do cliente, ou lógica complexa — merece revisão manual periódica. |
| **ESPECIAL** | Webhook, convite público, ERP por API key — comportamento intencionalmente diferente de Bearer user. |

---

## Princípios do backend (importante)

1. **Service role (`SUPABASE_SERVICE_ROLE_KEY`)** nas rotas Next **ignora RLS** no Supabase. Quem manda na segurança é **a própria rota** (validação explícita).
2. **`requireAdmin` / `getMe`** em `@/lib/apiOrgAuth` usam **`resolveOrgMe`** → membership vem de `org_members` + agrega `fornecedor_id` / `seller_id` onde aplicável.
3. **Staff da org** (painel DropCore): em geral **`role_base` ∈ { owner, admin }** para operações administrativas; **`operacional`** aparece em algumas leituras (ex.: catálogo).

---

## 1. Resumo por prefixo

| Prefixo | Padrão típico | Status |
|---------|----------------|--------|
| `/api/org/me` | Qualquer usuário autenticado (JWT) — devolve perfil org + `fornecedor_id` + `seller_id`. | OK |
| `/api/org/*` (maioria) | `requireAdmin(req)` ou `requireOwner(req)` → **owner/admin** (owner só onde indicado). Escopo **`.eq("org_id", org_id)`** nas queries. | OK |
| `/api/org/membros*` | Validação manual com service role + **owner/admin** (com regra extra: só **owner** altera papel em `set-role`). | OK-P |
| `/api/org/catalogo/search*` | **GET:** membro da org para o `orgId` da query. **Mutações:** `requireAdmin` (`ativar`, `inativar`, `delete`, `update`, `update-grupo`). | OK |
| `/api/org/bootstrap` | POST: usuário sem org pode criar org (onboarding). | REVISAR |
| `/api/org/sku/route.ts` | GET usa **`getMe`** (aceita **operacional**); POST/PATCH outras usam **`requireAdmin`** conforme método — ler arquivo se for endurecer. | OK-P |
| `/api/org/toggle-finance` | Auth manual (membro com permissão para alternar financeiro). | OK-P |
| `/api/fornecedor/*` | Bearer + vínculo armazém (`org_members.fornecedor_id` / `fornecedor/me`). Recursos filtrados pelo `fornecedor_id` do token. | OK |
| `/api/seller/*` | Bearer + linha em `sellers` (`user_id`). | OK |
| `/api/erp/pedidos` | **`X-API-Key`** (hash da chave do seller) + rate limit — **não** usa sessão humana. | ESPECIAL |
| `/api/webhooks/*` | Confiança no provedor (MP, Bling, etc.); implementação específica por arquivo. | ESPECIAL |
| `/api/calculadora/*` | Mix: convites por token, `calculadora/me` por JWT + regras de acesso calculadora. | ESPECIAL |
| `/api/platform/stats` | **`requireOwner(req)`** — restringe a **owner** (não basta admin). | OK |
| `/api/notifications` | JWT + `user_id` nas linhas — escopo **por usuário**. | OK |

---

## 2. Helper central (`web/lib/apiOrgAuth.ts`)

| Função | Efeito |
|--------|--------|
| `getMe` | Exige `org_id` e `role_base` (qualquer membro da org, incl. operacional). |
| `requireAdmin` | Exige **owner** ou **admin**. |
| `requireOwner` | Exige **owner** apenas. |

**Rotas que importam `requireAdmin` ou `requireOwner` diretamente** (amostra verificada no repo — tendência forte nas rotas financeiras, pedidos org, sellers org, mensalidades, SKU mutações, etc.):

- `org/pedidos`, `org/pedidos/[id]/entregar`, `org/dashboard-stats`, `org/dashboard-pro`, `org/mensalidades/*`, `org/financial/*` (várias), `org/sellers/*`, `org/fornecedores` (GET/POST com admin), `org/alteracoes-pendentes/*`, `org/sku/update`, `org/sku/delete`, `org/sku/bulk-update`, `org/sku/inativar`, `org/catalogo/import`, `org/plan-limits`, `org/portal-trial`, `org/erp-api-key`, `org/calculadora/*` (várias), entre outras.

---

## 3. Rotas `/api/org` **sem** import de `@/lib/apiOrgAuth` (padrão próprio)

Estas implementam auth “na mão” (Bearer/cookies + `org_members` ou `getMe` local). **Revisar em mudanças futuras** para unificar com `apiOrgAuth` quando possível.

| Rota | Comportamento resumido |
|------|-------------------------|
| `org/bootstrap` | Cria org para usuário autenticado sem org. |
| `org/membros`, `org/membros/remover`, `org/membros/set-role`, `org/membros/admin/set-password` | Staff org; `set-role` restringe mudança de papel a **owner** (comentário no código). |
| `org/toggle-finance` | Alterna `pode_ver_dinheiro` com checagem de quem pode. |
| `org/fornecedores/[id]` | `requireOwnerOrAdmin` local + `orgId` query. |
| `org/catalogo/search` (GET) | **`requireOrgStaffForOrgId`** (`getUserIdFromBearerOrCookies` + `org_members`) — mesmo comportamento; código unificado em `@/lib/apiOrgAuth`. |
| `org/catalogo/search/{ativar,inativar,delete,update,update-grupo}` | `requireAdmin` em `@/lib/apiOrgAuth` (piloto de unificação). |
| `org/catalogo/estoque-baixo-count` | **`requireOrgStaffForOrgId`** — alinhado ao GET catálogo. |
| `org/sku/busca`, `org/sku/search` | **`requireOrgStaffForOrgId`** + `org_id` na query. |
| `org/sku/pais`, `org/sku/filhos` | **`requireOrgStaffForOrgId`**; **`org_id` obrigatório na query** (removido uso só de header/env sem usuário). |

---

## 4. Inventário numérico (arquivos `route.ts`)

| Área | Quantidade (aprox.) |
|------|---------------------|
| `/api/org/*` | ~58 |
| `/api/fornecedor/*` | ~28 |
| `/api/seller/*` | ~22 |
| `/api/erp/*` | 1 |
| `/api/webhooks/*` | 2 |
| `/api/calculadora/*` | 3+ |
| Outros (`notifications`, `platform`, etc.) | ~6 |

---

## 5. Riscos e próximos passos (backlog técnico)

1. ~~**Unificar** `catalogo/search/*` mutações~~ → feito (piloto): `ativar`, `inativar`, `delete`, `update`, `update-grupo`. Próximos candidatos: outros `org/*` com `fetch` interno a `/api/org/me`.
2. **Documentar** `org/bootstrap` e fluxos de convite (`fornecedor/invite`, `seller/invite`, `calculadora/invite`) como superfície controlada (rate limit, abuse).
3. **Webhooks:** garantir validação de origem/assinatura onde o provedor suportar (cada integração é um item).
4. **IDOR:** em qualquer rota que receba `orgId` ou `id` na URL, confirmar que o código filtra sempre pelo **org_id derivado do membership**, não só pelo parâmetro (a maioria das rotas `requireAdmin` já ancora em `org_id` do token).
5. **RLS no Postgres:** complemento opcional para acesso **direto** ao Supabase com anon key; **não substitui** checagens nas APIs com service role.

---

## 6. Inventário completo de arquivos

**Total atual:** executar no projeto:

```bash
find web/app/api -name 'route.ts' | wc -l
```

**Listar todos os paths:**

```bash
find web/app/api -name 'route.ts' | sort
```

Os detalhes por rota estão nas seções 1–5; não duplicamos aqui os ~120 caminhos para evitar divergência com o Git.

---

**Fim da v1.** Próxima revisão sugerida após grandes mudanças em `org_members`, convites ou novas rotas financeiras.
