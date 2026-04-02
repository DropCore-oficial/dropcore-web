"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { ThemeToggle } from "@/components/ThemeToggle";
import { DropCoreLogo } from "@/components/DropCoreLogo";
import { Card, Alert, Button, Input } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [mostrarSenha, setMostrarSenha] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setLoading(true);

    try {
      const { data, error } = await supabaseBrowser.auth.signInWithPassword({
        email,
        password: senha,
      });

      if (error) throw error;
      if (!data.session) throw new Error("Sessão não veio do Supabase.");

      // opcional: garantir que a sessão está ok
      const { data: s } = await supabaseBrowser.auth.getSession();
      if (!s.session) throw new Error("Sessão não ficou ativa. Tente recarregar.");

      router.replace("/dashboard");
      router.refresh();
    } catch (err: any) {
      setErro(err?.message || "Erro ao logar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--background)] flex items-center justify-center p-6">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <form onSubmit={entrar} className="w-full max-w-md">
        <Card className="p-8 shadow-[var(--shadow-card)]" padding="none">
          <div className="flex justify-center mb-6">
            <DropCoreLogo variant="horizontal" href={null} className="shrink-0" />
          </div>
          <h1 className="text-2xl font-semibold text-[var(--foreground)]">Login</h1>
          <p className="text-sm text-[var(--muted)] mt-1">Entre na DropCore</p>

          <div className="mt-6 space-y-3">
            <Input
              label="E-mail"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />

            <div>
              <label className="text-sm text-[var(--muted)]">Senha</label>
              <div className="relative mt-1">
                <input
                  className="w-full rounded-[var(--radius-sm)] border border-[var(--card-border)] bg-[var(--card)] px-3 py-2 pr-10 outline-none text-[var(--foreground)] focus:ring-1 focus:ring-[var(--accent)]/50"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  type={mostrarSenha ? "text" : "password"}
                  autoComplete="current-password"
                  required
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

          {erro ? (
            <Alert variant="danger">{erro}</Alert>
          ) : null}

          <Button
            type="submit"
            variant="primary"
            size="lg"
            disabled={loading}
            className="w-full"
          >
            {loading ? "Entrando..." : "Entrar"}
          </Button>
        </div>
        </Card>
      </form>
    </div>
  );
}
