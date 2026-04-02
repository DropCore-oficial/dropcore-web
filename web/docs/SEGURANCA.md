# Revisão de segurança (DropCore)

## O que está seguro hoje

### Autenticação e autorização
- **Rotas protegidas**: Middleware redireciona quem não está logado (`/dashboard`, `/admin`, `/catalogo`, `/org`) para `/login`.
- **APIs**: Todas as rotas em `/api/org/*` validam o usuário (token Bearer ou cookies). Nada é retornado sem sessão válida.
- **Org**: Em todas as APIs que usam `orgId`, a permissão é checada com `org_members`: o usuário precisa ser membro daquela `org_id`. Se pedir org de outro, recebe 403.
- **Papel (role)**: Rotas de escrita (ativar, inativar, delete, update, membros, fornecedores) exigem `owner` ou `admin`. Operacional só acessa leitura do catálogo e sem `custo_base`.

### Dados sensíveis
- **Service Role Key**: Usada **apenas** no servidor (API routes). Nunca exposta no cliente (não existe em `NEXT_PUBLIC_*`).
- **Custo fornecedor**: Para usuários com role `operacional`, o campo `custo_base` é removido na resposta da API antes de enviar ao cliente. O banco pode até retornar; a API não repassa.

### Busca (catálogo)
- O parâmetro de busca `q` é limitado em tamanho (200 caracteres) e tem caracteres curinga (`%`, `_`, `\`) removidos para evitar abuso no filtro.

---

## O que você deve garantir

1. **Variáveis de ambiente**
   - `SUPABASE_SERVICE_ROLE_KEY` **nunca** no front (não colocar em nenhum `NEXT_PUBLIC_*`).
   - Em produção, usar env seguras (ex.: Vercel env vars, não commitar `.env`).

2. **HTTPS**
   - Em produção, usar sempre HTTPS para login e APIs.

3. **RLS (Row Level Security) no Supabase**
   - As APIs usam Service Role (bypass RLS). A segurança hoje está nas próprias APIs.
   - Para **defesa em profundidade**, vale ativar RLS nas tabelas `skus` e `org_members`: políticas que permitam apenas leitura/escrita dos dados da org do usuário (usando `auth.uid()` e join com `org_members`). Assim, mesmo que alguma chamada use o client anon no browser, o Supabase só devolve dados da org do usuário.

4. **Rate limiting (opcional)**
   - Para produção, considerar rate limit nas rotas de login e nas APIs (ex.: Vercel, Cloudflare ou middleware) para reduzir risco de abuso.

---

## Resumo

- **Sim**: o que implementamos até aqui está alinhado com boas práticas (auth, checagem de org, papel, ocultar custo_base para operacional, sanitização da busca).
- **Recomendado**: manter env seguras, HTTPS em produção e, se possível, RLS nas tabelas sensíveis e rate limiting nas APIs.
