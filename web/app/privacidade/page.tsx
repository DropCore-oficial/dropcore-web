import type { Metadata } from "next";
import { LegalPageShell } from "@/components/legal/LegalPageShell";
import { PRIVACIDADE_META, PrivacidadeBody } from "@/components/legal/content";

const DESCRIPTION = "Como o DropCore coleta, usa e protege os dados de sellers e fornecedores, em conformidade com a LGPD.";

export const metadata: Metadata = {
  title: PRIVACIDADE_META.title,
  description: DESCRIPTION,
  alternates: { canonical: "/privacidade" },
};

export default function PrivacidadePage() {
  return (
    <LegalPageShell
      title={PRIVACIDADE_META.title}
      subtitle={PRIVACIDADE_META.subtitle}
      updatedAt={PRIVACIDADE_META.updatedAt}
    >
      <PrivacidadeBody />
    </LegalPageShell>
  );
}
