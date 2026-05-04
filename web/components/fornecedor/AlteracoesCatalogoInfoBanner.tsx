import { AMBER_PREMIUM_TEXT_PRIMARY } from "@/lib/amberPremium";
import { cn } from "@/lib/utils";

function IconInfoCirculo({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </svg>
  );
}

/**
 * Explica que alterações enviadas para análise não substituem o catálogo do seller até o admin aprovar.
 */
export function AlteracoesCatalogoInfoBanner() {
  return (
    <div
      role="region"
      aria-label="Como funcionam alterações e o catálogo do seller"
      className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4 text-sm text-[var(--foreground)] shadow-sm transition-all duration-200 hover:shadow-md sm:p-5"
    >
      <div className="mb-2 flex items-center gap-3">
        <span className={cn("inline-flex shrink-0 items-center justify-center", AMBER_PREMIUM_TEXT_PRIMARY)} aria-hidden>
          <IconInfoCirculo className="h-[22px] w-[22px] sm:h-6 sm:w-6" />
        </span>
        <p className={cn("text-base font-semibold leading-snug", AMBER_PREMIUM_TEXT_PRIMARY)}>
          Catálogo do seller e alterações
        </p>
      </div>
      <div className="mt-1.5 space-y-2 text-sm leading-relaxed text-[var(--muted)] [&_strong]:font-medium [&_strong]:text-[var(--foreground)]">
        <p>
          <strong>Dados cadastrais</strong> (nome, descrição, preço, estoque via fluxos com análise, medidas, NCM e link de
          fotos no formulário) entram em <strong>análise da DropCore</strong>.
        </p>
        <p>
          O seller e os pedidos ERP seguem com a <strong>última versão aprovada</strong> até a publicação em{" "}
          <strong>Alterações de produtos</strong>.
        </p>
        <p>
          <strong>Miniatura de SKU</strong> (Enviar/Trocar) costuma atualizar na hora pela rota de upload.
        </p>
      </div>
    </div>
  );
}
