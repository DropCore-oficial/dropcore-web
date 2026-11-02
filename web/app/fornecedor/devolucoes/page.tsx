"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Consolidado em /fornecedor/pedidos (aba "Devolução") — confirmar/contestar agora acontece
 * direto no card do pedido, sem precisar de uma tela própria que ninguém achava fácil. Mantém
 * essa URL funcionando (links antigos, notificações já enviadas) só redirecionando. */
export default function FornecedorDevolucoesRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/fornecedor/pedidos?status=devolucao");
  }, [router]);
  return null;
}
