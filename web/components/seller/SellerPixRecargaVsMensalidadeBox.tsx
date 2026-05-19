import {
  SELLER_CREDITO_NAO_PAGA_MENSALIDADE,
  SELLER_MENSALIDADE_NAO_E_RECARGA,
} from "@/lib/sellerCreditoTermos";
import { cn } from "@/lib/utils";

type Variant = "recarga" | "mensalidade" | "both";

type Props = {
  /** Destaque do fluxo atual (recarga ou mensalidade). */
  variant?: Variant;
  className?: string;
};

/**
 * Caixa comparativa: recarga (pedidos) x mensalidade (plano). Evita confusão entre os dois PIX.
 */
export function SellerPixRecargaVsMensalidadeBox({ variant = "both", className }: Props) {
  const showRecarga = variant === "both" || variant === "recarga";
  const showMensalidade = variant === "both" || variant === "mensalidade";

  return (
    <div
      className={cn(
        "rounded-xl border border-[var(--card-border)] bg-[var(--surface-subtle)] p-3 text-xs space-y-2.5",
        className
      )}
    >
      {showRecarga && (
        <div className={variant === "recarga" ? "rounded-lg ring-1 ring-emerald-500/40 px-2 py-1.5 -mx-0.5" : undefined}>
          <p className="font-semibold text-[var(--foreground)]">Recarga de créditos</p>
          <p className="mt-0.5 text-[var(--muted)] leading-relaxed">{SELLER_CREDITO_NAO_PAGA_MENSALIDADE}</p>
        </div>
      )}
      {showRecarga && showMensalidade && <div className="border-t border-[var(--card-border)]" aria-hidden />}
      {showMensalidade && (
        <div
          className={variant === "mensalidade" ? "rounded-lg ring-1 ring-[var(--foreground)]/15 px-2 py-1.5 -mx-0.5" : undefined}
        >
          <p className="font-semibold text-[var(--foreground)]">Mensalidade do plano</p>
          <p className="mt-0.5 text-[var(--muted)] leading-relaxed">{SELLER_MENSALIDADE_NAO_E_RECARGA}</p>
        </div>
      )}
    </div>
  );
}
