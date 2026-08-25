"use client";

import { useActionState, useState, useTransition } from "react";
import { Check, Heart, RefreshCw } from "lucide-react";

import { regenerateInviteCode, updateCouple } from "@/lib/actions/couple";
import { Button, Card, Field, Input, cn } from "@/components/ui";

export function CoupleSettings({
  name,
  relationshipStartDate,
  anniversaryDate,
  inviteCode,
  partnerName,
}: {
  name: string;
  relationshipStartDate: string;
  anniversaryDate: string;
  inviteCode: string;
  partnerName: string | null;
}) {
  const [state, formAction, pending] = useActionState(updateCouple, null);

  return (
    <Card className="space-y-6">
      <form action={formAction} className="space-y-4">
        <Field label="Name of our space">
          <Input name="name" defaultValue={name} required maxLength={60} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Together since">
            <Input
              name="relationshipStartDate"
              type="date"
              defaultValue={relationshipStartDate}
            />
          </Field>

          <Field label="Anniversary">
            <Input
              name="anniversaryDate"
              type="date"
              defaultValue={anniversaryDate}
            />
          </Field>
        </div>

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

        <Button type="submit" size="sm" disabled={pending}>
          <Check className="h-4 w-4" />
          {pending ? "Saving…" : "Save changes"}
        </Button>
      </form>

      <div className="border-t border-line pt-5">
        <p className="label mb-2">Partner</p>

        {partnerName ? (
          <p className="flex items-center gap-1.5 text-sm">
            {partnerName}
            <span className="flex items-center gap-1.5 text-ink-faint">
              — you&rsquo;re both here
              <Heart className="h-3.5 w-3.5 fill-current text-primary" aria-hidden />
            </span>
          </p>
        ) : (
          <InviteCode code={inviteCode} />
        )}
      </div>
    </Card>
  );
}

function InviteCode({ code }: { code: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-soft">
        Share this code so your partner can join.
      </p>

      <p className="display text-2xl tracking-[0.28em] text-primary select-all">
        {code}
      </p>

      {error ? (
        <p role="alert" className="text-sm text-primary">
          {error}
        </p>
      ) : null}

      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await regenerateInviteCode();
            setError(result?.error ?? null);
          })
        }
      >
        <RefreshCw className={cn("h-4 w-4", pending && "animate-spin")} />
        {pending ? "Refreshing…" : "Generate a new code"}
      </Button>
    </div>
  );
}
