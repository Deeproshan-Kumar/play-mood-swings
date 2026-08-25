"use client";

import { useActionState } from "react";
import { Heart } from "lucide-react";

import { joinCouple } from "@/lib/actions/couple";
import { Button } from "@/components/ui";

export function AcceptInvite({ inviteCode }: { inviteCode: string }) {
  const [state, formAction, pending] = useActionState(joinCouple, null);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="inviteCode" value={inviteCode} />

      {state?.error ? (
        <p role="alert" className="text-sm text-primary">
          {state.error}
        </p>
      ) : null}

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        <Heart className="h-4.5 w-4.5 fill-current" />
        {pending ? "Joining…" : "Join our space"}
      </Button>
    </form>
  );
}
