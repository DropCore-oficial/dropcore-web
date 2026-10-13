"use client";

import { AdminTinyOlistOnboardingGuide } from "@/components/admin/AdminTinyOlistOnboardingGuide";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";

export default function AdminGuiaIntegracaoTinyPage() {
  return (
    <div className="dropcore-shell-6xl space-y-5 pt-6 pb-5 md:pb-7">
      <AdminPageHeader
        eyebrow="Operação"
        title="Guia — integrar seller na Olist/Tiny"
        subtitle={
          <>
            Roteiro para treinamento e integração assistida. Use na call com o seller; o painel dele em{" "}
            <strong className="text-[var(--foreground)]">Integração ERP</strong> tem checklist e webhook automáticos.
          </>
        }
      />

      <AdminTinyOlistOnboardingGuide />
    </div>
  );
}
