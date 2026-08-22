import type { Metadata } from "next";
import { LegalPageShell } from "@/components/legal/LegalPageShell";
import { CENTRAL_DE_AJUDA_META, CentralDeAjudaBody } from "@/components/legal/content";

const DESCRIPTION = "Tire dúvidas sobre saldo, PIX, SLA de postagem, fornecedor e conta no DropCore.";

export const metadata: Metadata = {
  title: CENTRAL_DE_AJUDA_META.title,
  description: DESCRIPTION,
  alternates: { canonical: "/central-de-ajuda" },
};

export default function CentralDeAjudaPage() {
  return (
    <LegalPageShell title={CENTRAL_DE_AJUDA_META.title} subtitle={CENTRAL_DE_AJUDA_META.subtitle}>
      <CentralDeAjudaBody />
    </LegalPageShell>
  );
}
