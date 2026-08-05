-- Fase 2 de auditoria: log genérico de ações administrativas destrutivas/sensíveis
-- (exclusões, aprovação de PIX, crédito manual, mudança de papel, ERP, etc). Ver
-- web/lib/adminAuditLog.ts — cada rota instrumentada chama logAdminAction() no fim.

create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id),
  actor_email text,
  ip_address text,
  user_agent text,
  action text not null,
  target_table text,
  target_id text,
  detalhes jsonb,
  criado_em timestamptz not null default now()
);

create index if not exists idx_admin_audit_log_org
  on public.admin_audit_log(org_id, criado_em desc);
create index if not exists idx_admin_audit_log_target
  on public.admin_audit_log(target_table, target_id);

alter table public.admin_audit_log enable row level security;

-- Só owner/admin da própria org enxergam o log dela. Escrita só via service role
-- (nenhuma policy de INSERT/UPDATE/DELETE para authenticated) — mesmo padrão de
-- fornecedor_dados_bancarios_historico.
create policy admin_audit_log_select_org_staff
  on public.admin_audit_log
  for select
  to authenticated
  using (
    org_id in (
      select om.org_id
      from public.org_members om
      where om.user_id = (select auth.uid())
        and om.role_base in ('owner', 'admin')
        and om.fornecedor_id is null
        and om.seller_id is null
    )
  );
