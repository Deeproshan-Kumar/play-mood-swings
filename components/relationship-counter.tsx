"use client";

import { useEffect, useState } from "react";

import { daysTogether, formatDuration } from "@/lib/format";

/**
 * PRD §5: "The exact relationship duration should update automatically."
 * Rendered from a server-computed value first, then kept live on the client so
 * it rolls over at midnight without a refresh.
 */
export function RelationshipCounter({
  startDate,
  initialDays,
  initialDuration,
}: {
  startDate: string;
  initialDays: number;
  initialDuration: string;
}) {
  const [days, setDays] = useState(initialDays);
  const [duration, setDuration] = useState(initialDuration);

  useEffect(() => {
    function update() {
      setDays(daysTogether(startDate));
      setDuration(formatDuration(startDate));
    }

    update();
    const timer = window.setInterval(update, 60_000);
    return () => window.clearInterval(timer);
  }, [startDate]);

  return (
    <div className="text-center">
      <p className="label mb-2">Together for</p>
      <p className="display text-5xl text-primary sm:text-6xl">
        {days.toLocaleString()}
        <span className="ml-2 text-2xl text-ink-soft sm:text-3xl">
          {days === 1 ? "day" : "days"}
        </span>
      </p>
      <p className="mt-2 text-sm text-ink-soft">{duration}</p>
    </div>
  );
}
