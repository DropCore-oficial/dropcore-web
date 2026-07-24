"use client";

import Link from "next/link";
import { Inter } from "next/font/google";
import { useTheme } from "./ThemeProvider";

/** Wordmark da marca: sempre Inter Bold (700). */
const dropCoreWordmarkFont = Inter({
  subsets: ["latin"],
  weight: "700",
});

export type DropCoreLogoVariant = "horizontal" | "symbol";

export type DropCoreLogoProps = {
  variant?: DropCoreLogoVariant;
  href?: string | null;
  className?: string;
  /** "dark" | "light" = fixo; undefined = usa tema atual (troca automática) */
  theme?: "dark" | "light";
  /** Ícone e wordmark um pouco menores — barras mobile sem cortar o desenho */
  compact?: boolean;
  /**
   * `panel` — cabeçalho de painel (ex.: owner): ícone maior; com `variant="symbol"` usa cantos `rounded-2xl` como avatar padrão.
   * `hero` — destaque de página cheia (ex.: "em breve"): ícone + wordmark maiores, mesma proporção do `default`.
   * `default` — barra superior / mobile.
   */
  size?: "default" | "panel" | "hero";
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
      className={`shrink-0 overflow-visible ${className}`}
      style={{ overflow: "visible" }}
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
function Wordmark({
  theme = "dark",
  compact = false,
  size = "default",
  className = "",
}: {
  theme?: "dark" | "light";
  compact?: boolean;
  size?: "default" | "panel" | "hero";
  className?: string;
}) {
  const c = theme === "dark" ? DARK : LIGHT;
  const sizeClass = compact
    ? "text-sm"
    : size === "hero"
      ? "text-2xl sm:text-3xl"
      : size === "panel"
        ? "text-xl sm:text-2xl"
        : "text-base";
  return (
    <span
      className={`${dropCoreWordmarkFont.className} tracking-tight antialiased whitespace-nowrap ${sizeClass} ${className}`}
      style={{ letterSpacing: "-0.02em" }}
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
  compact = false,
  size: sizeProp = "default",
}: DropCoreLogoProps) {
  const { theme: ctxTheme } = useTheme();
  const theme = themeProp ?? ctxTheme;
  const panel = sizeProp === "panel";
  const hero = sizeProp === "hero";
  const iconSize = panel
    ? variant === "symbol"
      ? 84
      : 80
    : hero
      ? variant === "symbol"
        ? 72
        : 64
      : variant === "horizontal"
        ? compact
          ? 32
          : 36
        : compact
          ? 32
          : 40;

  const iconRounded =
    panel && variant === "symbol" ? "rounded-2xl" : hero ? "rounded-xl" : "rounded-[8px]";
  /** Anel + sombra no contorno do ícone (nos dois temas) — sem isso o quadrado "some" contra
   * o fundo do card, que costuma ter quase a mesma cor (branco em claro, preto em escuro). */
  const iconShellLight = `inline-flex shrink-0 ${iconRounded} shadow-[0_1px_3px_rgba(0,0,0,0.12)] ring-1 ring-[var(--card-border)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.5)]`;

  const content = (
    <>
      <span className={iconShellLight}>
        <LogoIcon size={iconSize} theme={theme} />
      </span>
      {variant === "horizontal" && <Wordmark theme={theme} compact={compact} size={sizeProp} />}
    </>
  );
  const gap =
    variant === "symbol" ? "gap-0" : compact ? "gap-2" : hero ? "gap-3.5" : panel ? "gap-3" : "gap-2.5";
  const wrapperClass = `inline-flex items-center ${gap} shrink-0 hover:opacity-90 transition-opacity ${className}`;

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
