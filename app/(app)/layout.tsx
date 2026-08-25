import { ViewTransition } from "react";

import { db } from "@/lib/db";
import { requireCoupleContext } from "@/lib/auth";
import { BottomNav, MobileHeader, Sidebar } from "@/components/nav";
import { FavoritesProvider } from "@/components/favorites-provider";
import { PlayerProvider } from "@/components/player/player-provider";
import { PlayerBar } from "@/components/player/player-bar";
import { InstallPrompt } from "@/components/pwa";

/**
 * Everything behind this layout requires a couple space — `requireCoupleContext`
 * redirects to onboarding otherwise, so no child page repeats that check.
 *
 * The player provider lives here (not in a page) so navigating between Music,
 * Love, and Memories never interrupts playback.
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { user, couple } = await requireCoupleContext();

  const [songs, favorites] = await Promise.all([
    db.song.findMany({
      where: { coupleId: couple.id, isAvailable: true },
      orderBy: { position: "asc" },
      select: {
        id: true,
        youtubeVideoId: true,
        title: true,
        artist: true,
        thumbnail: true,
        duration: true,
      },
    }),
    db.favorite.findMany({
      where: { userId: user.id, song: { coupleId: couple.id } },
      select: { songId: true },
    }),
  ]);

  return (
    <FavoritesProvider initial={favorites.map((favorite) => favorite.songId)}>
      <PlayerProvider library={songs}>
        <div className="flex min-h-dvh flex-1">
          <Sidebar coupleName={couple.name} />

          <div className="flex min-w-0 flex-1 flex-col">
            <MobileHeader coupleName={couple.name} />

            {/* Bottom padding clears the mobile nav and the player bar. */}
            <main className="flex-1 px-5 pt-6 pb-40 sm:px-8 md:pb-28">
              {/*
                Only the page body transitions — the sidebar, header, and
                player sit outside, so they stay visually anchored while
                content crossfades. Falls back to an instant swap where the
                View Transitions API is unsupported.
              */}
              <ViewTransition default="page">
                <div className="mx-auto w-full max-w-5xl">{children}</div>
              </ViewTransition>
            </main>
          </div>
        </div>

        <PlayerBar />
        <BottomNav />
        <InstallPrompt />
      </PlayerProvider>
    </FavoritesProvider>
  );
}
