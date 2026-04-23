import { SellerCatalogoFornecedorPreviewClient } from "@/components/seller/SellerCatalogoFornecedorPreviewClient";

type PageProps = {
  params: Promise<{ fornecedorId: string }>;
  searchParams: Promise<{ n?: string }>;
};

export default async function SellerCatalogoFornecedorPreviewPage({ params, searchParams }: PageProps) {
  const { fornecedorId } = await params;
  const sp = await searchParams;
  const nomeArmazem = typeof sp.n === "string" && sp.n.trim() ? sp.n.trim() : undefined;
  return <SellerCatalogoFornecedorPreviewClient fornecedorId={fornecedorId} nomeArmazem={nomeArmazem} />;
}
