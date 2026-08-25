/**
 * Theme plumbing (PRD §18 "Appearance").
 *
 * The couple's choice lives in the database, but it is mirrored into a cookie
 * so the root layout can stamp `data-theme` during SSR. Reading the DB there
 * instead would cost a query on every navigation and still flash the wrong
 * colours on first paint.
 */

export const THEME_COOKIE = "mood-swings-theme";

export const THEMES = ["romantic", "light", "dark"] as const;

export type ThemeName = (typeof THEMES)[number];

export function resolveTheme(value: string | undefined | null): ThemeName {
  return THEMES.includes(value as ThemeName) ? (value as ThemeName) : "romantic";
}

/** Prisma stores the enum uppercase; the DOM attribute is lowercase. */
export function themeFromEnum(value: "LIGHT" | "DARK" | "ROMANTIC"): ThemeName {
  return value.toLowerCase() as ThemeName;
}
