import { permanentRedirect } from "next/navigation";

/** A landing pública virou a home (`app/page.tsx`) — redirect 308 permanente pra quem já tinha
 * link salvo ou compartilhado apontando pra `/landing`. */
export default function LandingRedirect() {
  permanentRedirect("/");
}
