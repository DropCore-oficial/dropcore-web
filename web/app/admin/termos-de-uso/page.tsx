import { AdminInstitutionalShell } from "@/components/legal/AdminInstitutionalShell";
import { TERMOS_DE_USO_META, TermosDeUsoBody } from "@/components/legal/content";

export default function AdminTermosDeUsoPage() {
  return (
    <AdminInstitutionalShell
      title={TERMOS_DE_USO_META.title}
      subtitle={TERMOS_DE_USO_META.subtitle}
      updatedAt={TERMOS_DE_USO_META.updatedAt}
    >
      <TermosDeUsoBody />
    </AdminInstitutionalShell>
  );
}
