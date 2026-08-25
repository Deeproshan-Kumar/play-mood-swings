"use client";

import Image from "next/image";
import { Heart, Music2, Pause, Play } from "lucide-react";

import { formatTime } from "@/lib/format";
import { Button, cn } from "@/components/ui";
import { MoodIcon } from "@/components/icons";
import { useFavorites } from "@/components/favorites-provider";
import { usePlayer } from "@/components/player/player-provider";
import type { PlayerTrack } from "@/components/player/types";

export type TrackRowData = PlayerTrack & {
  memory?: string | null;
  moods?: Array<{ id: string; slug: string; icon: string; name: string }>;
};

export function TrackRow({
  track,
  index,
  queue,
  showMemory = true,
}: {
  track: TrackRowData;
  index?: number;
  /** The list this row belongs to, so playing it queues its siblings. */
  queue?: PlayerTrack[];
  showMemory?: boolean;
}) {
  const player = usePlayer();
  const favorites = useFavorites();

  const isCurrent = player.current?.id === track.id;
  const isPlaying = isCurrent && player.isPlaying;

  return (
    <div
      className={cn(
        "group flex items-center gap-3 rounded-xl px-2 py-2 transition-colors sm:px-3",
        isCurrent ? "bg-blush/50" : "hover:bg-sunken",
      )}
    >
      <Button
        unstyled
        onClick={() => player.playTrack(track, queue)}
        className="relative shrink-0"
        aria-label={isPlaying ? `Pause ${track.title}` : `Play ${track.title}`}
      >
        {track.thumbnail ? (
          <Image
            src={track.thumbnail}
            alt=""
            width={48}
            height={48}
            unoptimized
            className="h-12 w-12 rounded-lg object-cover"
          />
        ) : (
          <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-blush text-primary">
            <Music2 className="h-5 w-5" />
          </span>
        )}

        <span
          className={cn(
            "absolute inset-0 flex items-center justify-center rounded-lg bg-black/45 text-white transition-opacity",
            isCurrent ? "opacity-100" : "opacity-0 group-hover:opacity-100",
          )}
        >
          {isPlaying ? (
            <Pause className="h-5 w-5" fill="currentColor" />
          ) : (
            <Play className="h-5 w-5" fill="currentColor" />
          )}
        </span>
      </Button>

      <Button
        unstyled
        onClick={() => player.playTrack(track, queue)}
        className="min-w-0 flex-1 text-left"
      >
        <span
          className={cn(
            "block truncate text-sm",
            isCurrent ? "font-medium text-primary" : "font-medium",
          )}
        >
          {typeof index === "number" ? (
            <span className="mr-2 text-xs tabular-nums text-ink-faint">
              {index + 1}
            </span>
          ) : null}
          {track.title}
        </span>

        <span className="mt-0.5 flex items-center gap-2 text-xs text-ink-soft">
          <span className="truncate">{track.artist ?? "Unknown artist"}</span>
          {track.moods?.map((mood) => (
            <span key={mood.id} title={mood.name} aria-label={mood.name}>
              <MoodIcon mood={mood} className="h-3.5 w-3.5" />
            </span>
          ))}
        </span>

        {showMemory && track.memory ? (
          <span className="mt-1 flex items-center gap-1.5 text-xs italic text-primary">
            <Heart className="h-3 w-3 shrink-0 fill-current" aria-hidden />
            <span className="truncate">{track.memory}</span>
          </span>
        ) : null}
      </Button>

      <span className="hidden text-xs tabular-nums text-ink-faint sm:block">
        {formatTime(track.duration)}
      </span>

      <Button
        unstyled
        onClick={() => favorites.toggle(track.id)}
        aria-pressed={favorites.isFavorite(track.id)}
        aria-label={
          favorites.isFavorite(track.id)
            ? `Remove ${track.title} from favourites`
            : `Add ${track.title} to favourites`
        }
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors",
          favorites.isFavorite(track.id)
            ? "text-primary"
            : "text-ink-faint opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-primary",
        )}
      >
        <Heart
          className={cn(
            "h-4.5 w-4.5",
            favorites.isFavorite(track.id) && "fill-current",
          )}
        />
      </Button>
    </div>
  );
}

/** Big "Play" affordance used on Home (PRD §9 "Playing for us"). */
export function PlayForUsButton({
  track,
  queue,
}: {
  track: PlayerTrack;
  queue?: PlayerTrack[];
}) {
  const player = usePlayer();
  const isPlaying = player.current?.id === track.id && player.isPlaying;

  return (
    <Button
      unstyled
      onClick={() => player.playTrack(track, queue)}
      className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-medium text-white transition-transform hover:scale-[1.03] active:scale-95"
    >
      {isPlaying ? (
        <Pause className="h-4 w-4" fill="currentColor" />
      ) : (
        <Play className="h-4 w-4" fill="currentColor" />
      )}
      {isPlaying ? "Pause" : "Play"}
    </Button>
  );
}
