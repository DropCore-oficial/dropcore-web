"use client";

import { useState, useRef, useEffect } from "react";
import { fornecedorProdutoImagemSrc, linkFotosComoSrcMiniatura } from "@/lib/fornecedorProdutoImagemSrc";

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
};

type PreviewMode = "off" | "hover" | "fixo";

export function FotoVariacaoCell({
  skuId,
  imagemUrl,
  fallbackImagemUrl = null,
  linkFotosUrl = null,
  onUpdate,
  getToken,
  variant = "row",
}: Props) {
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

  const mostraThumb = Boolean(urlExibicao) && !imgErro;
  const srcImagem = urlExibicao ? fornecedorProdutoImagemSrc(urlExibicao) : "";
  const previewAberto = previewMode !== "off";

  const stacked = variant === "stacked";
  const table = variant === "table";
  const box = stacked ? "h-24 w-24 sm:h-24 sm:w-24 lg:h-20 lg:w-20" : table ? "w-12 h-12" : "w-12 h-12";
  const imgPx = stacked ? 96 : table ? 48 : 48;
  const iconSz = stacked ? 18 : table ? 16 : 20;
  const hoverPreviewW = stacked ? 340 : table ? 240 : 260;
  const hoverPreviewH = stacked ? 400 : 320;

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
      <div className="flex items-center justify-center py-8 px-4 text-neutral-400 text-xs">Imagem não carregou</div>
    )
  ) : null;

  const thumbBlock = mostraThumb ? (
    <div className="relative">
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
        className={`shrink-0 ${box} rounded border border-neutral-200 dark:border-neutral-600 overflow-hidden bg-white dark:bg-neutral-900 p-0 block focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer touch-manipulation`}
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
          className="fixed z-[120] overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-xl pointer-events-none dark:border-neutral-600 dark:bg-neutral-900"
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
            <div className="flex items-center justify-center py-8 px-4 text-neutral-400 text-xs">Imagem não carregou</div>
          )}
        </div>
      )}
      {previewMode === "fixo" && previewImgBlock && (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center p-4 sm:p-6" role="dialog" aria-modal="true" aria-label="Visualização da foto">
          <button
            type="button"
            className="absolute inset-0 cursor-default border-0 bg-black/55 p-0"
            aria-label="Fechar"
            onClick={() => setPreviewMode("off")}
          />
          <div className="relative z-[110] w-full max-w-lg rounded-xl border border-neutral-200 bg-white p-2 shadow-2xl dark:border-neutral-600 dark:bg-neutral-900">
            {previewImgBlock}
          </div>
        </div>
      )}
    </div>
  ) : (
    <div
      className={`shrink-0 ${box} rounded border border-dashed border-neutral-200 dark:border-neutral-600 bg-white dark:bg-neutral-900 flex items-center justify-center`}
    >
      <svg xmlns="http://www.w3.org/2000/svg" width={iconSz} height={iconSz} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-neutral-400 dark:text-neutral-500">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <path d="M21 15l-5-5L5 21" />
      </svg>
    </div>
  );

  const actions = (
    <div
      className={`flex flex-col gap-0.5 ${stacked ? "w-full items-center" : ""} ${table ? "min-w-0 justify-center" : ""}`}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={handleUpload}
        disabled={loading}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={loading}
        className={`text-left disabled:opacity-50 touch-manipulation ${
          stacked
            ? "inline-flex h-7 w-full items-center justify-center rounded-lg border border-blue-200 bg-blue-100 px-2.5 text-[11px] font-semibold text-blue-700 shadow-sm hover:bg-blue-200 lg:h-6 lg:rounded-md lg:border-0 lg:bg-transparent lg:px-0 lg:font-medium lg:text-blue-600 lg:shadow-none lg:hover:bg-transparent lg:hover:text-blue-700"
            : table
              ? "whitespace-nowrap text-[11px] font-medium leading-tight text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
              : "text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
        }`}
      >
        {mostraThumb ? "Trocar" : "Enviar"}
      </button>
      {temImagemSalva && (
        <button
          type="button"
          onClick={handleDelete}
          disabled={loading}
          className={`text-left disabled:opacity-50 ${
            stacked
              ? "inline-flex h-7 w-full items-center justify-center rounded-lg border border-red-200 bg-red-100 px-2.5 text-[11px] font-semibold text-red-700 shadow-sm hover:bg-red-200 lg:h-6 lg:rounded-md lg:border-0 lg:bg-transparent lg:px-0 lg:font-medium lg:text-red-600 lg:shadow-none lg:hover:bg-transparent lg:hover:text-red-700"
              : table
                ? "whitespace-nowrap text-[11px] leading-tight text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                : "text-xs text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
          }`}
        >
          Excluir
        </button>
      )}
    </div>
  );

  return (
    <div className={`relative flex flex-col gap-0.5 ${table ? "min-w-0" : ""}`}>
      {stacked ? (
        <div className="flex w-[112px] shrink-0 flex-col items-center gap-1 sm:w-[112px] lg:w-[92px]">
          {thumbBlock}
          {actions}
        </div>
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
        <p className={stacked ? "max-w-[112px] break-words text-center text-[10px] text-red-500 lg:max-w-[92px]" : "text-[10px] text-red-500"}>{erro}</p>
      )}
      {loading && <p className="text-[10px] text-neutral-500 text-center">...</p>}
    </div>
  );
}
