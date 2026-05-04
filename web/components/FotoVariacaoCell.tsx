"use client";

import { useState, useRef, useEffect, forwardRef, useImperativeHandle } from "react";
import { fornecedorProdutoImagemSrc, linkFotosComoSrcMiniatura } from "@/lib/fornecedorProdutoImagemSrc";

export type FotoVariacaoCellHandle = {
  pickFile: () => void;
  deleteImage: () => void;
};

type Props = {
  skuId: string;
  imagemUrl: string | null;
  /** Miniatura só para exibição quando o SKU não tem `imagem_url` (ex.: pai espelhando a 1ª variante). Upload/apagar usam só `imagemUrl`. */
  fallbackImagemUrl?: string | null;
  /**
   * `link_fotos` do SKU ou herdado do pai — só vira miniatura quando `linkFotosComoSrcMiniatura` reconhece URL de imagem direta / Supabase.
   * Upload continua a gravar só em `imagem_url`.
   */
  linkFotosUrl?: string | null;
  onUpdate: (novaUrl: string | null) => void;
  getToken: () => Promise<string | null>;
  /** `stacked`: miniatura em cima e ações em baixo — melhor em listas estreitas (mobile). */
  /** `table`: célula de tabela — miniatura e links alinhados ao centro na linha. */
  variant?: "row" | "stacked" | "table";
  /** Só `variant="stacked"`: `large` = miniatura maior (cartões por cor no catálogo fornecedor). */
  stackedSize?: "default" | "large";
  /** Com `stacked` + `large`: esconde «Trocar»/«Excluir» — usar menu externo + `ref` (`pickFile` / `deleteImage`). */
  stackedHideInlineActions?: boolean;
};

type PreviewMode = "off" | "hover" | "fixo";

export const FotoVariacaoCell = forwardRef<FotoVariacaoCellHandle | null, Props>(function FotoVariacaoCell(
  {
    skuId,
    imagemUrl,
    fallbackImagemUrl = null,
    linkFotosUrl = null,
    onUpdate,
    getToken,
    variant = "row",
    stackedSize = "default",
    stackedHideInlineActions = false,
  },
  ref
) {
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<PreviewMode>("off");
  const [hoverPreviewPos, setHoverPreviewPos] = useState<{ left: number; top: number } | null>(null);
  const [imgErro, setImgErro] = useState(false);
  const [previewImgErro, setPreviewImgErro] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastPointerTypeRef = useRef<string>("mouse");

  const linkFotosMiniatura =
    typeof linkFotosUrl === "string" && linkFotosUrl.trim() !== ""
      ? linkFotosComoSrcMiniatura(linkFotosUrl)
      : null;
  const urlExibicao = imagemUrl || fallbackImagemUrl || linkFotosMiniatura || null;
  const temImagemSalva = Boolean(imagemUrl);

  useEffect(() => {
    setImgErro(false);
    setPreviewImgErro(false);
  }, [imagemUrl, fallbackImagemUrl, linkFotosUrl]);

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

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErro(null);
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) throw new Error("Sessão expirada.");
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/fornecedor/produtos/${skuId}/imagem`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? "Erro ao enviar.");
      onUpdate(j.imagem_url ?? null);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao enviar.");
    } finally {
      setLoading(false);
      e.target.value = "";
    }
  }

  async function handleDelete() {
    if (!imagemUrl) return;
    setErro(null);
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) throw new Error("Sessão expirada.");
      const res = await fetch(`/api/fornecedor/produtos/${skuId}/imagem`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? "Erro ao excluir.");
      onUpdate(null);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao excluir.");
    } finally {
      setLoading(false);
    }
  }

  const handleDeleteRef = useRef(handleDelete);
  handleDeleteRef.current = handleDelete;

  useImperativeHandle(ref, () => ({
    pickFile: () => {
      inputRef.current?.click();
    },
    deleteImage: () => {
      void handleDeleteRef.current();
    },
  }));

  const mostraThumb = Boolean(urlExibicao) && !imgErro;
  const srcImagem = urlExibicao ? fornecedorProdutoImagemSrc(urlExibicao) : "";
  const previewAberto = previewMode !== "off";

  const stacked = variant === "stacked";
  const table = variant === "table";
  const stackedLarge = stacked && stackedSize === "large";
  const hideStackedRow = stackedLarge && stackedHideInlineActions;
  /* `default`: lista compacta. `large`: cartão por cor — mobile: foto largura total (alinhada à tabela); md+: 160px e coluna fixa. */
  const box = stacked
    ? stackedLarge
      ? "aspect-square w-full shrink-0 md:aspect-auto md:h-40 md:w-40"
      : "h-20 w-20"
    : table
      ? "w-12 h-12"
      : "w-12 h-12";
  const imgPx = stacked ? (stackedLarge ? 160 : 80) : table ? 48 : 48;
  const iconSz = stacked ? (stackedLarge ? 24 : 18) : table ? 16 : 20;
  const stackedColClass = stackedLarge ? "w-full min-w-0 md:w-40" : "w-[92px]";
  const stackedErrMaxClass = stackedLarge ? "max-w-full md:max-w-[10rem]" : "max-w-[92px]";
  const hoverPreviewW = stacked ? (stackedLarge ? 400 : 340) : table ? 240 : 260;
  const hoverPreviewH = stacked ? (stackedLarge ? 460 : 400) : 320;

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

  const previewImgBlock = srcImagem ? (
    !previewImgErro ? (
      <img
        src={srcImagem}
        alt="Preview"
        className="w-full h-auto max-h-[min(85dvh,28rem)] object-contain block rounded-lg"
        onError={() => setPreviewImgErro(true)}
      />
    ) : (
      <div className="flex items-center justify-center py-8 px-4 text-[var(--muted)] text-xs">Imagem não carregou</div>
    )
  ) : null;

  const thumbBlock = mostraThumb ? (
    <div className={stackedLarge ? "relative w-full min-w-0" : "relative"}>
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
        onClick={() => {
          if (lastPointerTypeRef.current !== "mouse") {
            setPreviewMode((m) => (m === "fixo" ? "off" : "fixo"));
          }
        }}
        className={`shrink-0 max-md:min-w-0 ${box} ${stackedLarge ? "rounded-xl" : "rounded"} border border-[var(--card-border)] overflow-hidden bg-[var(--card)] p-0 block max-md:w-full focus:outline-none focus:ring-2 focus:ring-[var(--primary-blue)] cursor-pointer touch-manipulation`}
      >
        <img
          src={srcImagem}
          alt="Foto"
          width={imgPx}
          height={imgPx}
          className="w-full h-full object-cover block"
          onError={() => setImgErro(true)}
        />
      </button>
      {previewMode === "hover" && srcImagem && hoverPreviewPos && (
        <div
          className="fixed z-[120] overflow-hidden rounded-lg border border-[var(--card-border)] bg-[var(--card)] shadow-xl pointer-events-none"
          style={{ width: `${hoverPreviewW}px`, left: `${hoverPreviewPos.left}px`, top: `${hoverPreviewPos.top}px` }}
        >
          {!previewImgErro ? (
            <img
              src={srcImagem}
              alt="Preview"
              className="w-full h-auto object-contain block"
              style={{ maxHeight: `${hoverPreviewH}px` }}
              onError={() => setPreviewImgErro(true)}
            />
          ) : (
            <div className="flex items-center justify-center py-8 px-4 text-[var(--muted)] text-xs">Imagem não carregou</div>
          )}
        </div>
      )}
      {previewMode === "fixo" && previewImgBlock && (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center p-4 sm:p-6" role="dialog" aria-modal="true" aria-label="Visualização da foto">
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
  ) : (
    <div
      className={`shrink-0 ${box} ${stackedLarge ? "rounded-xl" : "rounded"} border border-dashed border-[var(--card-border)] bg-[var(--card)] flex items-center justify-center`}
    >
      <svg xmlns="http://www.w3.org/2000/svg" width={iconSz} height={iconSz} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[var(--muted)]">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <path d="M21 15l-5-5L5 21" />
      </svg>
    </div>
  );

  const fileInput = (
    <input
      ref={inputRef}
      type="file"
      accept="image/jpeg,image/png,image/webp,image/gif"
      className="hidden"
      onChange={handleUpload}
      disabled={loading}
    />
  );

  const actions =
    stackedLarge && hideStackedRow ? (
      fileInput
    ) : (
    <div
      className={
        table
          ? "flex min-w-0 flex-col justify-center gap-0.5"
          : stackedLarge
            ? "flex w-full min-w-0 flex-row flex-wrap items-center justify-center gap-x-1.5 gap-y-0.5 py-2 text-[11px] font-normal leading-snug"
            : stacked
              ? "flex w-full flex-col items-center gap-0.5"
              : ""
      }
    >
      {fileInput}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={loading}
        className={`disabled:opacity-50 touch-manipulation ${
          stackedLarge
            ? "whitespace-nowrap border-0 bg-transparent px-0 py-0.5 text-[11px] font-normal text-[var(--primary-blue)] shadow-none hover:underline hover:underline-offset-2 hover:text-[var(--primary-blue-hover)] disabled:opacity-50"
            : stacked
              ? "inline-flex h-auto min-h-0 w-full items-center justify-center border-0 bg-transparent px-0 py-0.5 text-left text-[11px] font-medium text-[var(--primary-blue)] shadow-none hover:underline hover:underline-offset-2 disabled:hover:no-underline"
              : table
                ? "whitespace-nowrap text-left text-[11px] font-medium leading-tight text-[var(--primary-blue)] hover:text-[var(--primary-blue-hover)]"
                : "text-left text-xs text-[var(--primary-blue)] hover:text-[var(--primary-blue-hover)]"
        }`}
      >
        {mostraThumb ? "Trocar" : "Enviar"}
      </button>
      {temImagemSalva && (
        <>
          {stackedLarge ? (
            <span className="select-none text-[var(--muted)]" aria-hidden>
              ·
            </span>
          ) : null}
          <button
            type="button"
            onClick={handleDelete}
            disabled={loading}
            className={`disabled:opacity-50 ${
              stackedLarge
                ? "whitespace-nowrap border-0 bg-transparent px-0 py-0.5 text-[11px] font-normal text-[var(--danger)] shadow-none hover:underline hover:underline-offset-2 hover:opacity-90 disabled:opacity-50"
                : stacked
                  ? "inline-flex h-auto min-h-0 w-full items-center justify-center border-0 bg-transparent px-0 py-0.5 text-left text-[11px] font-medium text-[var(--danger)] shadow-none hover:underline hover:underline-offset-2 disabled:hover:no-underline"
                  : table
                    ? "whitespace-nowrap text-left text-[11px] leading-tight text-[var(--danger)] hover:opacity-90"
                    : "text-left text-xs text-[var(--danger)] hover:opacity-90"
            }`}
          >
            Excluir
          </button>
        </>
      )}
    </div>
    );

  return (
    <div
      className={`relative flex flex-col ${table || stackedLarge ? "min-w-0" : ""} ${stacked && stackedLarge ? "w-full max-w-full" : ""} ${stacked && stackedLarge ? `h-full min-h-0 gap-0 max-md:h-auto ${hideStackedRow ? "max-md:gap-0" : "max-md:gap-2"}` : "gap-0.5"}`}
    >
      {stacked ? (
        stackedLarge ? (
          <div className={`flex ${stackedColClass} h-full min-h-0 shrink-0 flex-col max-md:h-auto`}>
            <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col items-stretch justify-end pb-0.5 pt-0.5 max-md:flex-none max-md:justify-center max-md:pb-0 max-md:pt-0 md:items-center">
              {thumbBlock}
            </div>
            {actions}
          </div>
        ) : (
          <div className={`flex ${stackedColClass} shrink-0 flex-col items-center gap-1`}>
            {thumbBlock}
            {actions}
          </div>
        )
      ) : table ? (
        <div className="flex min-h-[2.75rem] items-center gap-2.5">
          {thumbBlock}
          {actions}
        </div>
      ) : (
        <div className="flex items-center gap-2">
          {thumbBlock}
          {actions}
        </div>
      )}
      {erro && (
        <p className={stacked ? `${stackedErrMaxClass} break-words text-center text-[10px] text-[var(--danger)]` : "text-[10px] text-[var(--danger)]"}>{erro}</p>
      )}
      {loading && <p className="text-[10px] text-[var(--muted)] text-center">...</p>}
    </div>
  );
});

FotoVariacaoCell.displayName = "FotoVariacaoCell";
