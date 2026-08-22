import { FornecedorInstitutionalShell } from "@/components/legal/FornecedorInstitutionalShell";
import { TERMOS_DE_USO_META, TermosDeUsoBody } from "@/components/legal/content";

export default function FornecedorTermosDeUsoPage() {
  return (
    <FornecedorInstitutionalShell
      title={TERMOS_DE_USO_META.title}
      subtitle={TERMOS_DE_USO_META.subtitle}
      updatedAt={TERMOS_DE_USO_META.updatedAt}
    >
      <TermosDeUsoBody />
    </FornecedorInstitutionalShell>
  );
}
