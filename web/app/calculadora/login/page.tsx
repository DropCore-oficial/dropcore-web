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
import { isCalculadoraAssinaturaExpiradaLegacy403 } from "@/lib/calculadoraAssinaturaExpired";

/**
 * Login dedicado à marca "DropCore Calculadora".
 * Mesmo Supabase Auth do seller; após entrar, redireciona para a calculadora no painel seller.
 * (Futuro: entitlements calc-only sem linha em `sellers` — ver /api/calculadora/me.)
 */
export default function CalculadoraLoginPage() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [esqueciSenha, setEsqueciSenha] = useState(false);
  const [resetEnviado, setResetEnviado] = useState(false);

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
    setLoading(true);
    try {
      const { error: err } = await supabaseBrowser.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${typeof window !== "undefined" ? window.location.origin : ""}/seller/reset-password`,
      });
      if (err) throw err;
      setResetEnviado(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao enviar e-mail. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  async function entrar() {
    setError(null);
    if (!email.trim() || !senha) {
      setError("Preencha e-mail e senha.");
      return;
    }
    setLoading(true);
    try {
      const { data: authData, error: loginErr } = await supabaseBrowser.auth.signInWithPassword({
        email: email.trim(),
        password: senha,
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
      const legacyExpired = isCalculadoraAssinaturaExpiradaLegacy403(res.status, body);
      if (!accessOk && !legacyExpired) {
        await supabaseBrowser.auth.signOut();
        throw new Error(
          typeof body?.error === "string"
            ? body.error
            : "Sem acesso à calculadora. Verifique assinatura ou conta seller.",
        );
      }
      window.location.assign("/seller/calculadora");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao fazer login.");
    } finally {
      setLoading(false);
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

        {resetEnviado ? (
          <div className={authAlertSuccessClass}>
            E-mail enviado! Verifique sua caixa de entrada e o spam. Clique no link para redefinir a senha.
          </div>
        ) : esqueciSenha ? (
          <Button
            type="button"
            onClick={solicitarReset}
            disabled={loading}
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
            disabled={loading}
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
