"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { DropCoreLogo } from "@/components/DropCoreLogo";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function SellerLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [esqueciSenha, setEsqueciSenha] = useState(false);
  const [resetEnviado, setResetEnviado] = useState(false);
  const [mostrarSenha, setMostrarSenha] = useState(false);

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

      // Token da resposta (getSession() pode ainda não estar atualizado no cliente SSR)
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
              "Peça à organização um novo convite e use o link de cadastro, ou exclua este e-mail em Auth no Supabase se quiser recomeçar."
          );
        }
        if (res.status === 403) {
          throw new Error(apiMsg || "Conta bloqueada ou sem permissão.");
        }
        throw new Error(
          apiMsg ||
            "Acesso não autorizado neste painel. Se você é administrador da organização, use o login em /login."
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
    <div className="min-h-screen min-h-[100dvh] bg-[var(--background)] flex items-center justify-center dropcore-p-auth">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center">
          <DropCoreLogo variant="horizontal" href={null} className="mb-2" />
          <p className="text-[var(--muted)] text-sm">Acesso do seller</p>
          <ThemeToggle className="mt-2" />
        </div>

        <div className="rounded-[var(--radius)] border border-[var(--border-subtle)] bg-[var(--card)] shadow-[var(--shadow-card)] p-6">
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1.5">E-mail</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && entrar()}
                placeholder="seu@email.com"
                className="w-full rounded-xl bg-[var(--background)] border border-[var(--card-border)] text-[var(--foreground)] placeholder-[var(--muted)] px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--accent)]/50"
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1.5">Senha</label>
              <div className="relative">
                <input
                  type={mostrarSenha ? "text" : "password"}
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && entrar()}
                  placeholder="••••••"
                  className="w-full rounded-xl bg-[var(--background)] border border-[var(--card-border)] text-[var(--foreground)] placeholder-[var(--muted)] px-3 py-2.5 pr-10 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--accent)]/50"
                />
                <button
                  type="button"
                  onClick={() => setMostrarSenha(!mostrarSenha)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--foreground)] p-0.5"
                  title={mostrarSenha ? "Ocultar senha" : "Mostrar senha"}
                >
                  {mostrarSenha ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          </div>

          {error && (
            <div className="mt-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {resetEnviado ? (
            <div className="mt-4 rounded-xl border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-4 py-3 text-sm text-[var(--accent)]">
              E-mail enviado! Verifique sua caixa de entrada e o spam. Clique no link para redefinir a senha.
            </div>
          ) : esqueciSenha ? (
            <button
              onClick={solicitarReset}
              disabled={loading}
              className="mt-5 w-full rounded-xl bg-[var(--accent)] text-white font-semibold py-2.5 text-sm hover:opacity-90 transition disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? "Enviando..." : "Enviar link de redefinição"}
            </button>
          ) : (
            <button
              type="button"
              onClick={entrar}
              disabled={loading}
              className="mt-5 w-full rounded-xl bg-[var(--accent)] text-white font-semibold py-2.5 text-sm hover:opacity-90 transition disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? "Entrando..." : "Entrar"}
            </button>
          )}

          <button
            type="button"
            onClick={() => { setEsqueciSenha(!esqueciSenha); setResetEnviado(false); setError(null); }}
            className="mt-3 w-full text-xs text-[var(--muted)] hover:text-[var(--foreground)]"
          >
            {esqueciSenha ? "← Voltar ao login" : "Esqueci a senha"}
          </button>

          <p className="mt-6 pt-4 border-t border-[var(--border-subtle)] text-center text-xs text-[var(--muted)]">
            Só a calculadora de preço?{" "}
            <Link href="/calculadora/login" className="text-[var(--accent)] font-medium hover:underline">
              DropCore Calculadora
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
