import {
  Flame,
  Heart,
  HeartCrack,
  HeartHandshake,
  Moon,
  Sparkles,
  Sun,
  Wine,
  type LucideIcon,
} from "lucide-react";

import { DEFAULT_MOODS } from "@/lib/moods";
import { cn } from "@/components/ui";

/**
 * The app draws icons, never emoji — anything that used to be a glyph in copy
 * comes from `lucide-react` so it inherits colour, size, and stroke weight.
 *
 * Moods are the one icon set that is data-driven: `Mood.icon` holds a key from
 * `DEFAULT_MOODS`, which this registry resolves to a component.
 */
const MOOD_ICONS: Record<string, LucideIcon> = {
  heart: Heart,
  "heart-crack": HeartCrack,
  "heart-handshake": HeartHandshake,
  moon: Moon,
  wine: Wine,
  sun: Sun,
  flame: Flame,
};

/**
 * Moods seeded before icons replaced emoji still hold an emoji in `icon`, so the
 * slug — which never changes — is the fallback lookup.
 */
const MOOD_ICONS_BY_SLUG: Record<string, LucideIcon | undefined> =
  Object.fromEntries(
    DEFAULT_MOODS.map((mood) => [mood.slug, MOOD_ICONS[mood.icon]]),
  );

export type MoodIconRef = { slug: string; icon: string };

export function MoodIcon({
  mood,
  className,
}: {
  mood: MoodIconRef;
  className?: string;
}) {
  const Icon =
    MOOD_ICONS[mood.icon] ?? MOOD_ICONS_BY_SLUG[mood.slug] ?? Sparkles;

  return <Icon aria-hidden className={cn("shrink-0", className)} />;
}

/**
 * A circled icon — the standing treatment for the one illustrative mark on
 * empty states, invite screens, and other "one big glyph" moments.
 */
export function IconBadge({
  icon: Icon,
  className,
  iconClassName,
}: {
  icon: LucideIcon;
  className?: string;
  iconClassName?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex h-14 w-14 items-center justify-center rounded-full bg-blush text-primary",
        className,
      )}
    >
      <Icon className={cn("h-6 w-6", iconClassName)} />
    </span>
  );
}
