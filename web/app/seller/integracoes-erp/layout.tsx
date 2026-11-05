import { redirect } from "next/navigation";

/**
 * ERP (Olist/Bling) temporariamente fora do ar — pedido do Sr Stark 2026-11-04: "por
 * enquanto não teremos ERP". Nada em app/seller/integracoes-erp/** foi apagado (page.tsx,
 * como-conectar/, mapeamento/ continuam intactos) — só saiu do SellerNav e, a partir
 * daqui, qualquer acesso direto (link salvo, digitado, bookmark antigo) redireciona pra
 * /seller/integracoes-marketplace em vez de mostrar a tela de ERP. Layout cobre as 3
 * sub-rotas de uma vez (page, como-conectar, mapeamento) sem precisar editar cada uma.
 * Pra reativar: apagar este arquivo e devolver o link "ERP" no SellerNav.
 */
export default function SellerIntegracoesErpLayout() {
  redirect("/seller/integracoes-marketplace");
}
