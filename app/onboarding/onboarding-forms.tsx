"use client";

import { useActionState, useState } from "react";
import { Heart, LogIn } from "lucide-react";

import { createCouple, joinCouple } from "@/lib/actions/couple";
import { Button, Card, Field, Input } from "@/components/ui";

type Mode = "create" | "join";

export function OnboardingForms() {
  const [mode, setMode] = useState<Mode>("create");

  return (
    <div className="space-y-4">
      <div
        role="tablist"
        aria-label="Set up your space"
        className="grid grid-cols-2 gap-1 rounded-full border border-line bg-sunken p-1"
      >
        <TabButton
          active={mode === "create"}
          onClick={() => setMode("create")}
          label="Start a new space"
        />
        <TabButton
          active={mode === "join"}
          onClick={() => setMode("join")}
          label="Join with a code"
        />
      </div>

      {mode === "create" ? <CreateSpaceForm /> : <JoinSpaceForm />}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <Button
      unstyled
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`h-9 rounded-full text-sm font-medium transition-colors ${
        active ? "bg-raised text-ink shadow-sm" : "text-ink-soft hover:text-ink"
      }`}
    >
      {label}
    </Button>
  );
}

function CreateSpaceForm() {
  const [state, formAction, pending] = useActionState(createCouple, null);

  return (
    <Card>
      <form action={formAction} className="space-y-5">
        <Field label="What should we call it?" hint="For example: Alex + Sarah">
          <Input
            name="name"
            required
            maxLength={60}
            autoComplete="off"
            placeholder="Alex + Sarah"
          />
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Together since" hint="Powers your day counter.">
            <Input name="relationshipStartDate" type="date" />
          </Field>

          <Field label="Anniversary" hint="Optional.">
            <Input name="anniversaryDate" type="date" />
          </Field>
        </div>

        {state?.error ? (
          <p role="alert" className="text-sm text-primary">
            {state.error}
          </p>
        ) : null}

        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          <Heart className="h-4.5 w-4.5 fill-current" />
          {pending ? "Creating…" : "Create our space"}
        </Button>
      </form>
    </Card>
  );
}

function JoinSpaceForm() {
  const [state, formAction, pending] = useActionState(joinCouple, null);

  return (
    <Card>
      <form action={formAction} className="space-y-5">
        <Field
          label="Invite code"
          hint="The eight characters your partner shared with you."
        >
          <Input
            name="inviteCode"
            required
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="ABCD2345"
            className="text-center text-lg tracking-[0.3em] uppercase"
          />
        </Field>

        {state?.error ? (
          <p role="alert" className="text-sm text-primary">
            {state.error}
          </p>
        ) : null}

        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          <LogIn className="h-4.5 w-4.5" />
          {pending ? "Joining…" : "Join their space"}
        </Button>
      </form>
    </Card>
  );
}
