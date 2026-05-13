import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function getSupabaseUrl(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
}

function getServiceRoleKey(): string {
  return process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
}

/** Sem isso, inserts/updates via API routes falham (ex.: salvar rascunho do fornecedor na nuvem). */
export const supabaseServiceRoleConfigured = Boolean(getServiceRoleKey());

if (process.env.NODE_ENV === "development" && !supabaseServiceRoleConfigured) {
  console.warn(
    "[supabaseAdmin] SUPABASE_SERVICE_ROLE_KEY ausente em .env.local. Rotas que gravam no Supabase vão falhar no localhost. Supabase → Settings → API → service_role (secret)."
  );
}

let adminClient: SupabaseClient | null = null;

function getSupabaseAdminClient(): SupabaseClient {
  const url = getSupabaseUrl();
  const serviceKey = getServiceRoleKey();
  if (!url || !serviceKey) {
    throw new Error(
      "Supabase não configurado: defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (ex.: variáveis de ambiente na Vercel)."
    );
  }
  if (!adminClient) {
    adminClient = createClient(url, serviceKey);
  }
  return adminClient;
}

/** Cliente service role — criado só no primeiro uso (evita quebrar `next build` sem env). */
export const supabaseAdmin: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    const client = getSupabaseAdminClient();
    const value = Reflect.get(client, prop, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
