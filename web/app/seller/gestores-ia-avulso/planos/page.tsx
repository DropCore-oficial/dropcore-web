"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { SellerNav } from "../../SellerNav";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";
import { AMBER_PREMIUM_SHELL, AMBER_PREMIUM_TEXT_SOFT } from "@/lib/amberPremium";
import { DANGER_PREMIUM_SURFACE_TRANSPARENT, DANGER_PREMIUM_TEXT_SOFT } from "@/lib/semanticPremium";
import {
  type GestoresIaAvulsoCiclo,
  VALOR_GESTORES_IA_AVULSO_MENSAL,
  GESTORES_IA_AVULSO_CONTRATO_ANUAL_PARCELAS,
  GESTORES_IA_AVULSO_CONTRATO_ANUAL_CARENCIA_DIAS,
} from "@/lib/gestoresIaAvulsoPlanos";

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

const FEATURES_PACOTE = [
  "Anúncio — SEO, título e ficha técnica otimizados automaticamente",
  "SAC — respostas sugeridas pra perguntas e reclamações",
  "ADS — confere margem e preço, aponta o que está fora do saudável",
  "Gestor — chat que orquestra os outros 3 e responde sobre o negócio",
  "Calculadora de margem incluída (não paga separado)",
  "Dashboard financeiro dedicado",
  "Orçamento de IA bancado pela DropCore todo dia",
];

type Estado = "loading" | "denied" | "pronto";

type Dados = {
  incluiGestoresIa: boolean;
  gestoresIaCiclo: GestoresIaAvulsoCiclo | null;
  contratoAceiteEm: string | null;
  validoAte: string | null;
  /** Preço real da parcela mensal desse assinante (já aplica desconto, se houver). */
  valorMensal: number;
};

type PixData = {
  qr_code_base64: string;
  qr_code: string;
  expira_em: string;
  valor: number;
};

/**
 * Planos do pacote avulso "Gestores de IA". Cobrança é sempre a parcela mensal (R$797,90)
 * via PIX — mesma rota/valor pra quem assina mês a mês e pra quem está pagando uma parcela
 * do contrato anual. O "Anual" não é uma cobrança à vista: é um COMPROMISSO de 12 parcelas
 * mensais com os primeiros `GESTORES_IA_AVULSO_CONTRATO_ANUAL_CARENCIA_DIAS` dias sem
 * cobrança — iniciado sem PIX (`/planos/contrato-anual`), só depois de aceite explícito do
 * compromisso. Fluxo de PIX (QR, contagem, polling) replica 1:1 a renovação da Calculadora
 * em `/seller/calculadora`.
 */
export default function GestoresIaAvulsoPlanosPage() {
  const router = useRouter();
  const [estado, setEstado] = useState<Estado>("loading");
  const [dados, setDados] = useState<Dados | null>(null);

  const [pixLoading, setPixLoading] = useState(false);
  const [pixErr, setPixErr] = useState<string | null>(null);
  const [pixData, setPixData] = useState<PixData | null>(null);
  const [pixCopiado, setPixCopiado] = useState(false);
  const [countdownSec, setCountdownSec] = useState<number | null>(null);

  const [anualConfirmando, setAnualConfirmando] = useState(false);
  const [anualAceite, setAnualAceite] = useState(false);
  const [anualLoading, setAnualLoading] = useState(false);
  const [anualErr, setAnualErr] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const { data } = await supabaseBrowser.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      router.replace("/gestores-ia/login");
      return;
    }
    const [res, resPlanos] = await Promise.all([
      fetch(`/api/calculadora/me?t=${Date.now()}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      }),
      fetch("/api/gestores-ia-avulso/planos", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      }),
    ]);
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setEstado("denied");
      return;
    }
    if (j.access === "seller") {
      router.replace("/seller/cadastro");
      return;
    }
    const jPlanos = await resPlanos.json().catch(() => ({}));
    const valorMensal =
      resPlanos.ok && typeof jPlanos.mensal === "number" ? jPlanos.mensal : VALOR_GESTORES_IA_AVULSO_MENSAL;
    setDados({
      incluiGestoresIa: j.inclui_gestores_ia === true,
      gestoresIaCiclo: j.gestores_ia_ciclo === "mensal" || j.gestores_ia_ciclo === "anual" ? j.gestores_ia_ciclo : null,
      contratoAceiteEm: j.gestores_ia_contrato_aceite_em ?? null,
      validoAte: j.valido_ate ?? null,
      valorMensal,
    });
    setEstado("pronto");
  }, [router]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

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
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) return;
      try {
        const res = await fetch("/api/gestores-ia-avulso/planos/sync", {
          method: "POST",
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const j = await res.json().catch(() => ({}));
        if (j?.atualizado === true) {
          setPixData(null);
          await carregar();
        }
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
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch("/api/gestores-ia-avulso/planos", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
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

  const confirmarContratoAnual = useCallback(async () => {
    setAnualLoading(true);
    setAnualErr(null);
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch("/api/gestores-ia-avulso/planos/contrato-anual", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof j?.error === "string" ? j.error : "Erro ao iniciar o contrato.");
      setAnualConfirmando(false);
      setAnualAceite(false);
      await carregar();
    } catch (e: unknown) {
      setAnualErr(e instanceof Error ? e.message : "Erro ao iniciar o contrato.");
    } finally {
      setAnualLoading(false);
    }
  }, [carregar]);

  const temGestoresIa = dados?.incluiGestoresIa ?? false;
  const valorMensal = dados?.valorMensal ?? VALOR_GESTORES_IA_AVULSO_MENSAL;
  const jaEstaNoContratoAnual = temGestoresIa && dados?.gestoresIaCiclo === "anual";

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
              Pacote completo: Anúncio, SAC, ADS e Gestor — inclui a Calculadora. Cobrança sempre por PIX.
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
            {temGestoresIa ? (
              <section className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-5 shadow-sm sm:p-6">
                <p className="text-xs font-medium text-[var(--muted)]">Seu plano atual</p>
                <p className="mt-1 text-sm font-semibold text-[var(--foreground)]">
                  {jaEstaNoContratoAnual ? "Contrato anual" : "Mensal"}
                  {dados?.validoAte ? (
                    <span className="ml-1 font-normal text-[var(--muted)]">
                      · {jaEstaNoContratoAnual ? "próxima parcela em" : "válido até"}{" "}
                      {new Date(dados.validoAte).toLocaleDateString("pt-BR")}
                    </span>
                  ) : null}
                </p>
                {jaEstaNoContratoAnual && dados?.contratoAceiteEm ? (
                  <p className="mt-0.5 text-xs text-[var(--muted)]">
                    Assinado em {new Date(dados.contratoAceiteEm).toLocaleDateString("pt-BR")} · 12 parcelas de{" "}
                    {BRL.format(valorMensal)}
                  </p>
                ) : null}
              </section>
            ) : null}

            {!pixData ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <PlanoCard
                  titulo="Mensal"
                  valorLabel={BRL.format(valorMensal)}
                  subLabel="por mês, sem compromisso"
                  destaque={false}
                  features={FEATURES_PACOTE}
                  botaoLabel={temGestoresIa ? "Pagar parcela" : "Assinar"}
                  loading={pixLoading}
                  disabled={pixLoading}
                  onEscolher={() => void gerarPix()}
                />

                {jaEstaNoContratoAnual ? (
                  <section className="rounded-2xl border border-emerald-500/60 bg-[var(--card)] p-5 shadow-sm sm:p-6">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-[var(--foreground)]">Anual</p>
                      <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-semibold text-white">
                        Contrato ativo
                      </span>
                    </div>
                    <p className="mt-2 text-2xl font-bold tracking-tight text-[var(--foreground)]">
                      {BRL.format(valorMensal)}
                    </p>
                    <p className="text-xs text-[var(--muted)]">por mês · 12 parcelas no total</p>
                    <p className="mt-4 text-xs leading-relaxed text-[var(--muted)]">
                      Pague as próximas parcelas pelo card &quot;Mensal&quot; ao lado — mesmo valor, mesmo PIX.
                    </p>
                  </section>
                ) : !anualConfirmando ? (
                  <PlanoCard
                    titulo="Anual"
                    valorLabel={BRL.format(valorMensal)}
                    subLabel={`por mês · ${GESTORES_IA_AVULSO_CONTRATO_ANUAL_PARCELAS} parcelas, mesmo valor do mensal`}
                    destaque
                    badgeLabel={`Ganhe ${GESTORES_IA_AVULSO_CONTRATO_ANUAL_CARENCIA_DIAS} dias grátis`}
                    features={FEATURES_PACOTE}
                    botaoLabel="Assinar"
                    loading={false}
                    disabled={false}
                    onEscolher={() => setAnualConfirmando(true)}
                  />
                ) : (
                  <section className="rounded-2xl border border-emerald-500/60 bg-[var(--card)] p-5 shadow-sm sm:p-6">
                    <p className="text-sm font-semibold text-[var(--foreground)]">Confirmar contrato anual</p>
                    <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">
                      Você está assumindo um compromisso de {GESTORES_IA_AVULSO_CONTRATO_ANUAL_PARCELAS} parcelas
                      mensais de {BRL.format(valorMensal)}, pagas via PIX, uma por vez. Os
                      primeiros {GESTORES_IA_AVULSO_CONTRATO_ANUAL_CARENCIA_DIAS} dias são de carência — sua 1ª
                      parcela só vence depois desse período.
                    </p>
                    <label className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-[var(--foreground)]">
                      <input
                        type="checkbox"
                        checked={anualAceite}
                        onChange={(e) => setAnualAceite(e.target.checked)}
                        className="mt-0.5 h-4 w-4 shrink-0 rounded border-[var(--card-border)]"
                      />
                      <span>
                        Li e concordo com o compromisso de {GESTORES_IA_AVULSO_CONTRATO_ANUAL_PARCELAS} parcelas
                        mensais acima.
                      </span>
                    </label>
                    {anualErr ? (
                      <p
                        className={cn(
                          "mt-2 rounded-xl px-3 py-2.5 text-xs leading-relaxed",
                          DANGER_PREMIUM_SURFACE_TRANSPARENT,
                          DANGER_PREMIUM_TEXT_SOFT,
                        )}
                      >
                        {anualErr}
                      </p>
                    ) : null}
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                      <button
                        type="button"
                        onClick={() => void confirmarContratoAnual()}
                        disabled={!anualAceite || anualLoading}
                        className="w-full rounded-md bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                      >
                        {anualLoading ? "Confirmando…" : "Confirmar assinatura anual"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAnualConfirmando(false);
                          setAnualAceite(false);
                          setAnualErr(null);
                        }}
                        className="w-full rounded-md border border-[var(--card-border)] bg-[var(--card)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--foreground)] hover:bg-[var(--muted)]/10 sm:w-auto"
                      >
                        Cancelar
                      </button>
                    </div>
                  </section>
                )}
              </div>
            ) : null}

            {pixErr ? (
              <p
                className={cn(
                  "rounded-xl px-3 py-2.5 text-xs leading-relaxed",
                  DANGER_PREMIUM_SURFACE_TRANSPARENT,
                  DANGER_PREMIUM_TEXT_SOFT,
                )}
              >
                {pixErr}
              </p>
            ) : null}

            {pixData ? (
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
            ) : null}
          </>
        )}
      </div>
      <SellerNav active="plano" calcOnly produto={temGestoresIa ? "gestores_ia_avulso" : "calculadora"} />
    </div>
  );
}

function PlanoCard(props: {
  titulo: string;
  valorLabel: string;
  subLabel: string;
  badgeLabel?: string;
  destaque: boolean;
  features: string[];
  botaoLabel: string;
  loading: boolean;
  disabled: boolean;
  onEscolher: () => void;
}) {
  return (
    <section
      className={cn(
        "rounded-2xl border p-5 shadow-sm sm:p-6",
        props.destaque ? "border-emerald-500/60 bg-[var(--card)]" : "border-[var(--card-border)] bg-[var(--card)]",
      )}
    >
      <div className="flex items-center gap-2">
        <p className="text-sm font-semibold text-[var(--foreground)]">{props.titulo}</p>
        {props.badgeLabel ? (
          <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-semibold text-white">
            {props.badgeLabel}
          </span>
        ) : null}
      </div>
      <p className="mt-2 text-2xl font-bold tracking-tight text-[var(--foreground)]">{props.valorLabel}</p>
      <p className="text-xs text-[var(--muted)]">{props.subLabel}</p>
      <ul className="mt-4 space-y-1.5 border-t border-[var(--card-border)] pt-4">
        {props.features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-xs leading-snug text-[var(--muted)]">
            <span className="mt-0.5 text-emerald-600 dark:text-emerald-400" aria-hidden>
              ✓
            </span>
            <span>{f}</span>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={props.onEscolher}
        disabled={props.disabled}
        className="mt-4 w-full rounded-md bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {props.loading ? "Gerando PIX…" : props.botaoLabel}
      </button>
    </section>
  );
}
