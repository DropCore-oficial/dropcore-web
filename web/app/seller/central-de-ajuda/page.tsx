import { SellerInstitutionalShell } from "@/components/legal/SellerInstitutionalShell";
import { CENTRAL_DE_AJUDA_META, CentralDeAjudaBody } from "@/components/legal/content";

export default function SellerCentralDeAjudaPage() {
  return (
    <SellerInstitutionalShell title={CENTRAL_DE_AJUDA_META.title} subtitle={CENTRAL_DE_AJUDA_META.subtitle}>
      <CentralDeAjudaBody />
    </SellerInstitutionalShell>
  );
}
