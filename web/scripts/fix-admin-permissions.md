# 🔧 Como Corrigir "Erro ao verificar permissões"

## 🎯 Problema

Você está logado com o email do admin/owner, mas está recebendo "Erro ao verificar permissões".

## 🔍 Possíveis Causas

1. **Usuário não está na tabela `org_members`**
2. **Usuário está na tabela mas sem `role` ou `role_base` definido**
3. **`user_id` não corresponde ao ID do usuário logado**
4. **`org_id` está incorreto**
5. **RLS (Row Level Security) está bloqueando a consulta**

---

## ✅ Solução Passo a Passo

### Passo 1: Verificar o Email e User ID

1. Abra o **Supabase Dashboard**
2. Vá em **SQL Editor**
3. Execute:

```sql
-- Substitua pelo seu email de admin
SELECT 
  id as user_id,
  email,
  created_at
FROM auth.users
WHERE email = 'seu-email-admin@exemplo.com';
```

**Anote o `user_id` que aparecer!**

---

### Passo 2: Verificar se o Usuário Está na Tabela org_members

Execute:

```sql
-- Substitua pelo seu email e org_id
SELECT 
  om.*,
  au.email
FROM org_members om
JOIN auth.users au ON au.id = om.user_id
WHERE au.email = 'seu-email-admin@exemplo.com'
  AND om.org_id = '68a53d8e-8542-480d-b07f-4be371367362';
```

**Se não retornar nenhuma linha**, o usuário não está na tabela. Vá para o Passo 3.

**Se retornar uma linha**, verifique:
- `role` ou `role_base` está definido?
- O valor é `'owner'` ou `'admin'`?

---

### Passo 3: Adicionar o Usuário à Tabela (se não estiver)

Se o usuário não estiver na tabela, adicione:

```sql
-- SUBSTITUA pelos valores corretos:
-- - org_id: o ID da organização
-- - user_id: o ID do usuário (do Passo 1)

INSERT INTO org_members (org_id, user_id, role, role_base, pode_ver_dinheiro)
VALUES (
  '68a53d8e-8542-480d-b07f-4be371367362',  -- org_id
  'USER_ID_DO_PASSO_1',                     -- user_id
  'owner',                                  -- role
  'owner',                                  -- role_base
  true                                      -- pode_ver_dinheiro
);
```

---

### Passo 4: Atualizar Role (se já estiver na tabela mas sem role)

Se o usuário já estiver na tabela mas sem `role` definido:

```sql
-- SUBSTITUA pelos valores corretos
UPDATE org_members
SET 
  role = 'owner',
  role_base = 'owner',
  updated_at = NOW()
WHERE user_id = 'USER_ID_DO_PASSO_1'
  AND org_id = '68a53d8e-8542-480d-b07f-4be371367362';
```

---

### Passo 5: Verificar RLS (Row Level Security)

Se ainda não funcionar, pode ser que RLS esteja bloqueando:

```sql
-- Verificar políticas RLS
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd
FROM pg_policies
WHERE tablename = 'org_members';
```

**Se houver políticas muito restritivas**, você pode temporariamente desabilitar RLS para testar:

```sql
-- CUIDADO: apenas para debug!
ALTER TABLE org_members DISABLE ROW LEVEL SECURITY;
```

**Depois de testar, reative:**

```sql
ALTER TABLE org_members ENABLE ROW LEVEL SECURITY;
```

---

## 🧪 Testar

1. Faça logout
2. Faça login novamente com o email do admin
3. Acesse `/org/membros?orgId=SEU_ORG_ID`
4. Deve funcionar agora!

---

## 📊 Script Completo de Debug

Use o arquivo `debug-permissions.sql` que tem todas as queries necessárias.

---

## 🆘 Se Ainda Não Funcionar

1. **Verifique os logs do servidor** (terminal onde rodou `npm run dev`)
   - Procure por mensagens de erro detalhadas
   - Veja os logs de "Verificação de permissão"

2. **Verifique o Console do Navegador** (F12)
   - Veja a resposta da API
   - Verifique se há erros de rede

3. **Confirme que as variáveis de ambiente estão corretas**
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`

---

## 💡 Dica

O código agora mostra logs mais detalhados em desenvolvimento. Veja o terminal do servidor para entender exatamente o que está acontecendo!
