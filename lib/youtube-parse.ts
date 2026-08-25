/**
 * Pure YouTube parsing helpers.
 *
 * Kept out of `lib/youtube.ts` so they can be imported (and tested) without
 * pulling in the `server-only` API client.
 */

/** `PT1H2M11S` → 3731 seconds. Returns null for absent or malformed input. */
export function parseISODuration(iso: string | undefined): number | null {
  if (!iso) return null;

  const match = /^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
  if (!match) return null;

  const [, d, h, m, s] = match;

  // A bare "PT" matches the pattern but carries no duration.
  if (d === undefined && h === undefined && m === undefined && s === undefined) {
    return null;
  }

  return (
    Number(d ?? 0) * 86400 +
    Number(h ?? 0) * 3600 +
    Number(m ?? 0) * 60 +
    Number(s ?? 0)
  );
}

/**
 * Picks a thumbnail sized for how we actually display it.
 *
 * Deliberately skips `maxres` (1280×720) and `standard` (640×480): the largest
 * on-screen use is a 112px card and the expanded player shows the real YouTube
 * iframe, not this image. Across a playlist of ~85 songs, preferring `high`
 * (480×360) over `maxres` cuts the image payload by roughly an order of
 * magnitude for no visible difference.
 */
export function pickThumbnail(
  thumbnails: Record<string, { url: string }> | undefined,
): string | null {
  if (!thumbnails) return null;

  for (const size of ["high", "medium", "default"]) {
    const found = thumbnails[size]?.url;
    if (found) return found;
  }

  return null;
}

/** Auto-generated music channels are named "Artist - Topic". */
export function cleanArtist(channelTitle: string | undefined): string | null {
  if (!channelTitle) return null;
  return channelTitle.replace(/\s*-\s*Topic$/, "").trim() || null;
}

/**
 * Accepts a full YouTube URL or a bare playlist id.
 * Returns null when no plausible playlist id is present.
 */
export function extractPlaylistId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed);
    const listParam = url.searchParams.get("list");
    return listParam || null;
  } catch {
    // Not a URL — fall through to the bare-id check.
  }

  if (/^[A-Za-z0-9_-]{12,}$/.test(trimmed)) {
    return trimmed;
  }

  return null;
}
