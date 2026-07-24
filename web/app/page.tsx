import type { Metadata } from "next";
import { DropCoreLogo } from "@/components/DropCoreLogo";
import { getSiteUrl } from "@/lib/siteUrl";

const site = getSiteUrl();

const LANDING_TITLE = "DropCore — Em breve";
const LANDING_DESCRIPTION = "Estamos preparando uma nova experiência. Em breve, novidades.";

export const metadata: Metadata = {
  title: LANDING_TITLE,
  description: LANDING_DESCRIPTION,
  alternates: { canonical: site },
  openGraph: {
    url: site,
    title: LANDING_TITLE,
    description: LANDING_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: LANDING_TITLE,
    description: LANDING_DESCRIPTION,
  },
};

export default function Home() {
  const ano = new Date().getFullYear();
  return (
    <main className="relative flex min-h-dvh flex-1 flex-col items-center justify-center bg-[var(--background)] px-4 py-12 sm:px-6">
      <div className="relative flex w-full max-w-md flex-col items-center rounded-3xl border border-[var(--card-border)] bg-[var(--card)] px-6 py-10 text-center shadow-xl sm:max-w-lg sm:px-12 sm:py-14">
        <DropCoreLogo href={null} size="hero" />
        <span className="mt-8 inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-1.5 dark:border-emerald-400/30 dark:bg-emerald-400/10">
          <span className="relative flex h-2 w-2" aria-hidden>
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75 dark:bg-emerald-400" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-600 dark:bg-emerald-400" />
          </span>
          <span className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
            Em breve
          </span>
        </span>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight text-[var(--foreground)] sm:text-4xl">
          Novidades a caminho
        </h1>
        <p className="mt-3 max-w-sm text-sm leading-relaxed text-[var(--foreground)]/70 sm:text-base">
          Estamos preparando uma{" "}
          <span className="font-medium text-[var(--foreground)]">nova experiência</span> para
          sellers e fornecedores. Volte em breve.
        </p>
      </div>

      <p className="relative mt-8 text-[11px] text-[var(--foreground)]/50">
        © {ano} DropCore
      </p>
    </main>
  );
}
