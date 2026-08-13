/** Mesmo número de suporte do DropCore usado no portal seller (E.164, sem +). */
export const FORNECEDOR_SUPPORT_WHATSAPP_E164 = "5562992633065";

export const FORNECEDOR_SUPPORT_WHATSAPP_DEFAULT_PREFILL = "Olá! Preciso de suporte no portal fornecedor do DropCore.";

export function buildFornecedorSupportWhatsAppHref(prefill: string): string {
  return `https://wa.me/${FORNECEDOR_SUPPORT_WHATSAPP_E164}?text=${encodeURIComponent(prefill)}`;
}

/**
 * Mensagem inicial do WhatsApp conforme a rota do fornecedor (prefixos mais específicos primeiro).
 */
export function getFornecedorSupportWhatsAppPrefill(pathname: string): string {
  const p = pathname || "";

  if (p.startsWith("/fornecedor/integracoes-erp")) {
    return "Olá! Preciso de ajuda com a integração ERP (Olist/Tiny) no DropCore (fornecedor).";
  }
  if (p.startsWith("/fornecedor/produtos")) {
    return "Olá! Preciso de ajuda com produtos e catálogo no DropCore (fornecedor).";
  }
  if (p.startsWith("/fornecedor/pedidos")) {
    return "Olá! Preciso de ajuda com pedidos no DropCore (fornecedor).";
  }
  if (p.startsWith("/fornecedor/cadastro")) {
    return "Olá! Preciso de ajuda com meu cadastro de fornecedor no DropCore.";
  }
  if (p.startsWith("/fornecedor/dashboard")) {
    return "Olá! Preciso de ajuda com o painel do fornecedor no DropCore.";
  }
  if (p.startsWith("/fornecedor/login")) {
    return "Olá! Estou com dúvida para acessar a conta fornecedor no DropCore.";
  }
  if (p.startsWith("/fornecedor/register")) {
    return "Olá! Preciso de ajuda para concluir o cadastro fornecedor no DropCore.";
  }

  return FORNECEDOR_SUPPORT_WHATSAPP_DEFAULT_PREFILL;
}
