"use client";

import { DropCoreLogo } from "@/components/DropCoreLogo";
import { NotificationBell } from "@/components/NotificationBell";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  AMBER_PREMIUM_SHELL,
  AMBER_PREMIUM_TEXT_SOFT,
} from "@/lib/amberPremium";
import {
  DANGER_PREMIUM_SURFACE_TRANSPARENT,
  DANGER_PREMIUM_TEXT_SOFT,
} from "@/lib/semanticPremium";
import { MensalidadeCardPaymentBrick } from "@/components/portal/MensalidadeCardPaymentBrick";
import { cn } from "@/lib/utils";

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export type PortalMensalidadeBloqueioOverlayProps = {
  context: "seller" | "fornecedor";
  logoHref: string | null;
  onSair: () => void | Promise<void>;
  vencimentoEm: string | null;
  valor: number;
  mensalidadeId: string;
  payerEmail: string;
  mercadoPagoPublicKey: string | null;
  metodo: "pix" | "cartao";
  onMetodoChange: (m: "pix" | "cartao") => void;
  onCartaoAprovado: () => void;
  onPagamentoErro: (msg: string) => void;
  pixLoading: boolean;
  pagamentoErro: string | null;
  pixQrCode: string | null;
  pixCopiaCola: string | null;
  pixRestanteSec: number | null;
  pixCopiado: boolean;
  onGerarPix: () => void;
  onCopiarPix: () => void;
  onGerarNovoPix: () => void;
  /** Sobrepõe o painel (fundo visível com blur), igual à calculadora. */
  embedded?: boolean;
};

export function PortalMensalidadeBloqueioOverlay(props: PortalMensalidadeBloqueioOverlayProps) {
  const {
    context,
    logoHref,
    onSair,
    vencimentoEm,
    valor,
    mensalidadeId,
    payerEmail,
    mercadoPagoPublicKey,
    metodo,
    onMetodoChange,
    onCartaoAprovado,
    onPagamentoErro,
    pixLoading,
    pagamentoErro,
    pixQrCode,
    pixCopiaCola,
    pixRestanteSec,
    pixCopiado,
    onGerarPix,
    onCopiarPix,
    onGerarNovoPix,
    embedded = true,
  } = props;

  const titulo =
    context === "seller" ? "Renovar acesso ao painel seller" : "Renovar acesso ao painel do fornecedor";
  const subtitulo =
    "Regularize a mensalidade DropCore para liberar o painel. Escolha PIX ou cartão; a confirmação é automática após o pagamento aprovado.";

  const card = (
    <div className="relative w-full max-w-[min(26rem,calc(100vw-2rem))] overflow-x-hidden overflow-y-auto rounded-xl border border-emerald-300/60 dark:border-emerald-500/40 bg-white dark:bg-neutral-900 px-4 py-4 shadow-xl ring-1 ring-emerald-500/10 dark:ring-emerald-400/20">
      <div
        className="absolute inset-x-0 top-0 h-0.5 sm:h-1 bg-gradient-to-r from-emerald-500 via-emerald-400 to-emerald-600"
        aria-hidden
      />
      <div className="flex items-start gap-2.5">
        <span
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 dark:border-emerald-500/40 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300",
          )}
          aria-hidden
        >
          <svg
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect width="18" height="14" x="3" y="7" rx="2" ry="2" />
            <path d="M8 7V5a4 4 0 0 1 8 0v2" />
            <circle cx="12" cy="14" r="1" fill="currentColor" stroke="none" />
          </svg>
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <h2
            id="bloqueio-mensalidade-titulo"
            className="text-base font-semibold leading-snug text-neutral-900 dark:text-neutral-100"
          >
            {titulo}
          </h2>
          {vencimentoEm ? (
            <p className="text-xs sm:text-[13px] leading-relaxed text-neutral-500 dark:text-neutral-400">
              Vencimento:{" "}
              <span className="tabular-nums font-medium text-neutral-700 dark:text-neutral-300">
                {new Date(vencimentoEm + "T12:00:00").toLocaleDateString("pt-BR", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </span>
            </p>
          ) : null}
        </div>
      </div>

      <p className="mt-2 text-xs leading-relaxed text-neutral-600 dark:text-neutral-400">{subtitulo}</p>

      <p className="mt-2 text-xs font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
        {BRL.format(valor)} · mensalidade
      </p>

      <div className="mt-4 flex rounded-xl border border-[var(--card-border)] bg-[var(--background)] p-1">
        <button
          type="button"
          onClick={() => onMetodoChange("pix")}
          className={cn(
            "flex-1 rounded-lg py-2 text-xs font-semibold transition-colors",
            metodo === "pix"
              ? "bg-emerald-600 text-white shadow-sm"
              : "text-[var(--muted)] hover:text-[var(--foreground)]",
          )}
        >
          PIX
        </button>
        <button
          type="button"
          onClick={() => onMetodoChange("cartao")}
          className={cn(
            "flex-1 rounded-lg py-2 text-xs font-semibold transition-colors",
            metodo === "cartao"
              ? "bg-emerald-600 text-white shadow-sm"
              : "text-[var(--muted)] hover:text-[var(--foreground)]",
          )}
        >
          Cartão
        </button>
      </div>

      {pagamentoErro ? (
        <p
          className={cn(
            "mt-3 rounded-xl px-3 py-2.5 text-xs leading-relaxed",
            DANGER_PREMIUM_SURFACE_TRANSPARENT,
            DANGER_PREMIUM_TEXT_SOFT,
          )}
        >
          {pagamentoErro}
        </p>
      ) : null}

      {metodo === "pix" ? (
        <PixSection
          valor={valor}
          pixLoading={pixLoading}
          pixQrCode={pixQrCode}
          pixCopiaCola={pixCopiaCola}
          pixRestanteSec={pixRestanteSec}
          pixCopiado={pixCopiado}
          onGerarPix={onGerarPix}
          onCopiarPix={onCopiarPix}
          onGerarNovoPix={onGerarNovoPix}
        />
      ) : (
        <MensalidadeCardPaymentBrick
          context={context}
          mensalidadeId={mensalidadeId}
          amount={valor}
          payerEmail={payerEmail}
          publicKey={mercadoPagoPublicKey}
          onAprovado={onCartaoAprovado}
          onErro={onPagamentoErro}
        />
      )}

      {embedded ? (
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={() => void onSair()}
            className="w-full sm:w-auto rounded-md border border-[var(--card-border)] bg-[var(--card)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--foreground)] hover:bg-[var(--muted)]/10"
          >
            Sair da conta
          </button>
        </div>
      ) : null}
    </div>
  );

  if (embedded) {
    return (
      <div
        className="fixed inset-0 z-[120] flex items-center justify-center overflow-y-auto p-4 sm:p-6 bg-black/40 dark:bg-black/50"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bloqueio-mensalidade-titulo"
      >
        {card}
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col overflow-y-auto bg-black/50 dark:bg-black/65 p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bloqueio-mensalidade-titulo"
    >
      <div className="mx-auto flex w-full max-w-lg flex-shrink-0 items-center justify-between gap-3 pb-4">
        {logoHref ? (
          <DropCoreLogo variant="horizontal" href={logoHref} className="min-w-[140px]" />
        ) : (
          <DropCoreLogo variant="horizontal" href={null} className="min-w-[140px]" />
        )}
        <div className="flex items-center gap-2">
          <NotificationBell context={context} />
          <ThemeToggle />
          <button
            type="button"
            onClick={() => void onSair()}
            className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] px-3 py-1.5 text-xs text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
          >
            Sair
          </button>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-[min(22rem,calc(100vw-2rem))] flex-1 flex-col justify-center py-2">
        {card}
      </div>
    </div>
  );
}

function PixSection({
  valor,
  pixLoading,
  pixQrCode,
  pixCopiaCola,
  pixRestanteSec,
  pixCopiado,
  onGerarPix,
  onCopiarPix,
  onGerarNovoPix,
}: {
  valor: number;
  pixLoading: boolean;
  pixQrCode: string | null;
  pixCopiaCola: string | null;
  pixRestanteSec: number | null;
  pixCopiado: boolean;
  onGerarPix: () => void;
  onCopiarPix: () => void;
  onGerarNovoPix: () => void;
}) {
  if (!pixQrCode) {
    return (
      <div className="mt-4">
        <button
          type="button"
          onClick={onGerarPix}
          disabled={pixLoading}
          className="w-full rounded-md bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pixLoading ? "Gerando PIX…" : "Gerar PIX da mensalidade"}
        </button>
        {pixLoading ? (
          <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">Gerando PIX...</p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-1">
        <span className="text-xs font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
          {BRL.format(valor)}
        </span>
        <span className="text-[11px] text-neutral-500 dark:text-neutral-400">App do banco</span>
      </div>
      {pixRestanteSec !== null ? <PixTimer pixRestanteSec={pixRestanteSec} /> : null}
      <div className="flex justify-center rounded-lg border border-neutral-200 bg-white p-2 dark:border-neutral-700 dark:bg-neutral-950">
        <img
          src={`data:image/png;base64,${pixQrCode}`}
          alt="QR Code PIX"
          className="h-[7.75rem] w-[7.75rem] sm:h-32 sm:w-32 object-contain"
        />
      </div>
      {pixCopiaCola ? (
        <button
          type="button"
          onClick={onCopiarPix}
          className="w-full rounded-md border border-emerald-600 bg-emerald-600 py-1.5 text-[11px] font-semibold text-white hover:bg-emerald-700 touch-manipulation"
        >
          {pixCopiado ? "Copiado!" : "Copiar código PIX"}
        </button>
      ) : null}
      <p className="text-center text-xs leading-snug text-neutral-500 dark:text-neutral-400">
        Após o pagamento, esta página atualiza sozinha.
      </p>
      <div className="flex flex-col-reverse gap-1.5 sm:flex-row sm:justify-end pt-1">
        <button
          type="button"
          onClick={onGerarNovoPix}
          disabled={pixLoading}
          className="rounded-md border border-[var(--card-border)] bg-[var(--card)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--foreground)] hover:bg-[var(--muted)]/10 disabled:opacity-50"
        >
          {pixLoading ? "Gerando…" : "Gerar novo PIX"}
        </button>
      </div>
    </div>
  );
}

function PixTimer({ pixRestanteSec }: { pixRestanteSec: number }) {
  return (
    <div
      className={cn(
        "rounded-lg px-2.5 py-1.5 text-center text-[11px] font-medium tabular-nums border",
        pixRestanteSec <= 60
          ? cn(AMBER_PREMIUM_SHELL, AMBER_PREMIUM_TEXT_SOFT)
          : "border-neutral-200 bg-neutral-50 text-neutral-600 dark:border-neutral-700 dark:bg-neutral-800/50 dark:text-neutral-400",
      )}
    >
      {pixRestanteSec <= 0 ? (
        <>QR expirado — toque em &quot;Gerar novo PIX&quot;</>
      ) : (
        <>
          QR válido por{" "}
          <span className={pixRestanteSec <= 60 ? "tabular-nums" : ""}>
            {Math.floor(pixRestanteSec / 60)}:{(pixRestanteSec % 60).toString().padStart(2, "0")}
          </span>
        </>
      )}
    </div>
  );
}
