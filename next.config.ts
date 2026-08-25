import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Song artwork comes from YouTube's CDN. Declared so `next/image` accepts
    // these hosts; the thumbnails are already well-compressed JPEGs at the
    // sizes we request, so they're rendered `unoptimized` rather than paying
    // for a re-encode that saves almost nothing.
    remotePatterns: [
      { protocol: "https", hostname: "i.ytimg.com" },
      { protocol: "https", hostname: "img.youtube.com" },
      { protocol: "https", hostname: "yt3.ggpht.com" },
      // Clerk-hosted avatars.
      { protocol: "https", hostname: "img.clerk.com" },
    ],
  },

  // Trim the response of a header that only advertises the framework version.
  poweredByHeader: false,

  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          // The worker must never be served stale, or clients pin an old
          // caching policy indefinitely.
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        // This app is private by construction; keep it out of framing and
        // stop referrers leaking invite links to third parties.
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
