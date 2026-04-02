// web/lib/supabaseBrowser.ts
// Cliente com persistência em cookies para o middleware enxergar a sessão após o login
import { createBrowserClient } from "@supabase/ssr";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabaseBrowser = createBrowserClient(url, anon);
