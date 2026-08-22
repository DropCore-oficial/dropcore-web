"use client";

import { FornecedorNav } from "@/app/fornecedor/FornecedorNav";
import { SellerPageHeader } from "@/components/seller/SellerPageHeader";

/**
 * Moldura das páginas institucionais quando acessadas de dentro do painel do fornecedor —
 * mantém o `FornecedorNav` (menu do fornecedor). Reaproveita `SellerPageHeader` pro
 * cabeçalho: é o mesmo padrão que a migração do header do fornecedor já está seguindo
 * (barra degradê + subtítulo, sem eyebrow — ver skill dropcore-layout, seção "Header de
 * página interna"), só ainda não tem um `FornecedorPageHeader` próprio extraído.
 */
export function FornecedorInstitutionalShell({
  title,
  subtitle,
  updatedAt,
  children,
}: {
  title: string;
  subtitle?: string;
  updatedAt?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-[var(--background)] text-[var(--foreground)] app-bg pt-[calc(3.5rem+env(safe-area-inset-top,0px))] md:pt-14 pb-5">
      <div className="dropcore-shell-6xl pb-5 pt-5 md:pb-7 md:pt-7">
        <SellerPageHeader
          surface="hero"
          title={title}
          subtitle={
            <>
              {subtitle}
              {updatedAt && <span className="mt-1 block text-[var(--muted)]">Última atualização: {updatedAt}</span>}
            </>
          }
        />
        <div className="mt-5 max-w-3xl space-y-10 md:mt-7">{children}</div>
      </div>
      <FornecedorNav wide />
    </div>
  );
}
