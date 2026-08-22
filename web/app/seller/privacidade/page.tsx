import { SellerInstitutionalShell } from "@/components/legal/SellerInstitutionalShell";
import { PRIVACIDADE_META, PrivacidadeBody } from "@/components/legal/content";

export default function SellerPrivacidadePage() {
  return (
    <SellerInstitutionalShell
      title={PRIVACIDADE_META.title}
      subtitle={PRIVACIDADE_META.subtitle}
      updatedAt={PRIVACIDADE_META.updatedAt}
    >
      <PrivacidadeBody />
    </SellerInstitutionalShell>
  );
}
