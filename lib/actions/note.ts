"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/lib/db";
import { requireCoupleContext } from "@/lib/auth";
import { type ActionState, fail, messageFrom, ok } from "@/lib/actions/types";

/** Love notes (PRD §10). Only ever visible to the two people in the couple. */

const noteSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, "Write something first.")
    .max(2000, "That's a lot of love — try trimming it a little."),
  deliverAt: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? new Date(value) : null))
    .refine((value) => value === null || !Number.isNaN(value.getTime()), {
      message: "That delivery time doesn't look right.",
    }),
});

export async function sendNote(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, couple, partner } = await requireCoupleContext();

  if (!partner) {
    return fail("Invite your partner first — there's no one to send this to yet.");
  }

  const parsed = noteSchema.safeParse({
    content: formData.get("content"),
    deliverAt: formData.get("deliverAt") ?? undefined,
  });

  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Please check your note.");
  }

  const { content, deliverAt } = parsed.data;

  try {
    await db.loveNote.create({
      data: {
        coupleId: couple.id,
        senderId: user.id,
        recipientId: partner.id,
        content,
        // A past date means "send now".
        deliverAt: deliverAt && deliverAt > new Date() ? deliverAt : null,
      },
    });
  } catch (error) {
    return fail(messageFrom(error, "We couldn't send that note."));
  }

  revalidatePath("/love");
  revalidatePath("/home");

  return ok("Sent");
}

/** Marks a note read — only the recipient can do this. */
export async function markNoteRead(noteId: string): Promise<void> {
  const { user, couple } = await requireCoupleContext();

  await db.loveNote.updateMany({
    where: {
      id: noteId,
      coupleId: couple.id,
      recipientId: user.id,
      isRead: false,
    },
    data: { isRead: true, readAt: new Date() },
  });

  revalidatePath("/love");
  revalidatePath("/home");
}

/** Either partner can favourite a note in their shared thread. */
export async function toggleNoteFavorite(noteId: string): Promise<boolean> {
  const { couple } = await requireCoupleContext();

  const note = await db.loveNote.findFirst({
    where: { id: noteId, coupleId: couple.id },
    select: { id: true, isFavorite: true },
  });

  if (!note) {
    throw new Error("Note not found.");
  }

  await db.loveNote.update({
    where: { id: note.id },
    data: { isFavorite: !note.isFavorite },
  });

  revalidatePath("/love");

  return !note.isFavorite;
}

/** Only the sender can delete — you can't erase something written to you. */
export async function deleteNote(noteId: string): Promise<void> {
  const { user, couple } = await requireCoupleContext();

  await db.loveNote.deleteMany({
    where: { id: noteId, coupleId: couple.id, senderId: user.id },
  });

  revalidatePath("/love");
  revalidatePath("/home");
}
