import { db } from "@/lib/db";
import { requireCoupleContext } from "@/lib/auth";
import { isPlaylistStale } from "@/lib/sync";
import { PLAYLIST_TITLE } from "@/lib/youtube-config";
import { MusicLibrary } from "./music-library";

export const metadata = { title: "Music" };

/** PRD §6/§7 — the playlist is the library, reconciled when this page opens. */
export default async function MusicPage({ searchParams }: PageProps<"/music">) {
  const { user, couple, partner } = await requireCoupleContext();

  // Checked here, acted on after paint by <BackgroundSync> (PRD §7).
  const stale = await isPlaylistStale(couple.id);

  const { mood: moodParam } = await searchParams;
  const initialMoodId = typeof moodParam === "string" ? moodParam : null;

  const [songs, moods, syncState, unavailableCount] = await Promise.all([
    db.song.findMany({
      where: { coupleId: couple.id, isAvailable: true },
      orderBy: { position: "asc" },
      include: {
        moodTags: { select: { moodId: true } },
        favorites: { select: { userId: true } },
        memories: {
          orderBy: { createdAt: "desc" },
          select: { id: true, title: true, description: true },
        },
      },
    }),
    db.mood.findMany({
      where: { coupleId: couple.id },
      orderBy: { sortOrder: "asc" },
    }),
    db.couple.findUnique({
      where: { id: couple.id },
      select: { playlistLastSyncedAt: true, playlistSyncError: true },
    }),
    db.song.count({ where: { coupleId: couple.id, isAvailable: false } }),
  ]);

  return (
    <MusicLibrary
      songs={songs.map((song) => ({
        id: song.id,
        youtubeVideoId: song.youtubeVideoId,
        title: song.title,
        artist: song.artist,
        thumbnail: song.thumbnail,
        duration: song.duration,
        moodIds: song.moodTags.map((tag) => tag.moodId),
        favoritedByMe: song.favorites.some((f) => f.userId === user.id),
        favoritedByPartner: partner
          ? song.favorites.some((f) => f.userId === partner.id)
          : false,
        memories: song.memories.map((memory) => ({
          id: memory.id,
          title: memory.title,
          description: memory.description,
        })),
      }))}
      moods={moods}
      initialMoodId={initialMoodId}
      partnerName={partner?.name ?? null}
      playlistTitle={PLAYLIST_TITLE}
      lastSyncedAt={syncState?.playlistLastSyncedAt?.toISOString() ?? null}
      syncError={syncState?.playlistSyncError ?? null}
      unavailableCount={unavailableCount}
      stale={stale}
    />
  );
}
