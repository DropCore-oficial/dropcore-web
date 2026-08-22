import { FornecedorInstitutionalShell } from "@/components/legal/FornecedorInstitutionalShell";
import { SOBRE_META, SobreBody } from "@/components/legal/content";

export default function FornecedorSobrePage() {
  return (
    <FornecedorInstitutionalShell title={SOBRE_META.title} subtitle={SOBRE_META.subtitle}>
      <SobreBody />
    </FornecedorInstitutionalShell>
  );
}
