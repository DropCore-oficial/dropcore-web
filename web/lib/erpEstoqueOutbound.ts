import { createHmac } from "crypto";

export type ErpEstoqueItem = {
  sku: string;
  quantidade_vendida: number;
  estoque_atual_dropcore: number;
};

export type ErpEstoquePayload = {
  event: "dropcore.estoque_atualizado";
  pedido_id: string;
  referencia_externa: string | null;
  seller_id: string;
  org_id: string;
  items: ErpEstoqueItem[];
};

function signBodyHex(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body, "utf8").digest("hex");
}

function isAllowedWebhookUrl(url: string): boolean {
  const u = url.trim();
  if (!u) return false;
  try {
    const parsed = new URL(u);
    if (parsed.protocol === "https:") return true;
    if (process.env.NODE_ENV !== "production" && parsed.protocol === "http:") {
      const h = parsed.hostname.toLowerCase();
      if (h === "localhost" || h === "127.0.0.1") return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Dispara POST fire-and-forget para o ERP (n8n, middleware, etc.) com o estoque atual no DropCore.
 * Falhas só logam — não afetam o pedido já concluído.
 */
export function fireErpEstoqueWebhook(params: {
  webhookUrl: string | null | undefined;
  webhookSecret: string | null | undefined;
  payload: ErpEstoquePayload;
}): void {
  const url = params.webhookUrl?.trim() ?? "";
  if (!url || !isAllowedWebhookUrl(url)) {
    if (url) console.warn("[erp estoque webhook] URL inválida ou não HTTPS em produção — ignorado.");
    return;
  }

  const body = JSON.stringify(params.payload);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "DropCore-ErpEstoque/1.0",
  };
  const secret = params.webhookSecret?.trim();
  if (secret) {
    headers["X-DropCore-Signature"] = signBodyHex(body, secret);
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10_000);

  void fetch(url, { method: "POST", headers, body, signal: ctrl.signal })
    .then(async (res) => {
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        console.warn("[erp estoque webhook] HTTP", res.status, t.slice(0, 500));
      }
    })
    .catch((e: unknown) => {
      console.warn("[erp estoque webhook] fetch:", e instanceof Error ? e.message : e);
    })
    .finally(() => clearTimeout(timer));
}
