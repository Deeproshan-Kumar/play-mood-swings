import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Heart, HeartHandshake, SearchX, UserPlus } from "lucide-react";

import { db } from "@/lib/db";
import { getCoupleForUser, getUserId, requireUser } from "@/lib/auth";
import { Button, Card, HeartDrift } from "@/components/ui";
import { IconBadge } from "@/components/icons";
import { AcceptInvite } from "./accept-invite";

export const metadata = { title: "You're invited" };

export default async function JoinPage({ params }: PageProps<"/join/[code]">) {
  const { code } = await params;
  const inviteCode = code.toUpperCase();

  const couple = await db.couple.findUnique({
    where: { inviteCode },
    select: {
      id: true,
      name: true,
      partner1Id: true,
      partner2Id: true,
      partner1: { select: { name: true } },
    },
  });

  const clerkUserId = await getUserId();

  return (
    <main className="relative mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-16">
      <HeartDrift count={4} />

      <div className="relative z-10">
        {!couple ? (
          <Card className="space-y-4 text-center">
            <IconBadge icon={SearchX} />
            <h1 className="display text-3xl">This invite didn&rsquo;t work</h1>
            <p className="text-sm text-ink-soft">
              The code <strong className="text-ink">{inviteCode}</strong>{" "}
              doesn&rsquo;t match any space. Double-check it with your partner.
            </p>
            <Link href="/">
              <Button variant="outline">
                <ArrowLeft className="h-4 w-4" />
                Back to start
              </Button>
            </Link>
          </Card>
        ) : couple.partner2Id ? (
          <FullSpace name={couple.name} />
        ) : (
          <Invitation
            coupleName={couple.name}
            inviterName={couple.partner1.name}
            inviteCode={inviteCode}
            isSignedIn={Boolean(clerkUserId)}
          />
        )}
      </div>
    </main>
  );
}

function FullSpace({ name }: { name: string }) {
  return (
    <Card className="space-y-4 text-center">
      <IconBadge icon={HeartHandshake} />
      <h1 className="display text-3xl">{name} is complete</h1>
      <p className="text-sm text-ink-soft">
        Both partners have already joined this space.
      </p>
      <Link href="/">
        <Button variant="outline">
          <ArrowLeft className="h-4 w-4" />
          Back to start
        </Button>
      </Link>
    </Card>
  );
}

async function Invitation({
  coupleName,
  inviterName,
  inviteCode,
  isSignedIn,
}: {
  coupleName: string;
  inviterName: string | null;
  inviteCode: string;
  isSignedIn: boolean;
}) {
  // Signed in already? Make sure they aren't in another space before offering.
  if (isSignedIn) {
    const user = await requireUser();
    const existing = await getCoupleForUser(user.id);

    if (existing) {
      redirect("/home");
    }
  }

  return (
    <Card className="space-y-6 text-center">
      <div>
        <p className="label mb-3">You&rsquo;re invited</p>
        <IconBadge
          icon={Heart}
          className="mb-4 animate-heartbeat"
          iconClassName="fill-current"
        />
        <h1 className="display text-3xl leading-tight">{coupleName}</h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-soft">
          {inviterName ? (
            <>
              <strong className="font-medium text-ink">{inviterName}</strong> made
              a little space for the two of you.
            </>
          ) : (
            <>Someone made a little space for the two of you.</>
          )}
        </p>
      </div>

      {isSignedIn ? (
        <AcceptInvite inviteCode={inviteCode} />
      ) : (
        <div className="space-y-3">
          <Link
            href={`/sign-up?redirect_url=${encodeURIComponent(`/join/${inviteCode}`)}`}
            className="block"
          >
            <Button size="lg" className="w-full">
              <UserPlus className="h-4.5 w-4.5" />
              Create an account to join
            </Button>
          </Link>
          <Link
            href={`/sign-in?redirect_url=${encodeURIComponent(`/join/${inviteCode}`)}`}
            className="block"
          >
            <Button variant="ghost" size="sm" className="w-full">
              I already have an account
            </Button>
          </Link>
        </div>
      )}
    </Card>
  );
}
