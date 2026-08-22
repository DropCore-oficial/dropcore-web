import { AdminInstitutionalShell } from "@/components/legal/AdminInstitutionalShell";
import { PRIVACIDADE_META, PrivacidadeBody } from "@/components/legal/content";

export default function AdminPrivacidadePage() {
  return (
    <AdminInstitutionalShell
      title={PRIVACIDADE_META.title}
      subtitle={PRIVACIDADE_META.subtitle}
      updatedAt={PRIVACIDADE_META.updatedAt}
    >
      <PrivacidadeBody />
    </AdminInstitutionalShell>
  );
}
