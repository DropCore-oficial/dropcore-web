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
        "min-h-screen min-h-[100dvh] bg-[var(--background)] text-[var(--foreground)]",
        className
      )}
    >
      <div
        className={cn(
          "mx-auto dropcore-px-layout pt-[max(1.5rem,env(safe-area-inset-top,0px))] pb-6 sm:pt-8 sm:pb-8 space-y-8",
          maxWidthMap[maxWidth]
        )}
      >
        {children}
      </div>
    </div>
  );
}
