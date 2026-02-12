import type { Metadata } from "next";
import ConditionalLayout from "@/components/ConditionalLayout";
// Force rebuild for ChunkLoadError fix
import { AuthProvider } from "@/context/AuthContext";
import "./globals.css";

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
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" data-theme="dark" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                const theme = localStorage.getItem('g22-theme') || 'dark';
                document.documentElement.setAttribute('data-theme', theme);
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
