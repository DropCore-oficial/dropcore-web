import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

type CadastroStatus = {
  cadastro_dados_pendente?: boolean;
  plano_pendente?: boolean;
};

/**
 * Destino após login/cadastro por convite. Usa navegação completa quando possível
 * para o middleware enxergar a sessão no cookie (comum em mobile após signIn).
 */
export async function resolveSellerPostAuthPath(): Promise<string> {
  const { data: { session } } = await supabaseBrowser.auth.getSession();
  if (!session?.access_token) return "/seller/login";

  const res = await fetch("/api/seller/cadastro", {
    headers: { Authorization: `Bearer ${session.access_token}` },
    cache: "no-store",
  });
  if (!res.ok) return "/seller/login";

  const j = (await res.json()) as CadastroStatus;
  if (j.cadastro_dados_pendente) return "/seller/cadastro";
  return "/seller/dashboard";
}

export async function goToSellerAfterAuth(router: AppRouterInstance): Promise<void> {
  const path = await resolveSellerPostAuthPath();
  if (typeof window !== "undefined") {
    window.location.assign(path);
    return;
  }
  router.replace(path);
}

export function goToSellerLogin(email?: string): void {
  const q = email?.trim() ? `?email=${encodeURIComponent(email.trim())}` : "";
  if (typeof window !== "undefined") {
    window.location.assign(`/seller/login${q}`);
    return;
  }
}
