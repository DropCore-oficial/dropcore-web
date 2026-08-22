import type { Metadata } from "next";
import { LegalPageShell } from "@/components/legal/LegalPageShell";
import { TERMOS_DE_USO_META, TermosDeUsoBody } from "@/components/legal/content";

const DESCRIPTION = "Termos de uso do DropCore: cadastro, papéis de seller e fornecedor, camada financeira e responsabilidades.";

export const metadata: Metadata = {
  title: TERMOS_DE_USO_META.title,
  description: DESCRIPTION,
  alternates: { canonical: "/termos-de-uso" },
};

export default function TermosDeUsoPage() {
  return (
    <LegalPageShell
      title={TERMOS_DE_USO_META.title}
      subtitle={TERMOS_DE_USO_META.subtitle}
      updatedAt={TERMOS_DE_USO_META.updatedAt}
    >
      <TermosDeUsoBody />
    </LegalPageShell>
  );
}
