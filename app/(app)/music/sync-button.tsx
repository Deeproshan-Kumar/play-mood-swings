"use client";

import { useState, useTransition } from "react";

import { RefreshCw } from "lucide-react";

import { syncNow } from "@/lib/actions/youtube";
import { Button, cn } from "@/components/ui";

/** "Sync Now" (PRD §7). */
export function SyncButton() {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-3">
      {message ? (
        <span className="text-xs text-ink-soft" role="status">
          {message}
        </span>
      ) : null}

      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setMessage(null);
            const result = await syncNow();
            setMessage(result?.error ?? result?.success ?? null);
            setTimeout(() => setMessage(null), 6000);
          })
        }
      >
        <RefreshCw className={cn("h-4 w-4", pending && "animate-spin")} />
        {pending ? "Syncing…" : "Sync now"}
      </Button>
    </div>
  );
}
