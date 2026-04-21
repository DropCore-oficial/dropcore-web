-- =============================================================================
-- DropCore — Remoção de políticas RLS legadas (duplicadas / mais amplas)
-- Execute no Supabase SQL Editor APÓS rls-core-catalog.sql e rls-financeiro.sql.
--
-- Objetivo: deixar como base as políticas `rls_*` deste repositório; as APIs
-- Next.js usam service_role e não dependem dessas políticas antigas.
--
-- Revise o resultado com audit-rls-nucleo.sql depois de rodar.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- public.orgs
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "orgs_select_member" ON public.orgs;
DROP POLICY IF EXISTS "orgs_update_owner_admin" ON public.orgs;

-- ---------------------------------------------------------------------------
-- public.org_members
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "org_members_delete_owner_only" ON public.org_members;
DROP POLICY IF EXISTS "org_members_insert_owner_admin" ON public.org_members;
DROP POLICY IF EXISTS "org_members_select_self" ON public.org_members;
DROP POLICY IF EXISTS "org_members_update_owner_admin" ON public.org_members;

-- ---------------------------------------------------------------------------
-- public.fornecedores
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "fornecedores_select_member" ON public.fornecedores;
DROP POLICY IF EXISTS "fornecedores_write_privileged" ON public.fornecedores;

-- ---------------------------------------------------------------------------
-- public.skus
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "skus_select_by_org_member" ON public.skus;
DROP POLICY IF EXISTS "skus_select_member" ON public.skus;
DROP POLICY IF EXISTS "skus_select_por_org" ON public.skus;
DROP POLICY IF EXISTS "skus_write_by_owner_admin" ON public.skus;
DROP POLICY IF EXISTS "skus_write_owner_admin" ON public.skus;
DROP POLICY IF EXISTS "skus_write_privileged" ON public.skus;

-- ---------------------------------------------------------------------------
-- public.sellers
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "sellers_select_member" ON public.sellers;
DROP POLICY IF EXISTS "sellers_write_privileged" ON public.sellers;
