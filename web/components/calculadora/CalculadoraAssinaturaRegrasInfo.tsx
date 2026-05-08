import { cn } from "@/lib/utils";

/** Texto institucional: assinatura com dia fixo, bloqueio se inadimplente, sem juros. */

const boxBase = cn(
  "rounded-xl border border-neutral-200 dark:border-neutral-700",
  "bg-neutral-50/90 dark:bg-neutral-900/50",
  "text-[13px] leading-snug text-neutral-700 dark:text-neutral-300",
);

function RegrasLista({ className }: { className?: string }) {
  return (
    <ul className={cn("list-disc space-y-1 pl-5 text-[13px] sm:text-sm", className)}>
      <li>O dia da renovação fica fixo todo mês (sempre a mesma data no calendário).</li>
      <li>Não há juros nem multa por atraso: se ficar sem pagar, você pode ficar sem acesso à calculadora até regularizar.</li>
      <li>
        Pagamento atrasado não muda essa data: na próxima renovação já programada você paga outra vez,
        igual quem está em dia, porque o dia do ciclo mensal não acompanha a data em que você pagou.
      </li>
    </ul>
  );
}

export function CalculadoraAssinaturaRegrasInfo({
  heading = "Assinatura paga da calculadora — como funciona",
  className,
  variant = "standalone",
}: {
  heading?: string;
  className?: string;
  variant?: "standalone" | "embedded";
}) {
  if (variant === "embedded") {
    return (
      <details className={cn("group mt-2", className)}>
        <summary
          className={cn(
            "cursor-pointer select-none list-none text-[13px] font-semibold text-neutral-700 dark:text-neutral-300 sm:text-sm",
            "underline decoration-neutral-500/80 decoration-[1.5px] underline-offset-2 transition hover:text-neutral-900 dark:decoration-neutral-400/80 dark:hover:text-neutral-100 [&::-webkit-details-marker]:hidden",
          )}
        >
          Como funciona a renovação?
        </summary>
        <RegrasLista className="mt-2 pl-4 text-[11px] leading-snug text-neutral-700 dark:text-neutral-300" />
      </details>
    );
  }

  return (
    <div className={cn(boxBase, "px-3.5 py-3 sm:px-4 sm:py-3.5", className)} role="note">
      <p className="font-semibold text-neutral-900 dark:text-neutral-100">{heading}</p>
      <RegrasLista className="mt-2" />
    </div>
  );
}
