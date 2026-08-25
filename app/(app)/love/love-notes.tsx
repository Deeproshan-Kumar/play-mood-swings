"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import {
  Clock,
  Heart,
  Inbox,
  Mail,
  Send,
  Trash2,
  type LucideIcon,
} from "lucide-react";

import {
  deleteNote,
  markNoteRead,
  sendNote,
  toggleNoteFavorite,
} from "@/lib/actions/note";
import { formatRelative } from "@/lib/format";
import { Button, Card, EmptyState, Textarea, cn } from "@/components/ui";

export type NoteView = {
  id: string;
  content: string;
  isRead: boolean;
  isFavorite: boolean;
  createdAt: string;
  deliverAt: string | null;
  isMine: boolean;
  senderName: string | null;
};

type Tab = "all" | "received" | "sent" | "favourites";

export function LoveNotes({
  notes,
  partnerName,
}: {
  notes: NoteView[];
  partnerName: string | null;
}) {
  const [tab, setTab] = useState<Tab>("all");

  const visible = notes.filter((note) => {
    if (tab === "received") return !note.isMine;
    if (tab === "sent") return note.isMine;
    if (tab === "favourites") return note.isFavorite;
    return true;
  });

  const unread = notes.filter((note) => !note.isMine && !note.isRead).length;

  const tabs: Array<{ key: Tab; label: string; icon: LucideIcon }> = [
    { key: "all", label: "Everything", icon: Inbox },
    {
      key: "received",
      label: `For me${unread > 0 ? ` (${unread})` : ""}`,
      icon: Mail,
    },
    { key: "sent", label: "From me", icon: Send },
    { key: "favourites", label: "Kept", icon: Heart },
  ];

  return (
    <div className="space-y-7">
      <header>
        <p className="label">Love</p>
        <h1 className="display mt-1 text-4xl sm:text-5xl">
          Notes for {partnerName?.split(" ")[0] ?? "you"}
        </h1>
        <p className="mt-1.5 text-sm text-ink-soft">
          Small things, said out loud.
        </p>
      </header>

      <Composer partnerName={partnerName} />

      <div className="flex flex-wrap gap-2">
        {tabs.map((item) => (
          <Button
            key={item.key}
            size="chip"
            variant={tab === item.key ? "selected" : "chip"}
            onClick={() => setTab(item.key)}
            aria-pressed={tab === item.key}
          >
            <item.icon aria-hidden className="h-3.5 w-3.5" />
            {item.label}
          </Button>
        ))}
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={Mail}
          title="Nothing here yet"
          description="Write the first one. It doesn't have to be clever — it just has to be true."
        />
      ) : (
        <ul className="stagger space-y-3">
          {visible.map((note) => (
            <NoteCard key={note.id} note={note} />
          ))}
        </ul>
      )}
    </div>
  );
}

function Composer({ partnerName }: { partnerName: string | null }) {
  const [state, formAction, pending] = useActionState(sendNote, null);
  const [showSchedule, setShowSchedule] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // Clearing the form is a DOM side effect; the schedule panel stays open so
  // you can queue up several notes in a row.
  useEffect(() => {
    if (state?.success) {
      formRef.current?.reset();
    }
  }, [state?.success]);

  return (
    <Card>
      <form ref={formRef} action={formAction} className="space-y-4">
        <Textarea
          name="content"
          required
          rows={3}
          maxLength={2000}
          placeholder={`Tell ${partnerName?.split(" ")[0] ?? "them"} something…`}
          aria-label="Your note"
        />

        {showSchedule ? (
          <label className="block space-y-1.5">
            <span className="label block">Deliver later</span>
            <input
              type="datetime-local"
              name="deliverAt"
              className="h-10 rounded-xl border border-line bg-raised px-3 text-sm focus:border-accent focus:outline-none"
            />
            <span className="block text-xs text-ink-faint">
              They won&rsquo;t see it until then.
            </span>
          </label>
        ) : null}

        {state?.error ? (
          <p role="alert" className="text-sm text-primary">
            {state.error}
          </p>
        ) : null}
        {state?.success ? (
          <p role="status" className="text-sm text-primary">
            {state.success}
          </p>
        ) : null}

        <div className="flex items-center gap-2">
          <Button type="submit" disabled={pending}>
            <Send className="h-4 w-4" />
            {pending ? "Sending…" : "Send it"}
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowSchedule((on) => !on)}
          >
            {showSchedule ? (
              <Send className="h-4 w-4" />
            ) : (
              <Clock className="h-4 w-4" />
            )}
            {showSchedule ? "Send now instead" : "Schedule it"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function NoteCard({ note }: { note: NoteView }) {
  const [isFavorite, setIsFavorite] = useState(note.isFavorite);
  const [removed, setRemoved] = useState(false);
  const [, startTransition] = useTransition();
  const seen = useRef(note.isRead || note.isMine);

  // Opening the page is the read receipt for anything addressed to you.
  useEffect(() => {
    if (seen.current) return;
    seen.current = true;
    startTransition(async () => {
      try {
        await markNoteRead(note.id);
      } catch {
        // Non-critical — it stays unread and we'll retry next visit.
      }
    });
  }, [note.id]);

  if (removed) return null;

  const scheduled = note.deliverAt ? new Date(note.deliverAt) > new Date() : false;

  return (
    <li>
      <Card
        className={cn(
          "transition-colors",
          !note.isMine && !note.isRead && "border-line-strong bg-blush/40",
        )}
      >
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="label">
            {note.isMine ? "From me" : `From ${note.senderName ?? "them"}`}
            {scheduled ? " · scheduled" : ""}
          </p>
          <span className="text-xs text-ink-faint">
            {scheduled && note.deliverAt
              ? `arrives ${new Date(note.deliverAt).toLocaleString()}`
              : formatRelative(note.createdAt)}
          </span>
        </div>

        <p className="font-serif text-lg leading-relaxed whitespace-pre-wrap">
          {note.content}
        </p>

        <div className="mt-4 flex items-center gap-1 border-t border-line pt-3">
          <Button
            unstyled
            onClick={() => {
              setIsFavorite((on) => !on);
              startTransition(async () => {
                try {
                  await toggleNoteFavorite(note.id);
                } catch {
                  setIsFavorite(note.isFavorite);
                }
              });
            }}
            aria-pressed={isFavorite}
            aria-label={isFavorite ? "Remove from kept notes" : "Keep this note"}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition-colors",
              isFavorite
                ? "text-primary"
                : "text-ink-faint hover:text-primary",
            )}
          >
            <Heart className={cn("h-4 w-4", isFavorite && "fill-current")} />
            {isFavorite ? "Kept" : "Keep"}
          </Button>

          {note.isMine ? (
            <Button
              unstyled
              onClick={() => {
                setRemoved(true);
                startTransition(async () => {
                  try {
                    await deleteNote(note.id);
                  } catch {
                    setRemoved(false);
                  }
                });
              }}
              className="ml-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-ink-faint transition-colors hover:text-primary"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
              Delete
            </Button>
          ) : null}
        </div>
      </Card>
    </li>
  );
}
