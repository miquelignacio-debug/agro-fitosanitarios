import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Agro Fitosanitarios",
    short_name: "AgroFito",
    description: "Gestión de aplicaciones fitosanitarias agrícolas",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#1a4731",
    orientation: "portrait",
    categories: ["productivity"],
    icons: [
      {
        src: "/api/icon?size=192",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/api/icon?size=512",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
