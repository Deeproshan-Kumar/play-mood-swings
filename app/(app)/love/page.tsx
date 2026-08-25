import Link from "next/link";
import { Mail, UserPlus } from "lucide-react";

import { db } from "@/lib/db";
import { requireCoupleContext } from "@/lib/auth";
import { Button, EmptyState } from "@/components/ui";
import { LoveNotes } from "./love-notes";

export const metadata = { title: "Love" };

/** Love notes (PRD §10) — private to the two people in this space. */
export default async function LovePage() {
  const { user, couple, partner } = await requireCoupleContext();

  if (!partner) {
    return (
      <EmptyState
        icon={Mail}
        title="Notes need someone to read them"
        description="Once your partner joins your space, you can start leaving little messages for each other."
        action={
          <Link href="/onboarding/invite">
            <Button>
              <UserPlus className="h-4 w-4" />
              Invite your partner
            </Button>
          </Link>
        }
      />
    );
  }

  const notes = await db.loveNote.findMany({
    where: {
      coupleId: couple.id,
      // Scheduled notes stay hidden from the recipient until they're due,
      // but the sender always sees what they've queued up (PRD §10).
      OR: [
        { senderId: user.id },
        {
          recipientId: user.id,
          OR: [{ deliverAt: null }, { deliverAt: { lte: new Date() } }],
        },
      ],
    },
    orderBy: { createdAt: "desc" },
    include: { sender: { select: { id: true, name: true } } },
  });

  return (
    <LoveNotes
      notes={notes.map((note) => ({
        id: note.id,
        content: note.content,
        isRead: note.isRead,
        isFavorite: note.isFavorite,
        createdAt: note.createdAt.toISOString(),
        deliverAt: note.deliverAt?.toISOString() ?? null,
        isMine: note.senderId === user.id,
        senderName: note.sender.name,
      }))}
      partnerName={partner.name}
    />
  );
}
