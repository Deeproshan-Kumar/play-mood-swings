"use client";

import Image from "next/image";

import {
  ChevronDown,
  Heart,
  Music2,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from "lucide-react";

import { formatTime } from "@/lib/format";
import { Button, cn } from "@/components/ui";
import { useFavorites } from "@/components/favorites-provider";
import { usePlayer } from "./player-provider";

/** The persistent player (PRD §8). Sits above the mobile nav, below content. */
export function PlayerBar({ songMemory }: { songMemory?: string | null }) {
  const player = usePlayer();
  const favorites = useFavorites();

  if (!player.current) return null;

  const track = player.current;

  return (
    <>
      <ExpandedView songMemory={songMemory} />

      <div
        className={cn(
          "fixed inset-x-0 z-50 transition-all duration-300",
          "bottom-16 md:bottom-0",
          player.isExpanded && "pointer-events-none translate-y-4 opacity-0",
        )}
      >
        <div className="glass mx-auto max-w-6xl border-t md:rounded-none md:border-x-0">
          {/* Seek bar doubles as the progress indicator. */}
          <Seek />

          <div className="flex items-center gap-3 px-3 py-2.5 sm:px-4">
            <Button
              unstyled
              onClick={() => player.setExpanded(true)}
              className="flex min-w-0 flex-1 items-center gap-3 text-left"
              aria-label="Open now playing"
            >
              <Artwork track={track} />

              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {track.title}
                </span>
                <span className="block truncate text-xs text-ink-soft">
                  {track.artist ?? "Unknown artist"}
                </span>
              </span>
            </Button>

            <div className="flex items-center gap-1">
              <Button
                unstyled
                onClick={() => favorites.toggle(track.id)}
                aria-pressed={favorites.isFavorite(track.id)}
                aria-label="Add to favourites"
                className={cn(
                  "hidden h-10 w-10 items-center justify-center rounded-full transition-colors sm:flex",
                  favorites.isFavorite(track.id)
                    ? "text-primary"
                    : "text-ink-faint hover:text-primary",
                )}
              >
                <Heart
                  className={cn(
                    "h-5 w-5",
                    favorites.isFavorite(track.id) && "fill-current",
                  )}
                />
              </Button>

              <Button
                unstyled
                onClick={player.previous}
                aria-label="Previous song"
                className="hidden h-10 w-10 items-center justify-center rounded-full text-ink-soft transition-colors hover:text-ink sm:flex"
              >
                <SkipBack className="h-5 w-5" fill="currentColor" />
              </Button>

              <PlayButton />

              <Button
                unstyled
                onClick={player.next}
                aria-label="Next song"
                className="flex h-10 w-10 items-center justify-center rounded-full text-ink-soft transition-colors hover:text-ink"
              >
                <SkipForward className="h-5 w-5" fill="currentColor" />
              </Button>

              <span className="ml-1 hidden text-xs tabular-nums text-ink-faint lg:inline">
                {formatTime(player.progress)} / {formatTime(player.duration)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function Artwork({ track }: { track: { thumbnail: string | null; title: string } }) {
  if (!track.thumbnail) {
    return (
      <span
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-blush text-primary"
        aria-hidden
      >
        <Music2 className="h-5 w-5" />
      </span>
    );
  }

  return (
    <Image
      src={track.thumbnail}
      alt=""
      width={44}
      height={44}
      unoptimized
      className="h-11 w-11 shrink-0 rounded-lg object-cover"
    />
  );
}

function PlayButton({ large }: { large?: boolean }) {
  const player = usePlayer();

  return (
    <Button
      unstyled
      onClick={player.toggle}
      aria-label={player.isPlaying ? "Pause" : "Play"}
      className={cn(
        "flex items-center justify-center rounded-full bg-primary text-white transition-transform hover:scale-105 active:scale-95",
        large ? "h-16 w-16" : "h-11 w-11",
      )}
    >
      {player.isPlaying ? (
        <Pause className={large ? "h-7 w-7" : "h-5 w-5"} fill="currentColor" />
      ) : (
        <Play
          className={cn(large ? "h-7 w-7" : "h-5 w-5", "translate-x-px")}
          fill="currentColor"
        />
      )}
    </Button>
  );
}

function Seek({ tall }: { tall?: boolean }) {
  const player = usePlayer();
  const max = player.duration || player.current?.duration || 0;

  return (
    <div className={cn("group relative w-full", tall ? "py-2" : "")}>
      <div
        className={cn(
          "w-full overflow-hidden bg-line",
          tall ? "h-1.5 rounded-full" : "h-0.75",
        )}
      >
        <div
          className="h-full bg-primary transition-[width] duration-200"
          style={{ width: `${max > 0 ? (player.progress / max) * 100 : 0}%` }}
        />
      </div>

      <input
        type="range"
        min={0}
        max={max || 100}
        step={1}
        value={Math.min(player.progress, max || 100)}
        onChange={(event) => player.seek(Number(event.target.value))}
        aria-label="Seek"
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
    </div>
  );
}

/** Full-screen "Now Playing" — the large-artwork layout sketched in PRD §8. */
function ExpandedView({ songMemory }: { songMemory?: string | null }) {
  const player = usePlayer();
  const favorites = useFavorites();

  const track = player.current;
  if (!track) return null;

  return (
    <div
      className={cn(
        "fixed inset-0 z-60 flex flex-col bg-canvas transition-all duration-300",
        player.isExpanded
          ? "translate-y-0 opacity-100"
          : "pointer-events-none translate-y-full opacity-0",
      )}
    >
      {/* Blurred artwork wash behind everything — PRD §23. */}
      {track.thumbnail ? (
        <div
          aria-hidden
          className="absolute inset-0 scale-125 bg-cover bg-center opacity-25 blur-3xl"
          style={{ backgroundImage: `url(${track.thumbnail})` }}
        />
      ) : null}

      <div className="relative flex items-center justify-between px-5 py-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => player.setExpanded(false)}
          aria-label="Close now playing"
        >
          <ChevronDown className="h-5 w-5" />
        </Button>
        <p className="label">Now playing</p>
        <div className="w-10" />
      </div>

      <div className="relative mx-auto flex w-full max-w-xl flex-1 flex-col justify-end gap-6 overflow-y-auto px-6 pb-10">
        {/* The YouTube iframe is positioned over this space by the provider. */}
        <div className="aspect-video w-full shrink-0" aria-hidden />

        <div className="text-center">
          <h2 className="display text-3xl leading-tight sm:text-4xl">
            {track.title}
          </h2>
          <p className="mt-1.5 text-sm text-ink-soft">
            {track.artist ?? "Unknown artist"}
          </p>
        </div>

        {songMemory ? (
          <div className="card bg-blush/40 px-5 py-4 text-center">
            <p className="label mb-1.5 flex items-center justify-center gap-1.5">
              <Heart className="h-3.5 w-3.5 fill-current text-primary" />
              Our memory
            </p>
            <p className="font-serif text-lg italic leading-snug text-primary">
              &ldquo;{songMemory}&rdquo;
            </p>
          </div>
        ) : null}

        <div className="space-y-1">
          <Seek tall />
          <div className="flex justify-between text-xs tabular-nums text-ink-faint">
            <span>{formatTime(player.progress)}</span>
            <span>{formatTime(player.duration)}</span>
          </div>
        </div>

        <div className="flex items-center justify-center gap-3">
          <Button
            variant={player.shuffle ? "soft" : "quiet"}
            size="icon"
            onClick={player.toggleShuffle}
            aria-pressed={player.shuffle}
            aria-label="Shuffle"
          >
            <Shuffle className="h-4.5 w-4.5" />
          </Button>

          <Button
            variant="bare"
            size="icon-lg"
            onClick={player.previous}
            aria-label="Previous song"
          >
            <SkipBack className="h-6 w-6" fill="currentColor" />
          </Button>

          <PlayButton large />

          <Button
            variant="bare"
            size="icon-lg"
            onClick={player.next}
            aria-label="Next song"
          >
            <SkipForward className="h-6 w-6" fill="currentColor" />
          </Button>

          <Button
            variant={player.repeat !== "off" ? "soft" : "quiet"}
            size="icon"
            onClick={player.cycleRepeat}
            aria-pressed={player.repeat !== "off"}
            aria-label={`Repeat: ${player.repeat}`}
          >
            {player.repeat === "one" ? (
              <Repeat1 className="h-4.5 w-4.5" />
            ) : (
              <Repeat className="h-4.5 w-4.5" />
            )}
          </Button>
        </div>

        <div className="flex items-center justify-between gap-4">
          <Button
            unstyled
            onClick={() => favorites.toggle(track.id)}
            aria-pressed={favorites.isFavorite(track.id)}
            className={cn(
              "inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm transition-colors",
              favorites.isFavorite(track.id)
                ? "bg-blush text-primary"
                : "text-ink-soft hover:bg-sunken",
            )}
          >
            <Heart
              className={cn(
                "h-4.5 w-4.5",
                favorites.isFavorite(track.id) && "fill-current",
              )}
            />
            {favorites.isFavorite(track.id) ? "In your favourites" : "Add to favourites"}
          </Button>

          <div className="flex items-center gap-2">
            <Button
              unstyled
              onClick={player.toggleMute}
              aria-label={player.isMuted ? "Unmute" : "Mute"}
              className="text-ink-faint transition-colors hover:text-ink"
            >
              {player.isMuted ? (
                <VolumeX className="h-4.5 w-4.5" />
              ) : (
                <Volume2 className="h-4.5 w-4.5" />
              )}
            </Button>
            <input
              type="range"
              min={0}
              max={100}
              value={player.isMuted ? 0 : player.volume}
              onChange={(event) => player.setVolume(Number(event.target.value))}
              aria-label="Volume"
              className="h-1 w-24 cursor-pointer accent-primary"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
