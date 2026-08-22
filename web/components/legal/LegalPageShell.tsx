import Link from "next/link";
import { DropCoreLogo } from "@/components/DropCoreLogo";
import { ThemeToggle } from "@/components/ThemeToggle";

/**
 * Cabeçalho + moldura das 4 páginas institucionais públicas (Sobre, Termos de Uso,
 * Política de Privacidade, Central de Ajuda) — sem SellerNav/FornecedorNav/AdminMobileBottomNav
 * fixo, por isso não reserva o padding extra que o resto do sistema reserva pro rodapé
 * (ver `ConditionalFooter`, que já trata essas rotas como `compactMobilePadding`, igual a "/").
 *
 * Shell em `dropcore-shell-6xl` (padrão único do sistema, ver skill dropcore-layout) — o
 * card de título replica `SellerPageHeader` (`surface="hero"`): barra degradê ao lado do
 * `<h1>`, não embaixo. Corpo do texto fica em `max-w-3xl` só pra não deixar a linha de
 * leitura larga demais dentro do shell de 6xl (mesma ideia de `max-w-2xl` já usada em
 * subtítulos de outras páginas do sistema).
 */
export function LegalPageShell({
  title,
  subtitle,
  updatedAt,
  children,
}: {
  title: string;
  subtitle?: string;
  updatedAt?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-[var(--background)] text-[var(--foreground)]">
      <header className="border-b border-[var(--border-subtle)]">
        <div className="dropcore-shell-6xl flex h-[4.25rem] items-center justify-between gap-3">
          <DropCoreLogo variant="horizontal" href="/" />
          <div className="flex items-center gap-3 sm:gap-4">
            <Link
              href="/"
              className="text-sm font-medium text-[var(--muted)] transition hover:text-[var(--foreground)]"
            >
              Voltar ao início
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main className="dropcore-shell-6xl pb-5 pt-8 sm:pt-10 md:pb-7">
        <header className="relative overflow-hidden rounded-2xl border border-[var(--card-border)] bg-[var(--card)] px-4 py-5 shadow-sm sm:rounded-3xl sm:px-7 sm:py-6 md:px-8 md:py-7">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <h1 className="text-2xl font-bold leading-[1.15] tracking-tight text-[var(--foreground)] sm:text-3xl">
              {title}
            </h1>
            <span
              className="h-1 min-h-1 w-14 shrink-0 self-center rounded-full bg-gradient-to-r from-emerald-500 via-emerald-400 to-emerald-300/70 sm:w-20"
              aria-hidden
            />
          </div>
          {subtitle && (
            <p className="mt-2 max-w-2xl text-xs leading-relaxed text-[var(--muted)] sm:mt-2.5 sm:text-sm">
              {subtitle}
            </p>
          )}
          {updatedAt && <p className="mt-2 text-xs text-[var(--muted)]">Última atualização: {updatedAt}</p>}
        </header>
        <div className="mt-8 max-w-3xl space-y-10 sm:mt-10">{children}</div>
      </main>
    </div>
  );
}

export function LegalSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-semibold text-[var(--foreground)] sm:text-xl">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-[var(--muted)] sm:text-base">
        {children}
      </div>
    </section>
  );
}
