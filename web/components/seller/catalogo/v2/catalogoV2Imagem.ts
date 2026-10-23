import { publicProxiedCatalogoImageSrc } from "@/lib/supabaseStorageImageUrl";

/**
 * URL para <img> / Next Image: Supabase do projeto passa pelo proxy (CSP + CORS).
 * Usa o proxy público (sem sessão) porque o `next/image` interno (`/_next/image`) faz um
 * fetch de origem sem repassar cookie — contra o proxy do fornecedor (que exige sessão no
 * middleware) isso sempre voltava 401 e a miniatura caía no placeholder. A imagem em si não
 * é sensível (Storage já público), então não há perda de segurança em não exigir sessão aqui.
 */
export function catalogoV2UrlImagem(imagemUrl: string | null): string | null {
  return publicProxiedCatalogoImageSrc(imagemUrl, 384);
}
