# 🎯 Guia Completo: Sistema de Toggle de Permissão Financeira

## 📖 O Que Foi Implementado

### 1. **Rota API** (`/api/org/membros/toggle-finance`)
- **Localização:** `web/app/api/org/membros/toggle-finance/route.ts`
- **Método:** POST
- **O que faz:** Alterna a permissão financeira (`pode_ver_dinheiro`) de um membro

### 2. **Componente Switch**
- **Localização:** Dentro de `web/app/org/membros/page.tsx`
- **O que faz:** Interface visual para alternar a permissão
- **Características:**
  - Atualização otimista (muda na tela antes de confirmar)
  - Desabilita durante a requisição
  - Reverte se der erro

### 3. **RPC no Supabase**
- **Nome:** `rpc_toggle_finance_access`
- **O que faz:** Atualiza a coluna `pode_ver_dinheiro` na tabela `org_members`
- **Script:** `web/scripts/check-rpc.sql`

---

## 🔄 Fluxo Completo (Passo a Passo)

```
1. Usuário clica no Switch
   ↓
2. handleToggleFinance() é chamada
   ↓
3. Estado local atualiza (otimistic update)
   ↓
4. Requisição POST para /api/org/membros/toggle-finance
   ↓
5. API valida token do usuário
   ↓
6. API verifica se usuário é owner/admin
   ↓
7. API chama RPC no Supabase (com Service Role)
   ↓
8. RPC atualiza banco de dados
   ↓
9. Se sucesso: mantém mudança
   Se erro: reverte mudança
```

---

## 🛠️ Como Configurar

### Passo 1: Criar a RPC no Supabase

1. Abra o **Supabase Dashboard**
2. Vá em **SQL Editor**
3. Cole e execute o conteúdo de `web/scripts/check-rpc.sql`
4. Verifique se a função foi criada

### Passo 2: Verificar Estrutura da Tabela

A tabela `org_members` precisa ter:
```sql
CREATE TABLE org_members (
  id UUID PRIMARY KEY,
  org_id UUID NOT NULL,
  user_id UUID NOT NULL,
  pode_ver_dinheiro BOOLEAN DEFAULT false,
  role TEXT, -- ou role_base TEXT
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### Passo 3: Configurar Variáveis de Ambiente

Crie/edite `web/.env.local`:
```env
NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua_chave_anon
SUPABASE_SERVICE_ROLE_KEY=sua_service_role_key
```

---

## 🧪 Como Testar

### Teste Manual

1. **Inicie o servidor:**
   ```bash
   cd web
   npm run dev
   ```

2. **Acesse a página:**
   ```
   http://localhost:3000/org/membros?orgId=SEU_ORG_ID
   ```

3. **Clique no Switch:**
   - Deve mudar imediatamente
   - Deve desabilitar durante a requisição
   - Deve manter a mudança se der certo

### Teste no Console do Navegador

Abra o Console (F12) e veja:
- Requisições para `/api/org/membros/toggle-finance`
- Respostas da API
- Erros (se houver)

### Teste no Banco de Dados

Execute no Supabase SQL Editor:
```sql
SELECT 
  id,
  user_id,
  pode_ver_dinheiro,
  updated_at
FROM org_members
WHERE org_id = 'SEU_ORG_ID';
```

---

## 🐛 Troubleshooting

### Problema: Switch não muda
**Causa:** Erro na API ou RPC não existe
**Solução:** 
1. Verifique o Console do navegador
2. Verifique os logs do servidor
3. Confirme que a RPC existe no Supabase

### Problema: "Sem permissão"
**Causa:** Usuário não é owner/admin
**Solução:** Verifique a coluna `role` na tabela `org_members`

### Problema: "RPC não encontrada"
**Causa:** Função não foi criada no Supabase
**Solução:** Execute o script `check-rpc.sql`

### Problema: Erro de permissão no Node.js
**Causa:** Problema com `node_modules`
**Solução:** Veja `scripts/fix-permissions.md`

---

## 📝 Arquivos Criados/Modificados

### Novos Arquivos:
- ✅ `web/app/api/org/membros/toggle-finance/route.ts` - Rota API
- ✅ `web/scripts/check-rpc.sql` - Script SQL para criar RPC
- ✅ `web/scripts/fix-permissions.md` - Guia para resolver erros
- ✅ `web/scripts/test-toggle-finance.md` - Guia de testes
- ✅ `web/README-TOGGLE-FINANCE.md` - Este arquivo

### Arquivos Modificados:
- ✅ `web/app/org/membros/page.tsx` - Adicionado Switch e função handleToggleFinance

---

## 🎨 Design do Switch

O Switch foi criado com Tailwind CSS e tem:
- **Cores:** Verde quando ligado, cinza quando desligado
- **Animação:** Transição suave
- **Acessibilidade:** Suporta foco e aria-checked
- **Estado desabilitado:** Opacidade reduzida durante requisição

---

## 🔒 Segurança

### O que está protegido:
1. ✅ Validação de token (usuário autenticado)
2. ✅ Verificação de permissão (owner/admin apenas)
3. ✅ Validação de UUIDs (orgId, memberId)
4. ✅ Service Role usado apenas após validação
5. ✅ Erros não expõem detalhes internos

### Boas práticas implementadas:
- ✅ Atualização otimista com reversão em caso de erro
- ✅ Desabilita switch durante requisição
- ✅ Logs de erro apenas no servidor
- ✅ Mensagens de erro genéricas para o cliente

---

## 📚 Próximos Passos (Opcional)

1. **Adicionar confirmação:** Perguntar antes de alterar
2. **Adicionar histórico:** Registrar quem alterou e quando
3. **Adicionar notificação:** Avisar o membro quando permissão mudar
4. **Adicionar testes:** Testes automatizados para a API

---

## 💡 Dicas

- Use o Console do navegador para debugar
- Verifique os logs do servidor para erros
- Use o SQL Editor do Supabase para verificar dados
- Teste com diferentes usuários (owner, admin, membro comum)
