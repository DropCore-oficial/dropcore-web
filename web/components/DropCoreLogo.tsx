"use client";

import Link from "next/link";
import { useTheme } from "./ThemeProvider";

export type DropCoreLogoVariant = "horizontal" | "symbol";

export type DropCoreLogoProps = {
  variant?: DropCoreLogoVariant;
  href?: string | null;
  className?: string;
  /** "dark" | "light" = fixo; undefined = usa tema atual (troca automática) */
  theme?: "dark" | "light";
};

// Paleta oficial DropCore (preto puro no dark)
const DARK = {
  bg: "#000000",
  border: "#1c1c1c",
  arrowLeft: "#ededed",
  arrowRight: "#22C55E",
  drop: "#ededed",
  core: "#22C55E",
};
// No tema claro: arrowLeft e drop = mesma cor (#111827), Core e arrowRight = verde
const LIGHT = {
  bg: "#FFFFFF",
  border: "#E5E7EB",
  arrowLeft: "#111827",
  arrowRight: "#22C55E",
  drop: "#111827",
  core: "#22C55E",
};

/** Símbolo: quadrado arredondado, duas setas opostas (fluxo/sincronização) */
function LogoIcon({
  size = 36,
  theme = "dark",
  className = "",
}: {
  size?: number;
  theme?: "dark" | "light";
  className?: string;
}) {
  const c = theme === "dark" ? DARK : LIGHT;
  const suffix = theme === "dark" ? "d" : "l";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 36 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <defs>
        <filter id={`dc-glow-${suffix}`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="0.4" result="blur" />
          <feColorMatrix
            in="blur"
            type="matrix"
            values="0 0 0 0 0.133 0 0 0 0 0.718 0 0 0 0 0.369 0 0 0 0.5 0"
            result="glow"
          />
          <feMerge>
            <feMergeNode in="glow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {/* Quadrado arredondado */}
      <rect width="36" height="36" rx="8" fill={c.bg} stroke={c.border} strokeWidth="1" />
      {/* Seta esquerda (←) — cinza */}
      <path
        d="M18 18 L10 18 M14 14 L10 18 L14 22"
        stroke={c.arrowLeft}
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* Seta direita (→) — verde, glow sutil */}
      <path
        d="M18 18 L26 18 M22 14 L26 18 L22 22"
        stroke={c.arrowRight}
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        filter={`url(#dc-glow-${suffix})`}
      />
    </svg>
  );
}

/** Wordmark: Drop (cinza) + Core (verde) */
function Wordmark({ theme = "dark", className = "" }: { theme?: "dark" | "light"; className?: string }) {
  const c = theme === "dark" ? DARK : LIGHT;
  return (
    <span
      className={`font-bold tracking-tight text-base antialiased ${className}`}
      style={{
        fontFamily: "var(--font-geist-sans), Inter, system-ui, -apple-system, sans-serif",
        letterSpacing: "-0.02em",
      }}
    >
      <span style={{ color: c.drop }}>Drop</span>
      <span style={{ color: c.core }}>Core</span>
    </span>
  );
}

export function DropCoreLogo({
  variant = "horizontal",
  href = "/",
  className = "",
  theme: themeProp,
}: DropCoreLogoProps) {
  const { theme: ctxTheme } = useTheme();
  const theme = themeProp ?? ctxTheme;
  const iconSize = variant === "horizontal" ? 36 : 40;
  const content = (
    <>
      <LogoIcon size={iconSize} theme={theme} />
      {variant === "horizontal" && <Wordmark theme={theme} />}
    </>
  );
  const wrapperClass = `inline-flex items-center gap-2.5 shrink-0 hover:opacity-90 transition-opacity ${className}`;

  if (href && href !== "") {
    return <Link href={href} className={wrapperClass}>{content}</Link>;
  }
  return <div className={wrapperClass}>{content}</div>;
}

/** Versão para fundo escuro (theme="dark") */
export function LogoDark(props: Omit<DropCoreLogoProps, "theme">) {
  return <DropCoreLogo {...props} theme="dark" />;
}

/** Versão para fundo claro (theme="light") */
export function LogoLight(props: Omit<DropCoreLogoProps, "theme">) {
  return <DropCoreLogo {...props} theme="light" />;
}
