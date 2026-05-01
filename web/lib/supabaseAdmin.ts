import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

/** Sem isso, inserts/updates via API routes falham (ex.: salvar rascunho do fornecedor na nuvem). */
export const supabaseServiceRoleConfigured = Boolean(serviceKey.trim());

if (process.env.NODE_ENV === "development" && !supabaseServiceRoleConfigured) {
  console.warn(
    "[supabaseAdmin] SUPABASE_SERVICE_ROLE_KEY ausente em .env.local. Rotas que gravam no Supabase vão falhar no localhost. Supabase → Settings → API → service_role (secret)."
  );
}

export const supabaseAdmin = createClient(url, serviceKey);
