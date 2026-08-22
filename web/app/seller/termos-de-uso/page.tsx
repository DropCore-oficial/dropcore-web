import { SellerInstitutionalShell } from "@/components/legal/SellerInstitutionalShell";
import { TERMOS_DE_USO_META, TermosDeUsoBody } from "@/components/legal/content";

export default function SellerTermosDeUsoPage() {
  return (
    <SellerInstitutionalShell
      title={TERMOS_DE_USO_META.title}
      subtitle={TERMOS_DE_USO_META.subtitle}
      updatedAt={TERMOS_DE_USO_META.updatedAt}
    >
      <TermosDeUsoBody />
    </SellerInstitutionalShell>
  );
}
