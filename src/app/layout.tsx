import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Analytics } from "@vercel/analytics/next";
import ConditionalLayout from "@/components/ConditionalLayout";
// Force rebuild for ChunkLoadError fix
import { AuthProvider } from "@/context/AuthContext";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export const metadata: Metadata = {
  title: "G22 Scores - Plataforma Oficial de Torneos Deportivos",
  description: "La plataforma oficial para torneos deportivos. Resultados en tiempo real, estadísticas confiables y experiencia profesional para fans, clubes y federaciones.",
  keywords: ["torneos", "deportes", "resultados", "fixtures", "rugby", "fútbol", "rankings", "estadísticas"],
  authors: [{ name: "G22 Scores" }],
  openGraph: {
    title: "G22 Scores - Plataforma Oficial de Torneos Deportivos",
    description: "Resultados en tiempo real, estadísticas confiables y experiencia profesional para fans, clubes y federaciones.",
    type: "website",
    locale: "es_AR",
    siteName: "G22 Scores",
  },
  twitter: {
    card: "summary_large_image",
    title: "G22 Scores - Plataforma Oficial de Torneos Deportivos",
    description: "Resultados en tiempo real, estadísticas confiables y experiencia profesional.",
  },
  icons: {
    icon: "/icon.png",
    shortcut: "/icon.png",
    apple: "/icon.png",
  },
  manifest: "/manifest.json",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" data-theme="dark" className="dark" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://use.typekit.net" />
        <link rel="preconnect" href="https://p.typekit.net" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Outfit:wght@300;400;500;600;700;800;900&family=Inter:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600;700&family=Tangerine:wght@400;700&family=Inconsolata:wght@200..900&family=Cantarell:wght@400;700&family=Roboto+Mono:wght@400;500;700&family=Rancho&display=swap"
          rel="stylesheet"
        />
        <link href="https://use.typekit.net/zkk5abl.css" rel="stylesheet" />
        <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                const savedTheme = localStorage.getItem('g22-theme');
                const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
                const theme = savedTheme || (prefersDark ? 'dark' : 'light');
                document.documentElement.setAttribute('data-theme', theme);
                if (theme === 'dark') {
                  document.documentElement.classList.add('dark');
                } else {
                  document.documentElement.classList.remove('dark');
                }
              })();
            `,
          }}
        />
      </head>
      <body suppressHydrationWarning>
        <AuthProvider>
          <Suspense fallback={null}>
            <ConditionalLayout>{children}</ConditionalLayout>
          </Suspense>
        </AuthProvider>
        <Analytics />
      </body>
    </html>
  );
}
