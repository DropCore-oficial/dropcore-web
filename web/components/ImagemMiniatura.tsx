"use client";

import Image from "next/image";

type PropsTamanhoFixo = {
  src: string;
  alt: string;
  width: number;
  height: number;
  fill?: false;
  sizes?: never;
  className?: string;
  loading?: "lazy" | "eager";
  onError?: () => void;
};

/** `fill`: pro card fluido (`aspect-square`/`w-full h-full`, sem largura fixa) — o pai
 * precisa ter `position: relative` e uma altura real (ex. via `aspect-square`). */
type PropsFill = {
  src: string;
  alt: string;
  width?: never;
  height?: never;
  fill: true;
  sizes: string;
  className?: string;
  loading?: "lazy" | "eager";
  onError?: () => void;
};

type Props = PropsTamanhoFixo | PropsFill;

/**
 * Miniatura de catálogo/SKU — usa `next/image` (resize real via sharp, achado 2026-10-17:
 * o proxy `/api/.../imagem-proxy` ignora o parâmetro `w=` desde que parou de usar a Image
 * Transformation do Supabase, então uma miniatura de 48px baixava a imagem inteira) quando o
 * `src` é um path local (proxy same-origin). Cai pra `<img>` cru quando o `src` é externo
 * (ex.: `link_fotos` apontando pra outro domínio) ou `data:` URI — `next/image` exige
 * domínio liberado em `remotePatterns`, e aqui o domínio pode variar por SKU.
 */
export function ImagemMiniatura(props: Props) {
  const { src, alt, className, loading = "lazy", onError } = props;
  const local = src.startsWith("/");

  if (props.fill) {
    if (local) {
      return (
        <Image src={src} alt={alt} fill sizes={props.sizes} loading={loading} className={className} onError={onError} />
      );
    }
    return (
      <img
        src={src}
        alt={alt}
        loading={loading}
        decoding="async"
        className={className ? `absolute inset-0 h-full w-full ${className}` : "absolute inset-0 h-full w-full"}
        onError={onError}
      />
    );
  }

  if (local) {
    return (
      <Image
        src={src}
        alt={alt}
        width={props.width}
        height={props.height}
        loading={loading}
        className={className}
        onError={onError}
      />
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      width={props.width}
      height={props.height}
      loading={loading}
      decoding="async"
      className={className}
      onError={onError}
    />
  );
}
