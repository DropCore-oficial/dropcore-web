import { permanentRedirect } from "next/navigation";

/** Catálogo unificado em `/seller/produtos`. */
export default function SellerCatalogoRedirectPage() {
  permanentRedirect("/seller/produtos");
}
