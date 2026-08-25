/**
 * The starter mood set from PRD §13. Seeded per couple so they can diverge.
 *
 * `icon` is a key into the mood icon registry in `components/icons.tsx` — the
 * UI is icon-only, so nothing here is a glyph the interface renders directly.
 */
export const DEFAULT_MOODS = [
  { slug: "in-love", name: "In Love", icon: "heart" },
  { slug: "missing-you", name: "Missing You", icon: "heart-crack" },
  { slug: "late-night", name: "Late Night", icon: "moon" },
  { slug: "date-night", name: "Date Night", icon: "wine" },
  { slug: "need-a-hug", name: "Need a Hug", icon: "heart-handshake" },
  { slug: "happy-together", name: "Happy Together", icon: "sun" },
  { slug: "romantic", name: "Romantic", icon: "flame" },
] as const;

/** A line of copy for each mood, shown once a mood is picked. */
export const MOOD_BLURBS: Record<string, string> = {
  "in-love": "Everything sounds better right now.",
  "missing-you": "Distance is just a number of songs.",
  "late-night": "The quiet hours, just for us.",
  "date-night": "Dim the lights. This one's a date.",
  "need-a-hug": "Consider this a hug in playlist form.",
  "happy-together": "Sunshine, and you.",
  romantic: "No notes. Just us.",
};
