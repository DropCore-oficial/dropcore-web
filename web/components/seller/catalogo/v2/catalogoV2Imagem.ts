import { proxiedCatalogoImageSrc } from "@/lib/supabaseStorageImageUrl";

/** URL para <img> / Next Image: Supabase do projeto passa pelo proxy (CSP + CORS). */
export function catalogoV2UrlImagem(imagemUrl: string | null): string | null {
  return proxiedCatalogoImageSrc(imagemUrl, 384);
}
