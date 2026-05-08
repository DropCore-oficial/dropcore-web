"use client";

import { useEffect, useMemo, useState } from "react";
import { DropCoreLogo } from "@/components/DropCoreLogo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { apiGet, apiPost } from "@/lib/api";
import Link from "next/link";
import { AMBER_PREMIUM_SHELL, AMBER_PREMIUM_TEXT_PRIMARY } from "@/lib/amberPremium";
import { cn } from "@/lib/utils";

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

type RecebimentoCalc = {
  id: string;
  user_id: string;
  email: string | null;
  mp_payment_id: string;
  valor: number;
  external_reference: string | null;
  pago_em: string;
};

const fmtBrl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export default function AdminCalculadoraConvitesPage() {
  const [emailAlvo, setEmailAlvo] = useState("");
  const [validadeDias, setValidadeDias] = useState("7");
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ultimoConvite, setUltimoConvite] = useState<Invite | null>(null);
  const [assinantes, setAssinantes] = useState<Assinante[]>([]);
  const [assinantesLoading, setAssinantesLoading] = useState(false);
  const [assinantesErro, setAssinantesErro] = useState<string | null>(null);
  const [recebimentos, setRecebimentos] = useState<RecebimentoCalc[]>([]);
  const [recebimentosSomaTotal, setRecebimentosSomaTotal] = useState<number | null>(null);
  const [recebimentosLoading, setRecebimentosLoading] = useState(false);
  const [recebimentosErro, setRecebimentosErro] = useState<string | null>(null);
  const [apagarLoginModal, setApagarLoginModal] = useState<{ userId: string; emailHint: string } | null>(null);
  const [apagarLoginEmail, setApagarLoginEmail] = useState("");
  const [apagarLoginSending, setApagarLoginSending] = useState(false);
  const [linkCopiado, setLinkCopiado] = useState(false);
  const [copiarErro, setCopiarErro] = useState<string | null>(null);

  async function carregarRecebimentos() {
    setRecebimentosErro(null);
    setRecebimentosLoading(true);
    try {
      const json = await apiGet<{
        items?: RecebimentoCalc[];
        soma_total_geral?: number;
        error?: string;
      }>("/api/org/calculadora/recebimentos?limit=100");
      if (typeof json?.error === "string" && json.error && !json.items?.length) {
        setRecebimentosErro(json.error);
        setRecebimentos([]);
        setRecebimentosSomaTotal(null);
        return;
      }
      setRecebimentos(Array.isArray(json.items) ? json.items : []);
      setRecebimentosSomaTotal(typeof json.soma_total_geral === "number" ? json.soma_total_geral : null);
      if (typeof json?.error === "string" && json.error) setRecebimentosErro(json.error);
    } catch (e: unknown) {
      setRecebimentosErro(e instanceof Error ? e.message : "Erro ao carregar recebimentos.");
      setRecebimentos([]);
      setRecebimentosSomaTotal(null);
    } finally {
      setRecebimentosLoading(false);
    }
  }

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
    carregarRecebimentos();
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

  const mailtoConviteHref = useMemo(() => {
    if (!linkMostrar) return "";
    const subject = encodeURIComponent("Convite — DropCore Calculadora (teste grátis)");
    const body = encodeURIComponent(
      `Olá,\n\nSegue o link para criar a sua conta e ativar o teste grátis da DropCore Calculadora:\n\n${linkMostrar}\n\nAtenciosamente,`
    );
    const toRaw = ultimoConvite?.email_alvo?.trim();
    const to = toRaw ? encodeURIComponent(toRaw) : "";
    return `mailto:${to}?subject=${subject}&body=${body}`;
  }, [linkMostrar, ultimoConvite?.email_alvo]);

  async function copiarLinkConvite() {
    setCopiarErro(null);
    if (!linkMostrar) return;
    try {
      await navigator.clipboard.writeText(linkMostrar);
      setLinkCopiado(true);
      window.setTimeout(() => setLinkCopiado(false), 2500);
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = linkMostrar;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        setLinkCopiado(true);
        window.setTimeout(() => setLinkCopiado(false), 2500);
      } catch {
        setCopiarErro("Não foi possível copiar. Selecione o link acima manualmente.");
      }
    }
  }

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <header className="border-b border-[var(--border-subtle)] bg-[var(--card)]/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <DropCoreLogo variant="horizontal" href="/dashboard" className="shrink-0 overflow-visible py-0.5" />
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap justify-end">
            <Link
              href="/dashboard"
              className="rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-3 py-1.5 text-xs font-medium text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
            >
              Início da dash
            </Link>
            <ThemeToggle className="hidden md:inline-flex rounded-lg border border-[var(--card-border)] bg-[var(--card)] p-2 min-h-[40px] min-w-[40px] items-center justify-center touch-manipulation" />
            <div className="text-xs text-[var(--muted)] hidden sm:block">Admin · Convites da calculadora</div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 space-y-6">
        <section className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-6 shadow-sm">
          <h1 className="text-lg font-semibold mb-1">Teste grátis da DropCore Calculadora</h1>
          <p className="text-sm text-[var(--muted)] mb-5">
            Gere um link de teste grátis para a calculadora e envie para o cliente ativar o acesso. Informação oficial para cliente
            (plano pago): dia de renovação fixo no calendário, sem juros; inadimplência bloqueia o uso até quitar — o dia da
            renovação não migra só porque o último pagamento foi atrasado (está também nas telas /calculadora).
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
                {loading ? "Gerando link..." : "Gerar link de teste"}
              </button>

              {erro && (
                <div className="rounded-xl border border-red-300 bg-red-100 px-3 py-2 text-xs text-red-700">
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
              <div className="flex flex-wrap items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => void copiarLinkConvite()}
                  className="rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-xs font-medium text-[var(--foreground)] hover:bg-[var(--card)] transition-colors touch-manipulation min-h-[40px]"
                >
                  {linkCopiado ? "Copiado!" : "Copiar link"}
                </button>
                <a
                  href={mailtoConviteHref}
                  className="inline-flex items-center justify-center rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 text-xs font-semibold shadow-sm transition-colors touch-manipulation min-h-[40px]"
                >
                  {ultimoConvite.email_alvo?.trim()
                    ? "Abrir e-mail para o cliente"
                    : "Abrir rascunho de e-mail"}
                </a>
              </div>
              {copiarErro && (
                <p className="text-[11px] text-red-600 dark:text-red-400">{copiarErro}</p>
              )}
              <p className="text-[11px] text-[var(--muted)] max-w-xl">
                O botão verde abre o seu programa de e-mail (Mail, Outlook, Gmail no navegador, etc.) com o texto e o link
                prontos{ultimoConvite.email_alvo?.trim() ? " e o destinatário preenchido" : ""}. O envio não sai dos servidores
                DropCore — é o seu e-mail que envia.
              </p>
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
              {assinantesLoading ? "Atualizando..." : "Atualizar lista"}
            </button>
          </div>

          {assinantesErro && (
            <div className="rounded-xl border border-red-300 bg-red-100 px-3 py-2 text-xs text-red-700">
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
                        ? "text-emerald-700 bg-emerald-100 border-emerald-300"
                        : "text-neutral-600 bg-neutral-100 border-neutral-200";
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
                          <div className="inline-flex flex-wrap items-center justify-end gap-1.5 max-w-[280px] ml-auto">
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
                              className="rounded-lg border border-emerald-500/40 bg-emerald-100 px-2 py-1 text-[10px] text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
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
                              className="rounded-lg border border-red-300 bg-red-100 px-2 py-1 text-[10px] text-red-600 hover:bg-red-100 disabled:opacity-50"
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
                            <button
                              type="button"
                              disabled={assinantesLoading || !a.email}
                              title={
                                !a.email
                                  ? "Sem e-mail na lista — não é possível confirmar a conta."
                                  : "Exclui a conta de login no Supabase (irreversível). Bloqueado para sellers e membros de org."
                              }
                              onClick={() => {
                                setApagarLoginEmail(a.email ?? "");
                                setApagarLoginModal({ userId: a.user_id, emailHint: a.email ?? "" });
                              }}
                              className={cn(
                                AMBER_PREMIUM_SHELL,
                                AMBER_PREMIUM_TEXT_PRIMARY,
                                "rounded-lg px-2 py-1 text-[10px] hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
                              )}
                            >
                              Excluir login
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

        <section className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-6 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold">Recebimentos — renovação PIX (calculadora)</h2>
              <p className="text-xs text-[var(--muted)]">
                Valores registrados quando o Mercado Pago aprova o PIX de renovação. O dinheiro continua caindo na sua conta MP;
                aqui é o espelho interno.
              </p>
            </div>
            <button
              type="button"
              onClick={carregarRecebimentos}
              disabled={recebimentosLoading}
              className="rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-3 py-1.5 text-xs text-[var(--muted)] hover:text-[var(--foreground)] disabled:opacity-50 shrink-0"
            >
              {recebimentosLoading ? "Atualizando..." : "Atualizar"}
            </button>
          </div>

          {recebimentosSomaTotal != null && recebimentosSomaTotal >= 0 && (
            <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
              Total registrado (todos os PIX): {fmtBrl.format(recebimentosSomaTotal)}
            </p>
          )}

          {recebimentosErro && (
            <div className="rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
              {recebimentosErro}
            </div>
          )}

          {recebimentos.length === 0 && !recebimentosLoading && !recebimentosErro && (
            <p className="text-xs text-[var(--muted)]">Nenhum pagamento registrado ainda (após rodar o SQL da tabela e novas renovações).</p>
          )}

          {recebimentos.length > 0 && (
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs border-separate border-spacing-y-1">
                <thead>
                  <tr className="text-[11px] text-[var(--muted)]">
                    <th className="text-left px-2 py-1.5">Pago em</th>
                    <th className="text-left px-2 py-1.5">E-mail</th>
                    <th className="text-right px-2 py-1.5">Valor</th>
                    <th className="text-left px-2 py-1.5 font-mono">Payment MP</th>
                  </tr>
                </thead>
                <tbody>
                  {recebimentos.map((r) => {
                    const d = new Date(r.pago_em);
                    const dataStr = Number.isNaN(d.getTime())
                      ? "—"
                      : d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
                    return (
                      <tr key={r.id} className="align-middle">
                        <td className="px-2 py-1.5 text-[var(--muted)] whitespace-nowrap">{dataStr}</td>
                        <td className="px-2 py-1.5 text-[var(--foreground)] font-medium max-w-[200px] truncate" title={r.email ?? ""}>
                          {r.email ?? "—"}
                        </td>
                        <td className="px-2 py-1.5 text-right font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                          {fmtBrl.format(r.valor)}
                        </td>
                        <td className="px-2 py-1.5 text-[var(--muted)] text-[10px] max-w-[140px] truncate" title={r.mp_payment_id}>
                          {r.mp_payment_id}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="text-[11px] text-[var(--muted)] mt-2">Últimos 100 registros. Pagamentos antigos (antes desta versão) não aparecem.</p>
            </div>
          )}
        </section>
      </main>

      {apagarLoginModal && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="apagar-login-titulo"
        >
          <div className="w-full max-w-md rounded-2xl border border-[var(--card-border)] bg-[var(--card)] shadow-xl p-5 space-y-4">
            <h2 id="apagar-login-titulo" className="text-base font-semibold text-[var(--foreground)]">
              Excluir conta de login (Auth)
            </h2>
            <p className="text-xs text-[var(--muted)] leading-relaxed">
              Exclui o usuário do <strong className="text-[var(--foreground)]">Supabase Auth</strong>. A pessoa deixa de
              conseguir entrar com este e-mail. <strong className="text-[var(--foreground)]">Essa ação não pode ser desfeita.</strong>
              <br />
              <br />
              Não é permitido se for <strong className="text-[var(--foreground)]">seller</strong> ou tiver{" "}
              <strong className="text-[var(--foreground)]">organização (org)</strong>.
            </p>
            <div>
              <label className="block text-[11px] font-medium text-[var(--muted)] mb-1">
                Digite o e-mail da conta para confirmar
              </label>
              <input
                type="email"
                value={apagarLoginEmail}
                onChange={(e) => setApagarLoginEmail(e.target.value)}
                className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)]"
                placeholder={apagarLoginModal.emailHint || "email@exemplo.com"}
                autoComplete="off"
              />
            </div>
            <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end pt-1">
              <button
                type="button"
                disabled={apagarLoginSending}
                onClick={() => {
                  setApagarLoginModal(null);
                  setApagarLoginEmail("");
                }}
                className="rounded-lg border border-[var(--card-border)] px-4 py-2 text-sm text-[var(--muted)] hover:text-[var(--foreground)]"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={apagarLoginSending}
                onClick={async () => {
                  try {
                    setApagarLoginSending(true);
                    setAssinantesErro(null);
                    const {
                      data: { session },
                    } = await supabaseBrowser.auth.getSession();
                    if (!session?.access_token) throw new Error("Sem sessão.");
                    const res = await fetch(
                      `/api/org/calculadora/assinantes/${apagarLoginModal.userId}/apagar-conta`,
                      {
                        method: "POST",
                        headers: {
                          "Content-Type": "application/json",
                          Authorization: `Bearer ${session.access_token}`,
                        },
                        body: JSON.stringify({ email: apagarLoginEmail.trim() }),
                      },
                    );
                    const j = await res.json().catch(() => ({}));
                    if (!res.ok) throw new Error(j?.error ?? "Erro ao excluir conta.");
                    setApagarLoginModal(null);
                    setApagarLoginEmail("");
                    await carregarAssinantes();
                  } catch (e: unknown) {
                    setAssinantesErro(e instanceof Error ? e.message : "Erro ao excluir conta.");
                  } finally {
                    setApagarLoginSending(false);
                  }
                }}
                className="rounded-lg bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-50"
              >
                {apagarLoginSending ? "Excluindo..." : "Excluir definitivamente"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

