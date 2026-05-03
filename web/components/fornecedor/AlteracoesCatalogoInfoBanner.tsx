/**
 * Explica que alterações enviadas para análise não substituem o catálogo do seller até o admin aprovar.
 */
export function AlteracoesCatalogoInfoBanner() {
  return (
    <div
      role="region"
      aria-label="Como funcionam alterações e o catálogo do seller"
      className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4 sm:p-5 text-sm text-[var(--foreground)] shadow-sm transition-all duration-200 hover:shadow-md"
    >
      <div className="mb-2 flex items-center gap-2">
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-[var(--muted)]/15 text-[var(--muted)]">
          i
        </span>
        <p className="text-base font-semibold text-[var(--foreground)]">Catálogo do seller e alterações</p>
      </div>
      <div className="mt-1.5 space-y-2 text-sm leading-relaxed text-[var(--muted)] [&_strong]:text-[var(--foreground)]">
        <p>
          <strong>Dados cadastrais</strong> (nome, descrição, preço, estoque via fluxos com análise, medidas, NCM e link de fotos no formulário) entram em{" "}
          <strong>análise da DropCore</strong>.
        </p>
        <p>
          O seller e os pedidos ERP seguem com a <strong>última versão aprovada</strong> até a publicação em <strong>Alterações de produtos</strong>.
        </p>
        <p>
          <strong>Miniatura de SKU</strong> (Enviar/Trocar) costuma atualizar na hora pela rota de upload.
        </p>
      </div>
    </div>
  );
}
