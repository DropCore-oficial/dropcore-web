const MP_SDK_URL = "https://sdk.mercadopago.com/js/v2";

let loadPromise: Promise<void> | null = null;

function sdkDisponivel(): boolean {
  return typeof window !== "undefined" && typeof window.MercadoPago === "function";
}

function aguardarScript(
  script: HTMLScriptElement,
  timeoutMs: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (sdkDisponivel()) {
      resolve();
      return;
    }

    const timer = window.setTimeout(() => {
      cleanup();
      reject(
        new Error(
          "Mercado Pago não inicializou. Reinicie o servidor (npm run dev) após alterar next.config.ts ou .env.local.",
        ),
      );
    }, timeoutMs);

    const onLoad = () => {
      if (sdkDisponivel()) {
        cleanup();
        resolve();
      }
    };

    const onError = () => {
      cleanup();
      reject(new Error("Falha ao carregar script do Mercado Pago (CSP ou rede)."));
    };

    const cleanup = () => {
      window.clearTimeout(timer);
      script.removeEventListener("load", onLoad);
      script.removeEventListener("error", onError);
    };

    script.addEventListener("load", onLoad);
    script.addEventListener("error", onError);

    // Script já estava no DOM (ex.: remount React) — load não dispara de novo
    window.setTimeout(() => {
      if (sdkDisponivel()) {
        cleanup();
        resolve();
      }
    }, 0);
  });
}

export function carregarSdkMercadoPago(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("SDK Mercado Pago só carrega no navegador."));
  }
  if (sdkDisponivel()) return Promise.resolve();
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const existing = document.querySelector(
      `script[src="${MP_SDK_URL}"]`,
    ) as HTMLScriptElement | null;

    if (existing) {
      await aguardarScript(existing, 12_000);
      return;
    }

    const script = document.createElement("script");
    script.src = MP_SDK_URL;
    script.async = true;
    document.head.appendChild(script);
    await aguardarScript(script, 12_000);
  })().catch((err) => {
    loadPromise = null;
    throw err;
  });

  return loadPromise;
}
