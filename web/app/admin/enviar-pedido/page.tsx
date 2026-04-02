"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Redireciona para /admin/pedidos (fluxo integrado de pedidos + bloqueio).
 */
export default function EnviarPedidoPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/admin/pedidos");
  }, [router]);
  return (
    <div style={{ padding: 24, textAlign: "center" }}>
      <p>Redirecionando para Pedidos…</p>
    </div>
  );
}
