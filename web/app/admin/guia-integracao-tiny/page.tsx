"use client";

import Link from "next/link";
import { AdminTinyOlistOnboardingGuide } from "@/components/admin/AdminTinyOlistOnboardingGuide";

export default function AdminGuiaIntegracaoTinyPage() {
  return (
    <div className="dropcore-shell-6xl space-y-5 pt-5 pb-10 md:space-y-6 md:pt-7 md:pb-12">
      <header className="space-y-3">
        <Link
          href="/dashboard"
          className="inline-flex text-sm font-medium text-emerald-600 hover:underline dark:text-emerald-400"
        >
          ← Voltar ao início
        </Link>
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight text-[var(--foreground)] sm:text-2xl">
            Guia — integrar seller na Olist/Tiny
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--muted)]">
            Roteiro para treinamento e integração assistida. Use na call com o seller; o painel dele em{" "}
            <strong className="text-[var(--foreground)]">Integração ERP</strong> tem checklist e webhook automáticos.
          </p>
        </div>
      </header>

      <AdminTinyOlistOnboardingGuide />
    </div>
  );
}
