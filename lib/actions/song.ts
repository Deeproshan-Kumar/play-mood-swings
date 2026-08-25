"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/lib/db";
import { assertSongInCouple, requireCoupleContext } from "@/lib/auth";
import { type ActionState, fail, messageFrom, ok } from "@/lib/actions/types";

/**
 * Every action here re-derives the couple from the session and checks the
 * target row belongs to it. Server Actions accept direct POSTs, so the UI
 * having hidden the button is never treated as authorisation (PRD §20).
 */

/** PRD §12 — each person keeps their own favourites. */
export async function toggleFavorite(songId: string): Promise<boolean> {
  const { user, couple } = await requireCoupleContext();

  await assertSongInCouple(songId, couple.id);

  const existing = await db.favorite.findUnique({
    where: { userId_songId: { userId: user.id, songId } },
  });

  if (existing) {
    await db.favorite.delete({
      where: { userId_songId: { userId: user.id, songId } },
    });
  } else {
    await db.favorite.create({ data: { userId: user.id, songId } });
  }

  revalidatePath("/music");
  revalidatePath("/us");
  revalidatePath("/home");

  return !existing;
}

const memorySchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Give this memory a title.")
    .max(120, "That title is a little long."),
  description: z
    .string()
    .trim()
    .max(2000, "That's a long memory — try trimming it.")
    .optional()
    .transform((value) => value || null),
  date: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? new Date(value) : null))
    .refine((value) => value === null || !Number.isNaN(value.getTime()), {
      message: "That date doesn't look right.",
    }),
  songId: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || null),
});

/** PRD §11 — attach a memory to a song (or keep it standalone, PRD §15). */
export async function createMemory(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, couple } = await requireCoupleContext();

  const parsed = memorySchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description") ?? undefined,
    date: formData.get("date") ?? undefined,
    songId: formData.get("songId") ?? undefined,
  });

  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Please check the form.");
  }

  const { title, description, date, songId } = parsed.data;

  try {
    if (songId) {
      await assertSongInCouple(songId, couple.id);
    }

    await db.memory.create({
      data: {
        coupleId: couple.id,
        createdById: user.id,
        title,
        description,
        date,
        songId,
      },
    });
  } catch (error) {
    return fail(messageFrom(error, "We couldn't save that memory."));
  }

  revalidatePath("/memories");
  revalidatePath("/music");
  revalidatePath("/home");

  return ok("Memory saved");
}

export async function deleteMemory(memoryId: string): Promise<void> {
  const { couple } = await requireCoupleContext();

  // Scoped delete — a memory id from another couple simply matches nothing.
  await db.memory.deleteMany({
    where: { id: memoryId, coupleId: couple.id },
  });

  revalidatePath("/memories");
  revalidatePath("/music");
  revalidatePath("/home");
}

/** PRD §13 — tag a song with a mood so moods can filter the library. */
export async function toggleSongMood(
  songId: string,
  moodId: string,
): Promise<boolean> {
  const { couple } = await requireCoupleContext();

  await assertSongInCouple(songId, couple.id);

  const mood = await db.mood.findFirst({
    where: { id: moodId, coupleId: couple.id },
    select: { id: true },
  });

  if (!mood) {
    throw new Error("Unknown mood.");
  }

  const existing = await db.songMood.findUnique({
    where: { songId_moodId: { songId, moodId } },
  });

  if (existing) {
    await db.songMood.delete({ where: { songId_moodId: { songId, moodId } } });
  } else {
    await db.songMood.create({ data: { songId, moodId } });
  }

  revalidatePath("/music");
  revalidatePath("/mood");

  return !existing;
}

/** Records "how are you feeling" for the current user (PRD §13). */
export async function checkInMood(moodId: string): Promise<void> {
  const { user, couple } = await requireCoupleContext();

  const mood = await db.mood.findFirst({
    where: { id: moodId, coupleId: couple.id },
    select: { id: true },
  });

  if (!mood) {
    throw new Error("Unknown mood.");
  }

  await db.moodCheckIn.create({
    data: { coupleId: couple.id, userId: user.id, moodId },
  });

  revalidatePath("/mood");
  revalidatePath("/home");
}
