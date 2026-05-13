"use client";

import { useEffect, useRef, useState } from "react";
import { catalogoV2UrlImagem } from "./catalogoV2Imagem";
import { linkFotosComoSrcMiniatura } from "@/lib/fornecedorProdutoImagemSrc";
import { strSellerCatalogo as str } from "@/components/seller/SellerCatalogoGrupoUi";
import { cn } from "@/lib/utils";

type PreviewMode = "off" | "hover" | "fixo";

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
 * Mesma regra de interação do `FotoVariacaoCell` no fornecedor:
 * desktop — passar o mouse na miniatura abre preview flutuante; mobile/toque — toque abre modal em tela cheia.
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

  const [previewMode, setPreviewMode] = useState<PreviewMode>("off");
  const [hoverPreviewPos, setHoverPreviewPos] = useState<{ left: number; top: number } | null>(null);
  const [imgErro, setImgErro] = useState(false);
  const [previewImgErro, setPreviewImgErro] = useState(false);
  const lastPointerTypeRef = useRef<string>("mouse");

  const grade = variant === "grade";
  const hoverPreviewW = grade ? 400 : 260;
  const hoverPreviewH = grade ? 460 : 320;
  const imgPx = grade ? 160 : 48;

  useEffect(() => {
    setImgErro(false);
    setPreviewImgErro(false);
    setPreviewMode("off");
    setHoverPreviewPos(null);
  }, [src]);

  useEffect(() => {
    if (previewMode !== "fixo") return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setPreviewMode("off");
    }
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [previewMode]);

  function abrirPreviewHoverPorAnchor(el: HTMLElement) {
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const gap = 12;
    let left = r.right + gap;
    if (left + hoverPreviewW > vw - 8) left = r.left - hoverPreviewW - gap;
    left = Math.max(8, Math.min(left, vw - hoverPreviewW - 8));
    let top = r.top + r.height / 2 - hoverPreviewH / 2;
    top = Math.max(8, Math.min(top, vh - hoverPreviewH - 8));
    setHoverPreviewPos({ left, top });
    setPreviewMode("hover");
  }

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
        onPointerDown={(e) => {
          lastPointerTypeRef.current = e.pointerType;
        }}
        onPointerEnter={(e) => {
          if (e.pointerType === "mouse") abrirPreviewHoverPorAnchor(e.currentTarget);
        }}
        onPointerLeave={(e) => {
          if (e.pointerType === "mouse") {
            setPreviewMode("off");
            setHoverPreviewPos(null);
          }
        }}
        onClick={(e) => {
          e.stopPropagation();
          if (lastPointerTypeRef.current !== "mouse") {
            setPreviewMode((m) => (m === "fixo" ? "off" : "fixo"));
          }
        }}
        className={cn(
          "cursor-pointer touch-manipulation overflow-hidden border border-[var(--card-border)] bg-[var(--card)] p-0 focus:outline-none focus:ring-2 focus:ring-[var(--primary-blue)]",
          grade
            ? "relative block w-full rounded-xl max-md:h-auto md:h-40 md:w-full"
            : "block h-12 w-12 shrink-0 rounded max-md:w-full",
          className,
        )}
      >
        <img
          src={src}
          alt="Foto do produto"
          {...(grade ? {} : { width: imgPx, height: imgPx })}
          className={cn(
            grade
              ? "block h-auto w-full max-w-full object-contain md:h-full md:w-full md:max-h-full md:max-w-full"
              : "block h-full w-full object-cover",
          )}
          onError={() => {
            setImgErro(true);
            onThumbError?.();
          }}
        />
      </button>
      {previewMode === "hover" && src && hoverPreviewPos && (
        <div
          className="pointer-events-none fixed z-[120] overflow-hidden rounded-lg border border-[var(--card-border)] bg-[var(--card)] shadow-xl"
          style={{ width: `${hoverPreviewW}px`, left: `${hoverPreviewPos.left}px`, top: `${hoverPreviewPos.top}px` }}
        >
          {!previewImgErro ? (
            <img
              src={src}
              alt="Preview"
              className="block h-auto w-full object-contain"
              style={{ maxHeight: `${hoverPreviewH}px` }}
              onError={() => setPreviewImgErro(true)}
            />
          ) : (
            <div className="flex items-center justify-center px-4 py-8 text-xs text-[var(--muted)]">Imagem não carregou</div>
          )}
        </div>
      )}
      {previewMode === "fixo" && previewImgBlock && (
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
            onClick={() => setPreviewMode("off")}
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
