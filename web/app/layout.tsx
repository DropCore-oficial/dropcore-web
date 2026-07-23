import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import { SiteFooter } from "@/components/SiteFooter";
import { getSiteUrl } from "@/lib/siteUrl";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteUrl = getSiteUrl();

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "DropCore",
    template: "%s | DropCore",
  },
  description: "Hub de gestão para sellers e fornecedores",
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: "DropCore",
    title: "DropCore",
    description: "Hub de gestão para sellers e fornecedores",
    url: siteUrl,
  },
  twitter: {
    card: "summary_large_image",
    title: "DropCore",
    description: "Hub de gestão para sellers e fornecedores",
  },
};

/** Mobile: evita zoom por pinça e ajuda a não “puxar” a página na horizontal (calculadora / PWA-like). */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

const themeScript = `
(function() {
  const stored = localStorage.getItem('dropcore-theme');
  const theme = stored === 'dark' || stored === 'light' ? stored : 'light';
  if (theme === 'dark') document.documentElement.classList.add('dark');
  else document.documentElement.classList.remove('dark');
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Padrão claro no HTML; o script no <head> aplica dark só se houver preferência salva (evita flash).
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased flex min-h-dvh flex-col`}
        style={{ background: "var(--background)", color: "var(--foreground)" }}
      >
        <ThemeProvider>
          <div className="flex min-h-dvh flex-col">
            {children}
            <SiteFooter />
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
