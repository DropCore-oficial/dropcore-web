import { redirect } from "next/navigation";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Entrada /calculadora: com sessão vai direto para a calculadora no app seller.
 * Sem sessão o middleware envia para /calculadora/login.
 */
export default async function CalculadoraIndexPage() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {
          /* só leitura de sessão nesta página */
        },
      },
    },
  );
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/calculadora/login");
  }
  redirect("/seller/calculadora");
}
