import { redirect } from "next/navigation";

/**
 * ERP (Olist/Tiny) saiu do menu do fornecedor — pedido do Sr Stark 2026-11-06: fornecedor
 * passa a conectar o Mercado Livre direto pra manter o estoque sincronizado (ver
 * docs/SCHEMA.md), igual já foi feito no lado do seller em 2026-11-04. Nada em
 * app/fornecedor/integracoes-erp/** foi apagado (page.tsx continua intacto) — só saiu do
 * FornecedorNav e, a partir daqui, qualquer acesso direto (link salvo, digitado, bookmark
 * antigo) redireciona pra /fornecedor/integracoes-marketplace em vez de mostrar a tela de
 * ERP. Pra reativar: apagar este arquivo e devolver o link "ERP" no FornecedorNav.
 */
export default function FornecedorIntegracoesErpLayout() {
  redirect("/fornecedor/integracoes-marketplace");
}
