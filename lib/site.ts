/**
 * Shared identity for the app's metadata — title, tagline, and canonical origin.
 *
 * Open Graph and Twitter cards need absolute URLs, and `export const metadata`
 * is static, so it can't derive the host from request headers the way
 * app/onboarding/invite/page.tsx does. The origin has to come from the
 * environment instead.
 */

export const SITE_NAME = "Mood Swings";

export const SITE_TAGLINE =
  "A little private corner of the internet that belongs to us.";

/** PRD §28 — what the app is, for anyone who sees a link before signing in. */
export const SITE_DESCRIPTION =
  "A private space for two people in love, where your YouTube playlist becomes the soundtrack to your memories, messages, and relationship.";

/** Treat blank env values as unset — `.env.example` ships keys with `""`. */
function clean(value: string | undefined) {
  const trimmed = value?.trim().replace(/\/+$/, "");
  return trimmed || undefined;
}

export const SITE_URL =
  clean(process.env.NEXT_PUBLIC_APP_URL) ??
  // Set on every Vercel deployment, pointing at the production domain.
  (clean(process.env.VERCEL_PROJECT_PRODUCTION_URL)
    ? `https://${clean(process.env.VERCEL_PROJECT_PRODUCTION_URL)}`
    : undefined) ??
  "http://localhost:3000";
