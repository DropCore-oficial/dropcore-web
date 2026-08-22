import { FornecedorInstitutionalShell } from "@/components/legal/FornecedorInstitutionalShell";
import { CENTRAL_DE_AJUDA_META, CentralDeAjudaBody } from "@/components/legal/content";

export default function FornecedorCentralDeAjudaPage() {
  return (
    <FornecedorInstitutionalShell title={CENTRAL_DE_AJUDA_META.title} subtitle={CENTRAL_DE_AJUDA_META.subtitle}>
      <CentralDeAjudaBody />
    </FornecedorInstitutionalShell>
  );
}
