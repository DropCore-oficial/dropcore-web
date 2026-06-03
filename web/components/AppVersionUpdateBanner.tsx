"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  type AppSurface,
  getClientSurfaceBuildId,
  isDevBuildId,
} from "@/lib/appSurfaceVersion";
import { isDropcoreLoginPath, isPortalPublicPath } from "@/lib/portalPublicPaths";
import { usePortalAuthSession } from "@/lib/usePortalAuthSession";

const POLL_MS = 30_000;
const FIRST_RECHECK_MS = 5_000;
const SNOOZE_MS = 2 * 60 * 60 * 1000;

function snoozeKey(surface: AppSurface): string {
  return `dropcore-version-snooze-until-${surface}`;
}

function snoozeBuildKey(surface: AppSurface): string {
  return `dropcore-version-snooze-build-${surface}`;
}

function ackKey(surface: AppSurface): string {
  return `dropcore-version-ack-${surface}`;
}

/** Só com ?versionBannerPreview=1 na URL — não persiste (evita banner eterno após teste). */
function isPreviewForced(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("versionBannerPreview") === "1";
}

function isSnoozedFor(surface: AppSurface, serverId: string): boolean {
  if (typeof window === "undefined") return false;
  const until = Number(sessionStorage.getItem(snoozeKey(surface)) ?? 0);
  if (!Number.isFinite(until) || Date.now() >= until) return false;
  return sessionStorage.getItem(snoozeBuildKey(surface)) === serverId;
}

function snoozeBanner(surface: AppSurface, serverId: string): void {
  sessionStorage.setItem(snoozeKey(surface), String(Date.now() + SNOOZE_MS));
  sessionStorage.setItem(snoozeBuildKey(surface), serverId);
}

function clearSnooze(surface: AppSurface): void {
  sessionStorage.removeItem(snoozeKey(surface));
  sessionStorage.removeItem(snoozeBuildKey(surface));
}

function clearLegacyPreviewKeys(surface: AppSurface): void {
  sessionStorage.removeItem(`dropcore-version-banner-preview-${surface}`);
  sessionStorage.removeItem("dropcore-version-banner-preview");
}

function setAcknowledgedBuild(surface: AppSurface, serverId: string): void {
  sessionStorage.setItem(ackKey(surface), serverId);
}

function isAcknowledged(surface: AppSurface, serverId: string): boolean {
  return sessionStorage.getItem(ackKey(surface)) === serverId;
}

function setBannerOffset(px: number): void {
  document.documentElement.style.setProperty("--app-version-banner-offset", `${px}px`);
  document.documentElement.toggleAttribute("data-version-banner", px > 0);
}

async function fetchServerBuildId(surface: AppSurface): Promise<string | null> {
  try {
    const res = await fetch(`/api/app-version?surface=${surface}&t=${Date.now()}`, {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache" },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { buildId?: string };
    return typeof json.buildId === "string" && json.buildId.trim() ? json.buildId.trim() : null;
  } catch {
    return null;
  }
}

function reloadPortalWithoutPreview(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete("versionBannerPreview");
  window.location.replace(url.toString());
}

type Props = {
  /** Portal onde o banner está montado — nunca usar na landing pública. */
  surface: AppSurface;
  /** Só exibe com sessão Supabase (login, cadastro e rotas públicas ficam sem banner). */
  requireAuth?: boolean;
};

/**
 * Faixa fixa no topo quando há deploy novo na área do portal (seller, fornecedor, etc.).
 * Em dev o banner fica desligado (hash muda a cada save); use ?versionBannerPreview=1 para testar layout.
 */
export function AppVersionUpdateBanner({ surface, requireAuth = false }: Props) {
  const [show, setShow] = useState(false);
  const bannerRef = useRef<HTMLDivElement>(null);
  const pendingServerIdRef = useRef<string | null>(null);
  const clientBuildId = getClientSurfaceBuildId(surface);
  const pathname = usePathname() ?? "";
  const hasSession = usePortalAuthSession();
  const onLoginPage = isDropcoreLoginPath(pathname);
  const onPublicPortalRoute = requireAuth && isPortalPublicPath(pathname, surface);
  const mayShowPortalChrome =
    !onLoginPage && (!requireAuth || (hasSession && !onPublicPortalRoute));

  useEffect(() => {
    clearLegacyPreviewKeys(surface);
  }, [surface]);

  const checkVersion = useCallback(async () => {
    if (!mayShowPortalChrome) {
      setShow(false);
      return;
    }

    if (isPreviewForced()) {
      setShow(true);
      return;
    }

    if (process.env.NODE_ENV === "development" || isDevBuildId(clientBuildId)) {
      setShow(false);
      return;
    }

    const serverId = await fetchServerBuildId(surface);
    if (!serverId) {
      setShow(false);
      return;
    }

    if (serverId === clientBuildId) {
      setAcknowledgedBuild(surface, serverId);
      setShow(false);
      return;
    }

    if (isAcknowledged(surface, serverId)) {
      setShow(false);
      return;
    }

    if (isSnoozedFor(surface, serverId)) {
      setShow(false);
      return;
    }

    pendingServerIdRef.current = serverId;
    setShow(true);
  }, [clientBuildId, mayShowPortalChrome, surface]);

  useEffect(() => {
    void checkVersion();

    const firstRecheck = window.setTimeout(() => void checkVersion(), FIRST_RECHECK_MS);
    const interval = window.setInterval(() => void checkVersion(), POLL_MS);

    const onFocus = () => void checkVersion();
    const onVisible = () => {
      if (document.visibilityState === "visible") void checkVersion();
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.clearTimeout(firstRecheck);
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [checkVersion]);

  useEffect(() => {
    if (!show) {
      setBannerOffset(0);
      return;
    }

    const el = bannerRef.current;
    if (!el) return;

    const syncHeight = () => {
      const h = Math.ceil(el.getBoundingClientRect().height);
      setBannerOffset(h > 0 ? h : 0);
    };

    syncHeight();

    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(syncHeight) : null;
    ro?.observe(el);
    window.addEventListener("resize", syncHeight);

    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", syncHeight);
      setBannerOffset(0);
    };
  }, [show]);

  if (!mayShowPortalChrome) return null;
  if (!show) return null;

  const offset = "var(--app-version-banner-offset, 0px)";

  return (
    <>
      <div
        ref={bannerRef}
        className="fixed top-0 left-0 right-0 z-[200] border-b border-emerald-500/30 bg-emerald-950 px-3 py-2.5 text-center text-sm text-emerald-50 shadow-sm sm:px-4 dark:border-emerald-400/25 dark:bg-neutral-950"
        role="status"
        aria-live="polite"
      >
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-center gap-2 sm:flex-row sm:gap-4">
          <p className="leading-snug text-emerald-50/95 dark:text-neutral-200">
            Nova versão do DropCore disponível. Atualize para usar as últimas melhorias e correções.
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => {
                void (async () => {
                  const sid = pendingServerIdRef.current ?? (await fetchServerBuildId(surface));
                  if (sid) setAcknowledgedBuild(surface, sid);
                  clearSnooze(surface);
                  clearLegacyPreviewKeys(surface);
                  reloadPortalWithoutPreview();
                })();
              }}
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
                const sid = pendingServerIdRef.current;
                if (sid) snoozeBanner(surface, sid);
                setShow(false);
              }}
              className="rounded-md px-2 py-1.5 text-xs font-medium text-emerald-200/80 underline-offset-2 transition hover:text-emerald-50 hover:underline dark:text-neutral-400 dark:hover:text-neutral-200 sm:text-sm"
            >
              Lembrar mais tarde
            </button>
          </div>
        </div>
      </div>
      <div aria-hidden className="pointer-events-none shrink-0" style={{ height: offset }} />
    </>
  );
}
