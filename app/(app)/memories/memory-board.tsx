"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Heart, Music2, Plus, Sparkles, Trash2, X } from "lucide-react";

import { createMemory, deleteMemory } from "@/lib/actions/song";
import { formatDate } from "@/lib/format";
import { Button, Card, EmptyState, Field, Input, Textarea } from "@/components/ui";
import { PlayForUsButton } from "@/components/track-row";
import type { PlayerTrack } from "@/components/player/types";

type MemoryView = {
  id: string;
  title: string;
  description: string | null;
  date: string | null;
  createdByName: string | null;
  song: PlayerTrack | null;
};

export function MemoryBoard({
  memories,
  songs,
}: {
  memories: MemoryView[];
  songs: Array<{ id: string; title: string; artist: string | null }>;
}) {
  const [composing, setComposing] = useState(false);

  return (
    <div className="space-y-7">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label">Memories</p>
          <h1 className="display mt-1 text-4xl sm:text-5xl">Our moments</h1>
          <p className="mt-1.5 text-sm text-ink-soft">
            The ones worth keeping, and the songs that go with them.
          </p>
        </div>

        <Button size="sm" onClick={() => setComposing((on) => !on)}>
          {composing ? (
            <X className="h-4 w-4" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          {composing ? "Never mind" : "Add a memory"}
        </Button>
      </header>

      {composing ? (
        <MemoryForm songs={songs} onDone={() => setComposing(false)} />
      ) : null}

      {memories.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title="No memories yet"
          description="Write down the first one — a trip, a night in, the day everything changed."
          action={
            <Button onClick={() => setComposing(true)}>
              <Plus className="h-4 w-4" />
              Add a memory
            </Button>
          }
        />
      ) : (
        <ul className="stagger grid gap-4 sm:grid-cols-2">
          {memories.map((memory) => (
            <MemoryCard key={memory.id} memory={memory} />
          ))}
        </ul>
      )}
    </div>
  );
}

function MemoryForm({
  songs,
  onDone,
}: {
  songs: Array<{ id: string; title: string; artist: string | null }>;
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState(createMemory, null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.success) {
      formRef.current?.reset();
      onDone();
    }
  }, [state?.success, onDone]);

  return (
    <Card>
      <form ref={formRef} action={formAction} className="space-y-4">
        <Field label="What do you want to remember?">
          <Input name="title" required maxLength={120} placeholder="Our first date" />
        </Field>

        <Field label="Tell the story">
          <Textarea
            name="description"
            rows={3}
            maxLength={2000}
            placeholder="Everything about that week."
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="When">
            <Input name="date" type="date" />
          </Field>

          <Field label="Song" hint="Optional — ties the memory to your music.">
            <select
              name="songId"
              defaultValue=""
              className="h-11 w-full rounded-xl border border-line bg-raised px-3 text-sm focus:border-accent focus:outline-none"
            >
              <option value="">No song</option>
              {songs.map((song) => (
                <option key={song.id} value={song.id}>
                  {song.title}
                  {song.artist ? ` — ${song.artist}` : ""}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {state?.error ? (
          <p role="alert" className="text-sm text-primary">
            {state.error}
          </p>
        ) : null}

        <div className="flex gap-2">
          <Button type="submit" disabled={pending}>
            <Heart className="h-4 w-4 fill-current" />
            {pending ? "Saving…" : "Save memory"}
          </Button>
          <Button type="button" variant="ghost" onClick={onDone}>
            <X className="h-4 w-4" />
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}

function MemoryCard({ memory }: { memory: MemoryView }) {
  const [removed, setRemoved] = useState(false);
  const [, startTransition] = useTransition();

  if (removed) return null;

  return (
    <li>
      <Card className="hoverable flex h-full flex-col">
        {memory.date ? (
          <p className="label mb-2">{formatDate(memory.date)}</p>
        ) : null}

        <h2 className="display text-2xl leading-tight">{memory.title}</h2>

        {memory.description ? (
          <p className="mt-2 flex-1 text-sm leading-relaxed text-ink-soft">
            {memory.description}
          </p>
        ) : (
          <div className="flex-1" />
        )}

        {memory.song ? (
          <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-sunken px-4 py-3">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-sm font-medium">
                <Music2 className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                <span className="truncate">{memory.song.title}</span>
              </p>
              <p className="truncate text-xs text-ink-soft">
                {memory.song.artist ?? "Unknown artist"}
              </p>
            </div>
            <PlayForUsButton track={memory.song} />
          </div>
        ) : null}

        <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
          <span className="text-xs text-ink-faint">
            {memory.createdByName ? `Added by ${memory.createdByName}` : ""}
          </span>
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
            className="inline-flex items-center gap-1.5 text-xs text-ink-faint transition-colors hover:text-primary"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
            Delete
          </Button>
        </div>
      </Card>
    </li>
  );
}
