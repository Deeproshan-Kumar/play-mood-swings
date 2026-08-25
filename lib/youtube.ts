import "server-only";

import { cleanArtist, parseISODuration, pickThumbnail } from "@/lib/youtube-parse";

/**
 * YouTube Data API v3 access (PRD §6, §7).
 *
 * The app plays one public playlist (see `lib/youtube-config.ts`), so reads use
 * a plain server-side API key. No OAuth, no per-user tokens, nothing stored —
 * which keeps PRD §20 trivially satisfied: there are no user credentials here
 * to leak. The key never reaches the browser.
 *
 * We store YouTube metadata only, never audio (PRD §6).
 */

const API = "https://www.googleapis.com/youtube/v3";

export class YouTubeConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "YouTubeConfigError";
  }
}

export class YouTubeApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "YouTubeApiError";
  }
}

function apiKey(): string {
  const key = process.env.YOUTUBE_API_KEY;

  if (!key) {
    throw new YouTubeConfigError(
      "YOUTUBE_API_KEY is not set. Create one in Google Cloud (enable YouTube Data API v3 → Credentials → API key) and add it to .env.",
    );
  }

  return key;
}

async function ytFetch<T>(
  path: string,
  params: Record<string, string>,
): Promise<T> {
  const url = new URL(`${API}/${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  url.searchParams.set("key", apiKey());

  const response = await fetch(url, {
    // The playlist changes upstream; never serve this from a cache.
    cache: "no-store",
  });

  if (response.status === 400 || response.status === 403) {
    const body = await response.text();

    if (body.includes("API_KEY_INVALID") || body.includes("keyInvalid")) {
      throw new YouTubeConfigError(
        "That YouTube API key was rejected. Check YOUTUBE_API_KEY in .env.",
      );
    }
    if (body.includes("accessNotConfigured") || body.includes("SERVICE_DISABLED")) {
      throw new YouTubeConfigError(
        "YouTube Data API v3 isn't enabled for this key's Google Cloud project.",
      );
    }
    if (body.includes("quotaExceeded")) {
      throw new YouTubeApiError(
        "YouTube's daily quota for this key is used up. It resets at midnight Pacific.",
      );
    }
    if (body.includes("ipRefererBlocked") || body.includes("REQUEST_DENIED")) {
      throw new YouTubeConfigError(
        "This API key has referrer/IP restrictions that block server calls. Set its restriction to 'None' or restrict by IP.",
      );
    }

    throw new YouTubeApiError(`YouTube rejected the request (${response.status}).`);
  }

  if (response.status === 404) {
    throw new YouTubeApiError(
      "That playlist could not be found. Make sure it is public or unlisted, not private.",
    );
  }

  if (!response.ok) {
    throw new YouTubeApiError(
      `YouTube API error (${response.status}). Please try again in a moment.`,
    );
  }

  return (await response.json()) as T;
}

// ── Playlist items ───────────────────────────────────────────

export type YouTubeTrack = {
  videoId: string;
  title: string;
  artist: string | null;
  thumbnail: string | null;
  position: number;
  duration: number | null;
  isAvailable: boolean;
  addedAt: Date;
};

type PlaylistItemsResponse = {
  nextPageToken?: string;
  items: Array<{
    snippet: {
      title: string;
      publishedAt: string;
      position: number;
      videoOwnerChannelTitle?: string;
      thumbnails?: Record<string, { url: string }>;
      resourceId: { videoId: string };
    };
    status?: { privacyStatus?: string };
  }>;
};

type VideosResponse = {
  items: Array<{
    id: string;
    contentDetails?: { duration?: string };
  }>;
};

/** Every track in the playlist, in order, with durations resolved. */
export async function listPlaylistTracks(
  playlistId: string,
): Promise<YouTubeTrack[]> {
  const tracks: YouTubeTrack[] = [];
  let pageToken: string | undefined;

  do {
    const page = await ytFetch<PlaylistItemsResponse>("playlistItems", {
      part: "snippet,status",
      playlistId,
      maxResults: "50",
      ...(pageToken ? { pageToken } : {}),
    });

    for (const item of page.items ?? []) {
      const videoId = item.snippet.resourceId?.videoId;
      if (!videoId) continue;

      const privacy = item.status?.privacyStatus;
      const title = item.snippet.title;

      // YouTube keeps removed entries in the playlist with a placeholder title.
      const isAvailable =
        title !== "Deleted video" &&
        title !== "Private video" &&
        privacy !== "private";

      tracks.push({
        videoId,
        title,
        artist: cleanArtist(item.snippet.videoOwnerChannelTitle),
        thumbnail: pickThumbnail(item.snippet.thumbnails),
        position: item.snippet.position,
        duration: null,
        isAvailable,
        addedAt: new Date(item.snippet.publishedAt),
      });
    }

    pageToken = page.nextPageToken;
  } while (pageToken);

  await attachDurations(tracks);

  return tracks.sort((a, b) => a.position - b.position);
}

/** `videos.list` accepts up to 50 ids per call. */
async function attachDurations(tracks: YouTubeTrack[]) {
  const ids = tracks.filter((t) => t.isAvailable).map((t) => t.videoId);
  const byId = new Map<string, number>();

  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50);
    const page = await ytFetch<VideosResponse>("videos", {
      part: "contentDetails",
      id: batch.join(","),
    });

    for (const item of page.items ?? []) {
      const seconds = parseISODuration(item.contentDetails?.duration);
      if (seconds !== null) byId.set(item.id, seconds);
    }
  }

  for (const track of tracks) {
    track.duration = byId.get(track.videoId) ?? null;
  }
}
