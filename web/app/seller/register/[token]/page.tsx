"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { DropCoreLogo } from "@/components/DropCoreLogo";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function SellerRegisterPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [sellerNome, setSellerNome] = useState<string | null>(null);
  const [conviteDadosPendente, setConviteDadosPendente] = useState(false);
  const [convitePlanoPendente, setConvitePlanoPendente] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [sending, setSending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState(false);
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [needsLink, setNeedsLink] = useState(false);

  useEffect(() => {
    fetch(`/api/seller/invite/${token}`)
      .then((r) => r.json())
      .then((j) => {
        if (j?.ok) {
          setSellerNome(j.seller_nome);
          setConviteDadosPendente(!!j.cadastro_dados_pendente);
          setConvitePlanoPendente(!!j.plano_pendente);
        } else setTokenError(j?.error ?? "Convite inválido.");
      })
      .catch(() => setTokenError("Erro ao validar convite."))
      .finally(() => setLoading(false));
  }, [token]);

  async function afterAuthRedirect() {
    const { data: { session } } = await supabaseBrowser.auth.getSession();
    if (session?.access_token) {
      const r = await fetch("/api/seller/cadastro", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });
      const cj = await r.json();
      if (r.ok && cj.cadastro_dados_pendente) {
        router.replace("/seller/cadastro");
        return;
      }
    }
    router.replace("/seller/dashboard");
  }

  async function vincularContaExistente() {
    setFormError(null);
    if (!email.trim() || !email.includes("@")) {
      setFormError("Informe o mesmo e-mail da sua conta.");
      return;
    }
    if (senha.length < 6) {
      setFormError("Informe a senha da sua conta.");
      return;
    }
    setSending(true);
    try {
      const { error: loginErr, data } = await supabaseBrowser.auth.signInWithPassword({
        email: email.trim(),
        password: senha,
      });
      if (loginErr) {
        throw new Error(loginErr.message === "Invalid login credentials" ? "E-mail ou senha incorretos." : loginErr.message);
      }
      const access_token = data.session?.access_token;
      if (!access_token) throw new Error("Não foi possível obter sessão. Tente de novo.");

      const res = await fetch(`/api/seller/invite/${token}/link`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Erro ao vincular ao convite.");

      await afterAuthRedirect();
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : "Erro inesperado.");
    } finally {
      setSending(false);
    }
  }

  async function registrar() {
    setFormError(null);
    setNeedsLink(false);
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
      const res = await fetch(`/api/seller/invite/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), senha }),
      });
      const json = await res.json();
      if (!res.ok) {
        if (json?.code === "EMAIL_ALREADY_REGISTERED") {
          setNeedsLink(true);
          setFormError(json?.error ?? "Este e-mail já está cadastrado.");
          return;
        }
        throw new Error(json?.error ?? "Erro ao criar conta.");
      }

      // Faz login automático
      const { error: loginErr } = await supabaseBrowser.auth.signInWithPassword({
        email: email.trim(),
        password: senha,
      });
      if (loginErr) {
        setSucesso(true);
        return;
      }
      await afterAuthRedirect();
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
            onClick={() => router.replace("/seller/login")}
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
          <p className="text-[var(--muted)] text-sm">Criar acesso de seller</p>
        </div>

        <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] shadow-sm p-6">
          <div className="mb-5 rounded-xl bg-[var(--background)] border border-[var(--card-border)] px-4 py-3">
            <p className="text-xs text-[var(--muted)]">Convite para</p>
            <p className="text-[var(--foreground)] font-semibold mt-0.5">{sellerNome}</p>
            {(conviteDadosPendente || convitePlanoPendente) && (
              <p className="text-[11px] text-[var(--muted)] mt-2 leading-relaxed">
                {conviteDadosPendente
                  ? "Depois de criar a senha, você completa CNPJ ou CPF, contato e endereço na tela de cadastro comercial."
                  : null}
                {conviteDadosPendente && convitePlanoPendente ? " " : ""}
                {convitePlanoPendente
                  ? `${conviteDadosPendente ? "Em seguida, no painel, " : "Depois de entrar, no painel, "}escolha o plano Starter ou Pro (com valores e comparação) antes de usar o restante.`
                  : null}
              </p>
            )}
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1.5">E-mail</label>
              <input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setNeedsLink(false);
                }}
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
                  className="w-full rounded-xl bg-white border border-neutral-200 text-neutral-900 placeholder-neutral-400 px-3 py-2.5 pr-10 text-sm focus:outline-none focus:border-neutral-400"
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
                  className="w-full rounded-xl bg-white border border-neutral-200 text-neutral-900 placeholder-neutral-400 px-3 py-2.5 pr-10 text-sm focus:outline-none focus:border-neutral-400"
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

          {formError && (
            <div className="mt-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
              {formError}
            </div>
          )}

          {needsLink && (
            <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
              <p className="font-medium mb-2">Conta já existe com este e-mail</p>
              <p className="text-amber-800/90 dark:text-amber-200/90 text-xs leading-relaxed mb-3">
                Confirme o e-mail e a <strong>senha dessa conta</strong> acima e use o botão abaixo para entrar e vincular ao convite do seller <strong>{sellerNome}</strong> (sem criar utilizador novo).
              </p>
              <button
                type="button"
                onClick={() => void vincularContaExistente()}
                disabled={sending}
                className="w-full rounded-xl border border-amber-600 bg-amber-600 text-white font-semibold py-2.5 text-sm hover:opacity-90 transition disabled:opacity-60"
              >
                {sending ? "A vincular…" : "Entrar e vincular ao convite"}
              </button>
            </div>
          )}

          <button
            onClick={registrar}
            disabled={sending}
            className="mt-5 w-full rounded-xl bg-[var(--accent)] text-white font-semibold py-2.5 text-sm hover:opacity-90 transition disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {sending ? "Criando conta…" : "Criar conta e entrar"}
          </button>
        </div>
      </div>
    </div>
  );
}
