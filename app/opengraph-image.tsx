import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

import { SITE_NAME, SITE_TAGLINE } from "@/lib/site";

export const alt = `${SITE_NAME} — ${SITE_TAGLINE}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// The same mark as the favicon, so a shared link matches the installed app.
const icon = await readFile(join(process.cwd(), "app/icon.svg"), "base64");
const iconSrc = `data:image/svg+xml;base64,${icon}`;

// Dark romantic palette, lifted from the [data-theme="dark"] block in globals.css.
const INK = "#f7ecee";
const INK_SOFT = "#c4a6ad";
const ROSE = "#f0a3b8";

/**
 * Satori can't read the woff2 files `next/font/google` gives the app, so fetch
 * the TrueType variant of the same families. The old User-Agent is what makes
 * the Google Fonts CSS endpoint hand back `.ttf` instead of `.woff2`.
 */
async function loadGoogleFont(family: string, weight: number) {
  const css = await fetch(
    `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, "+")}:wght@${weight}`,
    {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Linux; U; Android 4.0.3; ko-kr; LG-L160L Build/IML74K) AppleWebkit/534.30 (KHTML, like Gecko) Version/4.0 Mobile Safari/534.30",
      },
    },
  ).then((res) => res.text());

  const url = css.match(/src: url\((.+?)\)/)?.[1];
  if (!url) throw new Error(`No TrueType source for ${family} ${weight}`);

  return fetch(url).then((res) => res.arrayBuffer());
}

// Read once at module scope: the image doesn't vary per request, so it's
// prerendered at build time and this never runs on a user's request.
const fonts = await Promise.all([
  loadGoogleFont("Cormorant Garamond", 600).then((data) => ({
    name: "Cormorant Garamond",
    data,
    weight: 600 as const,
    style: "normal" as const,
  })),
  loadGoogleFont("Inter", 500).then((data) => ({
    name: "Inter",
    data,
    weight: 500 as const,
    style: "normal" as const,
  })),
]).catch((error) => {
  // A card with the fallback font beats a failed build.
  console.warn("[opengraph-image] Falling back to the built-in font:", error);
  return [];
});

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width: "100%",
          height: "100%",
          padding: "72px 80px",
          fontFamily: "Inter",
          color: INK,
          background:
            "linear-gradient(135deg, #140a0e 0%, #2b0f19 38%, #611630 74%, #8b1e3f 100%)",
        }}
      >
        {/* Rose glow, top right — the "soft gradients" of PRD §23. */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            background:
              "radial-gradient(circle at 80% 18%, rgba(196, 69, 105, 0.5) 0%, rgba(196, 69, 105, 0) 62%)",
          }}
        />

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
            <img src={iconSrc} width={76} height={76} alt="" />
            <div
              style={{
                display: "flex",
                fontFamily: "Cormorant Garamond",
                fontSize: 44,
              }}
            >
              <span>Mood&nbsp;</span>
              <span style={{ color: ROSE }}>Swings</span>
            </div>
          </div>

          <div
            style={{
              fontSize: 16,
              letterSpacing: "0.26em",
              textTransform: "uppercase",
              color: INK_SOFT,
            }}
          >
            For two people, only
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            fontFamily: "Cormorant Garamond",
            fontSize: 82,
            lineHeight: 1.08,
          }}
        >
          <div>A little private corner</div>
          <div>of the internet</div>
          <div style={{ color: ROSE }}>that belongs to us.</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
          <div
            style={{
              width: "100%",
              height: 1,
              background: "rgba(247, 236, 238, 0.16)",
            }}
          />
          <div
            style={{
              fontSize: 22,
              letterSpacing: "0.03em",
              color: INK_SOFT,
            }}
          >
            Music · Love notes · Memories · Moods
          </div>
        </div>
      </div>
    ),
    { ...size, fonts: fonts.length ? fonts : undefined },
  );
}
