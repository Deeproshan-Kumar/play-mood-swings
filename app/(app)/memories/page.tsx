import { db } from "@/lib/db";
import { requireCoupleContext } from "@/lib/auth";
import { MemoryBoard } from "./memory-board";

export const metadata = { title: "Memories" };

/** Song memories (PRD §11) and standalone moments (PRD §15). */
export default async function MemoriesPage() {
  const { couple } = await requireCoupleContext();

  const [memories, songs] = await Promise.all([
    db.memory.findMany({
      where: { coupleId: couple.id },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
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
        createdBy: { select: { name: true } },
      },
    }),
    db.song.findMany({
      where: { coupleId: couple.id, isAvailable: true },
      orderBy: { position: "asc" },
      select: { id: true, title: true, artist: true },
    }),
  ]);

  return (
    <MemoryBoard
      memories={memories.map((memory) => ({
        id: memory.id,
        title: memory.title,
        description: memory.description,
        date: memory.date?.toISOString() ?? null,
        createdByName: memory.createdBy.name,
        song: memory.song,
      }))}
      songs={songs}
    />
  );
}
