import type { MetadataRoute } from "next";
import { appIconHref, appIconMimeType } from "@/lib/appBranding";

export default function manifest(): MetadataRoute.Manifest {
  const src = appIconHref();
  const type = appIconMimeType();

  return {
    name: "G22 Scores",
    short_name: "G22",
    description: "Plataforma Oficial de Torneos Deportivos",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#000000",
    theme_color: "#8fff00",
    icons: [
      { src, sizes: "192x192", type },
      { src, sizes: "512x512", type },
    ],
  };
}
