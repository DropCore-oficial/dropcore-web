"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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

export default function SellerLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [esqueciSenha, setEsqueciSenha] = useState(false);
  const [resetEnviado, setResetEnviado] = useState(false);

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
      router.replace("/seller/dashboard");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao fazer login.");
    } finally {
      setLoading(false);
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
          <Button type="button" onClick={entrar} disabled={loading} variant="primary" size="lg" className={authPrimaryButtonClass}>
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
