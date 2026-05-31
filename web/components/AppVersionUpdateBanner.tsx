"use client";

import { useCallback, useEffect, useState } from "react";

const CLIENT_BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID ?? "dev";
const POLL_MS = 90_000;
const SNOOZE_MS = 2 * 60 * 60 * 1000;
const SNOOZE_KEY = "dropcore-version-snooze-until";
const PREVIEW_KEY = "dropcore-version-banner-preview";
const BANNER_HEIGHT_PX = 52;

function isDevBuildId(id: string): boolean {
  return id === "dev" || id === "local" || id.startsWith("local-");
}

function isPreviewForced(): boolean {
  if (typeof window === "undefined") return false;
  if (window.location.search.includes("versionBannerPreview=1")) {
    sessionStorage.setItem(PREVIEW_KEY, "1");
    return true;
  }
  return sessionStorage.getItem(PREVIEW_KEY) === "1";
}

function isSnoozed(): boolean {
  if (typeof window === "undefined") return false;
  const until = Number(sessionStorage.getItem(SNOOZE_KEY) ?? 0);
  return Number.isFinite(until) && Date.now() < until;
}

function snoozeBanner(): void {
  sessionStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_MS));
}

async function fetchServerBuildId(): Promise<string | null> {
  try {
    const res = await fetch("/api/app-version", { cache: "no-store" });
    if (!res.ok) return null;
    const json = (await res.json()) as { buildId?: string };
    return typeof json.buildId === "string" && json.buildId.trim() ? json.buildId.trim() : null;
  } catch {
    return null;
  }
}

/**
 * Faixa fixa no topo (estilo MyLine) quando há deploy novo (buildId do servidor ≠ build do browser).
 * Em dev não aparece, salvo ?versionBannerPreview=1 para testar layout.
 */
export function AppVersionUpdateBanner() {
  const [show, setShow] = useState(false);

  const checkVersion = useCallback(async () => {
    if (isPreviewForced()) {
      setShow(true);
      return;
    }

    if (isDevBuildId(CLIENT_BUILD_ID)) {
      setShow(false);
      return;
    }

    if (isSnoozed()) {
      setShow(false);
      return;
    }

    const serverId = await fetchServerBuildId();
    if (!serverId || serverId === CLIENT_BUILD_ID) {
      setShow(false);
      return;
    }

    setShow(true);
  }, []);

  useEffect(() => {
    void checkVersion();

    const interval = window.setInterval(() => void checkVersion(), POLL_MS);

    const onFocus = () => void checkVersion();
    const onVisible = () => {
      if (document.visibilityState === "visible") void checkVersion();
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [checkVersion]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.style.setProperty(
      "--app-version-banner-offset",
      show ? `${BANNER_HEIGHT_PX}px` : "0px",
    );
    return () => {
      document.documentElement.style.setProperty("--app-version-banner-offset", "0px");
    };
  }, [show]);

  if (!show) return null;

  return (
    <>
      <div
        className="fixed top-0 left-0 right-0 z-[9999] border-b border-emerald-900/30 bg-[#0f172a] px-3 py-2.5 text-center text-sm text-white shadow-md sm:px-4"
        role="status"
        aria-live="polite"
        style={{ minHeight: BANNER_HEIGHT_PX }}
      >
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-center gap-2 sm:flex-row sm:gap-4">
          <p className="leading-snug text-white/95">
            Nova versão do DropCore disponível. Atualize para usar as últimas melhorias e correções.
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-500 sm:text-sm"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M21 12a9 9 0 1 1-3-6.7" />
                <polyline points="21 3 21 9 15 9" />
              </svg>
              Atualizar agora
            </button>
            <button
              type="button"
              onClick={() => {
                snoozeBanner();
                setShow(false);
              }}
              className="rounded-md px-2 py-1.5 text-xs font-medium text-white/75 underline-offset-2 transition hover:text-white hover:underline sm:text-sm"
            >
              Lembrar mais tarde
            </button>
          </div>
        </div>
      </div>
      {/* Empurra conteúdo fixo (nav top) para baixo da faixa */}
      <div aria-hidden className="pointer-events-none" style={{ height: BANNER_HEIGHT_PX }} />
    </>
  );
}
