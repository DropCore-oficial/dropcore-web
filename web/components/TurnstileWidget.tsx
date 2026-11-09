"use client";

import { useEffect, useRef } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: Record<string, unknown>) => string;
      remove: (widgetId: string) => void;
    };
  }
}

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js";

let scriptPromise: Promise<void> | null = null;
function loadTurnstileScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Falha ao carregar verificação anti-bot."));
    document.head.appendChild(script);
  });
  return scriptPromise;
}

type Props = {
  onVerify: (token: string) => void;
  onExpire?: () => void;
};

/**
 * Widget anti-bot (Cloudflare Turnstile) usado em login/esqueci-senha. Some sozinho se
 * `NEXT_PUBLIC_TURNSTILE_SITE_KEY` não estiver configurada (ex.: dev local sem conta
 * Cloudflare) — nesse caso o formulário segue funcionando sem exigir token.
 * Use uma `key` diferente no componente pai pra forçar um novo desafio a cada tentativa
 * (token do Turnstile é de uso único).
 */
export function TurnstileWidget({ onVerify, onExpire }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return;
    let cancelled = false;
    loadTurnstileScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return;
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: TURNSTILE_SITE_KEY,
          callback: onVerify,
          "expired-callback": () => onExpire?.(),
          theme: "auto",
        });
      })
      .catch((e: unknown) => console.error("[TurnstileWidget]", e));
    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!TURNSTILE_SITE_KEY) return null;
  return <div ref={containerRef} className="mt-1 flex justify-center" />;
}

/** True quando a verificação anti-bot está ativa (chave configurada) — usar pra exigir token antes de habilitar o botão. */
export const turnstileAtivo = Boolean(TURNSTILE_SITE_KEY);
