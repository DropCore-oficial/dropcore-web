import { AdminPageHeader } from "@/components/admin/AdminPageHeader";

/**
 * Moldura das páginas institucionais quando acessadas de dentro do painel admin. O menu
 * (`AdminNav`/`AdminMobileBottomNav`) já é global via `app/admin/layout.tsx` — aqui só o
 * cabeçalho de página (`AdminPageHeader`) + conteúdo, dentro do shell padrão do sistema.
 */
export function AdminInstitutionalShell({
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
    <div className="dropcore-shell-6xl space-y-5 pb-5 pt-5 md:space-y-6 md:pb-7 md:pt-7">
      <AdminPageHeader
        eyebrow="Institucional"
        title={title}
        backHref="/dashboard"
        subtitle={
          <>
            {subtitle}
            {updatedAt && <span className="mt-1 block">Última atualização: {updatedAt}</span>}
          </>
        }
      />
      <div className="max-w-3xl space-y-10">{children}</div>
    </div>
  );
}
