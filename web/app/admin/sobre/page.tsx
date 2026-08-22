import { AdminInstitutionalShell } from "@/components/legal/AdminInstitutionalShell";
import { SOBRE_META, SobreBody } from "@/components/legal/content";

export default function AdminSobrePage() {
  return (
    <AdminInstitutionalShell title={SOBRE_META.title} subtitle={SOBRE_META.subtitle}>
      <SobreBody />
    </AdminInstitutionalShell>
  );
}
