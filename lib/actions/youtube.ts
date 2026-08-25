"use server";

import { revalidatePath } from "next/cache";

import { requireCoupleContext } from "@/lib/auth";
import { syncPlaylist } from "@/lib/sync";
import { type ActionState, fail, messageFrom, ok } from "@/lib/actions/types";

/**
 * The playlist is fixed app-wide (`lib/youtube-config.ts`), so there is no
 * connect or disconnect flow — only "Sync Now" (PRD §7).
 */
export async function syncNow(): Promise<ActionState> {
  const { couple } = await requireCoupleContext();

  try {
    const result = await syncPlaylist(couple.id);

    revalidatePath("/music");
    revalidatePath("/settings");
    revalidatePath("/", "layout");

    const changes = [
      result.added > 0 && `${result.added} added`,
      result.removed > 0 && `${result.removed} removed`,
      result.restored > 0 && `${result.restored} back`,
      result.reordered > 0 && `${result.reordered} reordered`,
    ].filter(Boolean);

    return ok(
      changes.length > 0 ? `Synced — ${changes.join(", ")}` : "Already up to date",
    );
  } catch (error) {
    return fail(messageFrom(error, "Sync failed."));
  }
}
