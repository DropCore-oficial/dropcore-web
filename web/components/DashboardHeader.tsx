"use client";

import Link from "next/link";
import { DropCoreLogo } from "./DropCoreLogo";
import { ThemeToggle } from "./ThemeToggle";
import { Button } from "./ui";
import { NotificationBell } from "./NotificationBell";

export type DashboardHeaderProps = {
  href?: string;
  onRefresh?: () => void;
  onLogout?: () => void;
  /** Elementos extras entre logo e ações (ex: badge plano) */
  children?: React.ReactNode;
};

export function DashboardHeader({
  href = "/dashboard",
  onRefresh,
  onLogout,
  children,
}: DashboardHeaderProps) {
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 py-4 border-b border-[var(--border-subtle)]">
      <div className="flex items-center gap-3 sm:gap-4 min-w-0 w-full sm:w-auto">
        <DropCoreLogo
          variant="horizontal"
          href={href}
          className="shrink-0 max-w-[min(100%,220px)] sm:max-w-none"
        />
        {children}
      </div>
      <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto sm:justify-end sm:shrink-0">
        <Link
          href="/dashboard"
          className="rounded-[var(--radius)] px-3 py-2 min-h-[40px] sm:min-h-0 inline-flex items-center text-xs font-medium transition-colors bg-[var(--card)] border border-[var(--border-subtle)] text-[var(--muted)] hover:text-[var(--foreground)] shadow-[var(--shadow)] touch-manipulation"
        >
          <span className="sm:hidden">Início</span>
          <span className="hidden sm:inline">Início da dash</span>
        </Link>
        <ThemeToggle className="rounded-[var(--radius)] p-2 min-h-[40px] min-w-[40px] inline-flex items-center justify-center transition-colors bg-[var(--card)] border border-[var(--border-subtle)] hover:opacity-90 shadow-[var(--shadow)] touch-manipulation" />
        <NotificationBell context="admin" />
        {onRefresh && (
          <Button variant="secondary" onClick={onRefresh} className="min-h-[40px] sm:min-h-0 touch-manipulation">
            Atualizar
          </Button>
        )}
        {onLogout && (
          <Button variant="secondary" onClick={onLogout} className="min-h-[40px] sm:min-h-0 touch-manipulation hover:text-[var(--danger)] hover:border-[var(--danger)]/50">
            Sair
          </Button>
        )}
      </div>
    </header>
  );
}
