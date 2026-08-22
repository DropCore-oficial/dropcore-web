import { AdminInstitutionalShell } from "@/components/legal/AdminInstitutionalShell";
import { CENTRAL_DE_AJUDA_META, CentralDeAjudaBody } from "@/components/legal/content";

export default function AdminCentralDeAjudaPage() {
  return (
    <AdminInstitutionalShell title={CENTRAL_DE_AJUDA_META.title} subtitle={CENTRAL_DE_AJUDA_META.subtitle}>
      <CentralDeAjudaBody />
    </AdminInstitutionalShell>
  );
}
