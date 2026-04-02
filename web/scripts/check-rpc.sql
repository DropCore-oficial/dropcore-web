-- Script SQL para verificar/criar a RPC rpc_toggle_finance_access no Supabase
-- 
-- COMO USAR:
-- 1. Abra o Supabase Dashboard
-- 2. Vá em SQL Editor
-- 3. Cole este script e execute

-- Primeiro, vamos verificar se a função já existe
SELECT 
  routine_name,
  routine_type
FROM information_schema.routines
WHERE routine_schema = 'public' 
  AND routine_name = 'rpc_toggle_finance_access';

-- Se não existir, execute o código abaixo para criar a função:

CREATE OR REPLACE FUNCTION rpc_toggle_finance_access(
  p_org_id UUID,
  p_user_id UUID,
  p_enable BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER -- Permite que a função execute com privilégios elevados
AS $$
BEGIN
  -- Atualiza a coluna pode_ver_dinheiro na tabela org_members
  UPDATE org_members
  SET pode_ver_dinheiro = p_enable,
      updated_at = NOW()
  WHERE org_id = p_org_id
    AND user_id = p_user_id;
  
  -- Verifica se alguma linha foi atualizada
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Membro não encontrado na organização';
  END IF;
END;
$$;

-- Dar permissão para a função ser executada por usuários autenticados
GRANT EXECUTE ON FUNCTION rpc_toggle_finance_access(UUID, UUID, BOOLEAN) TO authenticated;

-- Verificar se foi criada corretamente
SELECT 
  routine_name,
  routine_type,
  security_type
FROM information_schema.routines
WHERE routine_schema = 'public' 
  AND routine_name = 'rpc_toggle_finance_access';
