"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { DropCoreLogo } from "@/components/DropCoreLogo";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function CalculadoraRegisterPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [emailAlvo, setEmailAlvo] = useState<string | null>(null);
  const [validadeDias, setValidadeDias] = useState<number | null>(null);

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [sending, setSending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState(false);
  const [mostrarSenha, setMostrarSenha] = useState(false);

  useEffect(() => {
    fetch(`/api/calculadora/invite/${token}`)
      .then((r) => r.json())
      .then((j) => {
        if (j?.ok) {
          setEmailAlvo(typeof j.email_alvo === "string" ? j.email_alvo : null);
          setValidadeDias(typeof j.validade_dias === "number" ? j.validade_dias : null);
          if (typeof j.email_alvo === "string") setEmail(j.email_alvo);
        } else {
          setTokenError(j?.error ?? "Convite inválido.");
        }
      })
      .catch(() => setTokenError("Erro ao validar convite."))
      .finally(() => setLoading(false));
  }, [token]);

  async function registrar() {
    setFormError(null);
    if (!email.trim() || !email.includes("@")) {
      setFormError("Informe um e-mail válido.");
      return;
    }
    if (senha.length < 6) {
      setFormError("Senha deve ter pelo menos 6 caracteres.");
      return;
    }
    if (senha !== confirmar) {
      setFormError("As senhas não coincidem.");
      return;
    }

    setSending(true);
    try {
      const res = await fetch(`/api/calculadora/invite/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), senha }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? "Erro ao criar conta.");

      const { error: loginErr } = await supabaseBrowser.auth.signInWithPassword({
        email: email.trim(),
        password: senha,
      });
      if (loginErr) {
        setSucesso(true);
        return;
      }
      router.replace("/seller/calculadora");
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : "Erro inesperado.");
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
        <p className="text-[var(--muted)] text-sm">Validando convite…</p>
      </div>
    );
  }

  if (tokenError) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center p-4">
        <div className="rounded-2xl border border-red-300 bg-red-50 p-8 max-w-sm w-full text-center shadow-sm">
          <div className="text-red-700 font-semibold text-lg mb-2">Convite inválido</div>
          <div className="text-red-600 text-sm">{tokenError}</div>
        </div>
      </div>
    );
  }

  if (sucesso) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center p-4">
        <div className="rounded-2xl border border-[var(--accent)]/40 bg-[var(--accent)]/10 p-8 max-w-sm w-full text-center shadow-sm">
          <div className="text-[var(--accent)] font-semibold text-lg mb-2">Conta criada!</div>
          <p className="text-[var(--accent)]/90 text-sm mb-6">Seu acesso foi criado com sucesso. Faça login para continuar.</p>
          <button
            type="button"
            onClick={() => router.replace("/calculadora/login")}
            className="w-full rounded-xl bg-[var(--accent)] hover:opacity-90 text-white font-medium py-2.5 transition"
          >
            Ir para o login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--background)] flex items-center justify-center p-4">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center">
          <DropCoreLogo variant="horizontal" href={null} className="mb-2" />
          <p className="text-[var(--muted)] text-sm">Ativar teste grátis da Calculadora</p>
        </div>

        <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] shadow-sm p-6">
          <div className="mb-5 rounded-xl bg-[var(--background)] border border-[var(--card-border)] px-4 py-3">
            <p className="text-xs text-[var(--muted)]">Convite de teste da calculadora</p>
            <p className="text-[var(--foreground)] font-semibold mt-0.5">
              {validadeDias
                ? validadeDias === 7
                  ? "Teste grátis de 7 dias"
                  : `${validadeDias} dias de acesso`
                : "Acesso à calculadora"}
            </p>
            {emailAlvo && <p className="text-xs text-[var(--muted)] mt-1">Válido para: {emailAlvo}</p>}
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1.5">E-mail</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
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
                  placeholder="Mínimo 6 caracteres"
                  className="w-full rounded-xl bg-[var(--background)] border border-[var(--card-border)] text-[var(--foreground)] placeholder-[var(--muted)] px-3 py-2.5 pr-10 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--accent)]/50"
                />
                <button
                  type="button"
                  onClick={() => setMostrarSenha(!mostrarSenha)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--foreground)] p-0.5"
                >
                  {mostrarSenha ? "Ocultar" : "Mostrar"}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1.5">Confirmar senha</label>
              <input
                type={mostrarSenha ? "text" : "password"}
                value={confirmar}
                onChange={(e) => setConfirmar(e.target.value)}
                placeholder="Repita a senha"
                className="w-full rounded-xl bg-[var(--background)] border border-[var(--card-border)] text-[var(--foreground)] placeholder-[var(--muted)] px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--accent)]/50"
              />
            </div>
          </div>

          {formError && (
            <div className="mt-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
              {formError}
            </div>
          )}

          <button
            type="button"
            onClick={registrar}
            disabled={sending}
            className="mt-5 w-full rounded-xl bg-[var(--accent)] text-white font-semibold py-2.5 text-sm hover:opacity-90 transition disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {sending ? "Ativando…" : "Ativar teste grátis"}
          </button>
        </div>
      </div>
    </div>
  );
}
