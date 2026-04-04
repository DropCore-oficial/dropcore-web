import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "DropCore",
  description: "Hub de gestão para sellers e fornecedores",
  icons: { icon: "/logo-icon.png", apple: "/logo-icon.png" },
};

/** Mobile: evita zoom por pinça e ajuda a não “puxar” a página na horizontal (calculadora / PWA-like). */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

const themeScript = `
(function() {
  const stored = localStorage.getItem('dropcore-theme');
  const theme = stored === 'dark' || stored === 'light' ? stored : 'dark';
  if (theme === 'dark') document.documentElement.classList.add('dark');
  else document.documentElement.classList.remove('dark');
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        style={{ background: "var(--background)", color: "var(--foreground)" }}
      >
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
