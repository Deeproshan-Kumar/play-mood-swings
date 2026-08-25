import "server-only";

import { auth, clerkClient, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { db } from "@/lib/db";
import { Prisma } from "@/lib/generated/prisma/client";

/**
 * Access control (PRD §20).
 *
 * Every helper here derives the couple from the *session*, never from anything
 * the client sends. Callers get a `coupleId` they can safely scope queries to;
 * no route or action should ever accept a coupleId as input.
 */

/** Clerk user id for the current session, or null when signed out. */
export async function getUserId() {
  const { userId } = await auth();
  return userId;
}

type ClerkUser = NonNullable<Awaited<ReturnType<typeof currentUser>>>;

/** The columns on `User` that Clerk owns. `email` is unique in our schema. */
type MirroredProfile = { email: string; name: string; avatar: string };

/** The address Clerk marks primary, or their only one when none is marked. */
function primaryEmail(clerkUser: ClerkUser) {
  return clerkUser.primaryEmailAddress ?? clerkUser.emailAddresses[0] ?? null;
}

function profileFor(clerkUser: ClerkUser, email: string): MirroredProfile {
  return {
    email,
    name:
      [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") ||
      clerkUser.username ||
      email.split("@")[0],
    avatar: clerkUser.imageUrl,
  };
}

/**
 * Mirrors the Clerk user into our `User` table so relations have something to
 * point at. Lazily synced on first authenticated render — Clerk stays the
 * source of truth for identity.
 */
export async function requireUser() {
  const clerkUser = await currentUser();

  if (!clerkUser) {
    redirect("/sign-in");
  }

  const address = primaryEmail(clerkUser);

  if (!address) {
    throw new Error("Clerk user has no email address on file.");
  }

  const profile = profileFor(clerkUser, address.emailAddress);
  const emailIsVerified = address.verification?.status === "verified";

  try {
    return await mirrorClerkUser(clerkUser.id, profile, emailIsVerified);
  } catch (error) {
    // Two first renders for the same person can race each other. Whichever
    // insert lost re-resolves against the row the winner just wrote.
    if (isUniqueViolation(error)) {
      return mirrorClerkUser(clerkUser.id, profile, emailIsVerified);
    }

    throw error;
  }
}

function isUniqueViolation(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

async function mirrorClerkUser(
  clerkUserId: string,
  profile: MirroredProfile,
  emailIsVerified: boolean,
) {
  const mirrored = await db.user.findUnique({ where: { clerkUserId } });

  if (mirrored) {
    return db.user.update({ where: { id: mirrored.id }, data: profile });
  }

  // First render for this Clerk id. `email` is unique, so a row left behind by
  // an earlier Clerk account on the same address has to be resolved before we
  // insert — a plain upsert on `clerkUserId` would fail its create path and
  // take down every authenticated page with it.
  const onSameEmail = await db.user.findUnique({
    where: { email: profile.email },
  });

  if (onSameEmail) {
    return resolveEmailClash(
      onSameEmail,
      clerkUserId,
      profile,
      emailIsVerified,
    );
  }

  return db.user.create({ data: { clerkUserId, ...profile } });
}

/**
 * Another row already holds this email. Only Clerk can say what that means,
 * since our copy of that row's address may simply be out of date.
 */
async function resolveEmailClash(
  existing: { id: string; clerkUserId: string; email: string },
  clerkUserId: string,
  profile: MirroredProfile,
  emailIsVerified: boolean,
) {
  const previousOwner = await findClerkUser(existing.clerkUserId);

  if (!previousOwner) {
    // The Clerk account behind that row is gone — deleted, or wiped along with
    // a dev instance. Whoever can prove they own the address inherits the
    // space built under it, rather than landing in onboarding with their
    // couple, songs and notes stranded on an unreachable row.
    if (!emailIsVerified) {
      throw new Error(
        `A space already exists under ${profile.email} from an earlier account. Verify that address in Clerk to claim it.`,
      );
    }

    return db.user.update({
      where: { id: existing.id },
      data: { clerkUserId, ...profile },
    });
  }

  const ownerEmail = primaryEmail(previousOwner)?.emailAddress;

  if (ownerEmail && ownerEmail !== existing.email) {
    // They moved to a different address and we never noticed, which is what
    // freed this one. Catch the stale row up, then take the insert we came for.
    await db.user.update({
      where: { id: existing.id },
      data: { email: ownerEmail },
    });

    return db.user.create({ data: { clerkUserId, ...profile } });
  }

  throw new Error(
    `Two live Clerk accounts claim ${profile.email}. Delete or re-address one of them in Clerk before signing in.`,
  );
}

/** Null when the id no longer exists in Clerk; every other failure rethrows. */
async function findClerkUser(clerkUserId: string) {
  const clerk = await clerkClient();

  try {
    return await clerk.users.getUser(clerkUserId);
  } catch (error) {
    // Clerk's backend client surfaces a deleted user as a 404 response. A
    // network blip must not read as "gone" — that would hand the row over.
    if ((error as { status?: unknown } | null)?.status === 404) {
      return null;
    }

    throw error;
  }
}

const coupleInclude = {
  partner1: true,
  partner2: true,
} as const;

/** The couple this user belongs to, as either partner. Null if they have none. */
export async function getCoupleForUser(userId: string) {
  return db.couple.findFirst({
    where: {
      OR: [{ partner1Id: userId }, { partner2Id: userId }],
    },
    include: coupleInclude,
  });
}

export type CoupleContext = {
  user: Awaited<ReturnType<typeof requireUser>>;
  couple: NonNullable<Awaited<ReturnType<typeof getCoupleForUser>>>;
  /** The other person, or null while the invite is still outstanding. */
  partner: { id: string; name: string | null; avatar: string | null } | null;
};

/**
 * The gate every authenticated page and server action goes through.
 * Redirects to onboarding when the user has not created or joined a space yet.
 */
export async function requireCoupleContext(): Promise<CoupleContext> {
  const user = await requireUser();
  const couple = await getCoupleForUser(user.id);

  if (!couple) {
    redirect("/onboarding");
  }

  const partnerRecord =
    couple.partner1Id === user.id ? couple.partner2 : couple.partner1;

  return {
    user,
    couple,
    partner: partnerRecord
      ? {
          id: partnerRecord.id,
          name: partnerRecord.name,
          avatar: partnerRecord.avatar,
        }
      : null,
  };
}

/**
 * Confirms a record actually belongs to the caller's couple before it is
 * mutated. Server Actions are reachable by direct POST, so ownership is
 * re-checked here rather than trusted from the UI that rendered the form.
 */
export async function assertSongInCouple(songId: string, coupleId: string) {
  const song = await db.song.findFirst({
    where: { id: songId, coupleId },
    select: { id: true },
  });

  if (!song) {
    throw new Error("Song not found in this space.");
  }

  return song;
}
