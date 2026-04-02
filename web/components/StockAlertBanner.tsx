"use client";

import { useRouter } from "next/navigation";
import { Alert, Button } from "./ui";

export type StockAlertBannerProps = {
  count: number;
  catalogRoute?: string;
};

export function StockAlertBanner({ count, catalogRoute = "/admin/catalogo?estoqueBaixo=1" }: StockAlertBannerProps) {
  const router = useRouter();

  if (count <= 0) return null;

  return (
    <Alert
      variant="warning"
      className="!bg-[var(--card)] !border-[var(--card-border)]"
      title={`${count} ${count === 1 ? "item" : "itens"} com estoque abaixo do mínimo`}
      action={
        <Button variant="warning" size="md" onClick={() => router.push(catalogRoute)}>
          Ver catálogo
        </Button>
      }
    >
      <span className="text-[var(--muted)]">Repor estoque para evitar rupturas</span>
    </Alert>
  );
}
