/**
 * Explica que alterações enviadas para análise não substituem o catálogo do seller até o admin aprovar.
 */
export function AlteracoesCatalogoInfoBanner() {
  return (
    <div
      role="region"
      aria-label="Como funcionam alterações e o catálogo do seller"
      className="rounded-xl border border-gray-200 bg-white p-4 text-sm shadow-sm transition-all duration-200 hover:shadow-md dark:border-neutral-700 dark:bg-neutral-900"
    >
      <div className="mb-2 flex items-center gap-2">
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-gray-100 text-gray-600 dark:bg-neutral-800 dark:text-neutral-300">i</span>
        <p className="text-base font-semibold text-gray-900 dark:text-neutral-100">Catálogo do seller e alterações</p>
      </div>
      <div className="mt-1.5 space-y-2 text-sm leading-relaxed text-gray-500 dark:text-neutral-300">
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
