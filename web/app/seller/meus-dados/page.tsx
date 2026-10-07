"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { SellerNav } from "../SellerNav";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";
import { DANGER_PREMIUM_TEXT_PRIMARY, SUCCESS_PREMIUM_TEXT_PRIMARY } from "@/lib/semanticPremium";

type Estado = "loading" | "denied" | "pronto";

type Dados = {
  email: string | null;
  validoAte: string | null;
  incluiGestoresIa: boolean;
};

const MIN_SENHA = 8;

/**
 * "Meus dados" do assinante avulso (Calculadora / Gestores de IA) — equivalente pessoal do
 * /seller/cadastro do hub (que é dado de empresa, não se aplica aqui). Assinante avulso não
 * cadastra nome/telefone hoje (só e-mail+senha no registro), então o que existe de verdade
 * pra mostrar é e-mail, status da assinatura e troca de senha.
 */
export default function MeusDadosPage() {
  const router = useRouter();
  const [estado, setEstado] = useState<Estado>("loading");
  const [dados, setDados] = useState<Dados | null>(null);

  const [novaSenha, setNovaSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [salvandoSenha, setSalvandoSenha] = useState(false);
  const [erroSenha, setErroSenha] = useState<string | null>(null);
  const [senhaAlterada, setSenhaAlterada] = useState(false);

  const carregar = useCallback(async () => {
    const { data } = await supabaseBrowser.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      router.replace("/gestores-ia/login");
      return;
    }
    const res = await fetch(`/api/calculadora/me?t=${Date.now()}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setEstado("denied");
      return;
    }
    if (j.access === "seller") {
      router.replace("/seller/cadastro");
      return;
    }
    setDados({
      email: j.email ?? null,
      validoAte: j.valido_ate ?? null,
      incluiGestoresIa: j.inclui_gestores_ia === true,
    });
    setEstado("pronto");
  }, [router]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function salvarSenha() {
    setErroSenha(null);
    setSenhaAlterada(false);
    if (novaSenha.length < MIN_SENHA) {
      setErroSenha(`A senha precisa ter pelo menos ${MIN_SENHA} caracteres.`);
      return;
    }
    if (novaSenha !== confirmarSenha) {
      setErroSenha("As senhas não coincidem.");
      return;
    }
    setSalvandoSenha(true);
    const { error } = await supabaseBrowser.auth.updateUser({ password: novaSenha });
    setSalvandoSenha(false);
    if (error) {
      setErroSenha(error.message);
      return;
    }
    setNovaSenha("");
    setConfirmarSenha("");
    setSenhaAlterada(true);
  }

  const temGestoresIa = dados?.incluiGestoresIa ?? false;

  if (estado === "denied") {
    return (
      <div className="bg-[var(--background)] text-[var(--foreground)] app-bg pt-[calc(3.5rem+env(safe-area-inset-top,0px))] md:pt-14 pb-5">
        <div className="dropcore-shell-6xl py-10 text-center text-sm text-[var(--muted)]">
          Não foi possível validar seu acesso.
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[var(--background)] text-[var(--foreground)] app-bg pt-[calc(3.5rem+env(safe-area-inset-top,0px))] md:pt-14 pb-5">
      <div className="dropcore-shell-6xl space-y-5 py-5 md:space-y-6 md:py-7">
        <header className="overflow-visible rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4 shadow-sm sm:p-5">
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2 sm:gap-3">
              <h1 className="min-w-0 truncate text-2xl font-bold tracking-tight text-[var(--foreground)] sm:text-3xl">
                Meus dados
              </h1>
              <span
                className="h-1 w-14 shrink-0 self-center rounded-full bg-gradient-to-r from-emerald-500 via-emerald-400 to-emerald-300/70 sm:w-20"
                aria-hidden
              />
            </div>
            <p className="text-sm leading-snug text-[var(--muted)]">Dados da sua conta e senha de acesso.</p>
          </div>
        </header>

        {estado === "loading" ? (
          <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-5 shadow-sm sm:p-6">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="mt-3 h-4 w-64" />
          </div>
        ) : (
          <>
            <section className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-5 shadow-sm sm:p-6">
              <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-[var(--muted)]">E-mail</dt>
                  <dd className="mt-0.5 font-medium text-[var(--foreground)]">{dados?.email ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-[var(--muted)]">Pacote</dt>
                  <dd className="mt-0.5 font-medium text-[var(--foreground)]">
                    {temGestoresIa ? "Calculadora + Gestores de IA" : "Calculadora"}
                  </dd>
                </div>
                <div>
                  <dt className="text-[var(--muted)]">Assinatura válida até</dt>
                  <dd className="mt-0.5 font-medium text-[var(--foreground)]">
                    {dados?.validoAte ? new Date(dados.validoAte).toLocaleDateString("pt-BR") : "—"}
                  </dd>
                </div>
              </dl>
            </section>

            <section className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-5 shadow-sm sm:p-6">
              <p className="font-medium text-[var(--foreground)]">Trocar senha</p>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:max-w-md">
                <input
                  type="password"
                  value={novaSenha}
                  onChange={(e) => setNovaSenha(e.target.value)}
                  placeholder="Nova senha"
                  autoComplete="new-password"
                  className="rounded-md border border-[var(--card-border)] bg-[var(--card)] px-3 py-2 text-sm text-[var(--foreground)]"
                />
                <input
                  type="password"
                  value={confirmarSenha}
                  onChange={(e) => setConfirmarSenha(e.target.value)}
                  placeholder="Confirmar nova senha"
                  autoComplete="new-password"
                  className="rounded-md border border-[var(--card-border)] bg-[var(--card)] px-3 py-2 text-sm text-[var(--foreground)]"
                />
              </div>
              <div className="mt-3 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => void salvarSenha()}
                  disabled={salvandoSenha || !novaSenha || !confirmarSenha}
                  className="rounded-md bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                >
                  {salvandoSenha ? "Salvando…" : "Salvar nova senha"}
                </button>
                {erroSenha ? <p className={cn(DANGER_PREMIUM_TEXT_PRIMARY, "text-xs")}>{erroSenha}</p> : null}
                {senhaAlterada ? <p className={cn(SUCCESS_PREMIUM_TEXT_PRIMARY, "text-xs")}>Senha atualizada.</p> : null}
              </div>
            </section>
          </>
        )}
      </div>
      <SellerNav active="cadastro" calcOnly temGestoresIa={temGestoresIa} />
    </div>
  );
}
