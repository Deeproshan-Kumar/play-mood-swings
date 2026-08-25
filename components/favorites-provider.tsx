"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useTransition,
} from "react";

import { toggleFavorite } from "@/lib/actions/song";

/**
 * Keeps the heart state consistent between the library rows and the player bar,
 * and updates optimistically so tapping a heart feels instant.
 */

type FavoritesContextValue = {
  isFavorite: (songId: string) => boolean;
  toggle: (songId: string) => void;
};

const FavoritesContext = createContext<FavoritesContextValue | null>(null);

export function useFavorites() {
  const context = useContext(FavoritesContext);
  if (!context) {
    throw new Error("useFavorites must be used inside <FavoritesProvider>");
  }
  return context;
}

export function FavoritesProvider({
  initial,
  children,
}: {
  initial: string[];
  children: React.ReactNode;
}) {
  const [ids, setIds] = useState(() => new Set(initial));
  const [, startTransition] = useTransition();

  const isFavorite = useCallback((songId: string) => ids.has(songId), [ids]);

  const toggle = useCallback((songId: string) => {
    setIds((previous) => {
      const next = new Set(previous);
      if (next.has(songId)) {
        next.delete(songId);
      } else {
        next.add(songId);
      }
      return next;
    });

    startTransition(async () => {
      try {
        await toggleFavorite(songId);
      } catch {
        // Roll back if the server rejected it.
        setIds((previous) => {
          const next = new Set(previous);
          if (next.has(songId)) {
            next.delete(songId);
          } else {
            next.add(songId);
          }
          return next;
        });
      }
    });
  }, []);

  const value = useMemo(() => ({ isFavorite, toggle }), [isFavorite, toggle]);

  return (
    <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>
  );
}
