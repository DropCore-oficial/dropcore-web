"use client";

import { useEffect, useState } from "react";
import { DropCoreLogo } from "@/components/DropCoreLogo";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { apiGet, apiPost } from "@/lib/api";
import Link from "next/link";

type Invite = {
  id: string;
  token: string;
  email_alvo: string | null;
  validade_dias: number;
  expira_em: string;
  usado: boolean;
  usado_em: string | null;
  criado_em: string;
  link: string;
};

type Assinante = {
  id: string;
  user_id: string;
  email: string | null;
  valido_ate: string;
  ativo: boolean;
  dias_restantes: number;
  expirado: boolean;
};

export default function AdminCalculadoraConvitesPage() {
  const [emailAlvo, setEmailAlvo] = useState("");
  const [validadeDias, setValidadeDias] = useState("7");
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ultimoConvite, setUltimoConvite] = useState<Invite | null>(null);
  const [assinantes, setAssinantes] = useState<Assinante[]>([]);
  const [assinantesLoading, setAssinantesLoading] = useState(false);
  const [assinantesErro, setAssinantesErro] = useState<string | null>(null);

  async function carregarAssinantes() {
    setAssinantesErro(null);
    setAssinantesLoading(true);
    try {
      const {
        data: { session },
      } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) {
        throw new Error("Sem sessão. Faça login novamente.");
      }
      const json = await apiGet<{ items?: Assinante[] }>("/api/org/calculadora/assinantes");
      setAssinantes(Array.isArray(json.items) ? json.items : []);
    } catch (e: unknown) {
      setAssinantesErro(e instanceof Error ? e.message : "Erro inesperado ao carregar assinantes.");
    } finally {
      setAssinantesLoading(false);
    }
  }

  useEffect(() => {
    carregarAssinantes();
  }, []);

  async function gerarConvite() {
    setErro(null);
    const diasNum = Number(validadeDias);
    if (!validadeDias || !Number.isFinite(diasNum) || diasNum <= 0) {
      setErro("Informe a quantidade de dias de acesso.");
      return;
    }
    if (emailAlvo.trim() && !emailAlvo.includes("@")) {
      setErro("E-mail inválido (ou deixe em branco).");
      return;
    }

    setLoading(true);
    try {
      const {
        data: { session },
      } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) {
        throw new Error("Sem sessão. Faça login novamente.");
      }

      const json = await apiPost<{ invite: Invite }>("/api/org/calculadora/invites", {
        email_alvo: emailAlvo.trim() || null,
        validade_dias: diasNum,
      });
      setUltimoConvite(json.invite);
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : "Erro inesperado.");
    } finally {
      setLoading(false);
    }
  }

  const linkMostrar = ultimoConvite?.link ?? "";

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <header className="border-b border-[var(--border-subtle)] bg-[var(--card)]/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <DropCoreLogo variant="horizontal" href="/dashboard" className="h-7" />
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-3 py-1.5 text-xs font-medium text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
            >
              Início da dash
            </Link>
            <div className="text-xs text-[var(--muted)]">Admin · Convites da calculadora</div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 space-y-6">
        <section className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-6 shadow-sm">
          <h1 className="text-lg font-semibold mb-1">Teste grátis da DropCore Calculadora</h1>
          <p className="text-sm text-[var(--muted)] mb-5">
            Gere um link de teste grátis para a calculadora e envie para o cliente ativar o acesso.
          </p>

          <div className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-[var(--muted)] mb-1.5">
                  E-mail do cliente (opcional)
                </label>
                <input
                  type="email"
                  value={emailAlvo}
                  onChange={(e) => setEmailAlvo(e.target.value)}
                  placeholder="cliente@exemplo.com (ou deixe em branco)"
                  className="w-full rounded-xl bg-[var(--background)] border border-[var(--card-border)] px-3 py-2.5 text-sm text-[var(--foreground)] placeholder-[var(--muted)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]/50"
                />
                <p className="mt-1 text-[11px] text-[var(--muted)]">Se preencher, o convite só será aceito para este e-mail. Se deixar em branco, qualquer e-mail poderá usar o link.</p>
              </div>

              <div className="max-w-[180px]">
                <label className="block text-xs text-[var(--muted)] mb-1.5">
                  Dias de acesso
                </label>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={validadeDias}
                  onChange={(e) => setValidadeDias(e.target.value)}
                  className="w-full rounded-xl bg-[var(--background)] border border-[var(--card-border)] px-3 py-2.5 text-sm text-[var(--foreground)] placeholder-[var(--muted)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]/50"
                />
                <p className="mt-1 text-[11px] text-[var(--muted)]">
                  Padrão: 7 dias (teste). Máximo: 365 dias.
                </p>
              </div>
            </div>

            <div className="flex flex-col justify-between gap-4">
              <button
                type="button"
                onClick={gerarConvite}
                disabled={loading}
                className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 text-sm shadow-sm transition disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? "Gerando link…" : "Gerar link de teste"}
              </button>

              {erro && (
                <div className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {erro}
                </div>
              )}
            </div>
          </div>
        </section>

        {ultimoConvite && (
          <section className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-6 shadow-sm space-y-3">
            <h2 className="text-sm font-semibold">Último convite gerado</h2>
            <div className="space-y-2 text-xs text-[var(--muted)]">
              <div>
                <span className="font-semibold text-[var(--foreground)]">E-mail alvo: </span>
                {ultimoConvite.email_alvo ?? "— (qualquer e-mail)"}
              </div>
              <div>
                <span className="font-semibold text-[var(--foreground)]">Dias de acesso: </span>
                {ultimoConvite.validade_dias}
              </div>
              <div>
                <span className="font-semibold text-[var(--foreground)]">Link: </span>
                <a
                  href={linkMostrar}
                  target="_blank"
                  rel="noreferrer"
                  className="break-all text-[var(--accent)] hover:underline"
                >
                  {linkMostrar}
                </a>
              </div>
            </div>
          </section>
        )}

        <section className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold">Assinantes da calculadora</h2>
              <p className="text-xs text-[var(--muted)]">
                Usuários com acesso à DropCore Calculadora (teste grátis ou acesso pago/manual).
              </p>
            </div>
            <button
              type="button"
              onClick={carregarAssinantes}
              disabled={assinantesLoading}
              className="rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-3 py-1.5 text-xs text-[var(--muted)] hover:text-[var(--foreground)] disabled:opacity-50"
            >
              {assinantesLoading ? "Atualizando…" : "Atualizar lista"}
            </button>
          </div>

          {assinantesErro && (
            <div className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">
              {assinantesErro}
            </div>
          )}

          {assinantes.length === 0 && !assinantesLoading && !assinantesErro && (
            <p className="text-xs text-[var(--muted)]">Nenhum assinante encontrado ainda.</p>
          )}

          {assinantes.length > 0 && (
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs border-separate border-spacing-y-1">
                <thead>
                  <tr className="text-[11px] text-[var(--muted)]">
                    <th className="text-left px-2 py-1.5">E-mail</th>
                    <th className="text-left px-2 py-1.5">Válido até</th>
                    <th className="text-left px-2 py-1.5">Dias restantes</th>
                    <th className="text-left px-2 py-1.5">Status</th>
                    <th className="text-right px-2 py-1.5">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {assinantes.map((a) => {
                    const validoData = new Date(a.valido_ate);
                    const validoStr = Number.isNaN(validoData.getTime())
                      ? "—"
                      : validoData.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
                    const dias = a.dias_restantes;
                    const status = a.ativo && !a.expirado ? "Ativo" : "Expirado";
                    const statusClass =
                      a.ativo && !a.expirado
                        ? "text-emerald-700 bg-emerald-50 border-emerald-200"
                        : "text-neutral-600 bg-neutral-50 border-neutral-200";
                    return (
                      <tr key={a.id} className="align-middle">
                        <td className="px-2 py-1.5">
                          <span className="text-[var(--foreground)] font-medium">{a.email ?? "—"}</span>
                        </td>
                        <td className="px-2 py-1.5 text-[var(--muted)]">{validoStr}</td>
                        <td className="px-2 py-1.5 text-[var(--muted)]">
                          {dias >= 0 ? `${dias} dia${dias === 1 ? "" : "s"}` : `${Math.abs(dias)} dia${Math.abs(dias) === 1 ? "" : "s"} atrás`}
                        </td>
                        <td className="px-2 py-1.5">
                          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusClass}`}>
                            {status}
                          </span>
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              disabled={assinantesLoading}
                              onClick={async () => {
                                try {
                                  const {
                                    data: { session },
                                  } = await supabaseBrowser.auth.getSession();
                                  if (!session?.access_token) throw new Error("Sem sessão.");
                                  const res = await fetch(
                                    `/api/org/calculadora/assinantes/${a.user_id}/prorrogar`,
                                    {
                                      method: "POST",
                                      headers: {
                                        "Content-Type": "application/json",
                                        Authorization: `Bearer ${session.access_token}`,
                                      },
                                      body: JSON.stringify({ dias: 7 }),
                                    },
                                  );
                                  const j = await res.json().catch(() => ({}));
                                  if (!res.ok) throw new Error(j?.error ?? "Erro ao prorrogar teste.");
                                  await carregarAssinantes();
                                } catch (e: unknown) {
                                  setAssinantesErro(e instanceof Error ? e.message : "Erro ao prorrogar teste.");
                                }
                              }}
                              className="rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-2 py-1 text-[10px] text-[var(--muted)] hover:text-[var(--foreground)] disabled:opacity-50"
                            >
                              +7 dias
                            </button>
                            <button
                              type="button"
                              disabled={assinantesLoading}
                              onClick={async () => {
                                try {
                                  const {
                                    data: { session },
                                  } = await supabaseBrowser.auth.getSession();
                                  if (!session?.access_token) throw new Error("Sem sessão.");
                                  const res = await fetch(
                                    `/api/org/calculadora/assinantes/${a.user_id}/prorrogar`,
                                    {
                                      method: "POST",
                                      headers: {
                                        "Content-Type": "application/json",
                                        Authorization: `Bearer ${session.access_token}`,
                                      },
                                      body: JSON.stringify({ dias: 30 }),
                                    },
                                  );
                                  const j = await res.json().catch(() => ({}));
                                  if (!res.ok) throw new Error(j?.error ?? "Erro ao prorrogar plano pago.");
                                  await carregarAssinantes();
                                } catch (e: unknown) {
                                  setAssinantesErro(e instanceof Error ? e.message : "Erro ao prorrogar plano pago.");
                                }
                              }}
                              className="rounded-lg border border-emerald-500/40 bg-emerald-50 px-2 py-1 text-[10px] text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                            >
                              +30 dias
                            </button>
                            <button
                              type="button"
                              disabled={assinantesLoading}
                              onClick={async () => {
                                try {
                                  const {
                                    data: { session },
                                  } = await supabaseBrowser.auth.getSession();
                                  if (!session?.access_token) throw new Error("Sem sessão.");
                                  const res = await fetch(
                                    `/api/org/calculadora/assinantes/${a.user_id}/desativar`,
                                    {
                                      method: "POST",
                                      headers: {
                                        Authorization: `Bearer ${session.access_token}`,
                                      },
                                    },
                                  );
                                  const j = await res.json().catch(() => ({}));
                                  if (!res.ok) throw new Error(j?.error ?? "Erro ao desativar acesso.");
                                  await carregarAssinantes();
                                } catch (e: unknown) {
                                  setAssinantesErro(e instanceof Error ? e.message : "Erro ao desativar acesso.");
                                }
                              }}
                              className="rounded-lg border border-red-300 bg-red-50 px-2 py-1 text-[10px] text-red-600 hover:bg-red-100 disabled:opacity-50"
                            >
                              Desativar
                            </button>
                            <button
                              type="button"
                              disabled={assinantesLoading}
                              onClick={async () => {
                                const label = a.email ?? a.user_id;
                                if (
                                  !confirm(
                                    `Excluir ${label} da calculadora?\n\nRemove só o acesso à calculadora (a conta no login continua a existir).`,
                                  )
                                ) {
                                  return;
                                }
                                try {
                                  setAssinantesErro(null);
                                  const {
                                    data: { session },
                                  } = await supabaseBrowser.auth.getSession();
                                  if (!session?.access_token) throw new Error("Sem sessão.");
                                  const res = await fetch(
                                    `/api/org/calculadora/assinantes/${a.user_id}/excluir`,
                                    {
                                      method: "DELETE",
                                      headers: {
                                        Authorization: `Bearer ${session.access_token}`,
                                      },
                                    },
                                  );
                                  const j = await res.json().catch(() => ({}));
                                  if (!res.ok) throw new Error(j?.error ?? "Erro ao excluir.");
                                  await carregarAssinantes();
                                } catch (e: unknown) {
                                  setAssinantesErro(e instanceof Error ? e.message : "Erro ao excluir.");
                                }
                              }}
                              className="rounded-lg border border-red-900 bg-red-900 px-2 py-1 text-[10px] text-white hover:bg-red-800 disabled:opacity-50"
                            >
                              Excluir
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

