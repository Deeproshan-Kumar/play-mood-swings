import { ExternalLink } from "lucide-react";

import { Card } from "@/components/ui";
import { PLAYLIST_TITLE, PLAYLIST_URL } from "@/lib/youtube-config";
import { SyncButton } from "@/app/(app)/music/sync-button";

/**
 * PRD §18 "YouTube". The playlist is fixed app-wide, so this is status and a
 * manual sync — there is nothing to connect or disconnect.
 */
export function YouTubeSettings({
  songCount,
  lastSyncedLabel,
  syncError,
  needsApiKey,
}: {
  songCount: number;
  lastSyncedLabel: string | null;
  syncError: string | null;
  needsApiKey: boolean;
}) {
  return (
    <Card className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium">{PLAYLIST_TITLE}</p>
          <p className="mt-0.5 text-xs text-ink-faint">
            {songCount} {songCount === 1 ? "song" : "songs"}
            {lastSyncedLabel ? ` · Last synced ${lastSyncedLabel}` : " · Never synced"}
          </p>
          <a
            href={PLAYLIST_URL}
            target="_blank"
            rel="noreferrer"
            className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-ink-soft underline underline-offset-4 hover:text-ink"
          >
            Open on YouTube
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
        </div>

        <SyncButton />
      </div>

      {needsApiKey ? (
        <div className="space-y-2 rounded-xl border border-line-strong bg-blush/40 px-4 py-3.5">
          <p className="text-sm text-primary">
            YouTube API key missing — the library can&rsquo;t load yet.
          </p>
          <ol className="list-decimal space-y-1 pl-4 text-xs text-ink-soft">
            <li>
              Google Cloud → <strong>APIs &amp; Services → Library</strong> →
              enable <strong>YouTube Data API v3</strong>
            </li>
            <li>
              <strong>Credentials → Create credentials → API key</strong>
            </li>
            <li>
              Add it to <code className="rounded bg-sunken px-1">.env</code> as{" "}
              <code className="rounded bg-sunken px-1">YOUTUBE_API_KEY=…</code>,
              then restart <code className="rounded bg-sunken px-1">npm run dev</code>
            </li>
          </ol>
          <p className="text-xs text-ink-faint">
            No consent screen, no OAuth client, and nothing to reconnect — the
            key only reads one public playlist.
          </p>
        </div>
      ) : syncError ? (
        <p className="rounded-xl border border-line-strong bg-blush/40 px-4 py-3 text-sm text-primary">
          {syncError}
        </p>
      ) : null}

      <p className="border-t border-line pt-4 text-xs text-ink-faint">
        Add or remove songs in the YouTube playlist itself and press Sync now —
        the library follows it, including order. Songs removed upstream are kept
        but hidden, so any memories attached to them survive.
      </p>
    </Card>
  );
}
