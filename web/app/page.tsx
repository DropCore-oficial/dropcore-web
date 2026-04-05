import type { Metadata } from "next";
import { Suspense } from "react";
import HomeEntry from "./home-entry";
import { getSiteUrl } from "@/lib/siteUrl";

const site = getSiteUrl();

/** Meta da raiz: canonical e og:url apontam para o domínio certo (pré-visualização de links). */
export const metadata: Metadata = {
  alternates: { canonical: site },
  openGraph: { url: site },
};

export default function Home() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[40vh] flex items-center justify-center text-sm text-neutral-500 dark:text-neutral-400">
          A carregar…
        </div>
      }
    >
      <HomeEntry />
    </Suspense>
  );
}
