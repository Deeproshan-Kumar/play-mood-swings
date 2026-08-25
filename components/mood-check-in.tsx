"use client";

import { useState, useTransition } from "react";
import Link from "next/link";

import { checkInMood } from "@/lib/actions/song";
import { MOOD_BLURBS } from "@/lib/moods";
import { Button, cn } from "@/components/ui";
import { MoodIcon } from "@/components/icons";

type Mood = { id: string; slug: string; name: string; icon: string };

/** "How are you feeling?" (PRD §13). */
export function MoodCheckIn({
  moods,
  currentMoodId,
  compact = false,
}: {
  moods: Mood[];
  currentMoodId: string | null;
  compact?: boolean;
}) {
  const [selected, setSelected] = useState(currentMoodId);
  const [, startTransition] = useTransition();

  function choose(mood: Mood) {
    const next = selected === mood.id ? null : mood.id;
    setSelected(next);

    if (next) {
      startTransition(async () => {
        try {
          await checkInMood(mood.id);
        } catch {
          setSelected(currentMoodId);
        }
      });
    }
  }

  const active = moods.find((mood) => mood.id === selected);

  return (
    <div className="space-y-3">
      <div
        className={cn(
          "flex flex-wrap gap-2",
          compact ? "" : "justify-center gap-3",
        )}
      >
        {moods.map((mood) => (
          <Button
            key={mood.id}
            unstyled
            onClick={() => choose(mood)}
            aria-pressed={selected === mood.id}
            className={cn(
              "inline-flex items-center gap-2 rounded-full border transition-all",
              compact ? "px-4 py-2 text-sm" : "px-5 py-3 text-base",
              selected === mood.id
                ? "border-primary bg-blush text-primary shadow-[0_4px_16px_-8px_var(--glow)]"
                : "border-line bg-raised text-ink-soft hover:border-line-strong hover:text-ink",
            )}
          >
            <MoodIcon
              mood={mood}
              className={compact ? "h-4 w-4" : "h-4.5 w-4.5"}
            />
            {mood.name}
          </Button>
        ))}
      </div>

      {active ? (
        <p
          className={cn(
            "text-sm italic text-ink-soft",
            compact ? "" : "text-center",
          )}
        >
          {MOOD_BLURBS[active.slug] ?? "Noted."}{" "}
          <Link
            href={`/music?mood=${active.id}`}
            className="text-primary underline underline-offset-4"
          >
            Play {active.name.toLowerCase()} songs
          </Link>
        </p>
      ) : null}
    </div>
  );
}
