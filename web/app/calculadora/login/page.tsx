"use client";

import { useState, useEffect } from "react";
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
import {
  isCalculadoraAssinaturaExpiradaLegacy403,
  isCalculadoraSemAcessoLegacy403,
} from "@/lib/calculadoraAssinaturaExpired";
import { TurnstileWidget, turnstileAtivo } from "@/components/TurnstileWidget";

/**
 * Login dedicado à marca "DropCore Calculadora".
 * Mesmo Supabase Auth do seller; após entrar, redireciona para a calculadora no painel seller.
 * Após autenticar, `/api/calculadora/me` define seller, calc ativo ou calc bloqueado na UI.
 */
export default function CalculadoraLoginPage() {
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

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const q = new URLSearchParams(window.location.search).get("email");
      if (q) setEmail(decodeURIComponent(q).trim());
    } catch {
      /* ignore */
    }
  }, []);

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
      if (err) throw err;
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

      const res = await fetch(`/api/calculadora/me?t=${Date.now()}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });
      const body = await res.json().catch(() => ({}));
      const accessOk =
        res.ok &&
        (body?.access === "seller" ||
          body?.access === "calc_only" ||
          body?.access === "calc_only_locked");
      const legacyLocked =
        isCalculadoraAssinaturaExpiradaLegacy403(res.status, body) ||
        isCalculadoraSemAcessoLegacy403(res.status, body);
      if (!accessOk && !legacyLocked) {
        await supabaseBrowser.auth.signOut();
        throw new Error(
          typeof body?.error === "string"
            ? body.error
            : "Não foi possível validar o acesso. Tente novamente ou fale com o suporte.",
        );
      }
      window.location.assign("/seller/calculadora");
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
      heading="Calculadora"
      headingClassName="text-[1.45rem] sm:text-[1.6rem]"
    >
      <div className="space-y-3">
        <AuthEmailInput value={email} onChange={setEmail} onEnter={entrar} id="calc-login-email" />
        <AuthPasswordInput value={senha} onChange={setSenha} onEnter={entrar} id="calc-login-senha" />

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
