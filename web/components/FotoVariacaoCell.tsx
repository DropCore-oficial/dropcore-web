"use client";

import { useState, useRef, useEffect } from "react";

type Props = {
  skuId: string;
  imagemUrl: string | null;
  onUpdate: (novaUrl: string | null) => void;
  getToken: () => Promise<string | null>;
  /** `stacked`: miniatura em cima e ações em baixo — melhor em listas estreitas (mobile). */
  /** `table`: célula de tabela — miniatura e links alinhados ao centro na linha. */
  variant?: "row" | "stacked" | "table";
};

export function FotoVariacaoCell({ skuId, imagemUrl, onUpdate, getToken, variant = "row" }: Props) {
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [previewVisivel, setPreviewVisivel] = useState(false);
  const [imgErro, setImgErro] = useState(false);
  const [previewImgErro, setPreviewImgErro] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setImgErro(false);
    setPreviewImgErro(false);
  }, [imagemUrl]);

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
      if (!res.ok) throw new Error(j?.error ?? "Erro ao apagar.");
      onUpdate(null);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao apagar.");
    } finally {
      setLoading(false);
    }
  }

  const mostraThumb = imagemUrl && !imgErro;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const usaProxy = Boolean(imagemUrl && supabaseUrl && imagemUrl.startsWith(supabaseUrl));
  const srcImagem = imagemUrl
    ? usaProxy
      ? `/api/fornecedor/produtos/imagem-proxy?url=${encodeURIComponent(imagemUrl)}`
      : imagemUrl
    : "";

  const stacked = variant === "stacked";
  const table = variant === "table";
  const box = stacked ? "w-11 h-11" : table ? "w-9 h-9" : "w-10 h-10";
  const imgPx = stacked ? 44 : table ? 36 : 40;
  const iconSz = stacked ? 18 : table ? 16 : 20;

  const thumbBlock = mostraThumb ? (
    <div className="relative">
      <button
        type="button"
        onMouseEnter={() => setPreviewVisivel(true)}
        onMouseLeave={() => setPreviewVisivel(false)}
        className={`shrink-0 ${box} rounded border border-neutral-200 dark:border-neutral-600 overflow-hidden bg-neutral-100 dark:bg-neutral-800 p-0 block focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer touch-manipulation`}
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
      {previewVisivel && srcImagem && (
        <div
          className={`absolute z-[80] rounded-lg overflow-hidden border border-neutral-200 dark:border-neutral-600 bg-white dark:bg-neutral-900 shadow-xl pointer-events-none ${
            stacked ? "left-1/2 -translate-x-1/2 bottom-full mb-2" : table ? "left-full top-1/2 -translate-y-1/2 ml-2" : "left-full top-0 ml-2"
          }`}
          style={{ width: stacked ? "min(220px, 70vw)" : table ? "min(200px, 40vw)" : "220px" }}
        >
          {!previewImgErro ? (
            <img
              src={srcImagem}
              alt="Preview"
              className="w-full h-auto object-contain block"
              style={{ maxHeight: "280px" }}
              onError={() => setPreviewImgErro(true)}
            />
          ) : (
            <div className="flex items-center justify-center py-8 px-4 text-neutral-400 text-xs">Imagem não carregou</div>
          )}
        </div>
      )}
    </div>
  ) : (
    <div
      className={`shrink-0 ${box} rounded border border-dashed border-neutral-300 dark:border-neutral-600 bg-neutral-50 dark:bg-neutral-800/50 flex items-center justify-center`}
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
        className={`text-left text-blue-600 hover:text-blue-700 disabled:opacity-50 dark:text-blue-400 dark:hover:text-blue-300 touch-manipulation ${
          stacked ? "text-[11px] font-medium" : table ? "whitespace-nowrap text-[11px] font-medium leading-tight" : "text-xs"
        }`}
      >
        {mostraThumb ? "Trocar" : "Enviar"}
      </button>
      {mostraThumb && (
        <button
          type="button"
          onClick={handleDelete}
          disabled={loading}
          className={`text-left text-red-600 hover:text-red-700 disabled:opacity-50 dark:text-red-400 dark:hover:text-red-300 ${
            stacked ? "text-[11px]" : table ? "whitespace-nowrap text-[11px] leading-tight" : "text-xs"
          }`}
        >
          Apagar
        </button>
      )}
    </div>
  );

  return (
    <div className={`relative flex flex-col gap-0.5 ${table ? "min-w-0" : ""}`}>
      {stacked ? (
        <div className="flex w-[52px] shrink-0 flex-col items-center gap-1">
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
        <p className={stacked ? "text-[10px] text-red-500 max-w-[52px] text-center break-words" : "text-[10px] text-red-500"}>{erro}</p>
      )}
      {loading && <p className="text-[10px] text-neutral-500 text-center">…</p>}
    </div>
  );
}
