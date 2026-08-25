"use server";

import { randomInt } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";

import { db } from "@/lib/db";
import { getCoupleForUser, requireCoupleContext, requireUser } from "@/lib/auth";
import { DEFAULT_MOODS } from "@/lib/moods";
import { THEME_COOKIE, themeFromEnum } from "@/lib/theme";
import { type ActionState, fail, messageFrom, ok } from "@/lib/actions/types";

/** Unambiguous alphabet — no O/0 or I/1, since these get read aloud. */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateInviteCode(length = 8) {
  let code = "";
  for (let i = 0; i < length; i += 1) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

async function uniqueInviteCode() {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = generateInviteCode();
    const taken = await db.couple.findUnique({
      where: { inviteCode: code },
      select: { id: true },
    });
    if (!taken) return code;
  }
  throw new Error("Could not allocate an invite code. Please try again.");
}

const optionalDate = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value ? new Date(value) : null))
  .refine((value) => value === null || !Number.isNaN(value.getTime()), {
    message: "That date doesn't look right.",
  });

const createCoupleSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Give your space a name.")
    .max(60, "That name is a little too long."),
  relationshipStartDate: optionalDate,
  anniversaryDate: optionalDate,
});

export async function createCouple(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();

  const existing = await getCoupleForUser(user.id);
  if (existing) {
    redirect("/home");
  }

  const parsed = createCoupleSchema.safeParse({
    name: formData.get("name"),
    relationshipStartDate: formData.get("relationshipStartDate") ?? undefined,
    anniversaryDate: formData.get("anniversaryDate") ?? undefined,
  });

  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Please check the form.");
  }

  const { name, relationshipStartDate, anniversaryDate } = parsed.data;

  try {
    const inviteCode = await uniqueInviteCode();

    await db.couple.create({
      data: {
        name,
        partner1Id: user.id,
        relationshipStartDate,
        anniversaryDate,
        inviteCode,
        // Every couple gets their own copy of the starter moods (PRD §13).
        moods: {
          create: DEFAULT_MOODS.map((mood, index) => ({
            slug: mood.slug,
            name: mood.name,
            icon: mood.icon,
            sortOrder: index,
          })),
        },
      },
    });
  } catch (error) {
    return fail(messageFrom(error, "We couldn't create your space."));
  }

  redirect("/onboarding/invite");
}

const joinSchema = z.object({
  inviteCode: z
    .string()
    .trim()
    .min(1, "Enter the invite code your partner shared.")
    .transform((value) => value.toUpperCase().replace(/[\s-]/g, "")),
});

export async function joinCouple(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();

  const existing = await getCoupleForUser(user.id);
  if (existing) {
    return fail("You're already part of a space.");
  }

  const parsed = joinSchema.safeParse({ inviteCode: formData.get("inviteCode") });
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Please check the code.");
  }

  const couple = await db.couple.findUnique({
    where: { inviteCode: parsed.data.inviteCode },
  });

  if (!couple) {
    return fail("That invite code doesn't match any space.");
  }

  if (couple.partner1Id === user.id) {
    return fail("That's your own invite code.");
  }

  if (couple.partner2Id) {
    return fail("This space already has both partners.");
  }

  try {
    await db.couple.update({
      where: { id: couple.id },
      data: { partner2Id: user.id },
    });
  } catch (error) {
    return fail(messageFrom(error, "We couldn't join that space."));
  }

  redirect("/home");
}

const updateCoupleSchema = z.object({
  name: z.string().trim().min(1, "Your space needs a name.").max(60),
  relationshipStartDate: optionalDate,
  anniversaryDate: optionalDate,
});

export async function updateCouple(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { couple } = await requireCoupleContext();

  const parsed = updateCoupleSchema.safeParse({
    name: formData.get("name"),
    relationshipStartDate: formData.get("relationshipStartDate") ?? undefined,
    anniversaryDate: formData.get("anniversaryDate") ?? undefined,
  });

  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Please check the form.");
  }

  try {
    await db.couple.update({
      where: { id: couple.id },
      data: parsed.data,
    });
  } catch (error) {
    return fail(messageFrom(error, "We couldn't save those changes."));
  }

  revalidatePath("/settings");
  revalidatePath("/us");
  revalidatePath("/home");

  return ok("Saved");
}

const themeSchema = z.enum(["LIGHT", "DARK", "ROMANTIC"]);

export async function setTheme(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { couple } = await requireCoupleContext();

  const parsed = themeSchema.safeParse(formData.get("theme"));
  if (!parsed.success) {
    return fail("Unknown theme.");
  }

  await db.couple.update({
    where: { id: couple.id },
    data: { theme: parsed.data },
  });

  // Mirrored into a cookie so the root layout can render the right theme
  // during SSR instead of flashing the default.
  const store = await cookies();
  store.set(THEME_COOKIE, themeFromEnum(parsed.data), {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });

  revalidatePath("/", "layout");

  return ok("Theme updated");
}

/** Rotates the code, e.g. if it was shared with the wrong person. */
export async function regenerateInviteCode(): Promise<ActionState> {
  const { couple } = await requireCoupleContext();

  if (couple.partner2Id) {
    return fail("Both partners have already joined.");
  }

  try {
    await db.couple.update({
      where: { id: couple.id },
      data: { inviteCode: await uniqueInviteCode() },
    });
  } catch (error) {
    return fail(messageFrom(error, "We couldn't refresh the code."));
  }

  revalidatePath("/onboarding/invite");
  revalidatePath("/settings");

  return ok("New code ready");
}

/** PRD §20: a couple must be able to delete their space and all its data. */
export async function deleteCoupleSpace(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { couple } = await requireCoupleContext();

  const confirmation = String(formData.get("confirm") ?? "").trim();
  if (confirmation !== couple.name) {
    return fail("Type the name of your space exactly to confirm.");
  }

  try {
    // Cascades remove songs, notes, memories, moods, and the YouTube link.
    await db.couple.delete({ where: { id: couple.id } });
  } catch (error) {
    return fail(messageFrom(error, "We couldn't delete the space."));
  }

  redirect("/onboarding");
}
