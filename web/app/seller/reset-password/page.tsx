"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { DropCoreLogo } from "@/components/DropCoreLogo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AMBER_PREMIUM_SURFACE, AMBER_PREMIUM_TEXT_BODY, AMBER_PREMIUM_TEXT_SOFT } from "@/lib/amberPremium";
import { cn } from "@/lib/utils";

export default function SellerResetPasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pronto, setPronto] = useState(false);

  const errorParam = searchParams.get("error_description") || searchParams.get("error");
  const otpExpired = searchParams.get("error_code") === "otp_expired";
  const [temSessao, setTemSessao] = useState(false);
  const [mostrarSenha, setMostrarSenha] = useState(false);

  useEffect(() => {
    const code = searchParams.get("code");

    const run = async () => {
      // Supabase PKCE: troca o code da URL por sessão (obrigatório quando o link vem com ?code=)
      if (code) {
        const { data, error } = await supabaseBrowser.auth.exchangeCodeForSession(code);
        if (error) {
          console.warn("exchangeCodeForSession:", error.message);
          // Pode falhar se abriu em outra aba/navegador ou o code expirou
        } else if (data?.session) {
          setTemSessao(true);
          window.history.replaceState({}, "", window.location.pathname);
        }
      }

      // Fallback: verifica sessão já existente
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (session) setTemSessao(true);
      setPronto(true);
    };

    const { data: { subscription } } = supabaseBrowser.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || (session && event !== "SIGNED_OUT")) {
        if (session) setTemSessao(true);
      }
    });

    run();
    return () => subscription.unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function alterarSenha() {
    setError(null);
    const { data: { session } } = await supabaseBrowser.auth.getSession();
    if (!session) {
      setError("Sessão expirada. Clique no link do e-mail novamente ou solicite um novo link.");
      return;
    }
    if (!novaSenha || novaSenha.length < 6) {
      setError("A senha deve ter pelo menos 6 caracteres.");
      return;
    }
    if (novaSenha !== confirmar) {
      setError("As senhas não coincidem.");
      return;
    }
    setLoading(true);
    try {
      const { error: err } = await supabaseBrowser.auth.updateUser({ password: novaSenha });
      if (err) throw err;
      setSucesso(true);
      setTimeout(() => router.replace("/seller/login"), 2000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao alterar senha. O link pode ter expirado.");
    } finally {
      setLoading(false);
    }
  }

  // Link expirado ou inválido
  if (otpExpired || errorParam) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center p-4">
        <div className="absolute top-4 right-4"><ThemeToggle /></div>
        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col items-center">
            <DropCoreLogo variant="horizontal" href={null} className="mb-2" />
            <p className="text-[var(--muted)] text-sm">Redefinir senha</p>
          </div>
          <div className={cn(AMBER_PREMIUM_SURFACE, "rounded-2xl p-6 shadow-sm")}>
            <p className={cn("text-sm mb-4", AMBER_PREMIUM_TEXT_BODY)}>
              O link de redefinição expirou ou é inválido. Solicite um novo link.
            </p>
            <button
              onClick={() => router.replace("/seller/login")}
              className="w-full rounded-xl bg-[var(--accent)] text-white font-semibold py-2.5 text-sm hover:opacity-90"
            >
              Voltar e solicitar novo link
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!pronto) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center p-4">
        <p className="text-[var(--muted)] text-sm">Carregando...</p>
      </div>
    );
  }

  if (sucesso) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <div className="rounded-2xl border border-[var(--accent)]/40 bg-[var(--accent)]/10 p-6 text-center shadow-sm">
            <p className="text-[var(--accent)] text-sm">Senha alterada com sucesso! Redirecionando...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--background)] flex items-center justify-center p-4">
      <div className="absolute top-4 right-4"><ThemeToggle /></div>
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center">
          <DropCoreLogo variant="horizontal" href={null} className="mb-2" />
          <p className="text-[var(--muted)] text-sm">Defina sua nova senha</p>
        </div>

        <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] shadow-sm p-6">
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1.5">Nova senha</label>
              <div className="relative">
                <input
                  type={mostrarSenha ? "text" : "password"}
                  value={novaSenha}
                  onChange={(e) => setNovaSenha(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
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
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1.5">Confirmar senha</label>
              <div className="relative">
                <input
                  type={mostrarSenha ? "text" : "password"}
                  value={confirmar}
                  onChange={(e) => setConfirmar(e.target.value)}
                  placeholder="Repita a senha"
                  onKeyDown={(e) => e.key === "Enter" && alterarSenha()}
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
            <div className="mt-4 rounded-xl border border-red-300 bg-red-100 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {!temSessao && pronto && (
            <p className={cn("mt-3 text-xs", AMBER_PREMIUM_TEXT_SOFT)}>
              Acesse esta página clicando no link do e-mail. Se o link expirou, solicite um novo.
            </p>
          )}
          <button
            onClick={alterarSenha}
            disabled={loading || (pronto && !temSessao)}
            className="mt-5 w-full rounded-xl bg-[var(--accent)] text-white font-semibold py-2.5 text-sm hover:opacity-90 transition disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? "Alterando..." : "Alterar senha"}
          </button>

          <button
            type="button"
            onClick={() => router.replace("/seller/login")}
            className="mt-3 w-full text-xs text-[var(--muted)] hover:text-[var(--foreground)]"
          >
            ← Voltar ao login
          </button>
        </div>
      </div>
    </div>
  );
}
