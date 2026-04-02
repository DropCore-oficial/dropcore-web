"use client";

import { cn } from "@/lib/utils";

export type PageLayoutProps = {
  children: React.ReactNode;
  className?: string;
  maxWidth?: "sm" | "md" | "lg" | "xl" | "full";
};

const maxWidthMap = {
  sm: "max-w-2xl",
  md: "max-w-4xl",
  lg: "max-w-6xl",
  xl: "max-w-7xl",
  full: "max-w-none",
};

export function PageLayout({
  children,
  className,
  maxWidth = "lg",
}: PageLayoutProps) {
  return (
    <div
      className={cn(
        "min-h-screen bg-[var(--background)] text-[var(--foreground)]",
        className
      )}
    >
      <div
        className={cn(
          "mx-auto px-4 py-6 sm:px-6 sm:py-8 space-y-8",
          maxWidthMap[maxWidth]
        )}
      >
        {children}
      </div>
    </div>
  );
}
