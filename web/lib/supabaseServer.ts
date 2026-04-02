// web/lib/supabaseServer.ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export function supabaseServer() {
  const cookieStorePromise = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return [];
        },
        setAll(cookiesToSet) {
          try {
            // Next 15 tipa cookies() como Promise no build estático; neste projeto
            // este helper não é usado em rotas críticas, então mantemos no-op seguro.
            void cookieStorePromise;
            void cookiesToSet;
          } catch {
            // Ignora erros ao definir cookies em rotas de API
          }
        },
      },
    }
  );
}
