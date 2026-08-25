import Link from "next/link";
import {
  Heart,
  Mail,
  Music2,
  PartyPopper,
  SmilePlus,
  Sparkles,
  UserPlus,
} from "lucide-react";

import { db } from "@/lib/db";
import { requireCoupleContext } from "@/lib/auth";
import {
  daysTogether,
  daysUntilAnniversary,
  formatDate,
  formatDuration,
  greeting,
} from "@/lib/format";
import { Button, Card, HeartDrift } from "@/components/ui";
import { RelationshipCounter } from "@/components/relationship-counter";
import { PlayForUsButton } from "@/components/track-row";
import { MoodCheckIn } from "@/components/mood-check-in";

export const metadata = { title: "Home" };

/** The romantic home screen (PRD §9, §24) — deliberately not a music dashboard. */
export default async function HomePage() {
  const { user, couple, partner } = await requireCoupleContext();

  const [featured, latestNote, memories, moods, myLastCheckIn] = await Promise.all([
    // "Playing for us" — favour a song the two of you both love, else the first.
    pickFeaturedSong(couple.id, user.id, partner?.id),
    partner
      ? db.loveNote.findFirst({
          where: {
            coupleId: couple.id,
            recipientId: user.id,
            OR: [{ deliverAt: null }, { deliverAt: { lte: new Date() } }],
          },
          orderBy: { createdAt: "desc" },
          include: { sender: { select: { name: true } } },
        })
      : null,
    db.memory.findMany({
      where: { coupleId: couple.id },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 4,
      select: { id: true, title: true, date: true },
    }),
    db.mood.findMany({
      where: { coupleId: couple.id },
      orderBy: { sortOrder: "asc" },
    }),
    db.moodCheckIn.findFirst({
      where: { coupleId: couple.id, userId: user.id },
      orderBy: { createdAt: "desc" },
      include: { mood: true },
    }),
  ]);

  const firstName = user.name?.split(" ")[0] ?? "love";
  const startDate = couple.relationshipStartDate;
  const anniversary = couple.anniversaryDate ?? couple.relationshipStartDate;
  const untilAnniversary = anniversary ? daysUntilAnniversary(anniversary) : null;

  return (
    <div className="space-y-8">
      <header className="relative overflow-hidden pt-4 text-center">
        <HeartDrift count={4} />

        <p className="relative z-10 flex items-center justify-center gap-1.5 text-sm text-ink-soft">
          {greeting()}, {firstName}
          <Heart className="h-3.5 w-3.5 fill-current text-primary" aria-hidden />
        </p>

        <h1 className="display relative z-10 mt-3 text-4xl sm:text-5xl">
          {couple.name}
        </h1>

        <p className="relative z-10 mt-2 text-sm italic text-ink-faint">
          This little space belongs to us.
        </p>
      </header>

      {startDate ? (
        <Card className="animate-fade-up">
          <RelationshipCounter
            startDate={startDate.toISOString()}
            initialDays={daysTogether(startDate)}
            initialDuration={formatDuration(startDate)}
          />

          {untilAnniversary !== null ? (
            <p className="mt-5 flex items-center justify-center gap-1.5 border-t border-line pt-4 text-center text-xs text-ink-faint">
              {untilAnniversary === 0 ? (
                <>
                  <PartyPopper className="h-3.5 w-3.5 text-primary" aria-hidden />
                  Happy anniversary — today&rsquo;s the day.
                </>
              ) : (
                `${untilAnniversary} ${untilAnniversary === 1 ? "day" : "days"} until your anniversary`
              )}
            </p>
          ) : null}
        </Card>
      ) : (
        <Card className="text-center">
          <p className="text-sm text-ink-soft">
            Add the day you got together and we&rsquo;ll start counting.
          </p>
          <Link href="/settings" className="mt-4 inline-block">
            <Button variant="soft" size="sm">
              Add our date
            </Button>
          </Link>
        </Card>
      )}

      {!partner ? (
        <Card className="border-dashed text-center">
          <p className="mb-1 text-sm font-medium">
            Your space is still missing someone
          </p>
          <p className="mb-4 text-sm text-ink-soft">
            Share your invite code so they can join you here.
          </p>
          <Link href="/onboarding/invite">
            <Button size="sm">
              <UserPlus className="h-4 w-4" />
              Invite them
            </Button>
          </Link>
        </Card>
      ) : null}

      {/* Playing for us */}
      <section>
        <h2 className="label mb-3 flex items-center gap-1.5">
          <Music2 className="h-3.5 w-3.5" aria-hidden />
          Playing for us
        </h2>

        {featured ? (
          <Card className="flex flex-col items-center gap-5 text-center sm:flex-row sm:text-left">
            {featured.thumbnail ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={featured.thumbnail}
                alt=""
                className="h-28 w-28 shrink-0 rounded-xl2 object-cover"
              />
            ) : null}

            <div className="min-w-0 flex-1">
              <h3 className="display text-2xl leading-tight">{featured.title}</h3>
              <p className="mt-1 text-sm text-ink-soft">
                {featured.artist ?? "Unknown artist"}
              </p>
              {featured.memory ? (
                <p className="mt-2 flex items-center justify-center gap-1.5 text-sm italic text-primary sm:justify-start">
                  <Heart className="h-3.5 w-3.5 shrink-0 fill-current" aria-hidden />
                  {featured.memory}
                </p>
              ) : null}
            </div>

            <PlayForUsButton track={featured} />
          </Card>
        ) : (
          <Card className="text-center">
            <p className="mb-4 text-sm text-ink-soft">
              Connect your YouTube playlist and this space gets a soundtrack.
            </p>
            <Link href="/settings">
              <Button size="sm">Connect a playlist</Button>
            </Link>
          </Card>
        )}
      </section>

      {/* A little message */}
      {latestNote ? (
        <section>
          <h2 className="label mb-3 flex items-center gap-1.5">
            <Mail className="h-3.5 w-3.5" aria-hidden />
            A little message from {latestNote.sender.name ?? "them"}
          </h2>
          <Card className="bg-blush/40">
            <p className="font-serif text-xl italic leading-relaxed text-primary">
              &ldquo;{latestNote.content}&rdquo;
            </p>
            <Link
              href="/love"
              className="mt-4 inline-block text-xs text-ink-soft underline underline-offset-4 hover:text-ink"
            >
              Write back
            </Link>
          </Card>
        </section>
      ) : partner ? (
        <section>
          <h2 className="label mb-3 flex items-center gap-1.5">
            <Mail className="h-3.5 w-3.5" aria-hidden />
            Love
          </h2>
          <Card className="text-center">
            <p className="mb-4 text-sm text-ink-soft">
              No notes yet. Be the one who starts.
            </p>
            <Link href="/love">
              <Button variant="soft" size="sm">
                Leave a note
              </Button>
            </Link>
          </Card>
        </section>
      ) : null}

      {/* Mood */}
      {moods.length > 0 ? (
        <section>
          <h2 className="label mb-3 flex items-center gap-1.5">
            <SmilePlus className="h-3.5 w-3.5" aria-hidden />
            How are you feeling?
          </h2>
          <MoodCheckIn
            moods={moods}
            currentMoodId={myLastCheckIn?.moodId ?? null}
            compact
          />
        </section>
      ) : null}

      {/* Our memories */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="label flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            Our memories
          </h2>
          <Link
            href="/memories"
            className="text-xs text-ink-soft underline underline-offset-4 hover:text-ink"
          >
            See all
          </Link>
        </div>

        {memories.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {memories.map((memory) => (
              <Link
                key={memory.id}
                href="/memories"
                className="rounded-full border border-line bg-raised px-4 py-2 text-sm transition-colors hover:border-line-strong"
              >
                {memory.title}
                {memory.date ? (
                  <span className="ml-2 text-xs text-ink-faint">
                    {formatDate(memory.date)}
                  </span>
                ) : null}
              </Link>
            ))}
          </div>
        ) : (
          <Card className="text-center">
            <p className="mb-4 text-sm text-ink-soft">
              Save the moments you want to keep.
            </p>
            <Link href="/memories">
              <Button variant="soft" size="sm">
                Add a memory
              </Button>
            </Link>
          </Card>
        )}
      </section>

      <p className="flex items-center justify-center gap-1.5 pb-4 text-center text-xs text-ink-faint">
        <Heart className="h-3 w-3 fill-current text-primary" aria-hidden />
        Made for us
      </p>
    </div>
  );
}

/**
 * Picks something meaningful rather than just the first row: a song you both
 * favourited, then one either of you did, then the top of the playlist.
 */
async function pickFeaturedSong(
  coupleId: string,
  userId: string,
  partnerId: string | undefined,
) {
  const withMemory = {
    memories: {
      orderBy: { createdAt: "desc" },
      take: 1,
      select: { description: true, title: true },
    },
  } as const;

  const shared =
    partnerId &&
    (await db.song.findFirst({
      where: {
        coupleId,
        isAvailable: true,
        AND: [
          { favorites: { some: { userId } } },
          { favorites: { some: { userId: partnerId } } },
        ],
      },
      include: withMemory,
    }));

  const song =
    shared ||
    (await db.song.findFirst({
      where: { coupleId, isAvailable: true, favorites: { some: {} } },
      include: withMemory,
    })) ||
    (await db.song.findFirst({
      where: { coupleId, isAvailable: true },
      orderBy: { position: "asc" },
      include: withMemory,
    }));

  if (!song) return null;

  const memory = song.memories[0];

  return {
    id: song.id,
    youtubeVideoId: song.youtubeVideoId,
    title: song.title,
    artist: song.artist,
    thumbnail: song.thumbnail,
    duration: song.duration,
    memory: memory ? (memory.description ?? memory.title) : null,
  };
}
