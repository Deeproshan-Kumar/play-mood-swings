"use client";

import { useActionState, useState } from "react";
import { Trash2, X } from "lucide-react";

import { deleteCoupleSpace } from "@/lib/actions/couple";
import { Button, Card, Field, Input } from "@/components/ui";

/** PRD §20 — a couple must be able to delete their space and everything in it. */
export function DangerZone({ coupleName }: { coupleName: string }) {
  const [state, formAction, pending] = useActionState(deleteCoupleSpace, null);
  const [open, setOpen] = useState(false);

  return (
    <Card className="border-line-strong">
      <p className="text-sm font-medium">Delete our space</p>
      <p className="mt-1 text-sm text-ink-soft">
        This removes every song, note, memory, and mood in{" "}
        <strong className="text-ink">{coupleName}</strong>. It cannot be undone.
      </p>

      {open ? (
        <form action={formAction} className="mt-5 space-y-4">
          <Field label={`Type "${coupleName}" to confirm`}>
            <Input name="confirm" autoComplete="off" placeholder={coupleName} />
          </Field>

          {state?.error ? (
            <p role="alert" className="text-sm text-primary">
              {state.error}
            </p>
          ) : null}

          <div className="flex gap-2">
            <Button type="submit" variant="danger" size="sm" disabled={pending}>
              <Trash2 className="h-4 w-4" />
              {pending ? "Deleting…" : "Delete everything"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setOpen(false)}
            >
              <X className="h-4 w-4" />
              Keep it
            </Button>
          </div>
        </form>
      ) : (
        <Button
          type="button"
          variant="danger"
          size="sm"
          className="mt-4"
          onClick={() => setOpen(true)}
        >
          <Trash2 className="h-4 w-4" />
          Delete our space
        </Button>
      )}
    </Card>
  );
}
