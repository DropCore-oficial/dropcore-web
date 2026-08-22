import type { Metadata } from "next";
import { LegalPageShell } from "@/components/legal/LegalPageShell";
import { SOBRE_META, SobreBody } from "@/components/legal/content";

const DESCRIPTION = "Conheça o DropCore: o hub B2B que conecta sellers e fornecedores, com catálogo, pedidos e financeiro integrados.";

export const metadata: Metadata = {
  title: SOBRE_META.title,
  description: DESCRIPTION,
  alternates: { canonical: "/sobre" },
};

export default function SobrePage() {
  return (
    <LegalPageShell title={SOBRE_META.title} subtitle={SOBRE_META.subtitle}>
      <SobreBody />
    </LegalPageShell>
  );
}
