/**
 * Mesma tela de lista de produtos do fornecedor (`app/fornecedor/produtos/page.tsx`), aberta
 * pelo admin com `?fornecedor_id=...` — ver `lib/useFornecedorAdminContexto.ts` e
 * `docs/SCHEMA.md` ("Admin edita produto do fornecedor"). Não duplica a tela: reexporta o
 * mesmo componente, só mudando o caminho de onde o Next resolve o layout (admin, não
 * fornecedor).
 */
export const dynamic = "force-dynamic";
export { default } from "@/app/fornecedor/produtos/page";
