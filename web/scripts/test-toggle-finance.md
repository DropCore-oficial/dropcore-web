# Guia Completo: Testar o Switch de Permissão Financeira

## 📋 Checklist Antes de Testar

### 1. ✅ RPC Criada no Supabase
A função `rpc_toggle_finance_access` precisa existir no seu banco Supabase.

**Como verificar/criar:**
1. Abra o Supabase Dashboard
2. Vá em **SQL Editor**
3. Execute o script em `scripts/check-rpc.sql`
4. Verifique se a função foi criada

### 2. ✅ Variáveis de Ambiente Configuradas
Certifique-se de que você tem no arquivo `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=sua_url_aqui
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua_chave_anon_aqui
SUPABASE_SERVICE_ROLE_KEY=sua_service_role_key_aqui
```

### 3. ✅ Estrutura da Tabela `org_members`
A tabela precisa ter:
- `id` (UUID)
- `org_id` (UUID)
- `user_id` (UUID)
- `pode_ver_dinheiro` (BOOLEAN)
- `role` ou `role_base` (TEXT) - valores: "owner", "admin", etc.

## 🧪 Como Testar

### Passo 1: Iniciar o Servidor
```bash
cd web
npm run dev
```

Se der erro de permissão, veja `scripts/fix-permissions.md`

### Passo 2: Fazer Login
1. Acesse `http://localhost:3000/login`
2. Faça login com um usuário que seja **owner** ou **admin** de uma organização

### Passo 3: Acessar a Página de Membros
1. Vá para `http://localhost:3000/org/membros?orgId=SEU_ORG_ID`
2. Você deve ver uma lista de membros com switches

### Passo 4: Testar o Switch
1. Clique em um switch para alternar a permissão
2. O switch deve:
   - Mudar de posição imediatamente (otimistic update)
   - Mostrar estado "desabilitado" durante a requisição
   - Se der certo: manter a mudança
   - Se der erro: reverter e mostrar mensagem de erro

## 🔍 Debugging

### Erro: "RPC não encontrada"
**Solução:** Execute o script SQL em `scripts/check-rpc.sql` no Supabase

### Erro: "Sem permissão para alterar membros"
**Causa:** O usuário logado não é owner/admin da organização
**Solução:** Verifique se o usuário tem `role = 'owner'` ou `role = 'admin'` na tabela `org_members`

### Erro: "Token inválido"
**Causa:** Sessão expirada ou token inválido
**Solução:** Faça logout e login novamente

### Switch não muda
**Causa:** Erro na API ou RPC
**Solução:** 
1. Abra o Console do navegador (F12)
2. Veja se há erros na aba Network
3. Verifique os logs do servidor (terminal onde rodou `npm run dev`)

## 📊 Verificar no Banco de Dados

Para confirmar que funcionou, execute no Supabase SQL Editor:

```sql
SELECT 
  id,
  user_id,
  org_id,
  pode_ver_dinheiro,
  role,
  updated_at
FROM org_members
WHERE org_id = 'SEU_ORG_ID'
ORDER BY updated_at DESC;
```

A coluna `pode_ver_dinheiro` deve ter mudado e `updated_at` deve estar atualizado.
