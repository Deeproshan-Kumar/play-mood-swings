"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { Heart, Trash2, X } from "lucide-react";

import { createMemory, deleteMemory, toggleSongMood } from "@/lib/actions/song";
import { Button, Field, Input, Textarea } from "@/components/ui";
import { MoodIcon } from "@/components/icons";
import type { LibrarySong } from "./music-library";

type Mood = { id: string; slug: string; name: string; icon: string };

/** Per-song panel: attach a memory (PRD §11) and tag moods (PRD §13). */
export function SongSheet({
  song,
  moods,
  onClose,
}: {
  song: LibrarySong;
  moods: Mood[];
  onClose: () => void;
}) {
  const [taggedIds, setTaggedIds] = useState(new Set(song.moodIds));
  const [, startTransition] = useTransition();
  const [state, formAction, pending] = useActionState(createMemory, null);

  // Close on success so the freshly saved memory shows in the list behind.
  useEffect(() => {
    if (state?.success) onClose();
  }, [state?.success, onClose]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function tag(moodId: string) {
    setTaggedIds((previous) => {
      const next = new Set(previous);
      if (next.has(moodId)) {
        next.delete(moodId);
      } else {
        next.add(moodId);
      }
      return next;
    });

    startTransition(async () => {
      try {
        await toggleSongMood(song.id, moodId);
      } catch {
        setTaggedIds(new Set(song.moodIds));
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-70 flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={`Details for ${song.title}`}
    >
      <Button
        unstyled
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-(--scrim) backdrop-blur-sm"
      />

      <div className="relative max-h-[88dvh] w-full max-w-lg overflow-y-auto rounded-t-xl3 border border-line bg-raised p-6 shadow-2xl sm:rounded-xl3">
        <header className="mb-5">
          <p className="label mb-1">Song</p>
          <h2 className="display text-2xl leading-tight">{song.title}</h2>
          <p className="mt-1 text-sm text-ink-soft">
            {song.artist ?? "Unknown artist"}
          </p>
        </header>

        <section className="mb-6">
          <p className="label mb-2.5">Moods</p>
          <div className="flex flex-wrap gap-2">
            {moods.map((mood) => (
              <Button
                key={mood.id}
                size="chip"
                variant={taggedIds.has(mood.id) ? "selected" : "chip"}
                onClick={() => tag(mood.id)}
                aria-pressed={taggedIds.has(mood.id)}
              >
                <MoodIcon mood={mood} className="h-3.5 w-3.5" />
                {mood.name}
              </Button>
            ))}
          </div>
        </section>

        {song.memories.length > 0 ? (
          <section className="mb-6">
            <p className="label mb-2.5">Our memories with this song</p>
            <ul className="space-y-2">
              {song.memories.map((memory) => (
                <MemoryItem key={memory.id} memory={memory} />
              ))}
            </ul>
          </section>
        ) : null}

        <section>
          <p className="label mb-2.5">Attach a memory</p>

          <form action={formAction} className="space-y-4">
            <input type="hidden" name="songId" value={song.id} />

            <Field label="Title">
              <Input
                name="title"
                required
                maxLength={120}
                placeholder="Our first road trip"
              />
            </Field>

            <Field label="What happened?">
              <Textarea
                name="description"
                rows={3}
                maxLength={2000}
                placeholder="We listened to this the whole way there."
              />
            </Field>

            <Field label="When">
              <Input name="date" type="date" />
            </Field>

            {state?.error ? (
              <p role="alert" className="text-sm text-primary">
                {state.error}
              </p>
            ) : null}

            <div className="flex gap-2">
              <Button type="submit" disabled={pending} className="flex-1">
                <Heart className="h-4 w-4 fill-current" />
                {pending ? "Saving…" : "Save memory"}
              </Button>
              <Button type="button" variant="ghost" onClick={onClose}>
                <X className="h-4 w-4" />
                Close
              </Button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}

function MemoryItem({
  memory,
}: {
  memory: { id: string; title: string; description: string | null };
}) {
  const [, startTransition] = useTransition();
  const [removed, setRemoved] = useState(false);

  if (removed) return null;

  return (
    <li className="flex items-start justify-between gap-3 rounded-xl bg-sunken px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">{memory.title}</p>
        {memory.description ? (
          <p className="mt-0.5 text-sm italic text-ink-soft">
            &ldquo;{memory.description}&rdquo;
          </p>
        ) : null}
      </div>

      <Button
        unstyled
        onClick={() => {
          setRemoved(true);
          startTransition(async () => {
            try {
              await deleteMemory(memory.id);
            } catch {
              setRemoved(false);
            }
          });
        }}
        aria-label={`Delete memory ${memory.title}`}
        className="inline-flex shrink-0 items-center gap-1.5 text-xs text-ink-faint transition-colors hover:text-primary"
      >
        <Trash2 className="h-3.5 w-3.5" aria-hidden />
        Remove
      </Button>
    </li>
  );
}
