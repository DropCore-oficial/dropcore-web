"use client";

import { cn } from "@/lib/utils";

export type CardProps = {
  children: React.ReactNode;
  className?: string;
  padding?: "none" | "sm" | "md" | "lg";
  as?: "div" | "section" | "article";
};

const paddingMap = {
  none: "",
  sm: "p-5",
  md: "p-6",
  lg: "p-8",
};

export function Card({
  children,
  className,
  padding = "md",
  as: Component = "div",
}: CardProps) {
  return (
    <Component
      className={cn(
        "rounded-[var(--radius)] border border-[var(--border-subtle)] bg-[var(--card)] shadow-[var(--shadow-card)] transition-colors",
        paddingMap[padding],
        className
      )}
    >
      {children}
    </Component>
  );
}
