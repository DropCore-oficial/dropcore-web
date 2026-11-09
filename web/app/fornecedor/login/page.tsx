"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
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
import { cn } from "@/lib/utils";
import { TurnstileWidget, turnstileAtivo } from "@/components/TurnstileWidget";

export default function FornecedorLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [esqueciSenha, setEsqueciSenha] = useState(false);
  const [resetEnviado, setResetEnviado] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileNonce, setTurnstileNonce] = useState(0);

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
        redirectTo: `${typeof window !== "undefined" ? window.location.origin : ""}/fornecedor/reset-password`,
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
      const { error: loginErr } = await supabaseBrowser.auth.signInWithPassword({
        email: email.trim(),
        password: senha,
        options: { captchaToken: turnstileToken ?? undefined },
      });
      if (loginErr) throw new Error("E-mail ou senha incorretos.");

      const {
        data: { session },
      } = await supabaseBrowser.auth.getSession();
      const res = await fetch("/api/fornecedor/me", {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        await supabaseBrowser.auth.signOut();
        const msg =
          typeof body?.error === "string" && body.error.trim()
            ? body.error
            : "Não foi possível validar o acesso ao painel do fornecedor.";
        throw new Error(msg);
      }
      router.replace("/fornecedor/dashboard");
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
      heading="Fornecedor"
      headingClassName="text-[1.45rem] sm:text-[1.6rem]"
    >
      <div className="space-y-3">
        <AuthEmailInput value={email} onChange={setEmail} onEnter={entrar} id="fornecedor-login-email" />
        <AuthPasswordInput value={senha} onChange={setSenha} onEnter={entrar} id="fornecedor-login-senha" />

        {error ? <div className={authAlertErrorClass}>{error}</div> : null}

        {!resetEnviado ? (
          <TurnstileWidget key={turnstileNonce} onVerify={setTurnstileToken} onExpire={() => setTurnstileToken(null)} />
        ) : null}

        {resetEnviado ? (
          <div className={authAlertSuccessClass}>E-mail enviado! Verifique sua caixa de entrada e o spam.</div>
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
