import { FornecedorInstitutionalShell } from "@/components/legal/FornecedorInstitutionalShell";
import { PRIVACIDADE_META, PrivacidadeBody } from "@/components/legal/content";

export default function FornecedorPrivacidadePage() {
  return (
    <FornecedorInstitutionalShell
      title={PRIVACIDADE_META.title}
      subtitle={PRIVACIDADE_META.subtitle}
      updatedAt={PRIVACIDADE_META.updatedAt}
    >
      <PrivacidadeBody />
    </FornecedorInstitutionalShell>
  );
}
