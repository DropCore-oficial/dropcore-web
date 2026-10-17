"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { apiGet, apiPost } from "@/lib/api";
import { AMBER_PREMIUM_TEXT_PRIMARY } from "@/lib/amberPremium";
import { DANGER_PREMIUM_SHELL, DANGER_PREMIUM_TEXT_PRIMARY } from "@/lib/semanticPremium";
import { cn } from "@/lib/utils";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { RowActionsMenu } from "@/components/ui/RowActionsMenu";
import { AbaPilula } from "@/components/seller/GestorAvulsoAbaPilula";
import {
  calcularValorMensalGestoresIaAvulso,
  isGestoresIaAvulsoDescontoTipo,
  VALOR_GESTORES_IA_AVULSO_MENSAL,
  type GestoresIaAvulsoDescontoTipo,
} from "@/lib/gestoresIaAvulsoPlanos";

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Convites do pacote "Gestores de IA" (R$797,90/mês, inclui a Calculadora junto) — página
 * própria, separada de /admin/calculadora-convites (essa aqui sempre manda
 * inclui_gestores_ia=true; a outra nunca manda). Mesma conta/tabela por baixo
 * (calculadora_assinantes), login e portal próprios (/gestores-ia/login).
 */

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
  inclui_gestores_ia: boolean;
};

type Assinante = {
  id: string;
  user_id: string;
  nome: string | null;
  email: string | null;
  valido_ate: string;
  ativo: boolean;
  gestores_ia_ciclo: string | null;
  dias_restantes: number;
  expirado: boolean;
  gestores_ia_desconto_tipo: GestoresIaAvulsoDescontoTipo | null;
  gestores_ia_desconto_valor: number | null;
};

export default function AdminGestoresIaConvitesPage() {
  const [emailAlvo, setEmailAlvo] = useState("");
  const [validadeDias, setValidadeDias] = useState("30");
  const [invCiclo, setInvCiclo] = useState<"mensal" | "anual">("mensal");
  const [invDescontoTipo, setInvDescontoTipo] = useState<"cheio" | GestoresIaAvulsoDescontoTipo>("cheio");
  const [invDescontoValorInput, setInvDescontoValorInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ultimoConvite, setUltimoConvite] = useState<Invite | null>(null);
  const [assinantes, setAssinantes] = useState<Assinante[]>([]);
  const [assinantesLoading, setAssinantesLoading] = useState(false);
  const [assinantesErro, setAssinantesErro] = useState<string | null>(null);
  const [excluirConfirmar, setExcluirConfirmar] = useState<{ userId: string; label: string } | null>(null);
  const [apagarLoginModal, setApagarLoginModal] = useState<{ userId: string; emailHint: string } | null>(null);
  const [apagarLoginEmail, setApagarLoginEmail] = useState("");
  const [apagarLoginSending, setApagarLoginSending] = useState(false);
  const [linkCopiado, setLinkCopiado] = useState(false);
  const [copiarErro, setCopiarErro] = useState<string | null>(null);
  const [descontoModal, setDescontoModal] = useState<{ assinanteId: string; nome: string } | null>(null);
  const [descontoTipo, setDescontoTipo] = useState<"cheio" | GestoresIaAvulsoDescontoTipo>("cheio");
  const [descontoValorInput, setDescontoValorInput] = useState("");
  const [descontoSending, setDescontoSending] = useState(false);
  const [descontoErro, setDescontoErro] = useState<string | null>(null);

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
      type AssinanteApi = {
        id: string;
        user_id: string;
        nome: string | null;
        email: string | null;
        ativo: boolean;
        gestores_ia_ciclo: string | null;
        valido_ate: string;
        gestores_ia_desconto_tipo: string | null;
        gestores_ia_desconto_valor: number | null;
      };
      const json = await apiGet<{ items?: AssinanteApi[] }>("/api/org/gestores-ia-avulso/assinantes");
      const now = Date.now();
      const items: Assinante[] = (Array.isArray(json.items) ? json.items : []).map((a) => {
        const validoDate = new Date(a.valido_ate);
        const diffMs = validoDate.getTime() - now;
        const expirado = Number.isNaN(validoDate.getTime()) || validoDate.getTime() < now;
        return {
          id: a.id,
          user_id: a.user_id,
          nome: a.nome,
          email: a.email,
          valido_ate: a.valido_ate,
          ativo: a.ativo,
          gestores_ia_ciclo: a.gestores_ia_ciclo,
          dias_restantes: Math.floor(diffMs / (1000 * 60 * 60 * 24)),
          expirado,
          gestores_ia_desconto_tipo: isGestoresIaAvulsoDescontoTipo(a.gestores_ia_desconto_tipo)
            ? a.gestores_ia_desconto_tipo
            : null,
          gestores_ia_desconto_valor: a.gestores_ia_desconto_valor,
        };
      });
      setAssinantes(items);
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

    let descontoValor: number | null = null;
    if (invDescontoTipo !== "cheio") {
      descontoValor = Number(invDescontoValorInput.replace(",", "."));
      if (!Number.isFinite(descontoValor) || descontoValor <= 0) {
        setErro("Informe um valor de desconto maior que zero.");
        return;
      }
      if (invDescontoTipo === "percentual" && descontoValor > 100) {
        setErro("Percentual não pode passar de 100.");
        return;
      }
      if (invDescontoTipo === "valor" && descontoValor >= VALOR_GESTORES_IA_AVULSO_MENSAL) {
        setErro("Desconto em R$ não pode ser maior ou igual ao preço cheio.");
        return;
      }
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
        inclui_gestores_ia: true,
        gestores_ia_ciclo: invCiclo,
        gestores_ia_desconto_tipo: invDescontoTipo === "cheio" ? null : invDescontoTipo,
        gestores_ia_desconto_valor: descontoValor,
      });
      setUltimoConvite(json.invite);
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : "Erro inesperado.");
    } finally {
      setLoading(false);
    }
  }

  const metricas = useMemo(() => {
    const total = assinantes.length;
    const ativos = assinantes.filter((a) => a.ativo && !a.expirado).length;
    const mensal = assinantes.filter((a) => a.gestores_ia_ciclo === "mensal").length;
    const anual = assinantes.filter((a) => a.gestores_ia_ciclo === "anual").length;
    return { total, ativos, mensal, anual };
  }, [assinantes]);

  const linkMostrar = ultimoConvite?.link ?? "";

  const mailtoConviteHref = useMemo(() => {
    if (!linkMostrar) return "";
    const subject = encodeURIComponent("Convite — Gestores de IA (DropCore)");
    const body = encodeURIComponent(
      `Olá,\n\nSegue o link para criar a sua conta e ativar o acesso aos Gestores de IA (inclui a Calculadora também):\n\n${linkMostrar}\n\nAtenciosamente,`
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

  async function prorrogarAssinante(userId: string) {
    try {
      const {
        data: { session },
      } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) throw new Error("Sem sessão.");
      const res = await fetch(`/api/org/calculadora/assinantes/${userId}/prorrogar`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ dias: 30 }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error ?? "Erro ao prorrogar.");
      await carregarAssinantes();
    } catch (e: unknown) {
      setAssinantesErro(e instanceof Error ? e.message : "Erro ao prorrogar.");
    }
  }

  async function desativarAssinante(userId: string) {
    try {
      const {
        data: { session },
      } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) throw new Error("Sem sessão.");
      const res = await fetch(`/api/org/calculadora/assinantes/${userId}/desativar`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error ?? "Erro ao desativar acesso.");
      await carregarAssinantes();
    } catch (e: unknown) {
      setAssinantesErro(e instanceof Error ? e.message : "Erro ao desativar acesso.");
    }
  }

  async function excluirAssinante(userId: string) {
    try {
      setAssinantesErro(null);
      const {
        data: { session },
      } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) throw new Error("Sem sessão.");
      const res = await fetch(`/api/org/calculadora/assinantes/${userId}/excluir`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error ?? "Erro ao excluir.");
      await carregarAssinantes();
    } catch (e: unknown) {
      setAssinantesErro(e instanceof Error ? e.message : "Erro ao excluir.");
    }
  }

  function assinanteDisplay(a: Assinante) {
    const validoData = new Date(a.valido_ate);
    const validoStr = Number.isNaN(validoData.getTime())
      ? "—"
      : validoData.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
    const dias = a.dias_restantes;
    const status = a.ativo && !a.expirado ? "Ativo" : "Expirado";
    const statusClass =
      a.ativo && !a.expirado
        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400"
        : "bg-[var(--muted)]/15 text-[var(--muted)]";
    const cicloLabel = a.gestores_ia_ciclo === "mensal" ? "Mensal" : a.gestores_ia_ciclo === "anual" ? "Anual" : "—";
    const valorEfetivo = calcularValorMensalGestoresIaAvulso(a.gestores_ia_desconto_tipo, a.gestores_ia_desconto_valor);
    const descontoLabel =
      a.gestores_ia_desconto_tipo === "valor"
        ? `${BRL.format(a.gestores_ia_desconto_valor ?? 0)} off`
        : a.gestores_ia_desconto_tipo === "percentual"
          ? `${a.gestores_ia_desconto_valor}% off`
          : null;
    return { validoStr, dias, status, statusClass, cicloLabel, valorEfetivo, descontoLabel };
  }

  function renderAcoesAssinante(a: Assinante, descontoLabel: string | null) {
    return (
      <div className="inline-flex items-center justify-end gap-1.5">
        <button
          type="button"
          disabled={assinantesLoading}
          onClick={() => abrirDescontoModal(a)}
          className="rounded-md border border-[var(--card-border)] bg-[var(--card)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--foreground)] hover:bg-[var(--muted)]/10 disabled:opacity-50"
        >
          {descontoLabel ? "Editar desconto" : "Dar desconto"}
        </button>
        <RowActionsMenu>
          <button
            type="button"
            disabled={assinantesLoading}
            onClick={() => void prorrogarAssinante(a.user_id)}
            className="block w-full rounded-md px-3 py-2 text-left text-sm text-[var(--foreground)] hover:bg-[var(--muted)]/12 disabled:cursor-not-allowed disabled:opacity-50"
          >
            +30 dias
          </button>
          <button
            type="button"
            disabled={assinantesLoading}
            onClick={() => void desativarAssinante(a.user_id)}
            className="block w-full rounded-md px-3 py-2 text-left text-sm text-[var(--foreground)] hover:bg-[var(--muted)]/12 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Desativar
          </button>
          <div className="my-1 border-t border-[var(--card-border)]" />
          <button
            type="button"
            disabled={assinantesLoading}
            onClick={() => setExcluirConfirmar({ userId: a.user_id, label: a.email ?? a.user_id })}
            className="block w-full rounded-md px-3 py-2 text-left text-sm text-[var(--danger)] hover:bg-[var(--muted)]/12 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Excluir do pacote
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
              AMBER_PREMIUM_TEXT_PRIMARY,
              "block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-[var(--muted)]/12 disabled:cursor-not-allowed disabled:opacity-40"
            )}
          >
            Excluir login
          </button>
        </RowActionsMenu>
      </div>
    );
  }

  function abrirDescontoModal(a: Assinante) {
    setDescontoErro(null);
    setDescontoTipo(a.gestores_ia_desconto_tipo ?? "cheio");
    setDescontoValorInput(a.gestores_ia_desconto_valor != null ? String(a.gestores_ia_desconto_valor) : "");
    setDescontoModal({ assinanteId: a.id, nome: a.nome ?? a.email ?? "esse assinante" });
  }

  async function salvarDesconto() {
    if (!descontoModal) return;
    setDescontoErro(null);

    let body: { tipo: GestoresIaAvulsoDescontoTipo | null; valor: number | null };
    if (descontoTipo === "cheio") {
      body = { tipo: null, valor: null };
    } else {
      const valor = Number(descontoValorInput.replace(",", "."));
      if (!Number.isFinite(valor) || valor <= 0) {
        setDescontoErro("Informe um valor maior que zero.");
        return;
      }
      if (descontoTipo === "percentual" && valor > 100) {
        setDescontoErro("Percentual não pode passar de 100.");
        return;
      }
      if (descontoTipo === "valor" && valor >= VALOR_GESTORES_IA_AVULSO_MENSAL) {
        setDescontoErro("Desconto em R$ não pode ser maior ou igual ao preço cheio.");
        return;
      }
      body = { tipo: descontoTipo, valor };
    }

    setDescontoSending(true);
    try {
      const {
        data: { session },
      } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) throw new Error("Sem sessão.");
      const res = await fetch(`/api/org/gestores-ia-avulso/assinantes/${descontoModal.assinanteId}/desconto`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify(body),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error ?? "Erro ao salvar desconto.");
      setDescontoModal(null);
      await carregarAssinantes();
    } catch (e: unknown) {
      setDescontoErro(e instanceof Error ? e.message : "Erro ao salvar desconto.");
    } finally {
      setDescontoSending(false);
    }
  }

  const descontoPreview =
    descontoTipo === "cheio"
      ? VALOR_GESTORES_IA_AVULSO_MENSAL
      : calcularValorMensalGestoresIaAvulso(descontoTipo, Number(descontoValorInput.replace(",", ".")) || null);

  const invDescontoPreview =
    invDescontoTipo === "cheio"
      ? VALOR_GESTORES_IA_AVULSO_MENSAL
      : calcularValorMensalGestoresIaAvulso(invDescontoTipo, Number(invDescontoValorInput.replace(",", ".")) || null);

  return (
    <div className="bg-[var(--background)] text-[var(--foreground)] app-bg">
      <main className="dropcore-shell-6xl space-y-5 pt-6 pb-5 md:pb-7">
        <AdminPageHeader eyebrow="Operação" title="Gerar convite (R$797,90/mês)" />
        <section className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-6 shadow-sm">

          <div className="grid gap-5 md:grid-cols-2">
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
                  className="w-full rounded-xl bg-[var(--card)] border border-[var(--card-border)] px-3 py-2.5 text-sm text-[var(--foreground)] placeholder-[var(--muted)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]/50"
                />
              </div>

              <div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {(
                    [
                      ["mensal", "Mensal", "Sem compromisso"],
                      ["anual", "Anual", "12 parcelas, 60 dias grátis"],
                    ] as const
                  ).map(([valor, titulo, subtitulo]) => {
                    const selecionado = invCiclo === valor;
                    return (
                      <button
                        key={valor}
                        type="button"
                        onClick={() => setInvCiclo(valor)}
                        className={cn(
                          "rounded-xl border p-3 text-left transition-colors",
                          selecionado
                            ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20"
                            : "border-[var(--card-border)] bg-[var(--card)] hover:border-emerald-300 dark:hover:border-emerald-700"
                        )}
                      >
                        <span className="flex items-center gap-2">
                          <span
                            className={cn(
                              "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2",
                              selecionado ? "border-emerald-600 bg-emerald-600" : "border-[var(--card-border)]"
                            )}
                            aria-hidden
                          >
                            {selecionado && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                          </span>
                          <span className="text-sm font-semibold text-[var(--foreground)]">{titulo}</span>
                        </span>
                        <p className="mt-1 pl-6 text-xs text-[var(--muted)]">{subtitulo}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {invCiclo === "anual" && (
                <p className="text-[11px] text-[var(--muted)]">
                  Conta libera na hora, sem cobrar — os 60 dias de carência do contrato anual mandam aqui, não os dias
                  de acesso.
                </p>
              )}
            </div>

            <div className="flex flex-col gap-4">
              <div>
                <p className="block text-xs text-[var(--muted)] mb-1.5">Desconto na parcela</p>
                <div className="flex gap-1 overflow-x-auto rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-1 sm:flex-wrap">
                  {(
                    [
                      ["cheio", "Preço cheio"],
                      ["valor", "Valor fixo em R$"],
                      ["percentual", "Percentual (%)"],
                    ] as const
                  ).map(([valor, label]) => (
                    <AbaPilula
                      key={valor}
                      ativo={invDescontoTipo === valor}
                      onClick={() => setInvDescontoTipo(valor)}
                      icon={null}
                    >
                      {label}
                    </AbaPilula>
                  ))}
                </div>
              </div>

              <div className="flex items-stretch gap-2">
                <div className="flex-1 rounded-xl border border-[var(--card-border)] bg-[var(--muted)]/10 px-3 py-2.5">
                  <p className="text-[11px] text-[var(--muted)]">Valor da parcela com essa configuração</p>
                  <p className="text-base font-bold text-[var(--foreground)]">{BRL.format(invDescontoPreview)}</p>
                </div>
                {invDescontoTipo !== "cheio" && (
                  <input
                    type="text"
                    inputMode="decimal"
                    value={invDescontoValorInput}
                    onChange={(e) => setInvDescontoValorInput(e.target.value)}
                    placeholder={invDescontoTipo === "valor" ? "100" : "15"}
                    className="w-24 shrink-0 rounded-xl bg-[var(--card)] border border-[var(--card-border)] px-3 py-2.5 text-sm text-[var(--foreground)] placeholder-[var(--muted)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]/50"
                  />
                )}
              </div>

              {erro && (
                <div className={cn("rounded-xl px-3 py-2 text-xs", DANGER_PREMIUM_SHELL, DANGER_PREMIUM_TEXT_PRIMARY)}>
                  {erro}
                </div>
              )}

              <div className="flex gap-2">
                {invCiclo === "mensal" && (
                  <div className="flex w-[120px] shrink-0 flex-col">
                    <label className="block text-xs text-[var(--muted)] mb-1.5">Dias de acesso</label>
                    <input
                      type="number"
                      min={1}
                      max={365}
                      value={validadeDias}
                      onChange={(e) => setValidadeDias(e.target.value)}
                      className="h-10 w-full rounded-xl bg-[var(--card)] border border-[var(--card-border)] px-3 text-sm text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]/50"
                    />
                  </div>
                )}
                <div className="flex flex-1 flex-col">
                  <span className="mb-1.5 block text-xs text-transparent select-none" aria-hidden="true">
                    .
                  </span>
                  <button
                    type="button"
                    onClick={gerarConvite}
                    disabled={loading}
                    className="flex h-10 w-full items-center justify-center rounded-md bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-[11px] shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {loading ? "Gerando link..." : "Gerar link de convite"}
                  </button>
                </div>
              </div>
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
                  className="rounded-md border border-[var(--card-border)] bg-[var(--card)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--foreground)] hover:bg-[var(--muted)]/10 touch-manipulation"
                >
                  {linkCopiado ? "Copiado!" : "Copiar link"}
                </button>
                <a
                  href={mailtoConviteHref}
                  className="inline-flex items-center justify-center rounded-md bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1.5 text-[11px] font-semibold shadow-sm touch-manipulation"
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
              <h2 className="text-sm font-semibold">Assinantes do pacote Gestores de IA</h2>
              <p className="text-xs text-[var(--muted)]">
                Usuários com o pacote completo (Gestores de IA + Calculadora) ativo.
              </p>
            </div>
            <button
              type="button"
              onClick={carregarAssinantes}
              disabled={assinantesLoading}
              className="rounded-md border border-[var(--card-border)] bg-[var(--card)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--muted)] hover:bg-[var(--muted)]/10 hover:text-[var(--foreground)] disabled:opacity-50"
            >
              {assinantesLoading ? "Atualizando..." : "Atualizar lista"}
            </button>
          </div>

          {assinantesErro && (
            <div className={cn("rounded-xl px-3 py-2 text-xs", DANGER_PREMIUM_SHELL, DANGER_PREMIUM_TEXT_PRIMARY)}>
              {assinantesErro}
            </div>
          )}

          {assinantes.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-0 divide-x divide-y sm:divide-y-0 divide-[var(--card-border)] rounded-xl border border-[var(--card-border)] overflow-hidden">
              <div className="px-4 py-3">
                <p className="text-[11px] text-[var(--muted)]">Total</p>
                <p className="text-lg font-bold text-[var(--foreground)] leading-tight mt-0.5">{metricas.total}</p>
              </div>
              <div className="px-4 py-3">
                <p className="text-[11px] text-[var(--muted)]">Ativos</p>
                <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400 leading-tight mt-0.5">{metricas.ativos}</p>
              </div>
              <div className="px-4 py-3">
                <p className="text-[11px] text-[var(--muted)]">Mensal</p>
                <p className="text-lg font-bold text-[var(--foreground)] leading-tight mt-0.5">{metricas.mensal}</p>
              </div>
              <div className="px-4 py-3">
                <p className="text-[11px] text-[var(--muted)]">Anual</p>
                <p className="text-lg font-bold text-[var(--foreground)] leading-tight mt-0.5">{metricas.anual}</p>
              </div>
            </div>
          )}

          {assinantes.length === 0 && !assinantesLoading && !assinantesErro && (
            <p className="text-xs text-[var(--muted)]">Nenhum assinante do pacote ainda.</p>
          )}

          {assinantes.length > 0 && (
            <>
              {/* Mobile: cards empilhados (tabela de 8 colunas não cabe/scrolla mal em ~390px). */}
              <div className="space-y-2.5 sm:hidden">
                {assinantes.map((a) => {
                  const { validoStr, dias, status, statusClass, cicloLabel, valorEfetivo, descontoLabel } =
                    assinanteDisplay(a);
                  return (
                    <article key={a.id} className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-[var(--foreground)]">{a.nome ?? "—"}</p>
                          <p className="truncate text-xs text-[var(--muted)]">{a.email ?? "—"}</p>
                        </div>
                        <span
                          className={cn(
                            "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-medium",
                            statusClass
                          )}
                        >
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden />
                          {status}
                        </span>
                      </div>
                      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                        <div>
                          <dt className="text-[11px] text-[var(--muted)]">Ciclo</dt>
                          <dd className="text-[var(--foreground)]">{cicloLabel}</dd>
                        </div>
                        <div>
                          <dt className="text-[11px] text-[var(--muted)]">Desconto</dt>
                          <dd className="text-[var(--foreground)]">
                            {descontoLabel ? `${descontoLabel} · ${BRL.format(valorEfetivo)}/mês` : "Preço cheio"}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-[11px] text-[var(--muted)]">Válido até</dt>
                          <dd className="text-[var(--foreground)]">{validoStr}</dd>
                        </div>
                        <div>
                          <dt className="text-[11px] text-[var(--muted)]">Dias restantes</dt>
                          <dd className="text-[var(--foreground)]">
                            {dias >= 0
                              ? `${dias} dia${dias === 1 ? "" : "s"}`
                              : `${Math.abs(dias)} dia${Math.abs(dias) === 1 ? "" : "s"} atrás`}
                          </dd>
                        </div>
                      </dl>
                      <div className="mt-3 flex justify-end border-t border-[var(--card-border)] pt-3">
                        {renderAcoesAssinante(a, descontoLabel)}
                      </div>
                    </article>
                  );
                })}
              </div>

              {/* Desktop: tabela. */}
              <div className="hidden overflow-x-auto sm:block">
                <table className="min-w-full text-xs border-separate border-spacing-y-1">
                  <thead>
                    <tr className="text-[11px] text-[var(--muted)]">
                      <th className="text-left px-2 py-1.5">Nome</th>
                      <th className="text-left px-2 py-1.5">E-mail</th>
                      <th className="text-left px-2 py-1.5">Ciclo</th>
                      <th className="text-left px-2 py-1.5">Desconto</th>
                      <th className="text-left px-2 py-1.5">Válido até</th>
                      <th className="text-left px-2 py-1.5">Dias restantes</th>
                      <th className="text-left px-2 py-1.5">Status</th>
                      <th className="text-right px-2 py-1.5">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assinantes.map((a) => {
                      const { validoStr, dias, status, statusClass, cicloLabel, valorEfetivo, descontoLabel } =
                        assinanteDisplay(a);
                      return (
                        <tr key={a.id} className="align-middle">
                          <td className="px-2 py-1.5">
                            <span className="text-[var(--foreground)] font-medium">{a.nome ?? "—"}</span>
                          </td>
                          <td className="px-2 py-1.5">
                            <span className="text-[var(--foreground)]">{a.email ?? "—"}</span>
                          </td>
                          <td className="px-2 py-1.5 text-[var(--muted)]">{cicloLabel}</td>
                          <td className="px-2 py-1.5">
                            {descontoLabel ? (
                              <div>
                                <span className="font-medium text-[var(--foreground)]">{descontoLabel}</span>
                                <p className="text-[10px] text-[var(--muted)]">{BRL.format(valorEfetivo)}/mês</p>
                              </div>
                            ) : (
                              <span className="text-[var(--muted)]">Preço cheio</span>
                            )}
                          </td>
                          <td className="px-2 py-1.5 text-[var(--muted)]">{validoStr}</td>
                          <td className="px-2 py-1.5 text-[var(--muted)]">
                            {dias >= 0 ? `${dias} dia${dias === 1 ? "" : "s"}` : `${Math.abs(dias)} dia${Math.abs(dias) === 1 ? "" : "s"} atrás`}
                          </td>
                          <td className="px-2 py-1.5">
                            <span
                              className={cn(
                                "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-medium",
                                statusClass
                              )}
                            >
                              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden />
                              {status}
                            </span>
                          </td>
                          <td className="px-2 py-1.5 text-right">{renderAcoesAssinante(a, descontoLabel)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      </main>

      {descontoModal && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="desconto-modal-titulo"
        >
          <div className="w-full max-w-md rounded-2xl border border-[var(--card-border)] bg-[var(--card)] shadow-xl p-5 space-y-4">
            <h2 id="desconto-modal-titulo" className="text-base font-semibold text-[var(--foreground)]">
              Desconto — {descontoModal.nome}
            </h2>

            <div className="flex gap-1 overflow-x-auto rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-1">
              {(
                [
                  ["cheio", "Preço cheio"],
                  ["valor", "Valor fixo em R$"],
                  ["percentual", "Percentual (%)"],
                ] as const
              ).map(([valor, label]) => (
                <AbaPilula key={valor} ativo={descontoTipo === valor} onClick={() => setDescontoTipo(valor)} icon={null}>
                  {label}
                </AbaPilula>
              ))}
            </div>

            <div className="flex items-stretch gap-2">
              <div className="flex-1 rounded-xl border border-[var(--card-border)] bg-[var(--muted)]/10 px-3 py-2.5">
                <p className="text-[11px] text-[var(--muted)]">Valor da parcela com essa configuração</p>
                <p className="text-base font-bold text-[var(--foreground)]">{BRL.format(descontoPreview)}</p>
              </div>
              {descontoTipo !== "cheio" && (
                <div className="w-24 shrink-0">
                  <label className="block text-[11px] font-medium text-[var(--muted)] mb-1">
                    {descontoTipo === "valor" ? "R$" : "%"}
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={descontoValorInput}
                    onChange={(e) => setDescontoValorInput(e.target.value)}
                    placeholder={descontoTipo === "valor" ? "100" : "15"}
                    className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-3 py-2 text-sm text-[var(--foreground)]"
                    autoFocus
                  />
                </div>
              )}
            </div>

            {descontoErro && (
              <div className={cn("rounded-xl px-3 py-2 text-xs", DANGER_PREMIUM_SHELL, DANGER_PREMIUM_TEXT_PRIMARY)}>
                {descontoErro}
              </div>
            )}

            <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end pt-1">
              <button
                type="button"
                disabled={descontoSending}
                onClick={() => setDescontoModal(null)}
                className="rounded-md border border-[var(--card-border)] bg-[var(--card)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--muted)] hover:bg-[var(--muted)]/10 hover:text-[var(--foreground)]"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={descontoSending}
                onClick={() => void salvarDesconto()}
                className="rounded-md bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
              >
                {descontoSending ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {excluirConfirmar && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="excluir-confirmar-titulo"
        >
          <div className="w-full max-w-md rounded-2xl border border-[var(--card-border)] bg-[var(--card)] shadow-xl p-5 space-y-4">
            <h2 id="excluir-confirmar-titulo" className="text-base font-semibold text-[var(--foreground)]">
              Excluir {excluirConfirmar.label} do pacote?
            </h2>
            <p className="text-xs text-[var(--muted)] leading-relaxed">
              Remove só o acesso ao pacote — a conta de login continua a existir.
            </p>
            <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end pt-1">
              <button
                type="button"
                onClick={() => setExcluirConfirmar(null)}
                className="rounded-md border border-[var(--card-border)] bg-[var(--card)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--muted)] hover:bg-[var(--muted)]/10 hover:text-[var(--foreground)]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  const userId = excluirConfirmar.userId;
                  setExcluirConfirmar(null);
                  void excluirAssinante(userId);
                }}
                className="rounded-md bg-[var(--danger)] px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:opacity-90 dark:bg-red-500 dark:hover:bg-red-400 dark:ring-1 dark:ring-inset dark:ring-white/20"
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}

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
                className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-3 py-2 text-sm text-[var(--foreground)]"
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
                className="rounded-md border border-[var(--card-border)] bg-[var(--card)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--muted)] hover:bg-[var(--muted)]/10 hover:text-[var(--foreground)]"
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
                className="rounded-md bg-[var(--danger)] px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:opacity-90 disabled:opacity-50 dark:bg-red-500 dark:hover:bg-red-400 dark:ring-1 dark:ring-inset dark:ring-white/20"
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
