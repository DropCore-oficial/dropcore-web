-- Conexão OAuth2 direta com Mercado Livre, fase 1: só leitura pros Gestores de IA
-- (anúncio, pergunta, e futuramente pedido só pra calcular velocidade de venda).
-- Mesmo padrão de seller_bling_integrations/seller_olist_integrations: token cifrado com
-- SELLER_ERP_CREDENTIALS_KEY (web/lib/sellerErpSecretBox.ts, já existe, não cria chave nova),
-- deny-all de RLS, acesso só via supabaseAdmin (service role).
-- Ver docs/SCHEMA.md e memória de projeto "Briefing Gestores de IA".

create table public.seller_mercadolivre_integrations (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null unique references public.sellers(id) on delete cascade,
  org_id uuid not null,
  ml_user_id text unique,
  ml_access_token text,
  ml_refresh_token text,
  ml_access_token_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.seller_mercadolivre_integrations enable row level security;
-- Sem policy: deny-all pra anon/authenticated. Acesso só via supabaseAdmin (service role).

revoke all on public.seller_mercadolivre_integrations from public, anon, authenticated;
