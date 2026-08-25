import "server-only";

import { db } from "@/lib/db";
import { Prisma } from "@/lib/generated/prisma/client";
import { PLAYLIST_ID } from "@/lib/youtube-config";
import { listPlaylistTracks } from "@/lib/youtube";

/**
 * Playlist synchronisation (PRD §7).
 *
 * YouTube has no "playlist changed" subscription, so we reconcile on demand:
 * when the Music page opens and when someone presses Sync Now.
 *
 * Songs that disappear upstream are marked unavailable rather than deleted —
 * a couple's memories and favourites hang off these rows, and losing a memory
 * because a video was taken down would be the worst possible bug in this app.
 */

export type SyncResult = {
  added: number;
  removed: number;
  restored: number;
  reordered: number;
  total: number;
};

export class SyncError extends Error {}

/**
 * The columns we mirror from YouTube. A row is only written when one of these
 * has actually drifted, so a steady-state sync issues no writes at all.
 */
type MirroredSong = {
  id: string;
  position: number;
  title: string;
  artist: string | null;
  thumbnail: string | null;
  duration: number | null;
  isAvailable: boolean;
};

function drifted(current: MirroredSong, next: MirroredSong) {
  return (
    current.position !== next.position ||
    current.title !== next.title ||
    current.artist !== next.artist ||
    current.thumbnail !== next.thumbnail ||
    current.duration !== next.duration ||
    current.isAvailable !== next.isAvailable
  );
}

/**
 * Applies every drifted row in one statement.
 *
 * Prisma has no bulk update that takes per-row values, and `song.update()` per
 * row meant ~85 sequential round-trips to the Supabase pooler inside a single
 * transaction — well past its 5s budget, so the sync aborted mid-write.
 *
 * `updatedAt` is set by hand because `@updatedAt` is applied by Prisma Client,
 * which raw SQL bypasses. Identifiers are quoted so `position` cannot be read
 * as the SQL function of the same name.
 */
function bulkUpdateSongs(rows: MirroredSong[]) {
  const values = rows.map(
    (row) => Prisma.sql`(
      ${row.id}::text,
      ${row.position}::int,
      ${row.title}::text,
      ${row.artist}::text,
      ${row.thumbnail}::text,
      ${row.duration}::int,
      ${row.isAvailable}::boolean
    )`,
  );

  return db.$executeRaw(Prisma.sql`
    UPDATE "Song" AS s
    SET "position" = v."position",
        "title" = v."title",
        "artist" = v."artist",
        "thumbnail" = v."thumbnail",
        "duration" = v."duration",
        "isAvailable" = v."isAvailable",
        "updatedAt" = NOW()
    FROM (VALUES ${Prisma.join(values, ", ")})
      AS v("id", "position", "title", "artist", "thumbnail", "duration", "isAvailable")
    WHERE s."id" = v."id"
  `);
}

export async function syncPlaylist(coupleId: string): Promise<SyncResult> {
  await db.couple.update({
    where: { id: coupleId },
    data: { playlistSyncStatus: "SYNCING", playlistSyncError: null },
  });

  try {
    const tracks = await listPlaylistTracks(PLAYLIST_ID);

    const existing = await db.song.findMany({
      where: { coupleId },
      select: {
        id: true,
        youtubeVideoId: true,
        position: true,
        title: true,
        artist: true,
        thumbnail: true,
        duration: true,
        isAvailable: true,
      },
    });

    const existingByVideoId = new Map(existing.map((s) => [s.youtubeVideoId, s]));
    const incomingIds = new Set(tracks.map((t) => t.videoId));

    const result: SyncResult = {
      added: 0,
      removed: 0,
      restored: 0,
      reordered: 0,
      total: tracks.length,
    };

    const additions: Prisma.SongCreateManyInput[] = [];
    const updates: MirroredSong[] = [];

    // Additions, reordering, and metadata drift.
    for (const [index, track] of tracks.entries()) {
      const current = existingByVideoId.get(track.videoId);

      if (!current) {
        result.added += 1;
        additions.push({
          coupleId,
          youtubeVideoId: track.videoId,
          title: track.title,
          artist: track.artist,
          thumbnail: track.thumbnail,
          duration: track.duration,
          position: index,
          isAvailable: track.isAvailable,
          addedAt: track.addedAt,
        });
        continue;
      }

      if (current.position !== index) result.reordered += 1;
      if (!current.isAvailable && track.isAvailable) result.restored += 1;

      const next: MirroredSong = {
        id: current.id,
        position: index,
        title: track.title,
        artist: track.artist,
        thumbnail: track.thumbnail,
        duration: track.duration,
        isAvailable: track.isAvailable,
      };

      if (drifted(current, next)) updates.push(next);
    }

    // Removals — kept as rows, flagged unavailable.
    const vanished = existing.filter(
      (song) => !incomingIds.has(song.youtubeVideoId) && song.isAvailable,
    );

    // At most three statements, whatever the playlist size: the transaction is
    // bounded by round-trips, not by how many songs moved.
    const writes: Prisma.PrismaPromise<unknown>[] = [];

    if (additions.length > 0) {
      writes.push(db.song.createMany({ data: additions }));
    }

    if (updates.length > 0) {
      writes.push(bulkUpdateSongs(updates));
    }

    if (vanished.length > 0) {
      result.removed = vanished.length;
      writes.push(
        db.song.updateMany({
          where: { id: { in: vanished.map((s) => s.id) } },
          data: { isAvailable: false },
        }),
      );
    }

    if (writes.length > 0) {
      await db.$transaction(writes);
    }

    await db.couple.update({
      where: { id: coupleId },
      data: {
        playlistSyncStatus: "SUCCESS",
        playlistSyncError: null,
        playlistLastSyncedAt: new Date(),
      },
    });

    return result;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Sync failed for an unknown reason.";

    await db.couple.update({
      where: { id: coupleId },
      data: { playlistSyncStatus: "ERROR", playlistSyncError: message },
    });

    throw new SyncError(message);
  }
}

/** Debounce for the open-the-page sync so navigation doesn't burn quota. */
const AUTO_SYNC_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Whether the library is due a refresh (PRD §7).
 *
 * The Music page checks this and hands the answer to a client component, which
 * runs the sync *after* paint. Awaiting the sync during render would block the
 * page on four YouTube round-trips every five minutes — the library is already
 * in Postgres, so there is no reason to make anyone wait for it.
 */
export async function isPlaylistStale(coupleId: string): Promise<boolean> {
  const couple = await db.couple.findUnique({
    where: { id: coupleId },
    select: { playlistLastSyncedAt: true, playlistSyncStatus: true },
  });

  if (!couple || couple.playlistSyncStatus === "SYNCING") return false;

  return (
    !couple.playlistLastSyncedAt ||
    Date.now() - couple.playlistLastSyncedAt.getTime() > AUTO_SYNC_INTERVAL_MS
  );
}
