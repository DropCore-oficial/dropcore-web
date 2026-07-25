import { SellerCatalogoProdutoDetalheClient } from "@/components/seller/SellerCatalogoProdutoDetalheClient";

type PageProps = {
  params: Promise<{ fornecedorId: string; paiKey: string }>;
};

export default async function SellerCatalogoProdutoDetalhePage({ params }: PageProps) {
  const { fornecedorId, paiKey } = await params;
  return <SellerCatalogoProdutoDetalheClient fornecedorId={fornecedorId} paiKey={decodeURIComponent(paiKey)} />;
}
