import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Analytics } from "@vercel/analytics/next";
import ChunkLoadRecovery from "@/components/ChunkLoadRecovery";
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

function AppShellFallback() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "#0f1117",
        color: "#f8fafc",
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      <div
        style={{
          display: "grid",
          gap: 14,
          justifyItems: "center",
        }}
      >
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            display: "grid",
            placeItems: "center",
            background: "#f8fafc",
            color: "#111827",
            fontWeight: 900,
            fontSize: 24,
          }}
        >
          G
        </div>
        <div style={{ fontSize: 14, opacity: 0.78 }}>Cargando G22 Scores</div>
      </div>
    </div>
  );
}

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
        <ChunkLoadRecovery />
        <AuthProvider>
          <Suspense fallback={<AppShellFallback />}>
            <ConditionalLayout>{children}</ConditionalLayout>
          </Suspense>
        </AuthProvider>
        <Analytics />
      </body>
    </html>
  );
}
