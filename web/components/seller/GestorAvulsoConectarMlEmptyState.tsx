import Link from "next/link";
import type { ReactNode } from "react";

/** Estado vazio "conectar Mercado Livre", compartilhado por Anúncio/SAC/ADS — antes era
 * JSX idêntico duplicado nos 3 `page.tsx` (achado da crítica Impeccable 2026-10-14: sem
 * ícone, lia como página de erro). Ícone do próprio gestor dá o mesmo peso visual que ele já
 * tem no card do hub, sem copy nova — a cópia que já existia só ganhou destaque visual. */
export function GestorAvulsoConectarMlEmptyState({
  icon,
  titulo,
  descricao,
}: {
  icon: ReactNode;
  titulo: string;
  descricao: string;
}) {
  return (
    <section className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-6 text-center shadow-sm sm:p-8">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400">
        {icon}
      </span>
      <p className="mt-3 font-medium text-[var(--foreground)]">{titulo}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-[var(--muted)]">{descricao}</p>
      <Link
        href="/seller/gestores-ia-avulso/integracoes"
        className="mt-4 inline-flex rounded-md bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-emerald-700"
      >
        Conectar Mercado Livre
      </Link>
    </section>
  );
}
