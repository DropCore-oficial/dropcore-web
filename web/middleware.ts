// web/middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getSiteUrl } from "@/lib/siteUrl";

/**
 * Produção no URL *.vercel.app (ex.: dropcore-web.vercel.app) → domínio canónico.
 * Previews com -git- no hostname (branch deploy) não redirecionam.
 * Defina NEXT_PUBLIC_APP_URL na Vercel = URL oficial (ex.: https://www.dropcore.com.br).
 */
function redirectVercelProductionToCanonical(req: NextRequest): NextResponse | null {
  if (process.env.NODE_ENV !== "production") return null;

  const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "").toLowerCase();
  if (!host.endsWith(".vercel.app")) return null;
  if (host.includes("-git-")) return null;

  let canonicalOrigin: string;
  try {
    canonicalOrigin = new URL(getSiteUrl()).origin;
  } catch {
    return null;
  }

  const canonicalHost = new URL(canonicalOrigin).hostname.toLowerCase();
  if (host === canonicalHost) return null;

  const dest = new URL(req.nextUrl.pathname + req.nextUrl.search, canonicalOrigin);
  return NextResponse.redirect(dest, 308);
}

function redirectBlingOAuthTrailingDot(req: NextRequest): NextResponse | null {
  const { pathname, search } = req.nextUrl;
  if (!pathname.endsWith(".")) return null;
  const normalized = pathname.replace(/\.+$/, "");
  if (normalized === pathname) return null;
  const dest = new URL(normalized + search, req.url);
  return NextResponse.redirect(dest, 307);
}

export async function middleware(req: NextRequest) {
  const canonicalRedirect = redirectVercelProductionToCanonical(req);
  if (canonicalRedirect) return canonicalRedirect;

  const blingOAuthRedirect = redirectBlingOAuthTrailingDot(req);
  if (blingOAuthRedirect) return blingOAuthRedirect;

  let res = NextResponse.next();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            res.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  let user = null;
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error) {
      console.warn("[middleware] getUser:", error.message);
    } else {
      user = data.user;
    }
  } catch (e) {
    // Rede/DNS/TLS ou projeto Supabase indisponível — não rebentar o pedido; trata como sem sessão.
    const msg = e instanceof Error ? e.message : String(e);
    const cause = e instanceof Error && "cause" in e && e.cause ? String(e.cause) : "";
    console.warn("[middleware] getUser fetch falhou:", msg, cause || "");
  }

  const path = req.nextUrl.pathname;

  // Rotas de UI que exigem sessão ativa
  const rotasProtegidas =
    path.startsWith("/dashboard") ||
    path.startsWith("/admin") ||
    path.startsWith("/catalogo") ||
    path.startsWith("/org");

  // Fornecedor e seller: proteger dashboard e páginas internas (exceto login/register)
  const isFornecedorProtegido =
    (path.startsWith("/fornecedor") &&
      !path.startsWith("/fornecedor/login") &&
      !path.startsWith("/fornecedor/register"));
  const isSellerProtegido =
    path.startsWith("/seller") &&
    !path.startsWith("/seller/login") &&
    !path.startsWith("/seller/register") &&
    !path.startsWith("/seller/reset-password") &&
    // Rota da calculadora do seller é controlada por /api/calculadora/me,
    // então não depende da sessão por cookie no middleware.
    !path.startsWith("/seller/calculadora");

  /** DropCore Calculadora: rotas internas exigem sessão; públicas: login e cadastro por convite */
  const isCalculadoraProtegido =
    path.startsWith("/calculadora") &&
    !path.startsWith("/calculadora/login") &&
    !path.startsWith("/calculadora/register");

  if (
    (rotasProtegidas ||
      isFornecedorProtegido ||
      isSellerProtegido ||
      isCalculadoraProtegido) &&
    !user
  ) {
    // Redirecionar para o login correto conforme o contexto
    if (isFornecedorProtegido) {
      return NextResponse.redirect(new URL("/fornecedor/login", req.url));
    }
    if (isCalculadoraProtegido) {
      return NextResponse.redirect(new URL("/calculadora/login", req.url));
    }
    if (isSellerProtegido) {
      // Se o usuário tentar acessar diretamente a calculadora do seller sem sessão,
      // prefere o login da calculadora (produto independente) em vez do login seller.
      if (path.startsWith("/seller/calculadora")) {
        return NextResponse.redirect(new URL("/calculadora/login", req.url));
      }
      return NextResponse.redirect(new URL("/seller/login", req.url));
    }
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // Segunda camada: rotas /api/org, /api/seller e /api/fornecedor exigem autenticação
  // (os handlers fazem a autorização detalhada, mas sem sessão nem token rejeitamos cedo)
  // Exceção: invite/[token] é chamado sem auth (usuário completando cadastro)
  const isInviteRoute =
    /^\/api\/(fornecedor|seller)\/invite\/[^/]+$/.test(path);
  const isApiProtected =
    (path.startsWith("/api/org/") ||
      path.startsWith("/api/seller/") ||
      path.startsWith("/api/fornecedor/")) &&
    !isInviteRoute;
  if (isApiProtected && !user) {
    // Verifica se há Bearer token no header (sellers/fornecedores usam token, não cookie)
    const authHeader = req.headers.get("authorization");
    const hasBearer = authHeader?.startsWith("Bearer ") ?? false;
    if (!hasBearer) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }
  }

  return res;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
