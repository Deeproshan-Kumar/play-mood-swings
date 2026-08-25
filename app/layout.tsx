import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Inter } from "next/font/google";
import { cookies } from "next/headers";
import { ClerkProvider } from "@clerk/nextjs";

import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";
import { THEME_COOKIE, resolveTheme } from "@/lib/theme";
import { ServiceWorkerRegistrar } from "@/components/pwa";

import "./globals.css";

// PRD §23: "an elegant serif for romantic headings and a clean sans-serif for UI".
const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  style: ["normal", "italic"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  // Cards need absolute URLs; every relative one below resolves against this.
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Mood Swings",
    template: "%s · Mood Swings",
  },
  description: "A little private corner of the internet that belongs to us.",
  applicationName: "Mood Swings",
  // A private space for two people — never index it. Link previews still work:
  // the card below is deliberately generic, so sharing an invite unfurls
  // without leaking anything about the couple behind it (PRD §20).
  robots: { index: false, follow: false },
  // og:image and twitter:image are wired up automatically from
  // app/opengraph-image.tsx and app/twitter-image.tsx.
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    url: "/",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
  },
  appleWebApp: {
    capable: true,
    title: "Mood Swings",
    statusBarStyle: "default",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fff8f5" },
    { media: "(prefers-color-scheme: dark)", color: "#140a0e" },
  ],
  // Let content sit under the notch when installed to the home screen.
  viewportFit: "cover",
  initialScale: 1,
  width: "device-width",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const theme = resolveTheme((await cookies()).get(THEME_COOKIE)?.value);

  return (
    <ClerkProvider>
      <html
        lang="en"
        data-theme={theme}
        className={`${cormorant.variable} ${inter.variable} h-full antialiased`}
        suppressHydrationWarning
      >
        <body className="min-h-full flex flex-col">
          {children}
          <ServiceWorkerRegistrar />
        </body>
      </html>
    </ClerkProvider>
  );
}
