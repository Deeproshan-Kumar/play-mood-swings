import { UserButton } from "@clerk/nextjs";
import {
  HeartHandshake,
  ListVideo,
  Palette,
  TriangleAlert,
  UserRound,
} from "lucide-react";

import { db } from "@/lib/db";
import { requireCoupleContext } from "@/lib/auth";
import { formatRelative } from "@/lib/format";
import { Card } from "@/components/ui";
import { CoupleSettings } from "./couple-settings";
import { YouTubeSettings } from "./youtube-settings";
import { AppearanceSettings } from "./appearance-settings";
import { DangerZone } from "./danger-zone";

export const metadata = { title: "Settings" };

/** PRD §18. */
export default async function SettingsPage() {
  const { user, couple, partner } = await requireCoupleContext();

  const songCount = await db.song.count({ where: { coupleId: couple.id } });

  return (
    <div className="space-y-8">
      <header>
        <p className="label">Settings</p>
        <h1 className="display mt-1 text-4xl sm:text-5xl">Our preferences</h1>
      </header>

      <section>
        <h2 className="label mb-3 flex items-center gap-1.5">
          <UserRound className="h-3.5 w-3.5" aria-hidden />
          Account
        </h2>
        <Card className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{user.name}</p>
            <p className="truncate text-xs text-ink-faint">{user.email}</p>
          </div>
          <UserButton />
        </Card>
      </section>

      <section>
        <h2 className="label mb-3 flex items-center gap-1.5">
          <HeartHandshake className="h-3.5 w-3.5" aria-hidden />
          Our space
        </h2>
        <CoupleSettings
          name={couple.name}
          relationshipStartDate={
            couple.relationshipStartDate?.toISOString().slice(0, 10) ?? ""
          }
          anniversaryDate={
            couple.anniversaryDate?.toISOString().slice(0, 10) ?? ""
          }
          inviteCode={couple.inviteCode}
          partnerName={partner?.name ?? null}
        />
      </section>

      <section>
        <h2 className="label mb-3 flex items-center gap-1.5">
          <ListVideo className="h-3.5 w-3.5" aria-hidden />
          YouTube
        </h2>
        <YouTubeSettings
          songCount={songCount}
          lastSyncedLabel={
            couple.playlistLastSyncedAt
              ? formatRelative(couple.playlistLastSyncedAt)
              : null
          }
          syncError={couple.playlistSyncError}
          needsApiKey={!process.env.YOUTUBE_API_KEY}
        />
      </section>

      <section>
        <h2 className="label mb-3 flex items-center gap-1.5">
          <Palette className="h-3.5 w-3.5" aria-hidden />
          Appearance
        </h2>
        <AppearanceSettings current={couple.theme} />
      </section>

      <section>
        <h2 className="label mb-3 flex items-center gap-1.5">
          <TriangleAlert className="h-3.5 w-3.5" aria-hidden />
          Danger zone
        </h2>
        <DangerZone coupleName={couple.name} />
      </section>
    </div>
  );
}
