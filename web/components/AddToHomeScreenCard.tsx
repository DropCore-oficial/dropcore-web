"use client";

import { useEffect, useState } from "react";

const DISMISS_KEY = "dropcore-a2hs-dismissed-v1";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return Boolean(window.matchMedia?.("(display-mode: standalone)").matches || nav.standalone === true);
}

function isIos(): boolean {
  if (typeof window === "undefined") return false;
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

/** Android/Chrome também dispara `beforeinstallprompt` no desktop — filtra por UA de celular. */
function isMobileAndroid(): boolean {
  if (typeof window === "undefined") return false;
  return /android/i.test(window.navigator.userAgent) && /mobile/i.test(window.navigator.userAgent);
}

/**
 * Card dispensável "adicionar à tela inicial" — iOS não tem API de instalação nativa
 * (só o passo a passo manual via botão compartilhar); Android/Chrome tem `beforeinstallprompt`
 * e usa o instalador nativo do navegador.
 */
export function AddToHomeScreenCard({ appName = "DropCore" }: { appName?: string }) {
  const [dismissed, setDismissed] = useState(true);
  const [platform, setPlatform] = useState<"ios" | "android" | null>(null);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;
    let dismissedAntes = false;
    try {
      dismissedAntes = localStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      dismissedAntes = false;
    }
    if (dismissedAntes) return;

    if (isIos()) {
      setPlatform("ios");
      setDismissed(false);
      return;
    }

    const onBeforeInstall = (e: Event) => {
      if (!isMobileAndroid()) return;
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setPlatform("android");
      setDismissed(false);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstall);
  }, []);

  function fechar() {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* localStorage indisponível (modo privado etc.) — só não persiste a dispensa */
    }
  }

  async function instalarAndroid() {
    if (!deferredPrompt) return;
    setInstalling(true);
    try {
      await deferredPrompt.prompt();
      await deferredPrompt.userChoice;
    } finally {
      setInstalling(false);
      setDeferredPrompt(null);
      fechar();
    }
  }

  if (dismissed || !platform) return null;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4 shadow-sm sm:hidden">
      <button
        type="button"
        onClick={fechar}
        aria-label="Fechar"
        className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-md text-[var(--muted)] hover:bg-[var(--muted)]/10 hover:text-[var(--foreground)]"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
      <div className="flex items-start gap-3 pr-8">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400">
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
            <rect x="7" y="2" width="10" height="20" rx="2.5" />
            <line x1="11" y1="18" x2="13" y2="18" />
          </svg>
        </span>
        <div className="min-w-0">
          <p className="text-[15px] font-semibold text-[var(--foreground)]">Adicionar {appName}</p>
          <p className="text-sm text-[var(--muted)]">Acesse mais rápido no seu {platform === "ios" ? "iPhone" : "celular"}</p>
        </div>
      </div>

      <div className="mt-3 space-y-1.5">
        <p className="flex items-center gap-2 text-sm text-[var(--foreground)]">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden />
          Acesso rápido
        </p>
        <p className="flex items-center gap-2 text-sm text-[var(--foreground)]">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden />
          Experiência nativa
        </p>
      </div>

      {platform === "ios" ? (
        <div className="mt-3 rounded-xl border border-[var(--primary-blue)]/25 bg-[var(--primary-blue)]/[0.08] px-3.5 py-3 text-[13px] leading-relaxed text-[var(--foreground)]">
          <p className="flex items-center gap-1.5 font-semibold text-[var(--primary-blue)]">
            <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 16V4M7 9l5-5 5 5" />
              <path d="M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" />
            </svg>
            Como instalar:
          </p>
          <ol className="mt-1.5 list-decimal space-y-0.5 pl-5">
            <li>Toque no botão compartilhar (□↑)</li>
            <li>Selecione &quot;Adicionar à Tela Inicial&quot;</li>
            <li>Toque em &quot;Adicionar&quot;</li>
          </ol>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => void instalarAndroid()}
          disabled={installing || !deferredPrompt}
          className="mt-3 w-full rounded-md bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
        >
          {installing ? "Abrindo…" : "Instalar app"}
        </button>
      )}
    </div>
  );
}
