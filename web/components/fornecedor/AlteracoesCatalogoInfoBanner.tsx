/**
 * Explica que alterações enviadas para análise não substituem o catálogo do seller até o admin aprovar.
 */
export function AlteracoesCatalogoInfoBanner() {
  return (
    <div
      role="region"
      aria-label="Como funcionam alterações e o catálogo do seller"
      className="rounded-xl border border-blue-200 bg-blue-50/95 p-4 text-sm shadow-sm dark:border-blue-900/55 dark:bg-blue-950/25"
    >
      <p className="font-semibold text-blue-950 dark:text-blue-200">Catálogo do seller e alterações</p>
      <p className="mt-1.5 text-xs leading-relaxed text-neutral-800 dark:text-neutral-300">
        Quando você altera <strong>dados do cadastro</strong> (nome, descrição, preço, estoque pelos fluxos que enviam para análise, medidas, NCM, link de fotos no formulário, etc.), o envio vai para a{" "}
        <strong>análise da DropCore</strong>. O <strong>catálogo que o seller vê</strong> e os <strong>pedidos via ERP</strong> continuam usando a{" "}
        <strong>última versão já aprovada</strong> até o admin publicar em <strong>Alterações de produtos</strong> — aqui na lista você pode ainda ver valores antigos até a aprovação.
      </p>
      <p className="mt-2 text-xs leading-relaxed text-neutral-800 dark:text-neutral-300">
        <strong>Fotos:</strong> envio pela miniatura (<strong>Enviar</strong> / <strong>Trocar</strong>) costuma atualizar a imagem do SKU <strong>na hora</strong> (rota de upload), fora dessa fila de texto.
      </p>
    </div>
  );
}
