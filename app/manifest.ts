import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Mood Swings",
    short_name: "Mood Swings",
    description: "A little private corner of the internet that belongs to us.",
    start_url: "/home",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#fff8f5",
    theme_color: "#8b1e3f",
    categories: ["music", "lifestyle"],
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        // Full-bleed variant so Android can crop it to any silhouette.
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      { name: "Music", url: "/music", description: "Our playlist" },
      { name: "Love notes", url: "/love", description: "Write something" },
      { name: "Memories", url: "/memories", description: "Our moments" },
    ],
  };
}
