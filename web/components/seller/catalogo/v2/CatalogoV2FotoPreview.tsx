"use client";

import { useEffect, useState } from "react";
import { catalogoV2UrlImagem } from "./catalogoV2Imagem";
import { linkFotosComoSrcMiniatura } from "@/lib/fornecedorProdutoImagemSrc";
import { strSellerCatalogo as str } from "@/components/seller/SellerCatalogoGrupoUi";
import { cn } from "@/lib/utils";

function resolveThumbSrc(imagemUrl: string | null, fallbackUrl: string | null, linkFotosUrl: string | null): string | null {
  const linkMini =
    typeof linkFotosUrl === "string" && linkFotosUrl.trim() !== "" ? linkFotosComoSrcMiniatura(linkFotosUrl) : null;
  const raw = str(imagemUrl).trim() || str(fallbackUrl).trim() || linkMini || "";
  return raw ? catalogoV2UrlImagem(raw) : null;
}

export type CatalogoV2FotoPreviewVariant = "thumb" | "grade";

type Props = {
  /**
   * Quando definido (incl. `null` explícito após resolver), ignora `imagemUrl` / `fallbackUrl` / `linkFotosUrl`.
   * Use para miniatura com fila de candidatos (`failIdx`).
   */
  srcResolved?: string | null;
  imagemUrl?: string | null;
  fallbackUrl?: string | null;
  linkFotosUrl?: string | null;
  variant: CatalogoV2FotoPreviewVariant;
  /** Chamado quando a miniatura falha ao carregar (ex.: próximo candidato). */
  onThumbError?: () => void;
  className?: string;
};

/**
 * Miniatura só eleva levemente no hover (sem preview flutuante — atrapalhava scroll,
 * abrindo/fechando painel toda hora ao passar o mouse pelos cards). Clique (mouse ou
 * toque) abre o modal em tela cheia, mesmo comportamento em qualquer dispositivo.
 * URLs passam por `catalogoV2UrlImagem` (proxy do catálogo seller).
 */
export function CatalogoV2FotoPreview({
  srcResolved: srcResolvedProp,
  imagemUrl = null,
  fallbackUrl = null,
  linkFotosUrl = null,
  variant,
  onThumbError,
  className,
}: Props) {
  const src =
    srcResolvedProp !== undefined
      ? srcResolvedProp
      : resolveThumbSrc(imagemUrl ?? null, fallbackUrl ?? null, linkFotosUrl ?? null);

  const [previewAberto, setPreviewAberto] = useState(false);
  const [imgErro, setImgErro] = useState(false);
  const [previewImgErro, setPreviewImgErro] = useState(false);

  const grade = variant === "grade";
  const imgPx = grade ? 160 : 48;

  useEffect(() => {
    setImgErro(false);
    setPreviewImgErro(false);
    setPreviewAberto(false);
  }, [src]);

  useEffect(() => {
    if (!previewAberto) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setPreviewAberto(false);
    }
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [previewAberto]);

  const previewImgBlock = src ? (
    !previewImgErro ? (
      <img
        src={src}
        alt="Preview"
        className="block h-auto max-h-[min(85dvh,28rem)] w-full rounded-lg object-contain"
        onError={() => setPreviewImgErro(true)}
      />
    ) : (
      <div className="flex items-center justify-center px-4 py-8 text-xs text-[var(--muted)]">Imagem não carregou</div>
    )
  ) : null;

  if (!src || imgErro) {
    return (
      <div
        className={cn(
          "flex shrink-0 items-center justify-center border border-[var(--card-border)] bg-[var(--muted)]/10 text-[var(--muted)]",
          grade
            ? "min-h-[10rem] w-full rounded-xl border-dashed md:h-40 md:min-h-0"
            : "h-12 w-12 rounded border",
          className,
        )}
      >
        —
      </div>
    );
  }

  const thumbBlock = (
    <div className={cn("relative", grade ? "w-full max-md:h-auto md:h-full md:min-h-0" : "")}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setPreviewAberto(true);
        }}
        className={cn(
          "cursor-pointer touch-manipulation overflow-hidden border border-[var(--card-border)] bg-[var(--card)] p-0 transition-transform duration-150 hover:-translate-y-[1px] focus:outline-none focus:ring-2 focus:ring-[var(--primary-blue)]",
          grade
            ? "relative block h-full w-full rounded-xl"
            : "block h-12 w-12 shrink-0 rounded max-md:w-full",
          className,
        )}
      >
        <img
          src={src}
          alt="Foto do produto"
          loading="lazy"
          decoding="async"
          {...(grade ? {} : { width: imgPx, height: imgPx })}
          className={cn(
            grade
              ? "block h-full w-full max-w-full object-cover object-top"
              : "block h-full w-full object-cover",
          )}
          onError={() => {
            setImgErro(true);
            onThumbError?.();
          }}
        />
      </button>
      {previewAberto && previewImgBlock && (
        <div
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center p-4 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label="Visualização da foto"
        >
          <button
            type="button"
            className="absolute inset-0 cursor-default border-0 bg-[color-mix(in_srgb,var(--foreground)_45%,transparent)] p-0"
            aria-label="Fechar"
            onClick={() => setPreviewAberto(false)}
          />
          <div className="relative z-[110] w-full max-w-lg rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-2 shadow-2xl">
            {previewImgBlock}
          </div>
        </div>
      )}
    </div>
  );

  return thumbBlock;
}
