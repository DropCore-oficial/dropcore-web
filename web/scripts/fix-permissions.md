# Como Resolver o Erro de Permissão do Node.js

## Problema
O erro `EPERM: operation not permitted` acontece quando o Node.js não consegue acessar arquivos no `node_modules`.

## Soluções (tente nesta ordem)

### Solução 1: Reinstalar dependências (RECOMENDADO)

Abra o terminal e execute:

```bash
cd web

# Remove node_modules e package-lock.json
rm -rf node_modules package-lock.json

# Reinstala tudo
npm install

# Tenta rodar novamente
npm run dev
```

### Solução 2: Se a Solução 1 não funcionar (permissões do sistema)

```bash
cd web

# Dá permissão de leitura/escrita para você
chmod -R u+rw node_modules

# Tenta rodar novamente
npm run dev
```

### Solução 3: Rodar sem Turbo (temporário)

Edite o arquivo `web/package.json` e troque:

```json
"dev": "next dev --turbo"
```

por:

```json
"dev": "next dev"
```

Depois execute:
```bash
npm run dev
```

### Solução 4: Se nada funcionar (nuclear option)

```bash
cd web

# Remove tudo relacionado ao Node
rm -rf node_modules package-lock.json .next

# Limpa cache do npm
npm cache clean --force

# Reinstala tudo do zero
npm install

# Tenta rodar
npm run dev
```

## Por que isso acontece?

1. **Arquivos em uso**: Algum processo pode estar usando arquivos do `node_modules`
2. **Permissões do sistema**: macOS pode ter bloqueado acesso a alguns arquivos
3. **Corrupção**: O `node_modules` pode estar corrompido
4. **Sandbox**: Alguns ambientes restringem acesso a arquivos

## Dica

Se você estiver usando o Cursor/VS Code, feche e abra novamente antes de tentar remover o `node_modules`.
