import { SellerInstitutionalShell } from "@/components/legal/SellerInstitutionalShell";
import { SOBRE_META, SobreBody } from "@/components/legal/content";

export default function SellerSobrePage() {
  return (
    <SellerInstitutionalShell title={SOBRE_META.title} subtitle={SOBRE_META.subtitle}>
      <SobreBody />
    </SellerInstitutionalShell>
  );
}
