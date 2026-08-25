"use client";

import { useMemo, useState } from "react";
import {
  Heart,
  HeartHandshake,
  ListMusic,
  MoreHorizontal,
  Play,
  SearchX,
  Shuffle,
  UserRound,
  type LucideIcon,
} from "lucide-react";

import { formatRelative } from "@/lib/format";
import { Button, EmptyState, Input } from "@/components/ui";
import { MoodIcon } from "@/components/icons";
import { TrackRow } from "@/components/track-row";
import { usePlayer } from "@/components/player/player-provider";
import { SongSheet } from "./song-sheet";
import { SyncButton } from "./sync-button";
import { BackgroundSync } from "./background-sync";

export type LibrarySong = {
  id: string;
  youtubeVideoId: string;
  title: string;
  artist: string | null;
  thumbnail: string | null;
  duration: number | null;
  moodIds: string[];
  favoritedByMe: boolean;
  favoritedByPartner: boolean;
  memories: Array<{ id: string; title: string; description: string | null }>;
};

type Mood = { id: string; slug: string; name: string; icon: string };

type Filter = "all" | "mine" | "theirs" | "ours";

export function MusicLibrary({
  songs,
  moods,
  initialMoodId,
  partnerName,
  playlistTitle,
  lastSyncedAt,
  syncError,
  unavailableCount,
  stale,
}: {
  songs: LibrarySong[];
  moods: Mood[];
  initialMoodId: string | null;
  partnerName: string | null;
  playlistTitle: string | null;
  lastSyncedAt: string | null;
  syncError: string | null;
  unavailableCount: number;
  stale: boolean;
}) {
  const player = usePlayer();

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [moodId, setMoodId] = useState<string | null>(initialMoodId);
  const [openSong, setOpenSong] = useState<LibrarySong | null>(null);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return songs.filter((song) => {
      if (moodId && !song.moodIds.includes(moodId)) return false;

      if (filter === "mine" && !song.favoritedByMe) return false;
      if (filter === "theirs" && !song.favoritedByPartner) return false;
      if (filter === "ours" && !(song.favoritedByMe && song.favoritedByPartner)) {
        return false;
      }

      if (needle) {
        const haystack = `${song.title} ${song.artist ?? ""}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }

      return true;
    });
  }, [songs, query, filter, moodId]);

  const queue = visible.map((song) => ({
    id: song.id,
    youtubeVideoId: song.youtubeVideoId,
    title: song.title,
    artist: song.artist,
    thumbnail: song.thumbnail,
    duration: song.duration,
  }));

  const filters: Array<{ key: Filter; label: string; icon: LucideIcon }> = [
    { key: "all", label: "All songs", icon: ListMusic },
    { key: "mine", label: "My favourites", icon: Heart },
    {
      key: "theirs",
      label: `${partnerName?.split(" ")[0] ?? "Their"} favourites`,
      icon: UserRound,
    },
    { key: "ours", label: "Ours", icon: HeartHandshake },
  ];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="label">Our library</p>
          <h1 className="display mt-1 text-4xl sm:text-5xl">
            {playlistTitle ?? "Music"}
          </h1>
          <p className="mt-1.5 text-xs text-ink-faint">
            {songs.length} {songs.length === 1 ? "song" : "songs"}
            {lastSyncedAt ? ` · Last synced ${formatRelative(lastSyncedAt)}` : ""}
          </p>
        </div>

        <SyncButton />
      </header>

      <BackgroundSync stale={stale} />

      {syncError ? (
        <p className="rounded-xl border border-line-strong bg-blush/40 px-4 py-3 text-sm text-primary">
          {syncError}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          onClick={() => queue.length > 0 && player.playQueue(queue, 0)}
          disabled={queue.length === 0}
        >
          <Play className="h-4 w-4" fill="currentColor" />
          Play all
        </Button>

        <Button
          size="sm"
          variant="outline"
          disabled={queue.length === 0}
          onClick={() => {
            if (queue.length === 0) return;
            if (!player.shuffle) player.toggleShuffle();
            player.playQueue(queue, Math.floor(Math.random() * queue.length));
          }}
        >
          <Shuffle className="h-4 w-4" />
          Shuffle
        </Button>

        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search our songs…"
          aria-label="Search songs"
          className="h-9 w-full max-w-56 sm:ml-auto"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {filters.map((item) => (
          <Button
            key={item.key}
            size="chip"
            variant={filter === item.key ? "selected" : "chip"}
            onClick={() => setFilter(item.key)}
            aria-pressed={filter === item.key}
          >
            <item.icon aria-hidden className="h-3.5 w-3.5" />
            {item.label}
          </Button>
        ))}
      </div>

      {moods.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          <Button
            size="chip"
            variant={moodId === null ? "soft" : "quiet"}
            onClick={() => setMoodId(null)}
            aria-pressed={moodId === null}
          >
            Any mood
          </Button>

          {moods.map((mood) => (
            <Button
              key={mood.id}
              size="chip"
              variant={moodId === mood.id ? "soft" : "quiet"}
              onClick={() => setMoodId(moodId === mood.id ? null : mood.id)}
              aria-pressed={moodId === mood.id}
            >
              <MoodIcon mood={mood} className="h-3.5 w-3.5" />
              {mood.name}
            </Button>
          ))}
        </div>
      ) : null}

      {visible.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="Nothing here yet"
          description={
            songs.length === 0
              ? "Your playlist synced, but it looks empty. Add a song on YouTube and press Sync Now."
              : "No songs match this filter. Try another mood or clear the search."
          }
        />
      ) : (
        <div className="animate-fade-in space-y-0.5">
          {visible.map((song, index) => (
            <div key={song.id} className="flex items-center gap-1">
              <div className="min-w-0 flex-1">
                <TrackRow
                  track={{
                    id: song.id,
                    youtubeVideoId: song.youtubeVideoId,
                    title: song.title,
                    artist: song.artist,
                    thumbnail: song.thumbnail,
                    duration: song.duration,
                    memory:
                      song.memories[0]?.description ?? song.memories[0]?.title ?? null,
                    moods: moods.filter((mood) => song.moodIds.includes(mood.id)),
                  }}
                  index={index}
                  queue={queue}
                />
              </div>

              <Button
                variant="quiet"
                size="icon-sm"
                onClick={() => setOpenSong(song)}
                aria-label={`Details for ${song.title}`}
                className="shrink-0 hover:bg-sunken"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {unavailableCount > 0 ? (
        <p className="text-center text-xs text-ink-faint">
          {unavailableCount}{" "}
          {unavailableCount === 1 ? "song is" : "songs are"} no longer in your
          YouTube playlist. We keep them so your memories stay attached.
        </p>
      ) : null}

      {openSong ? (
        <SongSheet
          song={openSong}
          moods={moods}
          onClose={() => setOpenSong(null)}
        />
      ) : null}
    </div>
  );
}
