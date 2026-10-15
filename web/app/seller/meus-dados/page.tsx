"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { SellerNav } from "../SellerNav";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";
import { DANGER_PREMIUM_TEXT_PRIMARY, SUCCESS_PREMIUM_TEXT_PRIMARY } from "@/lib/semanticPremium";
import { GestorAvulsoDadosComerciaisForm } from "@/components/seller/GestorAvulsoDadosComerciaisForm";

type Estado = "loading" | "denied" | "pronto";

type Dados = {
  email: string | null;
  validoAte: string | null;
  incluiGestoresIa: boolean;
  gestoresIaCiclo: "mensal" | "anual" | null;
  logoUrl: string | null;
};

const MIN_SENHA = 8;

/**
 * "Meus dados" do assinante avulso (Calculadora / Gestores de IA) — e-mail/senha/assinatura
 * desta página + logo e dados comerciais opcionais (`GestorAvulsoDadosComerciaisForm`,
 * 2026-10-15), equivalente ao `/seller/cadastro` do hub, só que sem bloquear nada.
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

  const [logoUploading, setLogoUploading] = useState(false);
  const [erroLogo, setErroLogo] = useState<string | null>(null);

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
      gestoresIaCiclo: j.gestores_ia_ciclo === "mensal" || j.gestores_ia_ciclo === "anual" ? j.gestores_ia_ciclo : null,
      logoUrl: typeof j.logo_url === "string" && j.logo_url.length > 0 ? j.logo_url : null,
    });
    setEstado("pronto");
  }, [router]);

  async function uploadLogo(file: File) {
    setLogoUploading(true);
    setErroLogo(null);
    try {
      const { data } = await supabaseBrowser.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        router.replace("/gestores-ia/login");
        return;
      }
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/gestores-ia-avulso/logo", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof json?.error === "string" ? json.error : "Erro ao enviar logo.");
      if (typeof json.logo_url === "string" && json.logo_url.length > 0) {
        setDados((d) => (d ? { ...d, logoUrl: json.logo_url } : d));
      }
    } catch (e: unknown) {
      setErroLogo(e instanceof Error ? e.message : "Erro ao enviar logo.");
    } finally {
      setLogoUploading(false);
    }
  }

  async function removeLogo() {
    setLogoUploading(true);
    setErroLogo(null);
    try {
      const { data } = await supabaseBrowser.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        router.replace("/gestores-ia/login");
        return;
      }
      const res = await fetch("/api/gestores-ia-avulso/logo", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof json?.error === "string" ? json.error : "Erro ao remover logo.");
      setDados((d) => (d ? { ...d, logoUrl: null } : d));
    } catch (e: unknown) {
      setErroLogo(e instanceof Error ? e.message : "Erro ao remover logo.");
    } finally {
      setLogoUploading(false);
    }
  }

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
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                <div className="shrink-0">
                  {dados?.logoUrl ? (
                    <img
                      src={dados.logoUrl}
                      alt=""
                      className="h-24 w-24 shrink-0 rounded-2xl border-0 object-contain bg-transparent p-0 outline-none ring-0"
                    />
                  ) : (
                    <div className="flex h-24 w-24 items-center justify-center rounded-2xl border border-dashed border-[var(--card-border)] bg-[var(--muted)]/8 px-2 text-center text-[11px] text-[var(--muted)]">
                      Sem logo
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1 space-y-2">
                  <div>
                    <p className="text-xs font-medium text-[var(--muted)]">Logo da marca</p>
                    <p className="mt-0.5 text-[11px] text-[var(--muted)]">
                      PNG, JPG, WebP ou GIF até 2 MB. Aparece no Dashboard do Gestor de IA.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <label
                      className={cn(
                        "inline-flex cursor-pointer items-center rounded-md border border-[var(--card-border)] bg-[var(--card)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--foreground)] transition hover:bg-[var(--muted)]/10",
                        logoUploading && "pointer-events-none opacity-60"
                      )}
                    >
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        className="sr-only"
                        disabled={logoUploading}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          e.target.value = "";
                          if (f) void uploadLogo(f);
                        }}
                      />
                      {logoUploading ? "Enviando…" : "Enviar imagem"}
                    </label>
                    {dados?.logoUrl ? (
                      <button
                        type="button"
                        onClick={() => void removeLogo()}
                        disabled={logoUploading}
                        className="rounded-md border border-[var(--card-border)] bg-[var(--card)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--muted)] transition-colors hover:bg-[var(--muted)]/10 hover:text-[var(--foreground)] disabled:opacity-60"
                      >
                        Remover
                      </button>
                    ) : null}
                  </div>
                  {erroLogo ? <p className={cn(DANGER_PREMIUM_TEXT_PRIMARY, "text-xs")}>{erroLogo}</p> : null}
                </div>
              </div>
            </section>

            <GestorAvulsoDadosComerciaisForm />

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
                    {temGestoresIa ? (
                      <span className="ml-1 font-normal text-[var(--muted)]">
                        ({dados?.gestoresIaCiclo === "anual" ? "anual" : "mensal"})
                      </span>
                    ) : null}
                  </dd>
                  <button
                    type="button"
                    onClick={() => router.push("/seller/gestores-ia-avulso/planos")}
                    className="mt-1 text-xs font-semibold text-emerald-700 hover:underline dark:text-emerald-300"
                  >
                    {temGestoresIa ? "Gerenciar plano" : "Ver planos de Gestores de IA"}
                  </button>
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
