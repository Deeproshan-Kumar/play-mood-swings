"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type { PlayerTrack, RepeatMode, YTPlayer } from "./types";

/**
 * Global playback state (PRD §8).
 *
 * Playback goes through YouTube's IFrame Player API — we never proxy or
 * re-host audio, only drive their player (PRD §8, §6).
 *
 * This provider is mounted in the persistent app layout, so the iframe is
 * never unmounted by navigation and music keeps playing across pages.
 */

type PlayerContextValue = {
  current: PlayerTrack | null;
  isPlaying: boolean;
  progress: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
  isExpanded: boolean;

  playTrack: (track: PlayerTrack, queue?: PlayerTrack[]) => void;
  playQueue: (queue: PlayerTrack[], startIndex?: number) => void;
  toggle: () => void;
  next: () => void;
  previous: () => void;
  seek: (seconds: number) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  setExpanded: (expanded: boolean) => void;
};

const PlayerContext = createContext<PlayerContextValue | null>(null);

export function usePlayer() {
  const context = useContext(PlayerContext);
  if (!context) {
    throw new Error("usePlayer must be used inside <PlayerProvider>");
  }
  return context;
}

const IFRAME_API_SRC = "https://www.youtube.com/iframe_api";

/** Loads the IFrame API exactly once per document. */
function loadIframeApi(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.YT?.Player) return Promise.resolve();

  return new Promise((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${IFRAME_API_SRC}"]`,
    );

    const previousCallback = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previousCallback?.();
      resolve();
    };

    if (!existing) {
      const script = document.createElement("script");
      script.src = IFRAME_API_SRC;
      script.async = true;
      document.head.appendChild(script);
    }
  });
}

function shuffleOrder(length: number, keepFirst: number): number[] {
  const order = Array.from({ length }, (_, i) => i).filter((i) => i !== keepFirst);

  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }

  return [keepFirst, ...order];
}

export function PlayerProvider({
  library,
  children,
}: {
  library: PlayerTrack[];
  children: React.ReactNode;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YTPlayer | null>(null);

  const [queue, setQueue] = useState<PlayerTrack[]>([]);
  const [index, setIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(80);
  const [isMuted, setIsMuted] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<RepeatMode>("off");
  const [isExpanded, setExpanded] = useState(false);

  /** Playback order — identity when not shuffling. */
  const [order, setOrder] = useState<number[]>([]);

  const current = queue[index] ?? null;

  // Refs let the YouTube event callbacks read fresh state without being
  // re-registered (the API has no way to swap handlers after construction).
  // Written in an effect, not during render — the callbacks only ever fire
  // asynchronously, so they always observe the committed values.
  const stateRef = useRef({ repeat, order, index });

  useEffect(() => {
    stateRef.current = { repeat, order, index };
  }, [repeat, order, index]);

  const advance = useCallback((direction: 1 | -1) => {
    const { order: currentOrder, index: currentIndex, repeat: currentRepeat } =
      stateRef.current;

    if (currentOrder.length === 0) return;

    const positionInOrder = currentOrder.indexOf(currentIndex);
    const nextPosition = positionInOrder + direction;

    if (nextPosition < 0) {
      setIndex(currentOrder[currentOrder.length - 1]);
      return;
    }

    if (nextPosition >= currentOrder.length) {
      if (currentRepeat === "all") {
        setIndex(currentOrder[0]);
      } else {
        setIsPlaying(false);
      }
      return;
    }

    setIndex(currentOrder[nextPosition]);
  }, []);

  // ── Create the YouTube player once ─────────────────────────
  useEffect(() => {
    let cancelled = false;

    loadIframeApi().then(() => {
      if (cancelled || !hostRef.current || !window.YT?.Player) return;

      playerRef.current = new window.YT.Player(hostRef.current, {
        height: "100%",
        width: "100%",
        playerVars: {
          playsinline: 1,
          rel: 0,
          modestbranding: 1,
        },
        events: {
          onReady: (event) => {
            if (cancelled) return;
            event.target.setVolume(volume);
            setIsReady(true);
          },
          onStateChange: (event) => {
            const states = window.YT?.PlayerState;
            if (!states) return;

            if (event.data === states.PLAYING) {
              setIsPlaying(true);
              setDuration(event.target.getDuration() || 0);
            } else if (event.data === states.PAUSED) {
              setIsPlaying(false);
            } else if (event.data === states.ENDED) {
              if (stateRef.current.repeat === "one") {
                event.target.seekTo(0, true);
                event.target.playVideo();
              } else {
                advance(1);
              }
            }
          },
          onError: () => {
            // Unplayable or embed-restricted video — skip past it rather than
            // stalling the queue on a song that will never load.
            advance(1);
          },
        },
      });
    });

    return () => {
      cancelled = true;
      playerRef.current?.destroy();
      playerRef.current = null;
    };
    // Intentionally mounted once; volume is applied via its own effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Load the current track whenever it changes ─────────────
  useEffect(() => {
    const player = playerRef.current;
    if (!player || !isReady || !current) return;

    player.loadVideoById(current.youtubeVideoId);
    setProgress(0);
    setDuration(current.duration ?? 0);
  }, [current, isReady]);

  // ── Poll progress while playing ────────────────────────────
  useEffect(() => {
    if (!isPlaying) return;

    const timer = window.setInterval(() => {
      const player = playerRef.current;
      if (!player) return;

      setProgress(player.getCurrentTime() || 0);

      const total = player.getDuration() || 0;
      if (total > 0) setDuration(total);
    }, 500);

    return () => window.clearInterval(timer);
  }, [isPlaying]);

  // ── Media Session: lock-screen / headphone controls ────────
  useEffect(() => {
    if (!current || !("mediaSession" in navigator)) return;

    navigator.mediaSession.metadata = new MediaMetadata({
      title: current.title,
      artist: current.artist ?? "",
      artwork: current.thumbnail
        ? [{ src: current.thumbnail, sizes: "480x360", type: "image/jpeg" }]
        : [],
    });
  }, [current]);

  const playQueue = useCallback(
    (nextQueue: PlayerTrack[], startIndex = 0) => {
      if (nextQueue.length === 0) return;

      const safeIndex = Math.max(0, Math.min(startIndex, nextQueue.length - 1));

      setQueue(nextQueue);
      setIndex(safeIndex);
      setOrder(
        shuffle
          ? shuffleOrder(nextQueue.length, safeIndex)
          : Array.from({ length: nextQueue.length }, (_, i) => i),
      );
      setIsPlaying(true);
    },
    [shuffle],
  );

  const playTrack = useCallback(
    (track: PlayerTrack, nextQueue?: PlayerTrack[]) => {
      const source = nextQueue ?? (queue.length > 0 ? queue : library);
      const position = source.findIndex((item) => item.id === track.id);

      if (position === -1) {
        playQueue([track, ...source], 0);
        return;
      }

      // Same track already loaded — treat the tap as play/pause.
      if (current?.id === track.id && playerRef.current) {
        if (isPlaying) {
          playerRef.current.pauseVideo();
        } else {
          playerRef.current.playVideo();
        }
        return;
      }

      playQueue(source, position);
    },
    [queue, library, current, isPlaying, playQueue],
  );

  const toggle = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;

    if (!current && library.length > 0) {
      playQueue(library, 0);
      return;
    }

    if (isPlaying) {
      player.pauseVideo();
    } else {
      player.playVideo();
    }
  }, [current, isPlaying, library, playQueue]);

  const seek = useCallback((seconds: number) => {
    playerRef.current?.seekTo(seconds, true);
    setProgress(seconds);
  }, []);

  const setVolume = useCallback((next: number) => {
    const clamped = Math.max(0, Math.min(100, next));
    setVolumeState(clamped);
    playerRef.current?.setVolume(clamped);

    if (clamped > 0 && playerRef.current) {
      playerRef.current.unMute();
      setIsMuted(false);
    }
  }, []);

  const toggleMute = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;

    setIsMuted((muted) => {
      if (muted) {
        player.unMute();
        player.setVolume(volume);
      } else {
        player.mute();
      }
      return !muted;
    });
  }, [volume]);

  const toggleShuffle = useCallback(() => {
    setShuffle((on) => {
      const next = !on;
      setOrder(
        next
          ? shuffleOrder(queue.length, index)
          : Array.from({ length: queue.length }, (_, i) => i),
      );
      return next;
    });
  }, [queue.length, index]);

  const cycleRepeat = useCallback(() => {
    setRepeat((mode) =>
      mode === "off" ? "all" : mode === "all" ? "one" : "off",
    );
  }, []);

  const next = useCallback(() => advance(1), [advance]);

  const previous = useCallback(() => {
    // Match the convention: restart the track unless we're near the start.
    if (progress > 3) {
      seek(0);
      return;
    }
    advance(-1);
  }, [progress, seek, advance]);

  const value = useMemo<PlayerContextValue>(
    () => ({
      current,
      isPlaying,
      progress,
      duration,
      volume,
      isMuted,
      shuffle,
      repeat,
      isExpanded,
      playTrack,
      playQueue,
      toggle,
      next,
      previous,
      seek,
      setVolume,
      toggleMute,
      toggleShuffle,
      cycleRepeat,
      setExpanded,
    }),
    [
      current,
      isPlaying,
      progress,
      duration,
      volume,
      isMuted,
      shuffle,
      repeat,
      isExpanded,
      playTrack,
      playQueue,
      toggle,
      next,
      previous,
      seek,
      setVolume,
      toggleMute,
      toggleShuffle,
      cycleRepeat,
    ],
  );

  return (
    <PlayerContext.Provider value={value}>
      {children}
      <YouTubeHost hostRef={hostRef} expanded={isExpanded} hasTrack={Boolean(current)} />
    </PlayerContext.Provider>
  );
}

/**
 * The iframe lives here permanently. Expanding "Now Playing" only moves and
 * resizes this box — remounting it would restart playback.
 */
function YouTubeHost({
  hostRef,
  expanded,
  hasTrack,
}: {
  hostRef: React.RefObject<HTMLDivElement | null>;
  expanded: boolean;
  hasTrack: boolean;
}) {
  return (
    <div
      aria-hidden={!expanded}
      className={
        expanded
          ? "fixed left-1/2 top-24 z-70 aspect-video w-[min(92vw,44rem)] -translate-x-1/2 overflow-hidden rounded-xl2 bg-black shadow-2xl transition-all duration-300"
          : "pointer-events-none fixed bottom-0 left-0 -z-10 h-1 w-1 overflow-hidden opacity-0"
      }
      style={hasTrack ? undefined : { visibility: "hidden" }}
    >
      <div ref={hostRef} className="h-full w-full" />
    </div>
  );
}
