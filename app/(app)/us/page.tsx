import Link from "next/link";
import {
  CalendarHeart,
  Heart,
  HeartHandshake,
  PencilLine,
  UserPlus,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";

import { db } from "@/lib/db";
import { requireCoupleContext } from "@/lib/auth";
import {
  daysTogether,
  daysUntilAnniversary,
  formatDate,
  formatDuration,
} from "@/lib/format";
import { Button, Card, HeartDrift } from "@/components/ui";
import { RelationshipCounter } from "@/components/relationship-counter";
import { TrackRow } from "@/components/track-row";

export const metadata = { title: "Us" };

/** The relationship space (PRD §3 "Us", §5, §12). */
export default async function UsPage() {
  const { user, couple, partner } = await requireCoupleContext();

  const [myFavorites, theirFavorites, counts] = await Promise.all([
    favoritesFor(couple.id, user.id),
    partner ? favoritesFor(couple.id, partner.id) : Promise.resolve([]),
    Promise.all([
      db.song.count({ where: { coupleId: couple.id, isAvailable: true } }),
      db.loveNote.count({ where: { coupleId: couple.id } }),
      db.memory.count({ where: { coupleId: couple.id } }),
    ]),
  ]);

  const [songCount, noteCount, memoryCount] = counts;

  const theirIds = new Set(theirFavorites.map((song) => song.id));
  const shared = myFavorites.filter((song) => theirIds.has(song.id));
  const sharedIds = new Set(shared.map((song) => song.id));

  const mineOnly = myFavorites.filter((song) => !sharedIds.has(song.id));
  const theirsOnly = theirFavorites.filter((song) => !sharedIds.has(song.id));

  const startDate = couple.relationshipStartDate;
  const anniversary = couple.anniversaryDate;
  const myFirstName = user.name?.split(" ")[0] ?? "Me";
  const theirFirstName = partner?.name?.split(" ")[0] ?? "Them";

  return (
    <div className="space-y-8">
      <header className="relative overflow-hidden py-4 text-center">
        <HeartDrift count={4} />
        <p className="label relative z-10">Us</p>
        <h1 className="display relative z-10 mt-2 text-4xl sm:text-5xl">
          {couple.name}
        </h1>
      </header>

      {startDate ? (
        <Card>
          <RelationshipCounter
            startDate={startDate.toISOString()}
            initialDays={daysTogether(startDate)}
            initialDuration={formatDuration(startDate)}
          />
        </Card>
      ) : null}

      <div className="stagger grid gap-4 sm:grid-cols-3">
        <Stat label="Songs" value={songCount} />
        <Stat label="Notes" value={noteCount} />
        <Stat label="Memories" value={memoryCount} />
      </div>

      <section className="grid gap-4 sm:grid-cols-2">
        <Card>
          <p className="label mb-3 flex items-center gap-1.5">
            <CalendarHeart className="h-3.5 w-3.5" aria-hidden />
            Special dates
          </p>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-ink-soft">Together since</dt>
              <dd>{startDate ? formatDate(startDate) : "—"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-ink-soft">Anniversary</dt>
              <dd>{anniversary ? formatDate(anniversary) : "—"}</dd>
            </div>
            {anniversary ? (
              <div className="flex justify-between gap-4">
                <dt className="text-ink-soft">Next one in</dt>
                <dd className="text-primary">
                  {daysUntilAnniversary(anniversary)} days
                </dd>
              </div>
            ) : null}
          </dl>

          <Link href="/settings" className="mt-4 inline-block">
            <Button variant="ghost" size="sm">
              <PencilLine className="h-4 w-4" />
              Edit dates
            </Button>
          </Link>
        </Card>

        <Card>
          <p className="label mb-3 flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" aria-hidden />
            The two of us
          </p>
          <ul className="space-y-3">
            <PartnerRow name={user.name} avatar={user.avatar} suffix="(you)" />
            {partner ? (
              <PartnerRow name={partner.name} avatar={partner.avatar} />
            ) : (
              <li className="flex items-center justify-between gap-3">
                <span className="text-sm text-ink-soft">
                  Waiting for your partner
                </span>
                <Link href="/onboarding/invite">
                  <Button variant="soft" size="sm">
                    <UserPlus className="h-4 w-4" />
                    Invite
                  </Button>
                </Link>
              </li>
            )}
          </ul>
        </Card>
      </section>

      {/* PRD §12 — his, hers, and shared favourites. */}
      <section className="space-y-6">
        <h2 className="display text-2xl">Our favourites</h2>

        <FavoriteGroup
          title="Ours"
          icon={HeartHandshake}
          empty="Nothing you both love yet — favourite the same song and it lands here."
          songs={shared}
        />
        <FavoriteGroup
          title={`${myFirstName}'s favourites`}
          icon={Heart}
          empty="You haven't favourited anything yet."
          songs={mineOnly}
        />
        {partner ? (
          <FavoriteGroup
            title={`${theirFirstName}'s favourites`}
            icon={UserRound}
            empty="Nothing yet from them."
            songs={theirsOnly}
          />
        ) : null}
      </section>
    </div>
  );
}

async function favoritesFor(coupleId: string, userId: string) {
  const rows = await db.favorite.findMany({
    where: { userId, song: { coupleId, isAvailable: true } },
    orderBy: { createdAt: "desc" },
    include: {
      song: {
        select: {
          id: true,
          youtubeVideoId: true,
          title: true,
          artist: true,
          thumbnail: true,
          duration: true,
        },
      },
    },
  });

  return rows.map((row) => row.song);
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card className="hoverable py-5 text-center">
      <p className="display text-3xl text-primary">{value.toLocaleString()}</p>
      <p className="label mt-1">{label}</p>
    </Card>
  );
}

function PartnerRow({
  name,
  avatar,
  suffix,
}: {
  name: string | null;
  avatar: string | null;
  suffix?: string;
}) {
  return (
    <li className="flex items-center gap-3">
      {avatar ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatar} alt="" className="h-9 w-9 rounded-full object-cover" />
      ) : (
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-blush text-sm font-medium text-primary">
          {name ? (
            name.charAt(0).toUpperCase()
          ) : (
            <UserRound className="h-4 w-4" aria-hidden />
          )}
        </span>
      )}
      <span className="text-sm">
        {name ?? "Someone"}
        {suffix ? <span className="ml-1.5 text-ink-faint">{suffix}</span> : null}
      </span>
    </li>
  );
}

function FavoriteGroup({
  title,
  icon: Icon,
  songs,
  empty,
}: {
  title: string;
  icon: LucideIcon;
  songs: Array<{
    id: string;
    youtubeVideoId: string;
    title: string;
    artist: string | null;
    thumbnail: string | null;
    duration: number | null;
  }>;
  empty: string;
}) {
  return (
    <div>
      <h3 className="label mb-2.5 flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5" aria-hidden />
        {title}
      </h3>
      {songs.length === 0 ? (
        <p className="text-sm text-ink-faint">{empty}</p>
      ) : (
        <div className="space-y-0.5">
          {songs.map((song) => (
            <TrackRow key={song.id} track={song} queue={songs} showMemory={false} />
          ))}
        </div>
      )}
    </div>
  );
}
