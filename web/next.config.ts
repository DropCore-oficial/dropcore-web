import type { NextConfig } from "next";
import path from "path";

const securityHeaders = [
  // Impede que a página seja carregada em iframes (clickjacking)
  { key: "X-Frame-Options", value: "DENY" },
  // Impede que o browser faça MIME sniffing
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Controla informação enviada no header Referer
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Força HTTPS por 1 ano (habilitar após certificar que o site roda 100% em HTTPS)
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  // Desativa APIs de hardware desnecessárias
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // Content Security Policy básica — ajustar conforme CDNs e scripts de terceiros usados
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // Mercado Pago Bricks (cartão): sdk + secure fields + API + mlstatic
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://sdk.mercadopago.com https://http2.mlstatic.com https://*.mlstatic.com",
      "style-src 'self' 'unsafe-inline' https://sdk.mercadopago.com https://http2.mlstatic.com https://*.mlstatic.com",
      `connect-src 'self' ${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""} https://*.supabase.co wss://*.supabase.co https://viacep.com.br https://api.mercadopago.com https://*.mercadopago.com https://api.mercadolibre.com https://*.mercadolibre.com https://http2.mlstatic.com https://*.mlstatic.com`,
      "img-src 'self' data: blob: https://*.supabase.co https://http2.mlstatic.com https://*.mlstatic.com https://*.mercadopago.com",
      "font-src 'self' data: https://http2.mlstatic.com https://*.mlstatic.com",
      "worker-src 'self' blob:",
      "child-src 'self' https://www.mercadopago.com https://*.mercadopago.com https://www.mercadolibre.com https://*.mercadolibre.com",
      "frame-src 'self' https://www.mercadopago.com https://*.mercadopago.com https://www.mercadolibre.com https://*.mercadolibre.com",
      "frame-ancestors 'none'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Monorepo: lockfile na raiz do repo; tracing deve ancorar em web/
  outputFileTracingRoot: path.join(process.cwd()),
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
