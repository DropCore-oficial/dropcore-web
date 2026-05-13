/** WhatsApp suporte seller (E.164, sem +). */
export const SELLER_SUPPORT_WHATSAPP_E164 = "5562992633065";

export const SELLER_SUPPORT_WHATSAPP_DEFAULT_PREFILL = "Olá! Preciso de suporte no portal seller do DropCore.";

export function buildSellerSupportWhatsAppHref(prefill: string): string {
  return `https://wa.me/${SELLER_SUPPORT_WHATSAPP_E164}?text=${encodeURIComponent(prefill)}`;
}

/**
 * Mensagem inicial do WhatsApp conforme a rota do seller (prefixos mais específicos primeiro).
 */
export function getSellerSupportWhatsAppPrefill(pathname: string): string {
  const p = pathname || "";

  if (p.startsWith("/seller/integracoes-erp/como-conectar")) {
    return "Olá! Preciso de ajuda para conectar a Olist/Tiny (token API) no DropCore.";
  }
  if (p.startsWith("/seller/integracoes-erp/mapeamento")) {
    return "Olá! Preciso de ajuda com SKUs e mapeamento na Olist/Tiny (DropCore).";
  }
  if (p.startsWith("/seller/integracoes-erp")) {
    return "Olá! Preciso de ajuda com a integração ERP (Olist/Tiny) no DropCore.";
  }
  if (p.startsWith("/seller/produtos")) {
    return "Olá! Preciso de ajuda com produtos e catálogo no DropCore (seller).";
  }
  if (p.startsWith("/seller/catalogo/fornecedor")) {
    return "Olá! Preciso de ajuda com o catálogo do fornecedor no DropCore.";
  }
  if (p.startsWith("/seller/catalogo")) {
    return "Olá! Preciso de ajuda com o catálogo no DropCore.";
  }
  if (p.startsWith("/seller/plano")) {
    return "Olá! Preciso de ajuda com plano e mensalidade no DropCore.";
  }
  if (p.startsWith("/seller/cadastro")) {
    return "Olá! Preciso de ajuda com meu cadastro de seller no DropCore.";
  }
  if (p.startsWith("/seller/calculadora")) {
    return "Olá! Preciso de ajuda com a calculadora no DropCore (seller).";
  }
  if (p.startsWith("/seller/dashboard")) {
    return "Olá! Preciso de ajuda com o painel do seller no DropCore.";
  }
  if (p.startsWith("/seller/login")) {
    return "Olá! Estou com dúvida para acessar a conta seller no DropCore.";
  }
  if (p.startsWith("/seller/register")) {
    return "Olá! Preciso de ajuda para concluir o cadastro seller no DropCore.";
  }
  if (p.startsWith("/seller/reset-password")) {
    return "Olá! Preciso de ajuda para redefinir senha no DropCore (seller).";
  }

  return SELLER_SUPPORT_WHATSAPP_DEFAULT_PREFILL;
}
