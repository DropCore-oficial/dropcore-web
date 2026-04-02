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
    <header className="flex items-center justify-between gap-4 py-4 border-b border-[var(--border-subtle)]">
      <div className="flex items-center gap-4 min-w-0">
        <DropCoreLogo
          variant="horizontal"
          href={href}
          className="shrink-0"
        />
        {children}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Link
          href="/dashboard"
          className="rounded-[var(--radius)] px-3 py-1.5 text-xs font-medium transition-colors bg-[var(--card)] border border-[var(--border-subtle)] text-[var(--muted)] hover:text-[var(--foreground)] shadow-[var(--shadow)]"
        >
          Início da dash
        </Link>
        <ThemeToggle className="rounded-[var(--radius)] p-2 transition-colors bg-[var(--card)] border border-[var(--border-subtle)] hover:opacity-90 shadow-[var(--shadow)]" />
        <NotificationBell context="admin" />
        {onRefresh && (
          <Button variant="secondary" onClick={onRefresh}>
            Atualizar
          </Button>
        )}
        {onLogout && (
          <Button variant="secondary" onClick={onLogout} className="hover:text-[var(--danger)] hover:border-[var(--danger)]/50">
            Sair
          </Button>
        )}
      </div>
    </header>
  );
}
