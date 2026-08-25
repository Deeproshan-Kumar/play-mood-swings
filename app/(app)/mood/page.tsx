import Link from "next/link";
import { SmilePlus } from "lucide-react";

import { db } from "@/lib/db";
import { requireCoupleContext } from "@/lib/auth";
import { formatRelative } from "@/lib/format";
import { Card, EmptyState } from "@/components/ui";
import { MoodIcon } from "@/components/icons";
import { MoodCheckIn } from "@/components/mood-check-in";

export const metadata = { title: "Mood" };

/** PRD §13 — pick how you feel, and see what they picked. */
export default async function MoodPage() {
  const { user, couple, partner } = await requireCoupleContext();

  const [moods, myCheckIn, theirCheckIn, taggedCounts] = await Promise.all([
    db.mood.findMany({
      where: { coupleId: couple.id },
      orderBy: { sortOrder: "asc" },
    }),
    db.moodCheckIn.findFirst({
      where: { coupleId: couple.id, userId: user.id },
      orderBy: { createdAt: "desc" },
      include: { mood: true },
    }),
    partner
      ? db.moodCheckIn.findFirst({
          where: { coupleId: couple.id, userId: partner.id },
          orderBy: { createdAt: "desc" },
          include: { mood: true },
        })
      : null,
    db.songMood.groupBy({
      by: ["moodId"],
      _count: { songId: true },
      where: { mood: { coupleId: couple.id } },
    }),
  ]);

  if (moods.length === 0) {
    return (
      <EmptyState
        icon={SmilePlus}
        title="No moods yet"
        description="Something went wrong seeding your moods. Try recreating your space, or tag songs from the Music page."
      />
    );
  }

  const countByMood = new Map(
    taggedCounts.map((row) => [row.moodId, row._count.songId]),
  );

  return (
    <div className="space-y-8">
      <header className="text-center">
        <p className="label">Mood</p>
        <h1 className="display mt-2 text-4xl sm:text-5xl">
          How are you feeling?
        </h1>
        <p className="mt-2 text-sm text-ink-soft">
          Pick one, and we&rsquo;ll pull the songs that match.
        </p>
      </header>

      <MoodCheckIn moods={moods} currentMoodId={myCheckIn?.moodId ?? null} />

      {theirCheckIn ? (
        <Card className="text-center">
          <p className="label mb-2">
            {partner?.name?.split(" ")[0] ?? "They"} felt
          </p>
          <p className="display flex items-center justify-center gap-2.5 text-3xl">
            <MoodIcon
              mood={theirCheckIn.mood}
              className="h-6 w-6 text-primary"
            />
            {theirCheckIn.mood.name}
          </p>
          <p className="mt-1.5 text-xs text-ink-faint">
            {formatRelative(theirCheckIn.createdAt)}
          </p>
        </Card>
      ) : null}

      <section>
        <h2 className="label mb-3">Songs by mood</h2>
        <div className="stagger grid gap-3 sm:grid-cols-2">
          {moods.map((mood) => {
            const count = countByMood.get(mood.id) ?? 0;

            return (
              <Link
                key={mood.id}
                href={`/music?mood=${mood.id}`}
                className="card hoverable flex items-center gap-4 px-5 py-4 hover:border-line-strong"
              >
                <span
                  aria-hidden
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blush text-primary"
                >
                  <MoodIcon mood={mood} className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{mood.name}</span>
                  <span className="block text-xs text-ink-faint">
                    {count === 0
                      ? "No songs tagged yet"
                      : `${count} ${count === 1 ? "song" : "songs"}`}
                  </span>
                </span>
              </Link>
            );
          })}
        </div>

        <p className="mt-4 text-center text-xs text-ink-faint">
          Tag songs with a mood from the details menu on any song in{" "}
          <Link href="/music" className="underline underline-offset-4">
            Music
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
