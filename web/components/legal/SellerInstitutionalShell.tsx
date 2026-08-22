"use client";

import { SellerNav } from "@/app/seller/SellerNav";
import { SellerPageHeader } from "@/components/seller/SellerPageHeader";

/**
 * Moldura das páginas institucionais (Sobre, Termos, Privacidade, Central de Ajuda) quando
 * acessadas de dentro do painel do seller — mantém o `SellerNav` (menu do seller) em vez do
 * cabeçalho público de `LegalPageShell`. Nenhuma aba do menu fica destacada (`active`
 * omitido), já que essas páginas não fazem parte do menu principal.
 */
export function SellerInstitutionalShell({
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
          showBack
          backHref="/seller/dashboard"
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
      <SellerNav wide />
    </div>
  );
}
