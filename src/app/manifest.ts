import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "StudyBuddie",
    short_name: "StudyBuddie",
    description: "StudyBuddie helps you find a study partner at a public campus building.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f2f9ff",
    theme_color: "#ff8a1f",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
