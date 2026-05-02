"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import {
  AuthEmailInput,
  AuthPasswordInput,
  DropcoreAuthShell,
  authAlertErrorClass,
  authPortalHintClass,
  authPrimaryButtonClass,
} from "@/components/DropcoreAuthShell";
import { Button } from "@/components/ui";
import { AMBER_PREMIUM_LINK } from "@/lib/amberPremium";
import { cn } from "@/lib/utils";

type OrgMeJson = {
  role_base?: string | null;
  fornecedor_id?: string | null;
  seller_id?: string | null;
};

function IconInfoPortal({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </svg>
  );
}

function AvisoPortaErrada({
  portal,
}: {
  portal: "seller" | "fornecedor";
}) {
  const isSeller = portal === "seller";
  const href = isSeller ? "/seller/login" : "/fornecedor/login";
  const cta = isSeller ? "Abrir login do seller" : "Abrir login do fornecedor";
  const detalhe = isSeller
    ? "Contas de seller usam o painel da loja, não este acesso."
    : "Contas de armazém usam o painel do fornecedor, não este acesso.";

  return (
    <div className={authPortalHintClass} role="alert">
      <div className="flex gap-3">
        <div className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md", AMBER_PREMIUM_LINK)} aria-hidden>
          <IconInfoPortal className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-[14px] font-semibold leading-snug text-neutral-900 dark:text-neutral-100">
            Este login é só para a equipe administrativa (DropCore).
          </p>
          <p className="text-[13px] leading-relaxed text-neutral-600 dark:text-neutral-400">
            {detalhe}
          </p>
          <p className="pt-0.5">
            <Link
              href={href}
              className={cn(
                "inline-flex items-center gap-1 text-[13px] font-semibold text-emerald-700",
                "underline decoration-emerald-700/30 underline-offset-2 transition hover:text-emerald-900 hover:decoration-emerald-700",
                "dark:text-emerald-400 dark:decoration-emerald-400/30 dark:hover:text-emerald-300",
              )}
            >
              {cta}
              <span aria-hidden className="text-[12px]">
                →
              </span>
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  /** Conta de armazém não usa este login */
  const [avisoFornecedor, setAvisoFornecedor] = useState(false);
  /** Conta seller não usa este login */
  const [avisoSeller, setAvisoSeller] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const {
        data: { session },
      } = await supabaseBrowser.auth.getSession();
      const token = session?.access_token;
      if (!token || cancelled) return;
      const headers = { Authorization: `Bearer ${token}` };
      try {
        const orgRes = await fetch("/api/org/me", { headers, cache: "no-store" });
        if (!orgRes.ok || cancelled) return;
        const org = (await orgRes.json().catch(() => ({}))) as OrgMeJson;
        if (org?.fornecedor_id) {
          router.replace("/fornecedor/dashboard");
          return;
        }
        if (org?.seller_id) {
          router.replace("/seller/dashboard");
          return;
        }
        const role = String(org?.role_base ?? "");
        if (role === "owner" || role === "admin") {
          router.replace("/dashboard");
        }
      } catch {
        /* mantém na tela de login */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setAvisoFornecedor(false);
    setAvisoSeller(false);
    setLoading(true);

    try {
      const { data, error } = await supabaseBrowser.auth.signInWithPassword({
        email,
        password: senha,
      });

      if (error) throw error;
      if (!data.session) throw new Error("Sessão não veio do Supabase.");

      const { data: s } = await supabaseBrowser.auth.getSession();
      if (!s.session) throw new Error("Sessão não ficou ativa. Tente recarregar.");

      const token = s.session.access_token;
      let destino = "/dashboard";
      const headers = { Authorization: `Bearer ${token}` };

      try {
        const [orgRes, fornRes] = await Promise.all([
          fetch("/api/org/me", { headers, cache: "no-store" }),
          fetch("/api/fornecedor/me", { headers, cache: "no-store" }),
        ]);

        const org = orgRes.ok
          ? ((await orgRes.json().catch(() => ({}))) as OrgMeJson)
          : null;

        const contaArmazem = Boolean(org?.fornecedor_id) || fornRes.ok;
        if (contaArmazem) {
          await supabaseBrowser.auth.signOut();
          setAvisoFornecedor(true);
          return;
        }

        if (org?.seller_id) {
          await supabaseBrowser.auth.signOut();
          setAvisoSeller(true);
          return;
        }

        if (orgRes.ok && org) {
          const role = String(org.role_base ?? "");
          if (role === "owner" || role === "admin") {
            destino = "/dashboard";
          } else {
            await supabaseBrowser.auth.signOut();
            setErro("Este login é exclusivo da equipe administrativa (proprietário ou administrador).");
            return;
          }
        } else {
          await supabaseBrowser.auth.signOut();
          setErro("Não foi possível validar seu acesso. Tente novamente.");
          return;
        }
      } catch {
        await supabaseBrowser.auth.signOut();
        setErro("Não foi possível validar seu acesso. Tente novamente.");
        return;
      }

      router.replace(destino);
      router.refresh();
    } catch (err: unknown) {
      setErro(err instanceof Error ? err.message : "Erro ao logar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <DropcoreAuthShell
      eyebrow="Acesso"
      heading="DropCore"
      headingClassName="text-[1.45rem] sm:text-[1.6rem]"
    >
      <form onSubmit={entrar} className="space-y-3.5">
        <AuthEmailInput value={email} onChange={setEmail} id="org-login-email" />
        <AuthPasswordInput value={senha} onChange={setSenha} id="org-login-senha" />

        {avisoFornecedor ? <AvisoPortaErrada portal="fornecedor" /> : null}
        {avisoSeller ? <AvisoPortaErrada portal="seller" /> : null}
        {erro ? <div className={authAlertErrorClass}>{erro}</div> : null}

        <Button
          type="submit"
          variant="primary"
          size="lg"
          disabled={loading}
          className={authPrimaryButtonClass}
        >
          {loading ? "Entrando..." : "Entrar"}
        </Button>
      </form>
    </DropcoreAuthShell>
  );
}
