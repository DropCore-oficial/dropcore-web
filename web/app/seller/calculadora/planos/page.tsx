"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { SellerNav } from "../../SellerNav";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";
import { AMBER_PREMIUM_SHELL, AMBER_PREMIUM_TEXT_SOFT } from "@/lib/amberPremium";
import { DANGER_PREMIUM_SURFACE_TRANSPARENT, DANGER_PREMIUM_TEXT_SOFT } from "@/lib/semanticPremium";

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

type Estado = "loading" | "denied" | "pronto";

type Dados = {
  ativo: boolean;
  validoAte: string | null;
  vencido: boolean;
};

type PixData = { qr_code_base64: string; qr_code: string; expira_em: string; valor: number };

/**
 * Planos da Calculadora avulsa (R$14,99/mês) — tela própria, separada do pacote Gestores de
 * IA avulso (desmembramento 2026-10-26). Reaproveita as rotas de PIX que já existiam dentro
 * do estado bloqueado de /seller/calculadora, só que numa página persistente (dá pra ver o
 * status mesmo sem estar vencido, não só quando bloqueado).
 */
export default function CalculadoraPlanosPage() {
  const router = useRouter();
  const [estado, setEstado] = useState<Estado>("loading");
  const [dados, setDados] = useState<Dados | null>(null);
  const [valorMensal, setValorMensal] = useState<number | null>(null);
  const [valorConfigurado, setValorConfigurado] = useState(true);

  const [pixLoading, setPixLoading] = useState(false);
  const [pixErr, setPixErr] = useState<string | null>(null);
  const [pixData, setPixData] = useState<PixData | null>(null);
  const [pixCopiado, setPixCopiado] = useState(false);
  const [countdownSec, setCountdownSec] = useState<number | null>(null);

  const carregar = useCallback(async () => {
    const { data } = await supabaseBrowser.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      router.replace("/calculadora/login");
      return;
    }
    const res = await fetch(`/api/calculadora/me?t=${Date.now()}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const j = await res.json().catch(() => ({}));
    if (j.access === "seller") {
      router.replace("/seller/cadastro");
      return;
    }
    if (j.access === "calc_only" && j.inclui_gestores_ia === true) {
      router.replace("/seller/gestores-ia-avulso/planos");
      return;
    }
    if (j.access === "calc_only") {
      setDados({ ativo: true, validoAte: j.valido_ate ?? null, vencido: false });
      setEstado("pronto");
      return;
    }
    if (j.access === "calc_only_locked") {
      setDados({ ativo: false, validoAte: j.valido_ate ?? null, vencido: true });
      setEstado("pronto");
      return;
    }
    setEstado("denied");
  }, [router]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  useEffect(() => {
    fetch("/api/calculadora/renovacao-pix")
      .then((r) => r.json())
      .then((j: { valor?: number | null; configurado?: boolean }) => {
        setValorMensal(typeof j.valor === "number" ? j.valor : null);
        setValorConfigurado(Boolean(j.configurado));
      })
      .catch(() => setValorConfigurado(false));
  }, []);

  useEffect(() => {
    const exp = pixData?.expira_em;
    if (!exp) {
      setCountdownSec(null);
      return;
    }
    const end = new Date(exp).getTime();
    if (Number.isNaN(end)) {
      setCountdownSec(null);
      return;
    }
    const tick = () => setCountdownSec(Math.max(0, Math.floor((end - Date.now()) / 1000)));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [pixData?.expira_em]);

  useEffect(() => {
    if (!pixData) return;
    const id = setInterval(async () => {
      const { data } = await supabaseBrowser.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return;
      try {
        await fetch("/api/calculadora/renovacao-pix/sync", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
        await carregar();
      } catch {
        /* ignore */
      }
    }, 5000);
    return () => clearInterval(id);
  }, [pixData, carregar]);

  const gerarPix = useCallback(async () => {
    setPixLoading(true);
    setPixErr(null);
    try {
      const { data } = await supabaseBrowser.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return;
      const res = await fetch("/api/calculadora/renovacao-pix", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof j?.error === "string" ? j.error : "Erro ao gerar PIX.");
      setPixData({
        qr_code_base64: String(j.qr_code_base64 ?? ""),
        qr_code: String(j.qr_code ?? ""),
        expira_em: String(j.expira_em ?? ""),
        valor: Number(j.valor ?? 0),
      });
    } catch (e: unknown) {
      setPixErr(e instanceof Error ? e.message : "Erro ao gerar PIX.");
    } finally {
      setPixLoading(false);
    }
  }, []);

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
                Planos
              </h1>
              <span
                className="h-1 w-14 shrink-0 self-center rounded-full bg-gradient-to-r from-emerald-500 via-emerald-400 to-emerald-300/70 sm:w-20"
                aria-hidden
              />
            </div>
            <p className="text-sm leading-snug text-[var(--muted)]">
              Calculadora de preço e margem. Cobrança mensal por PIX.
            </p>
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
              <p className="text-xs font-medium text-[var(--muted)]">Seu plano atual</p>
              <p className="mt-1 text-sm font-semibold text-[var(--foreground)]">
                Calculadora
                {dados?.validoAte ? (
                  <span className="ml-1 font-normal text-[var(--muted)]">
                    · {dados.vencido ? "vencido em" : "válido até"} {new Date(dados.validoAte).toLocaleDateString("pt-BR")}
                  </span>
                ) : null}
              </p>
            </section>

            {!pixData ? (
              <section className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-5 shadow-sm sm:p-6">
                <p className="text-sm font-semibold text-[var(--foreground)]">Mensal</p>
                <p className="mt-1 text-2xl font-bold tracking-tight text-[var(--foreground)]">
                  {valorMensal != null ? BRL.format(valorMensal) : "—"}
                </p>
                <p className="text-xs text-[var(--muted)]">por mês, sem compromisso</p>

                {!valorConfigurado ? (
                  <p
                    className={cn(
                      "mt-3 rounded-xl px-3 py-2.5 text-xs leading-relaxed",
                      DANGER_PREMIUM_SURFACE_TRANSPARENT,
                      DANGER_PREMIUM_TEXT_SOFT,
                    )}
                  >
                    O valor da renovação ainda não está configurado no servidor. Fale com o suporte.
                  </p>
                ) : null}
                {pixErr ? (
                  <p
                    className={cn(
                      "mt-3 rounded-xl px-3 py-2.5 text-xs leading-relaxed",
                      DANGER_PREMIUM_SURFACE_TRANSPARENT,
                      DANGER_PREMIUM_TEXT_SOFT,
                    )}
                  >
                    {pixErr}
                  </p>
                ) : null}

                <button
                  type="button"
                  onClick={() => void gerarPix()}
                  disabled={pixLoading || !valorConfigurado}
                  className="mt-4 w-full rounded-md bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                >
                  {pixLoading ? "Gerando PIX…" : dados?.vencido ? "Gerar PIX da renovação" : "Pagar com antecedência"}
                </button>
              </section>
            ) : (
              <section className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-5 shadow-sm sm:p-6">
                <div className="mx-auto max-w-xs space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-1">
                    <span className="text-xs font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
                      {BRL.format(pixData.valor)}
                    </span>
                    <span className="text-[11px] text-neutral-500 dark:text-neutral-400">App do banco</span>
                  </div>
                  {countdownSec !== null ? (
                    <div
                      className={cn(
                        "rounded-lg px-2.5 py-1.5 text-center text-[11px] font-medium tabular-nums border",
                        countdownSec <= 60
                          ? cn(AMBER_PREMIUM_SHELL, AMBER_PREMIUM_TEXT_SOFT)
                          : "border-neutral-200 bg-neutral-50 text-neutral-600 dark:border-neutral-700 dark:bg-neutral-800/50 dark:text-neutral-400",
                      )}
                    >
                      {countdownSec <= 0 ? (
                        <>QR expirado — gere um novo PIX</>
                      ) : (
                        <>
                          QR válido por{" "}
                          <span className={countdownSec <= 60 ? "tabular-nums" : ""}>
                            {Math.floor(countdownSec / 60)}:{(countdownSec % 60).toString().padStart(2, "0")}
                          </span>
                        </>
                      )}
                    </div>
                  ) : null}
                  <div className="flex justify-center rounded-lg border border-neutral-200 bg-white p-2 dark:border-neutral-700 dark:bg-neutral-950">
                    {pixData.qr_code_base64 ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={`data:image/png;base64,${pixData.qr_code_base64}`}
                        alt="QR Code PIX"
                        className="h-[7.75rem] w-[7.75rem] sm:h-32 sm:w-32 object-contain"
                      />
                    ) : (
                      <p className="text-xs text-neutral-500 px-2">QR indisponível — copie e cole.</p>
                    )}
                  </div>
                  {pixData.qr_code ? (
                    <button
                      type="button"
                      onClick={async () => {
                        await navigator.clipboard.writeText(pixData.qr_code);
                        setPixCopiado(true);
                        window.setTimeout(() => setPixCopiado(false), 2500);
                      }}
                      className="w-full rounded-md border border-emerald-600 bg-emerald-600 py-1.5 text-[11px] font-semibold text-white hover:bg-emerald-700 touch-manipulation"
                    >
                      {pixCopiado ? "Copiado!" : "Copiar código PIX"}
                    </button>
                  ) : null}
                  <p className="text-center text-xs leading-snug text-neutral-500 dark:text-neutral-400">
                    Após o pagamento, esta página atualiza sozinha.
                  </p>
                  <div className="flex justify-end pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setPixData(null);
                        setPixErr(null);
                      }}
                      className="rounded-md border border-[var(--card-border)] bg-[var(--card)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--foreground)] hover:bg-[var(--muted)]/10"
                    >
                      Voltar
                    </button>
                  </div>
                </div>
              </section>
            )}

            <section className="rounded-2xl border border-emerald-500/60 bg-[var(--card)] p-5 shadow-sm sm:p-6">
              <p className="text-sm font-semibold text-[var(--foreground)]">Quer mais que a calculadora?</p>
              <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
                O pacote completo Gestores de IA já inclui a Calculadora, sem pagar separado — mais Anúncio, SAC, ADS e
                Gestor cuidando do seu anúncio no Mercado Livre.
              </p>
              <Link
                href="/seller/gestores-ia-avulso/planos"
                className="mt-4 inline-flex rounded-md border border-[var(--card-border)] bg-[var(--card)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--foreground)] hover:bg-[var(--muted)]/10"
              >
                Ver planos de Gestores de IA
              </Link>
            </section>
          </>
        )}
      </div>
      <SellerNav active="plano" calcOnly produto="calculadora" />
    </div>
  );
}
