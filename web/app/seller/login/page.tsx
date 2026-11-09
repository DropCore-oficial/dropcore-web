"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { cn } from "@/lib/utils";
import {
  AuthEmailInput,
  AuthPasswordInput,
  DropcoreAuthShell,
  authAlertErrorClass,
  authAlertSuccessClass,
  authMutedLinkClass,
  authPrimaryButtonClass,
} from "@/components/DropcoreAuthShell";
import { Button } from "@/components/ui";
import { goToSellerAfterAuth } from "@/lib/sellerPostAuthRedirect";
import { TurnstileWidget, turnstileAtivo } from "@/components/TurnstileWidget";

function SellerLoginFallback() {
  return (
    <DropcoreAuthShell
      eyebrow="Acesso"
      heading="Seller"
      headingClassName="text-[1.45rem] sm:text-[1.6rem]"
    >
      <p className="text-sm text-neutral-500 dark:text-neutral-400">Carregando…</p>
    </DropcoreAuthShell>
  );
}

function SellerLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [esqueciSenha, setEsqueciSenha] = useState(false);
  const [resetEnviado, setResetEnviado] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileNonce, setTurnstileNonce] = useState(0);

  useEffect(() => {
    const fromUrl = searchParams.get("email")?.trim();
    if (fromUrl) setEmail(fromUrl);
  }, [searchParams]);

  function resetTurnstile() {
    setTurnstileToken(null);
    setTurnstileNonce((n) => n + 1);
  }

  async function solicitarReset() {
    setError(null);
    if (!email.trim()) {
      setError("Digite seu e-mail.");
      return;
    }
    if (turnstileAtivo && !turnstileToken) {
      setError("Confirme que você não é um robô.");
      return;
    }
    setLoading(true);
    try {
      const { error: err } = await supabaseBrowser.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${typeof window !== "undefined" ? window.location.origin : ""}/seller/reset-password`,
        captchaToken: turnstileToken ?? undefined,
      });
      if (err) throw new Error("Não foi possível enviar o e-mail agora. Tente novamente em instantes.");
      setResetEnviado(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao enviar e-mail. Tente novamente.");
    } finally {
      setLoading(false);
      resetTurnstile();
    }
  }

  async function entrar() {
    setError(null);
    if (!email.trim() || !senha) {
      setError("Preencha e-mail e senha.");
      return;
    }
    if (turnstileAtivo && !turnstileToken) {
      setError("Confirme que você não é um robô.");
      return;
    }
    setLoading(true);
    try {
      const { data: authData, error: loginErr } = await supabaseBrowser.auth.signInWithPassword({
        email: email.trim(),
        password: senha,
        options: { captchaToken: turnstileToken ?? undefined },
      });
      if (loginErr) throw new Error("E-mail ou senha incorretos.");

      const accessToken = authData.session?.access_token;
      if (!accessToken) {
        throw new Error("Não foi possível obter a sessão. Atualize a página e tente de novo.");
      }

      const res = await fetch("/api/seller/me", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        await supabaseBrowser.auth.signOut();
        const body = await res.json().catch(() => ({}));
        const apiMsg = typeof body?.error === "string" ? body.error : "";
        if (res.status === 404) {
          throw new Error(
            "Esta conta não está ligada a nenhum seller (pode ter sido excluído). " +
              "Peça à organização um novo convite e use o link de cadastro, ou exclua este e-mail em Auth no Supabase se quiser recomeçar.",
          );
        }
        if (res.status === 403) {
          throw new Error(apiMsg || "Conta bloqueada ou sem permissão.");
        }
        throw new Error(
          apiMsg ||
            "Acesso não autorizado neste painel. Se você é administrador da organização, use o login em /login.",
        );
      }
      await goToSellerAfterAuth(router);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao fazer login.");
    } finally {
      setLoading(false);
      resetTurnstile();
    }
  }

  return (
    <DropcoreAuthShell
      eyebrow="Acesso"
      heading="Seller"
      headingClassName="text-[1.45rem] sm:text-[1.6rem]"
    >
      <div className="space-y-3">
        <AuthEmailInput value={email} onChange={setEmail} onEnter={entrar} id="seller-login-email" />
        <AuthPasswordInput value={senha} onChange={setSenha} onEnter={entrar} id="seller-login-senha" />

        {error ? <div className={authAlertErrorClass}>{error}</div> : null}

        {!resetEnviado ? (
          <TurnstileWidget key={turnstileNonce} onVerify={setTurnstileToken} onExpire={() => setTurnstileToken(null)} />
        ) : null}

        {resetEnviado ? (
          <div className={authAlertSuccessClass}>
            E-mail enviado! Verifique sua caixa de entrada e o spam. Clique no link para redefinir a senha.
          </div>
        ) : esqueciSenha ? (
          <Button
            type="button"
            onClick={solicitarReset}
            disabled={loading || (turnstileAtivo && !turnstileToken)}
            variant="primary"
            size="lg"
            className={authPrimaryButtonClass}
          >
            {loading ? "Enviando..." : "Enviar link de redefinição"}
          </Button>
        ) : (
          <Button
            type="button"
            onClick={entrar}
            disabled={loading || (turnstileAtivo && !turnstileToken)}
            variant="primary"
            size="lg"
            className={authPrimaryButtonClass}
          >
            {loading ? "Entrando..." : "Entrar"}
          </Button>
        )}

        <button
          type="button"
          onClick={() => {
            setEsqueciSenha(!esqueciSenha);
            setResetEnviado(false);
            setError(null);
          }}
          className={cn(authMutedLinkClass, "mt-0.5 block w-full")}
        >
          {esqueciSenha ? "← Voltar ao login" : "Esqueci a senha"}
        </button>

      </div>
    </DropcoreAuthShell>
  );
}

export default function SellerLoginPage() {
  return (
    <Suspense fallback={<SellerLoginFallback />}>
      <SellerLoginForm />
    </Suspense>
  );
}
