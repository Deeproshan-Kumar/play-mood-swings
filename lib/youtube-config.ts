import { extractPlaylistId } from "@/lib/youtube-parse";

/**
 * The one playlist this app plays.
 *
 * Mood Swings is a private app for two people, so there is exactly one
 * playlist — no connect flow, no picker, no per-couple configuration.
 *
 * To point it elsewhere, set YOUTUBE_PLAYLIST_ID in .env to either a bare
 * playlist id or a full YouTube URL; both are accepted.
 */
const DEFAULT_PLAYLIST_ID = "PLS_xDUe-dkeDregcfTw9Wu8jZ2bGfgT6U";

const configured = process.env.YOUTUBE_PLAYLIST_ID?.trim();

export const PLAYLIST_ID =
  (configured ? extractPlaylistId(configured) : null) ?? DEFAULT_PLAYLIST_ID;

export const PLAYLIST_URL = `https://www.youtube.com/playlist?list=${PLAYLIST_ID}`;

/** Shown as the library heading. The playlist's own name, as you titled it. */
export const PLAYLIST_TITLE = "Mood Swings";
