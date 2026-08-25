# Mood Swings

> A little private corner of the internet that belongs to us.

A private music-and-romance space for two people. A shared YouTube playlist
becomes the app's library, wrapped in love notes, song memories, moods, and a
relationship counter. Installs to a home screen and runs full screen.

Built to the spec in [PRD.md](PRD.md) — all §21 must-haves, plus the mood
system (§13) and PWA packaging (§29).

---

## Stack

| Layer      | Choice                                                    |
| ---------- | --------------------------------------------------------- |
| Framework  | Next.js 16.3 (App Router, Turbopack, React 19)            |
| Auth       | Clerk 7 (Core 3)                                          |
| Database   | PostgreSQL 16 + Prisma 7 (`@prisma/adapter-pg`)           |
| Styling    | Tailwind CSS v4 (CSS-first `@theme`)                      |
| Music      | YouTube Data API v3 + YouTube IFrame Player API           |
| Motion     | React `<ViewTransition>` + CSS keyframes                   |
| Install    | PWA — manifest, service worker, offline page              |

---

## Setup

### 1. Database

```bash
brew services start postgresql@16
createdb mood_swings
```

`.env` already points at `postgresql://twinspark@localhost:5432/mood_swings`.
Adjust the role if yours differs.

```bash
npx prisma migrate dev      # apply the schema
npx prisma studio           # optional: browse the data
```

### 2. Clerk

The app runs in Clerk's **keyless mode** out of the box — `next dev` prints a
claim link and provisions a temporary instance, so you can try it immediately
with no keys.

For a real instance, put your keys in `.env`:

```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_test_..."
CLERK_SECRET_KEY="sk_test_..."
```

### 3. YouTube

The app plays **one playlist**, hardcoded in
[`lib/youtube-config.ts`](lib/youtube-config.ts). There is no connect flow, no
picker, and no OAuth — reads use a plain server-side API key.

1. Google Cloud → **APIs & Services → Library** → enable **YouTube Data API v3**
2. **Credentials → Create credentials → API key**
3. Put it in `.env`:

   ```
   YOUTUBE_API_KEY="AIza..."
   ```

That's the whole setup: no consent screen, no OAuth client, no Clerk
configuration, nothing to reconnect. The key stays server-side and only ever
reads one public playlist.

> If you restrict the key in Google Cloud, use **None** or an IP restriction.
> An *HTTP referrer* restriction blocks server-side calls and the app will
> report that specifically.

To use a different playlist, either edit `DEFAULT_PLAYLIST_ID` in
`lib/youtube-config.ts` or set `YOUTUBE_PLAYLIST_ID` in `.env` — a bare id or a
full YouTube URL both work. It must be **public or unlisted**; a fully private
playlist is not readable with an API key.

### 4. Run

```bash
npm run dev     # http://localhost:3000
```

---

## First run

```
Landing → Sign up → Create our space → Invite partner → Home
```

Your partner joins with the 8-character invite code or the `/join/<code>` link.
The playlist imports itself the first time either of you opens **Music**.

---

## How it fits together

```
proxy.ts                 Clerk context only — no route matching (see below)
app/(app)/layout.tsx     Auth gate + nav + player. Everything inside requires a couple.
lib/auth.ts              requireCoupleContext() — the single access-control chokepoint
lib/db.ts                Prisma singleton with the pg driver adapter
lib/youtube-config.ts    The single hardcoded playlist
lib/youtube.ts           YouTube Data API client (server-only, API key)
lib/youtube-parse.ts     Pure parsing helpers (importable + testable)
lib/sync.ts              Playlist reconciliation
lib/actions/*            Server Actions, each re-verifying couple membership
components/player/       YouTube IFrame player + global playback state
components/pwa.tsx       Service-worker registration + install prompt
app/manifest.ts          Web app manifest
public/sw.js             Service worker (see caching note below)
scripts/generate-icons.py  Regenerates every icon from one heart curve
```

### Access control (PRD §20)

Authorisation lives next to the data, not in the proxy. `createRouteMatcher` is
deprecated in Clerk 7 because path patterns can drift from real routing and leave
data reachable, so:

- `requireCoupleContext()` in `app/(app)/layout.tsx` gates every signed-in page.
- **Every** Server Action calls it again — actions are reachable by direct POST,
  so a hidden button is never treated as authorisation.
- No route or action accepts a `coupleId` from the client; it is always derived
  from the session.
- Ownership guards (`assertSongInCouple`) scope every mutation to the caller's
  couple.

### Playlist sync (PRD §7)

YouTube has no "playlist changed" event, so the app reconciles on demand:

- when the Music page opens (debounced to 5 minutes), and
- when someone presses **Sync Now**.

Additions, reordering, and metadata changes are applied directly. Songs that
disappear upstream are marked `isAvailable = false` rather than deleted —
memories and favourites hang off those rows, and losing a memory because a video
was taken down would be the worst possible bug in this app.

### The player

One YouTube iframe is mounted in the persistent app layout and never unmounted,
so playback survives navigation between Music, Love, and Memories. Expanding
"Now Playing" repositions that same element instead of remounting it.

---

## Installing it

Open the app on a phone and it offers to add itself to the home screen —
Chromium shows a real install prompt, iOS gets Share → Add to Home Screen.
Once installed it runs standalone with no browser chrome.

**The service worker caches almost nothing on purpose.** Every page here is
authenticated and personal, so HTML is never written to the cache; a stale or
mis-attributed page would be a privacy bug rather than a UX wrinkle. It caches
content-hashed build output, our icons, and YouTube thumbnails. Navigations
always hit the network and fall back to `/offline`. It only handles `GET`, so
Server Actions pass straight through.

It registers in production builds only — in development it would cache assets
Turbopack is actively rewriting. To exercise it: `npm run build && npm start`.

Regenerate icons after changing the palette:

```bash
python3 scripts/generate-icons.py   # needs Pillow
```

---

## Verification

```bash
npx tsc --noEmit    # types
npx eslint .        # lint
npm run build       # production build
```

All three are clean. Beyond that:

- **Data layer** — 18 assertions against real Postgres: couple isolation, the
  ownership-guard pattern, scheduled-note visibility, sync removal semantics,
  cascade deletion leaving user accounts intact.
- **Pure helpers** — 20 assertions over the YouTube and date/duration parsers.
- **YouTube** — playlist reads verified live against the API (85 items).
- **PWA** — manifest, service worker headers, every icon size, offline page,
  and security headers verified over HTTP from a production build.

---

## Not built (deliberately)

Remaining Version 2+ items from PRD §21: photo uploads, relationship timeline,
push notifications, anniversary reminders, and "Open When" letters. The schema
accommodates the first two (`Memory.image`, `Memory.date`) without a migration.

Push notifications are the notable gap — the service worker has no `push`
handler, since delivering them needs VAPID keys and a subscription store that
nothing currently uses.
