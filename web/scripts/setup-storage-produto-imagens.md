# Bucket Supabase para fotos por variação

O recurso de **uma foto por variação** usa o Supabase Storage.

## Configuração

1. No Supabase Dashboard: **Storage** → **New bucket**
2. Nome: `produto-imagens`
3. Marque **Public bucket** (para URLs públicas das imagens)
4. Crie o bucket

## Permissões

Configure as políticas RLS conforme necessário. Exemplo para permitir upload/delete apenas com auth (a API usa service role, então o bucket pode ser público para leitura e as operações são feitas server-side):

- Leitura: pública (Public bucket)
- Escrita: feita via API com service role (não precisa policy específica no cliente)
