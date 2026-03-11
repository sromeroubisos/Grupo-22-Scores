import type { Metadata, Viewport } from "next";
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
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet" />
        <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                const theme = localStorage.getItem('g22-theme') || 'dark';
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
      <body>
        <AuthProvider>
          <ConditionalLayout>{children}</ConditionalLayout>
        </AuthProvider>
      </body>
    </html>
  );
}
