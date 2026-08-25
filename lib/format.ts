/** Shared formatting helpers. Safe on both server and client. */

/** Whole days since `start`, counted in local time. */
export function daysTogether(start: Date | string): number {
  const from = new Date(start);
  const now = new Date();

  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const b = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());

  return Math.max(0, Math.round((b - a) / 86_400_000));
}

/**
 * Calendar-accurate breakdown, e.g. "2 years, 4 months, 13 days" (PRD §5).
 * Borrows days from the *previous* month so the result never goes negative.
 */
export function relationshipDuration(start: Date | string) {
  const from = new Date(start);
  const now = new Date();

  let years = now.getFullYear() - from.getFullYear();
  let months = now.getMonth() - from.getMonth();
  let days = now.getDate() - from.getDate();

  if (days < 0) {
    months -= 1;
    const prevMonth = new Date(now.getFullYear(), now.getMonth(), 0);
    days += prevMonth.getDate();
  }

  if (months < 0) {
    years -= 1;
    months += 12;
  }

  return {
    years: Math.max(0, years),
    months: Math.max(0, months),
    days: Math.max(0, days),
  };
}

export function formatDuration(start: Date | string): string {
  const { years, months, days } = relationshipDuration(start);

  const parts = [
    years > 0 && `${years} ${years === 1 ? "year" : "years"}`,
    months > 0 && `${months} ${months === 1 ? "month" : "months"}`,
    `${days} ${days === 1 ? "day" : "days"}`,
  ].filter(Boolean);

  return parts.join(", ");
}

/** Seconds → `3:07` or `1:02:11`. */
export function formatTime(totalSeconds: number | null | undefined): string {
  if (totalSeconds == null || !Number.isFinite(totalSeconds) || totalSeconds < 0) {
    return "--:--";
  }

  const seconds = Math.floor(totalSeconds % 60);
  const minutes = Math.floor((totalSeconds / 60) % 60);
  const hours = Math.floor(totalSeconds / 3600);

  const mm = hours > 0 ? String(minutes).padStart(2, "0") : String(minutes);

  return [hours > 0 ? String(hours) : null, mm, String(seconds).padStart(2, "0")]
    .filter((part) => part !== null)
    .join(":");
}

export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "";
  return new Date(date).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function formatRelative(date: Date | string): string {
  const then = new Date(date).getTime();
  const diff = Date.now() - then;

  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) return "just now";
  if (diff < hour) {
    const n = Math.floor(diff / minute);
    return `${n}m ago`;
  }
  if (diff < day) {
    const n = Math.floor(diff / hour);
    return `${n}h ago`;
  }
  if (diff < 7 * day) {
    const n = Math.floor(diff / day);
    return `${n}d ago`;
  }

  return new Date(date).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

/** "Good morning" / "Good afternoon" / "Good evening" (PRD §9). */
export function greeting(now = new Date()): string {
  const h = now.getHours();
  if (h < 5) return "Still up";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  if (h < 22) return "Good evening";
  return "Good night";
}

/** Days until the next anniversary of `date`. */
export function daysUntilAnniversary(date: Date | string): number {
  const d = new Date(date);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  let next = new Date(today.getFullYear(), d.getMonth(), d.getDate());
  if (next < today) {
    next = new Date(today.getFullYear() + 1, d.getMonth(), d.getDate());
  }

  return Math.round((next.getTime() - today.getTime()) / 86_400_000);
}
