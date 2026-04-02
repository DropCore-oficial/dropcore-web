"use client";

import { useState, useRef, useEffect } from "react";

type Props = {
  skuId: string;
  imagemUrl: string | null;
  onUpdate: (novaUrl: string | null) => void;
  getToken: () => Promise<string | null>;
};

export function FotoVariacaoCell({ skuId, imagemUrl, onUpdate, getToken }: Props) {
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

  return (
    <div className="flex flex-col gap-1 relative">
      <div className="flex items-center gap-2">
        {mostraThumb ? (
          <div className="relative">
            <button
              type="button"
              onMouseEnter={() => setPreviewVisivel(true)}
              onMouseLeave={() => setPreviewVisivel(false)}
              className="shrink-0 w-10 h-10 rounded border border-neutral-200 dark:border-neutral-600 overflow-hidden bg-neutral-100 dark:bg-neutral-800 p-0 block focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
            >
              <img
                src={srcImagem}
                alt="Foto"
                width={40}
                height={40}
                className="w-full h-full object-cover block"
                onError={() => setImgErro(true)}
              />
            </button>
            {previewVisivel && srcImagem && (
              <div
                className="absolute left-full top-0 z-[80] ml-2 rounded-lg overflow-hidden border border-neutral-200 dark:border-neutral-600 bg-white dark:bg-neutral-900 shadow-xl pointer-events-none"
                style={{ width: "220px" }}
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
                  <div className="flex items-center justify-center py-8 px-4 text-neutral-400 text-xs">
                    Imagem não carregou
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="shrink-0 w-10 h-10 rounded border border-dashed border-neutral-300 dark:border-neutral-600 bg-neutral-50 dark:bg-neutral-800/50 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-neutral-400 dark:text-neutral-500">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="M21 15l-5-5L5 21" />
            </svg>
          </div>
        )}
        <div className="flex flex-col gap-0.5">
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
            className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 disabled:opacity-50"
          >
            {mostraThumb ? "Trocar" : "Enviar"}
          </button>
          {mostraThumb && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={loading}
              className="text-xs text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 disabled:opacity-50"
            >
              Apagar
            </button>
          )}
        </div>
      </div>
      {erro && <p className="text-[10px] text-red-500">{erro}</p>}
      {loading && <p className="text-[10px] text-neutral-500">...</p>}
    </div>
  );
}
