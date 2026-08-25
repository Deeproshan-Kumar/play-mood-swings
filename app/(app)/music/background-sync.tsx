"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { syncNow } from "@/lib/actions/youtube";

/**
 * Reconciles with YouTube after the page has painted (PRD §7).
 *
 * The library renders instantly from Postgres; this catches it up in the
 * background and refreshes the route only if something actually changed, so a
 * no-op sync costs the user nothing visible.
 */
export function BackgroundSync({ stale }: { stale: boolean }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [syncing, setSyncing] = useState(false);
  const fired = useRef(false);

  useEffect(() => {
    if (!stale || fired.current) return;
    fired.current = true;

    setSyncing(true);

    startTransition(async () => {
      const result = await syncNow();
      setSyncing(false);

      // "Already up to date" means nothing moved — no need to re-render.
      if (result?.success && result.success !== "Already up to date") {
        router.refresh();
      }
    });
  }, [stale, router]);

  if (!syncing) return null;

  return (
    <p
      role="status"
      className="animate-fade-in text-xs text-ink-faint"
      aria-live="polite"
    >
      Checking YouTube for changes…
    </p>
  );
}
