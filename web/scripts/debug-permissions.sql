-- Script para debugar e corrigir problemas de permissão
-- Execute no Supabase SQL Editor

-- 1. Verificar se a tabela org_members existe e sua estrutura
SELECT 
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'org_members'
ORDER BY ordinal_position;

-- 2. Ver todos os membros da organização
SELECT 
  om.id,
  om.org_id,
  om.user_id,
  om.role,
  om.role_base,
  om.pode_ver_dinheiro,
  au.email,
  au.created_at as user_created_at
FROM org_members om
LEFT JOIN auth.users au ON au.id = om.user_id
WHERE om.org_id = '68a53d8e-8542-480d-b07f-4be371367362'  -- SUBSTITUA pelo seu org_id
ORDER BY om.created_at DESC;

-- 3. Verificar qual usuário está logado (substitua pelo email do admin)
SELECT 
  id as user_id,
  email,
  created_at
FROM auth.users
WHERE email = 'seu-email-admin@exemplo.com';  -- SUBSTITUA pelo email do admin

-- 4. Verificar se o usuário admin está na tabela org_members
SELECT 
  om.*,
  au.email
FROM org_members om
JOIN auth.users au ON au.id = om.user_id
WHERE au.email = 'seu-email-admin@exemplo.com'  -- SUBSTITUA pelo email do admin
  AND om.org_id = '68a53d8e-8542-480d-b07f-4be371367362';  -- SUBSTITUA pelo seu org_id

-- 5. Se o usuário não estiver na tabela, você pode adicionar manualmente:
-- (SUBSTITUA os valores pelos corretos)
/*
INSERT INTO org_members (org_id, user_id, role, role_base, pode_ver_dinheiro)
VALUES (
  '68a53d8e-8542-480d-b07f-4be371367362',  -- org_id
  'USER_ID_DO_ADMIN_AQUI',                  -- user_id (pegue do SELECT acima)
  'owner',                                  -- role
  'owner',                                  -- role_base
  true                                      -- pode_ver_dinheiro
);
*/

-- 6. Se o usuário já estiver na tabela mas sem role, atualize:
-- (SUBSTITUA os valores pelos corretos)
/*
UPDATE org_members
SET 
  role = 'owner',
  role_base = 'owner',
  updated_at = NOW()
WHERE user_id = 'USER_ID_DO_ADMIN_AQUI'  -- user_id
  AND org_id = '68a53d8e-8542-480d-b07f-4be371367362';  -- org_id
*/

-- 7. Verificar RLS (Row Level Security) - se estiver bloqueando
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies
WHERE tablename = 'org_members';

-- 8. Se RLS estiver bloqueando, você pode temporariamente desabilitar para testar:
-- (CUIDADO: apenas para debug, reative depois)
/*
ALTER TABLE org_members DISABLE ROW LEVEL SECURITY;
*/

-- 9. Para reativar RLS depois:
/*
ALTER TABLE org_members ENABLE ROW LEVEL SECURITY;
*/
