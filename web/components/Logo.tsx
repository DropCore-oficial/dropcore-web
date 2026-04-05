"use client";

import Link from "next/link";

type Variant = "horizontal" | "vertical" | "icon";

type LogoProps = {
  variant?: Variant;
  href?: string | null;
  className?: string;
  /** "dark" = logo branco (fundo escuro), "light" = logo preto (fundo claro) */
  theme?: "dark" | "light";
};

const SIZES: Record<Variant, { w: number; h: number }> = {
  horizontal: { w: 140, h: 36 },
  vertical: { w: 120, h: 90 },
  icon: { w: 40, h: 40 },
};

export function Logo({ variant = "horizontal", href = "/", className = "", theme = "dark" }: LogoProps) {
  const { w, h } = SIZES[variant];
  const src =
    variant === "icon" ? "/icon.svg" : variant === "vertical" ? "/logo-vertical.png" : "/logo-horizontal.png";

  /* theme=light: PNGs escuros → inverte; ícone /icon.svg já é o símbolo preto+verde */
  const imgStyle: React.CSSProperties = {
    width: w,
    height: h,
    maxWidth: w,
    maxHeight: h,
    background: "transparent",
    ...(theme === "light" && variant !== "icon"
      ? { filter: "invert(1) brightness(1.05) contrast(1.1)" }
      : {}),
  };

  const img = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt="DropCore"
      width={w}
      height={h}
      className={`object-contain border-0 outline-none select-none ${className}`}
      style={imgStyle}
    />
  );

  const wrapClass = "inline-flex shrink-0 border-0 outline-none bg-transparent [&_img]:border-0 [&_img]:outline-none [&_img]:bg-transparent";
  if (href && href !== "") {
    return (
      <Link href={href} className={`${wrapClass} ${className}`}>
        {img}
      </Link>
    );
  }
  return <span className={`${wrapClass} ${className}`}>{img}</span>;
}
