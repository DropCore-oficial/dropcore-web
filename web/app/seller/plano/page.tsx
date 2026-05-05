"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { SellerNav } from "../SellerNav";
import { SellerPageHeader } from "@/components/seller/SellerPageHeader";
import { IconCheck, IconClock, IconX } from "@/components/seller/Icons";
import {
  nomeExibicaoPlanoSeller,
  SELLER_PLANO_NOME_PRO,
  SELLER_PLANO_NOME_START,
} from "@/lib/sellerPlanoLabels";
import { VALOR_DEFAULT_MENSALIDADE_SELLER, VALOR_DEFAULT_MENSALIDADE_SELLER_PRO } from "@/lib/sellerPlanoPrecos";
import { planoSellerDefinido } from "@/lib/sellerDocumento";
import {
  AMBER_PREMIUM_SURFACE,
  AMBER_PREMIUM_TEXT_PRIMARY,
} from "@/lib/amberPremium";
import {
  DANGER_PREMIUM_SHELL,
  DANGER_PREMIUM_TEXT_PRIMARY,
} from "@/lib/semanticPremium";
import { cn } from "@/lib/utils";

type SellerMe = {
  id: string;
  nome: string;
  documento: string | null;
  plano: string | null;
};

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

const FEATURES_START = [
  "Resumo financeiro e extrato de movimentações",
  "Gráfico de volume por dia",
  "Operação com armazém (fornecedor) vinculado",
  "Até 15 SKUs habilitados no catálogo para concretizar vendas",
  "Pedidos com SKU do catálogo obrigatório no plano Start",
] as const;

const FEATURES_PRO_EXTRA = [
  "Tudo do plano Start",
  "Bloco Desempenho: receita, custo e margem",
  "Analytics ampliados no painel quando houver dados de venda",
  "Limites ampliados no catálogo conforme regras da plataforma",
] as const;

function FeatureLine({ children }: { children: ReactNode }) {
  return (
    <li className="flex gap-3 text-sm leading-snug text-[var(--foreground)]">
      <span
        className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-emerald-100/90 text-emerald-700 dark:bg-emerald-950/55 dark:text-emerald-400"
        aria-hidden
      >
        <IconCheck className="h-3.5 w-3.5" />
      </span>
      <span>{children}</span>
    </li>
  );
}

export default function SellerPlanoPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [seller, setSeller] = useState<SellerMe | null>(null);
  /** Não usar `seller.documento` do GET /me — vem mascarado; o servidor calcula com o documento real. */
  const [cadastroDadosPendente, setCadastroDadosPendente] = useState(true);
  const [planoPrecos, setPlanoPrecos] = useState<{ starter: number; pro: number } | null>(null);

  const [modalUpgrade, setModalUpgrade] = useState(false);
  const [upgradeLoading, setUpgradeLoading] = useState(false);
  const [upgradeErro, setUpgradeErro] = useState<string | null>(null);
  const [upgradeQr, setUpgradeQr] = useState<string | null>(null);
  const [upgradeCopia, setUpgradeCopia] = useState<string | null>(null);
  const [upgradeExpiraEm, setUpgradeExpiraEm] = useState<string | null>(null);
  const [upgradeRestSec, setUpgradeRestSec] = useState<number | null>(null);
  const [upgradeCopiado, setUpgradeCopiado] = useState(false);

  const loadMe = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) {
        router.replace("/seller/login");
        return;
      }
      const res = await fetch("/api/seller/me", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) {
        if (res.status === 401 || res.status === 404) {
          await supabaseBrowser.auth.signOut();
          router.replace("/seller/login");
          return;
        }
        throw new Error(json?.error ?? "Erro ao carregar.");
      }
      setSeller(json.seller);
      setCadastroDadosPendente(!!json.cadastro_dados_pendente);
      setPlanoPrecos(json.plano_precos_mensalidade ?? null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro inesperado.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void loadMe();
  }, [loadMe]);

  useEffect(() => {
    if (!upgradeExpiraEm || !upgradeQr) return;
    const tick = () => {
      const rest = Math.max(0, Math.floor((new Date(upgradeExpiraEm).getTime() - Date.now()) / 1000));
      setUpgradeRestSec(rest);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [upgradeExpiraEm, upgradeQr]);

  useEffect(() => {
    if (!upgradeQr) return;
    const poll = async () => {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) return;
      const syncRes = await fetch("/api/seller/deposito-pix/sync", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const syncJson = await syncRes.json().catch(() => ({}));
      if (syncJson.ok && syncJson.aprovados > 0) {
        const meRes = await fetch("/api/seller/me", {
          headers: { Authorization: `Bearer ${session.access_token}` },
          cache: "no-store",
        });
        const meJson = await meRes.json();
        if (meRes.ok && String(meJson.seller?.plano ?? "").toLowerCase() === "pro") {
          setSeller(meJson.seller);
          setCadastroDadosPendente(!!meJson.cadastro_dados_pendente);
          setModalUpgrade(false);
          setUpgradeQr(null);
          setUpgradeCopia(null);
          setUpgradeExpiraEm(null);
          setUpgradeErro(null);
        }
      }
    };
    const id = setInterval(poll, 10000);
    void poll();
    return () => clearInterval(id);
  }, [upgradeQr]);

  function fecharModalUpgrade() {
    setModalUpgrade(false);
    setUpgradeErro(null);
    setUpgradeLoading(false);
    setUpgradeQr(null);
    setUpgradeCopia(null);
    setUpgradeExpiraEm(null);
    setUpgradeRestSec(null);
    setUpgradeCopiado(false);
  }

  async function gerarPixUpgrade() {
    setUpgradeErro(null);
    setUpgradeLoading(true);
    setUpgradeQr(null);
    setUpgradeCopia(null);
    setUpgradeExpiraEm(null);
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) {
        router.replace("/seller/login");
        return;
      }
      const res = await fetch("/api/seller/plano/upgrade-pro-pix", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Não foi possível gerar o PIX.");
      if (json.qr_code_base64) {
        setUpgradeQr(json.qr_code_base64);
        setUpgradeCopia(json.qr_code ?? null);
        setUpgradeExpiraEm(json.expira_em ?? null);
      }
    } catch (e: unknown) {
      setUpgradeErro(e instanceof Error ? e.message : "Erro inesperado.");
    } finally {
      setUpgradeLoading(false);
    }
  }

  function abrirModalUpgrade() {
    setModalUpgrade(true);
    setUpgradeErro(null);
    setUpgradeQr(null);
    setUpgradeCopia(null);
    setUpgradeExpiraEm(null);
  }

  const precoStart = planoPrecos?.starter ?? VALOR_DEFAULT_MENSALIDADE_SELLER;
  const precoPro = planoPrecos?.pro ?? VALOR_DEFAULT_MENSALIDADE_SELLER_PRO;
  const diffUpgrade = Math.round((precoPro - precoStart) * 100) / 100;

  const planoNc = String(seller?.plano ?? "").trim().toLowerCase();
  const isPro = planoNc === "pro";
  const isStarter = planoNc === "starter";
  const planoDefinido = planoSellerDefinido(seller?.plano);
  const docOk = !cadastroDadosPendente;
  const podeUpgradePix = planoDefinido && isStarter && docOk;

  const pillRef =
    "rounded-xl border border-[var(--card-border)] bg-[var(--surface-subtle)] px-3 py-2.5 text-center text-sm font-medium text-[var(--foreground)]";

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--background)] app-bg flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-xl border-2 border-[var(--card-border)] border-t-neutral-500 dark:border-t-neutral-400" />
          <p className="text-sm font-medium text-[var(--muted)]">Carregando…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[var(--background)] app-bg flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-8 text-center shadow-lg">
          <p className={cn("mb-2 font-semibold", DANGER_PREMIUM_TEXT_PRIMARY)}>Erro</p>
          <p className="mb-6 text-sm text-[var(--muted)]">{error}</p>
          <button
            type="button"
            onClick={() => void loadMe()}
            className="rounded-xl bg-[var(--foreground)] px-6 py-2.5 text-sm font-medium text-[var(--background)] hover:opacity-90"
          >
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] app-bg pt-[calc(3.5rem+env(safe-area-inset-top,0px))] md:pt-14 pb-[calc(6.25rem+env(safe-area-inset-bottom,0px))] md:pb-8">
      <div className="dropcore-shell-4xl space-y-5 py-5 md:space-y-6 md:py-7">
        <SellerPageHeader
          surface="hero"
          showBack
          backHref="/seller/dashboard"
          title="Plano e upgrade"
          subtitle={
            <>
              Compare <span translate="no" lang="en">Start</span> e <span translate="no" lang="en">Pro</span>. O upgrade para{" "}
              <span translate="no" lang="en">Pro</span> é feito com um PIX pela diferença mensal entre os planos (referência da tabela financeira). Não
              credita saldo, só libera recursos do plano após confirmação no Mercado Pago. A cobrança na sua org pode seguir contrato próprio.
              {planoDefinido && (
                <span className="mt-2 block text-sm text-[var(--foreground)]">
                  Seu plano hoje:{" "}
                  <span
                    translate="no"
                    lang="en"
                    className="inline-flex items-center rounded-full bg-emerald-600 px-3 py-1 text-xs font-bold tracking-wide text-white shadow-sm shadow-emerald-600/25 ring-1 ring-emerald-700/15 dark:bg-emerald-500 dark:shadow-emerald-500/20 dark:ring-emerald-300/25"
                  >
                    {nomeExibicaoPlanoSeller(seller?.plano)}
                  </span>
                </span>
              )}
            </>
          }
        />

        {!planoDefinido && (
          <div className={cn("rounded-2xl border px-4 py-3 text-sm", AMBER_PREMIUM_SURFACE, AMBER_PREMIUM_TEXT_PRIMARY)}>
            Escolha <span translate="no" lang="en">Start</span> ou <span translate="no" lang="en">Pro</span> no primeiro acesso ao painel.{" "}
            <Link href="/seller/dashboard" className="font-semibold underline underline-offset-2">
              Ir ao painel
            </Link>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:items-stretch md:gap-6">
          {/* Start — mesmo bloco de secção do cadastro */}
          <section className="flex flex-col overflow-visible rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4 shadow-sm sm:p-5">
            <h2 className="border-b border-[var(--card-border)] pb-2 text-sm font-semibold text-[var(--foreground)]">
              <span translate="no" lang="en">
                {SELLER_PLANO_NOME_START}
              </span>
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">Resumo, volume por dia e armazém no dia a dia.</p>
            <div className="mt-5">
              <p className="text-3xl font-bold tabular-nums tracking-tight text-[var(--foreground)]">
                {BRL.format(precoStart)}
                <span className="text-base font-semibold text-[var(--muted)]">/mês</span>
              </p>
            </div>
            <div className="mt-4">
              <p className={pillRef}>Referência mensalidade Start</p>
            </div>
            <div className="mt-5 flex-1 border-t border-[var(--card-border)] pt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Inclui</p>
              <ul className="mt-3 space-y-2.5">
                {FEATURES_START.map((t) => (
                  <FeatureLine key={t}>{t}</FeatureLine>
                ))}
              </ul>
            </div>
            {isStarter && <p className="mt-5 text-center text-xs text-[var(--muted)]">Plano atual — upgrade no cartão ao lado.</p>}
          </section>

          {/* Pro — mesmo cartão + faixa e selo discretos (sem gradiente pesado) */}
          <section className="relative flex flex-col overflow-visible rounded-2xl border border-[var(--card-border)] border-t-4 border-t-emerald-500 bg-[var(--card)] p-4 shadow-sm sm:p-5 dark:border-t-emerald-500/90">
            <div className="flex flex-wrap items-start justify-between gap-2 border-b border-[var(--card-border)] pb-2">
              <h2 className="text-sm font-semibold text-[var(--foreground)]">
                <span translate="no" lang="en">
                  {SELLER_PLANO_NOME_PRO}
                </span>
              </h2>
              <span className="shrink-0 rounded-md border border-emerald-200/90 bg-emerald-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-800 dark:border-emerald-800/50 dark:bg-emerald-950/50 dark:text-emerald-300">
                Recomendado
              </span>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">Desempenho (receita, custo, margem) e analytics ampliados.</p>
            <div className="mt-5">
              <p className="text-3xl font-bold tabular-nums tracking-tight text-[var(--foreground)]">
                {BRL.format(precoPro)}
                <span className="text-base font-semibold text-[var(--muted)]">/mês</span>
              </p>
              <p className="mt-1 text-xs text-[var(--muted)]">Referência após upgrade</p>
            </div>
            <div className="mt-4 space-y-1.5">
              <p className={pillRef}>
                Upgrade único via PIX: <strong className="tabular-nums text-[var(--foreground)]">{BRL.format(diffUpgrade)}</strong>
              </p>
              <p className="text-center text-[11px] leading-snug text-[var(--muted)]">Confirmação automática (webhook ou sincronização do PIX).</p>
            </div>
            <div className="mt-5 flex-1 border-t border-[var(--card-border)] pt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Inclui</p>
              <ul className="mt-3 space-y-2.5">
                {FEATURES_PRO_EXTRA.map((t) => (
                  <FeatureLine key={t}>{t}</FeatureLine>
                ))}
              </ul>
            </div>

            <div className="mt-6 space-y-3">
              {isPro && (
                <div className="rounded-xl border border-emerald-500/35 bg-emerald-50 px-4 py-3 text-center text-sm font-semibold text-emerald-800 dark:border-emerald-700/50 dark:bg-emerald-950/25 dark:text-emerald-300">
                  Você já está no plano <span translate="no" lang="en">Pro</span>.
                </div>
              )}

              {planoDefinido && isStarter && !docOk && (
                <div className={cn("rounded-xl px-3 py-3 text-center text-xs leading-relaxed", DANGER_PREMIUM_SHELL, DANGER_PREMIUM_TEXT_PRIMARY)}>
                  Complete CNPJ/CPF e dados comerciais válidos no cadastro antes do PIX de upgrade.{" "}
                  <Link href="/seller/cadastro" className="font-semibold underline">
                    Abrir cadastro
                  </Link>
                </div>
              )}

              {planoDefinido && isStarter && docOk && (
                <>
                  <button
                    type="button"
                    onClick={abrirModalUpgrade}
                    className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-emerald-600/20 transition hover:bg-emerald-700 active:brightness-[0.92] dark:bg-emerald-600 dark:hover:bg-emerald-700"
                  >
                    Fazer upgrade para <span translate="no" lang="en" className="mx-1">Pro</span> — PIX {BRL.format(diffUpgrade)}
                  </button>
                  <p className="text-center text-[11px] text-[var(--muted)]">Abre o passo a passo para gerar o QR Code e copia e cola.</p>
                </>
              )}

              {planoDefinido && !isStarter && !isPro && (
                <p className="rounded-xl bg-[var(--surface-subtle)] px-3 py-2 text-center text-xs text-[var(--muted)]">
                  Plano não reconhecido para upgrade automático. Fale com o suporte.
                </p>
              )}
            </div>
          </section>
        </div>
      </div>

      {modalUpgrade && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 backdrop-blur-md sm:items-center">
          <div className="max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-2xl border border-[var(--card-border)] bg-[var(--card)] shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--card-border)] px-5 pb-4 pt-5">
              <h2 className="text-sm font-semibold text-[var(--foreground)]">Upgrade para Pro — PIX</h2>
              <button
                type="button"
                onClick={fecharModalUpgrade}
                className="-m-1 rounded p-1 text-[var(--muted)] transition-colors hover:text-[var(--foreground)]"
                aria-label="Fechar"
              >
                <IconX className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 p-5">
              {!upgradeQr ? (
                <>
                  <p className="text-sm text-[var(--muted)]">
                    Valor único: <strong className="text-[var(--foreground)]">{BRL.format(diffUpgrade)}</strong> (diferença Pro − Start na referência atual).
                  </p>
                  {upgradeErro && (
                    <p className={cn("rounded-xl px-3 py-2 text-xs", DANGER_PREMIUM_SHELL, DANGER_PREMIUM_TEXT_PRIMARY)}>{upgradeErro}</p>
                  )}
                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={fecharModalUpgrade}
                      className="flex-1 rounded-xl border border-[var(--card-border)] py-2.5 text-sm text-[var(--muted)] hover:bg-[var(--surface-hover)]"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={() => void gerarPixUpgrade()}
                      disabled={upgradeLoading || !podeUpgradePix}
                      className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white shadow-sm shadow-emerald-600/20 hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {upgradeLoading ? "Gerando…" : "Gerar PIX"}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                    <IconCheck className="h-5 w-5" />
                    <p className="text-sm font-semibold text-[var(--foreground)]">PIX gerado — pague no app do banco</p>
                  </div>
                  <p className="text-xs text-[var(--muted)]">O saldo da conta não muda; liberamos o Pro após confirmação do pagamento.</p>
                  {upgradeRestSec !== null && (
                    <div
                      className={cn(
                        "flex items-center justify-center gap-2 rounded-xl py-2 text-sm font-medium",
                        upgradeRestSec <= 60 ? cn(AMBER_PREMIUM_SURFACE, AMBER_PREMIUM_TEXT_PRIMARY) : "bg-[var(--surface-subtle)] text-[var(--muted)]"
                      )}
                    >
                      <IconClock className={`h-4 w-4 shrink-0 ${upgradeRestSec <= 60 ? "animate-pulse" : ""}`} />
                      Válido por {Math.floor(upgradeRestSec / 60)}:{(upgradeRestSec % 60).toString().padStart(2, "0")}
                    </div>
                  )}
                  <div className="flex justify-center rounded-xl bg-[var(--card)] p-4">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`data:image/png;base64,${upgradeQr}`} alt="QR Code PIX" className="h-40 w-40" />
                  </div>
                  {upgradeCopia && (
                    <div className="space-y-2">
                      <p className="text-xs text-[var(--muted)]">Copia e cola</p>
                      <div className="max-h-20 overflow-y-auto break-all rounded-xl border border-[var(--card-border)] bg-[var(--surface-subtle)] px-3 py-2 font-mono text-xs text-[var(--muted)]">
                        {upgradeCopia}
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          await navigator.clipboard.writeText(upgradeCopia);
                          setUpgradeCopiado(true);
                          setTimeout(() => setUpgradeCopiado(false), 2000);
                        }}
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white shadow-sm shadow-emerald-600/20 hover:bg-emerald-700"
                      >
                        {upgradeCopiado ? "Copiado!" : "Copiar código PIX"}
                      </button>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={fecharModalUpgrade}
                    className="w-full rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white shadow-sm shadow-emerald-600/20 hover:bg-emerald-700"
                  >
                    Fechar
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <SellerNav active="plano" />
    </div>
  );
}
