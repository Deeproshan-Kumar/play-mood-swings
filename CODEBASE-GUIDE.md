# Mood Swings — Complete Codebase Guide

**A line-by-line explanation of every file in this project, written for someone new to React and Next.js.**

---

## How to read this guide

This document explains **every file** in the repository: what it does, why it exists, and how the code inside it works. It is organised so you can read it front-to-back like a book, or jump to a file when you're staring at it in the editor.

The order is deliberate — it goes **bottom-up**:

| Part | What it covers | Why it's here |
| --- | --- | --- |
| 1 | React / Next.js / TypeScript / Tailwind foundations | Nothing else makes sense without these |
| 2 | Project map | Where everything lives |
| 3 | Tooling & config files | The scaffolding around the app |
| 4 | Database layer (Prisma) | The shape of the data |
| 5 | Authentication & access control | Who is allowed to see what |
| 6 | Shared library helpers (`lib/`) | Pure logic, no UI |
| 7 | Server Actions (`lib/actions/`) | How writes happen |
| 8 | The global shell (root layout, CSS, landing page) | The outermost frame |
| 9 | Reusable components (`components/`) | The building blocks |
| 10 | Every route, page by page | The actual screens |
| 11 | End-to-end feature traces | How the pieces move together |
| 12 | PWA files (service worker, icons) | Installability & offline |
| 13 | Patterns cheat-sheet & glossary | Reference material |
| 14 | Running, verifying, extending | What to do next |

Conventions used below:

- Code excerpts are **abridged** where a full paste would be noise; the file link takes you to the real thing.
- 🧠 marks a **concept box** — a React/Next.js idea explained from scratch.
- ⚠️ marks a **gotcha** — something that will bite you if you don't know it.
- 🔎 marks **why it's written this way**, as opposed to what it does.

---

# Part 1 — Foundations

If you already know React hooks and the Next.js App Router, skim this and start at Part 2. If you don't, this part is the difference between "I can read this code" and "I can't."

## 1.1 What problem is this app solving?

**Mood Swings** is a private web app for two people in a relationship. One YouTube playlist becomes their shared music library, and around that music the app layers love notes, memories attached to songs, moods, and a relationship-day counter.

The whole product spec lives in [PRD.md](PRD.md) — a "Product Requirements Document". You'll see comments all over the code like `PRD §12` or `(PRD §20)`. Those are pointers back to the section of that document that the code implements. When you read `/** PRD §12 — each person keeps their own favourites. */`, that means "section 12 of PRD.md asked for this".

🔎 This is a genuinely useful habit: the code tells you *what*, the PRD reference tells you *why anyone wanted it*.

## 1.2 The big picture: what runs where

There are three "places" code runs in this app. Confusing them is the single biggest source of beginner errors in Next.js.

```
┌──────────────────────── YOUR SERVER (Node.js) ────────────────────────┐
│                                                                        │
│  proxy.ts            ← runs on every request, before anything else     │
│  Server Components   ← app/**/page.tsx, layout.tsx (the default)       │
│  Server Actions      ← lib/actions/*.ts ("use server")                 │
│  lib/db.ts           ← talks to PostgreSQL                             │
│  lib/youtube.ts      ← talks to YouTube's API with a secret key        │
│                                                                        │
└────────────────────────────────┬───────────────────────────────────────┘
                                 │ HTML + JSON over HTTP
                                 ▼
┌──────────────────────── THE BROWSER ──────────────────────────────────┐
│                                                                        │
│  Client Components   ← files starting with "use client"                │
│  React hooks         ← useState, useEffect, useTransition…             │
│  The YouTube iframe  ← actual audio playback                           │
│  public/sw.js        ← the service worker (a separate background thread)│
│                                                                        │
└────────────────────────────────┬───────────────────────────────────────┘
                                 │
                                 ▼
┌──────────────── THIRD PARTIES ────────────────────────────────────────┐
│  Clerk (login)      PostgreSQL (data)      YouTube (music + metadata)  │
└────────────────────────────────────────────────────────────────────────┘
```

Key facts to hold on to:

1. **Server Components are the default.** A `page.tsx` with no `"use client"` at the top runs *only* on the server. It never ships to the browser. It can `await` a database query directly.
2. **Client Components are opt-in.** You write `"use client"` as the very first line. Now the file is bundled and sent to the browser, and only then can it use `useState`, `onClick`, `useEffect`, etc.
3. **A Server Component can render a Client Component**, and pass it props. The props must be *serialisable* (strings, numbers, arrays, plain objects — not functions, not `Date`… more on that below).
4. **A Client Component cannot import a Server Component**, and cannot import anything marked `"server-only"`.

## 1.3 React from zero

### Components

A React component is a JavaScript function that returns markup.

```tsx
function Greeting() {
  return <p>Hello</p>;
}
```

That `<p>Hello</p>` is **JSX** — HTML-looking syntax that the build step compiles into function calls. Rules that trip people up:

- Attributes are camelCase: `className` (not `class`), `onClick` (not `onclick`).
- Every component must return exactly one root element. Use `<>…</>` (a "Fragment") when you don't want an extra wrapper `<div>`.
- `{}` inside JSX means "drop back into JavaScript": `<p>{user.name}</p>`.
- Whitespace and text need care: `&rsquo;` and `&ldquo;` appear all over this codebase because a raw apostrophe inside JSX text is legal but ESLint's React rules prefer the entity, and it renders as a proper typographic quote.

### Props

Props are the function's arguments. This codebase almost always destructures them with a type annotation inline:

```tsx
export function Stat({ label, value }: { label: string; value: number }) {
  return <div>{label}: {value}</div>;
}
```

Read that as: "this function takes one object; that object has a `label` string and a `value` number; pull both out into local variables."

`children` is a special prop meaning "whatever was nested inside this component":

```tsx
function Card({ children }: { children: React.ReactNode }) {
  return <div className="card">{children}</div>;
}

// used as:
<Card><p>Anything at all</p></Card>
```

### State and the render cycle

`useState` gives a Client Component memory that survives re-renders:

```tsx
const [query, setQuery] = useState("");
```

- `query` is the current value.
- `setQuery("abc")` schedules a re-render with the new value.
- The `""` is only the *initial* value — it's ignored on later renders.

**The mental model that matters:** you never "update the DOM". You update state; React re-runs your component function; React compares the new returned markup against the old and patches the real DOM for you.

⚠️ State updates are asynchronous and batched. Right after `setQuery("abc")`, the local `query` variable is still the old value. If you need to compute from the previous value, pass a function: `setIds(prev => new Set(prev))`. This codebase does that constantly — see [components/favorites-provider.tsx](components/favorites-provider.tsx).

### Hooks used in this project

| Hook | Purpose | Example in this repo |
| --- | --- | --- |
| `useState` | local mutable value | search box text in [music-library.tsx](<app/(app)/music/music-library.tsx>) |
| `useEffect` | run a side effect *after* render (subscriptions, timers, DOM APIs) | the progress poller in [player-provider.tsx](components/player/player-provider.tsx) |
| `useRef` | a mutable box that does **not** trigger re-render | the YouTube player instance, form DOM nodes |
| `useMemo` | cache an expensive computed value between renders | the filtered song list |
| `useCallback` | cache a function identity between renders | every method on the player context |
| `useContext` / `createContext` | read a value provided higher in the tree without prop-drilling | favourites + player |
| `useTransition` | mark an update as non-urgent, and get a `pending` flag | every "fire a Server Action from a click" |
| `useActionState` | wire a `<form>` to a Server Action and hold its result | every form in the app |
| `useSyncExternalStore` | subscribe React to state that lives *outside* React | PWA install eligibility |

🧠 **`useEffect` in one paragraph.** The function you pass runs *after* the browser has painted. The array at the end is the dependency list: `[]` means "run once when this component mounts", `[x]` means "run again whenever `x` changes". If you return a function, React calls it to clean up before re-running or on unmount — that's how the timers and event listeners in this app avoid leaking. Effects are for *synchronising with things outside React* (timers, browser APIs, third-party players), not for computing values — compute those during render.

### Keys in lists

Whenever this codebase maps over data:

```tsx
{songs.map((song) => <TrackRow key={song.id} track={song} />)}
```

The `key` must be a stable unique id (a database id, never the array index if the list can reorder). React uses it to match old elements to new ones. Without it, reordering the list would visually scramble component state.

### Controlled inputs

```tsx
<Input value={query} onChange={(event) => setQuery(event.target.value)} />
```

The input's displayed value comes from React state, and every keystroke writes back to state. That's a *controlled* input. Compare with [couple-settings.tsx](<app/(app)/settings/couple-settings.tsx>), which uses `defaultValue` instead — an *uncontrolled* input, where the browser owns the value and the server reads it out of the form on submit. This app uses uncontrolled inputs for forms that post to Server Actions (less code, no re-render per keystroke) and controlled inputs for things that filter the UI live (search box, sliders).

## 1.4 Next.js App Router from zero

Next.js is a framework built on React. It adds routing, server rendering, bundling, image handling, and a server runtime.

### Routing is your folder structure

Everything under [app/](app/) is a route. The rules:

| File | Meaning |
| --- | --- |
| `app/page.tsx` | the page at `/` |
| `app/music/page.tsx` | the page at `/music` |
| `app/layout.tsx` | wrapper UI shared by everything below it |
| `app/loading.tsx` | shown while the page below is still loading on the server |
| `app/(app)/…` | **route group** — parentheses mean "this folder does NOT appear in the URL" |
| `app/join/[code]/page.tsx` | **dynamic segment** — matches `/join/ANYTHING`, value available as `params.code` |
| `app/sign-in/[[...sign-in]]/page.tsx` | **optional catch-all** — matches `/sign-in` *and* `/sign-in/factor-one/…` |

So in this project:

```
/                       app/page.tsx                        landing page
/sign-in, /sign-in/*    app/sign-in/[[...sign-in]]/page.tsx  Clerk's UI
/sign-up, /sign-up/*    app/sign-up/[[...sign-up]]/page.tsx
/onboarding             app/onboarding/page.tsx
/onboarding/invite      app/onboarding/invite/page.tsx
/join/ABCD2345          app/join/[code]/page.tsx
/offline                app/offline/page.tsx
/home                   app/(app)/home/page.tsx        ← note: URL has no "(app)"
/music                  app/(app)/music/page.tsx
/love                   app/(app)/love/page.tsx
/memories               app/(app)/memories/page.tsx
/us                     app/(app)/us/page.tsx
/mood                   app/(app)/mood/page.tsx
/settings               app/(app)/settings/page.tsx
/manifest.webmanifest   app/manifest.ts                (generated, not a page)
```

🔎 **Why the `(app)` route group exists.** Everything inside it needs the same three things: a logged-in user who belongs to a couple, the navigation chrome, and the music player. Putting them behind one layout means that check and that UI are written **once**, in [app/(app)/layout.tsx](<app/(app)/layout.tsx>), and the URLs stay clean (`/home`, not `/app/home`).

### Layouts nest and persist

```
app/layout.tsx              ← root: <html>, <body>, fonts, ClerkProvider
   └── app/(app)/layout.tsx ← sidebar, bottom nav, music player, auth gate
          └── app/(app)/music/page.tsx
```

When you navigate from `/music` to `/love`, **the root layout and the `(app)` layout are not re-created** — only the page swaps. This is why the music keeps playing when you navigate: the YouTube iframe lives in the `(app)` layout, not in the music page.

### `params` and `searchParams` are Promises

In Next.js 16 (this project is on 16.3.1), the route inputs are async:

```tsx
export default async function JoinPage({ params }: PageProps<"/join/[code]">) {
  const { code } = await params;   // ← must await
}
```

`PageProps<"/join/[code]">` and `LayoutProps<"/">` are **globally available types** — you don't import them. They're generated from your actual folder structure into `.next/dev/types/`, which is why [next-env.d.ts](next-env.d.ts) imports those generated type files. Type the route as a string literal and you get autocomplete and compile errors if the route doesn't exist.

⚠️ Older tutorials show `params` as a plain object. That's Next.js 14 and earlier. In this codebase it is always awaited.

### Server Components fetch data directly

This is the biggest departure from "classic React". Look at [app/(app)/memories/page.tsx](<app/(app)/memories/page.tsx>):

```tsx
export default async function MemoriesPage() {
  const { couple } = await requireCoupleContext();
  const memories = await db.memory.findMany({ where: { coupleId: couple.id } });
  return <MemoryBoard memories={…} />;
}
```

The component is `async`. It queries Postgres. It renders. There is no `useEffect`, no loading spinner, no `/api/memories` endpoint, and no fetch from the browser. Next.js runs this on the server, streams the resulting HTML to the browser, and the database credentials never leave the server.

🧠 **Why this is safe.** The function body is compiled into the server bundle only. If you accidentally import it into a Client Component, the build fails — and [lib/db.ts](lib/db.ts) and [lib/auth.ts](lib/auth.ts) both start with `import "server-only"`, which turns that mistake into a clear error message instead of a leaked secret.

### `loading.tsx` and streaming

If a page's server work takes time, Next.js shows the nearest `loading.tsx` immediately, then streams in the real content. This project has one per route — e.g. [app/(app)/music/loading.tsx](<app/(app)/music/loading.tsx>) — each rendering a skeleton shaped like the real page.

### Server Actions: writes without an API layer

A file starting with `"use server"` exports functions that the browser can *call*, but whose code runs on the server. Next.js generates the HTTP plumbing.

```tsx
// lib/actions/note.ts
"use server";
export async function sendNote(prev, formData) { … }
```

```tsx
// love-notes.tsx  ("use client")
const [state, formAction, pending] = useActionState(sendNote, null);
<form action={formAction}>…</form>
```

Submitting the form POSTs to the server, runs `sendNote`, and returns its value into `state`. No `fetch`, no route handler, no JSON parsing.

⚠️ **A Server Action is a public HTTP endpoint.** Anyone who knows it exists can POST to it with arbitrary arguments. Hiding a button in the UI is *not* security. That's why every action in [lib/actions/](lib/actions/) re-derives the current user from the session and re-checks ownership. This is the single most important security idea in the codebase (Part 5 and Part 7).

### Caching and revalidation

Server Components render and their output can be cached. When a Server Action changes data, it must tell Next.js which routes are now stale:

```ts
revalidatePath("/love");
revalidatePath("/home");
```

You'll see those calls at the end of nearly every action. `revalidatePath("/", "layout")` invalidates everything under the root layout — used when the theme changes, since that affects every page.

### `redirect()`

```ts
redirect("/onboarding");
```

Called on the server, this **throws a special error** that Next.js catches and turns into a redirect. Two consequences you'll see in this code:

1. Code after `redirect()` never runs — so `if (!couple) redirect(...)` acts like a type guard, and TypeScript narrows `couple` to non-null afterwards.
2. You must not wrap it in a `try/catch` that swallows errors. Notice in [lib/actions/couple.ts](lib/actions/couple.ts) that `redirect()` is always called **outside** the `try` block. That's not stylistic; putting it inside would catch the redirect as if it were a failure.

## 1.5 TypeScript, only the parts used here

TypeScript is JavaScript plus type annotations, erased at build time.

```ts
function formatTime(totalSeconds: number | null | undefined): string
```

- `number | null | undefined` is a **union** — any of those three.
- `: string` is the return type.

Patterns that recur in this repo:

| Syntax | Meaning |
| --- | --- |
| `type Foo = { a: string }` | name a shape |
| `a?: string` | optional property |
| `x ?? y` | use `y` only if `x` is `null`/`undefined` (unlike `\|\|`, `0` and `""` pass through) |
| `x?.y` | read `y` only if `x` isn't nullish, else `undefined` |
| `as const` | freeze a literal so its exact values become types |
| `keyof typeof buttonVariants` | "any key of that object" — how `Button`'s `variant` prop stays in sync with the styles object |
| `NonNullable<T>` | T with `null`/`undefined` removed |
| `Awaited<ReturnType<typeof f>>` | "the type `f` resolves to" — used in [lib/auth.ts](lib/auth.ts) so `CoupleContext` tracks Prisma's inferred types automatically |
| `ComponentProps<"button">` | every prop a real `<button>` accepts |
| `satisfies` / generics | not used much here — you can ignore them for now |

🔎 `Awaited<ReturnType<typeof requireUser>>` is worth understanding because it appears in the app's most central type. Rather than hand-writing what a `User` looks like, it says "whatever `requireUser()` resolves to". Add a column to the Prisma schema and this type updates itself.

## 1.6 Tailwind CSS v4, only the parts used here

Instead of writing CSS rules, you compose utility classes in `className`:

```tsx
<div className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm">
```

`flex` = `display:flex`, `items-center` = `align-items:center`, `gap-3` = `gap: 0.75rem`, `px-3` = horizontal padding, `text-sm` = small font size.

Things specific to **v4** (this project) that differ from v3 tutorials:

- **No `tailwind.config.js`.** Configuration is CSS-first, inside [app/globals.css](app/globals.css) using `@theme`.
- `@import "tailwindcss";` at the top of the CSS replaces the old three `@tailwind` directives.
- Custom colours are declared as CSS variables and mapped in `@theme inline`, e.g. `--color-canvas: var(--canvas);` — that single line is what makes `bg-canvas` and `text-canvas` exist as utilities.
- ⚠️ v4's reset no longer sets `cursor: pointer` on buttons. This codebase restores it explicitly in `globals.css`, or every control would feel dead. That comment in the CSS is a real bug fix, not trivia.

Prefixes you'll see:

| Prefix | Meaning |
| --- | --- |
| `sm:` `md:` `lg:` | apply at that screen width and up (mobile-first) |
| `hover:` `focus-visible:` `active:` | interaction states |
| `group` / `group-hover:` | parent marked `group`, child reacts to parent's hover — used for the play overlay on song rows |
| `bg-blush/40` | 40% opacity of that colour |
| `bg-(--scrim)` | v4 syntax for "use this raw CSS variable" |
| `dark:` | defined by this project as `[data-theme="dark"]`, not the OS setting |

## 1.7 The technology stack, and why each piece

| Piece | Version | Job | Why chosen |
| --- | --- | --- | --- |
| **Next.js** | 16.3.1 | routing, SSR, Server Actions, bundling | one framework for server + client; Server Actions remove the need for a REST layer |
| **React** | 19.2.8 | UI | `useActionState`, `useTransition`, `<ViewTransition>` all come from 19 |
| **TypeScript** | 5 | types | catches the class of bug where a nullable DB column meets `.toUpperCase()` |
| **Clerk** | 7 | authentication | drop-in sign-in UI + session management; no password handling in this codebase at all |
| **PostgreSQL** | 17, on Supabase | database | relational data with real foreign keys and cascades. Hosted; a local Homebrew 16 also works — see §4.12 |
| **Prisma** | 7 | ORM + migrations | typed queries generated from a schema file |
| **Tailwind** | v4 | styling | design tokens + utilities, no separate CSS files per component |
| **lucide-react** | 1.x | icons | every glyph in the UI is an icon component, never an emoji character |
| **zod** | 4 | runtime validation | Server Actions receive untrusted `FormData`; zod turns it into checked, typed values |
| **pg** + `@prisma/adapter-pg` | 8 / 7 | Postgres driver | Prisma 7 requires an explicit driver adapter |
| **dotenv** | 17 | env loading for Prisma CLI | the CLI runs outside Next.js, so it needs its own `.env` loader |

---

# Part 2 — Project map

Every file in the repository, with a one-line job description. Files are covered in depth later; this is the index.

## 2.1 Application code

```
app/
├── layout.tsx                   Root layout: <html>, fonts, Clerk, theme, service worker
├── page.tsx                     Public landing page (/)
├── globals.css                  The entire design system: tokens, 3 themes, animations
├── manifest.ts                  Generates /manifest.webmanifest for PWA install
├── opengraph-image.tsx          Generates the 1200×630 link-preview image
├── twitter-image.tsx            Re-exports the OG image for X/Twitter cards
├── icon.svg                     Vector favicon (heart curve)
├── apple-icon.png               iOS home-screen icon
├── favicon.ico                  Multi-size legacy favicon
├── offline/page.tsx             Shown by the service worker when a navigation fails
│
├── sign-in/[[...sign-in]]/page.tsx    Clerk's sign-in widget
├── sign-up/[[...sign-up]]/page.tsx    Clerk's sign-up widget
│
├── onboarding/
│   ├── page.tsx                 Step 1: create a space, or join with a code
│   ├── onboarding-forms.tsx     Client: the two-tab form
│   └── invite/
│       ├── page.tsx             Step 2: show the invite code + link
│       └── invite-share.tsx     Client: copy-to-clipboard buttons
│
├── join/[code]/
│   ├── page.tsx                 Public invite landing page
│   └── accept-invite.tsx        Client: one-button join form
│
└── (app)/                       ← everything below requires a couple
    ├── layout.tsx               Auth gate + nav + favourites + player
    ├── home/{page,loading}.tsx           Romantic dashboard
    ├── music/
    │   ├── page.tsx             Server: loads library from Postgres
    │   ├── music-library.tsx    Client: search, filters, list
    │   ├── song-sheet.tsx       Client: per-song modal (memories + mood tags)
    │   ├── sync-button.tsx      Client: "Sync now"
    │   ├── background-sync.tsx  Client: post-paint auto-sync
    │   └── loading.tsx
    ├── love/{page,love-notes,loading}.tsx        Love notes
    ├── memories/{page,memory-board,loading}.tsx  Memories
    ├── us/{page,loading}.tsx                     Relationship + favourites
    ├── mood/{page,loading}.tsx                   Mood check-in + songs by mood
    └── settings/
        ├── page.tsx             Server: composes the five sections
        ├── couple-settings.tsx  Client: name/dates form + invite code
        ├── youtube-settings.tsx Server: playlist status
        ├── appearance-settings.tsx  Client: theme picker
        ├── danger-zone.tsx      Client: delete-everything flow
        └── loading.tsx
```

## 2.2 Components

```
components/
├── ui.tsx                       Button, Card, Input, Textarea, Field, EmptyState,
│                                Skeleton, PageSkeleton, HeartDrift, cn()
├── icons.tsx                    Mood icon registry + IconBadge
├── nav.tsx                      Sidebar, BottomNav, MobileHeader  (client)
├── relationship-counter.tsx     Live day counter  (client)
├── mood-check-in.tsx            "How are you feeling?" chips  (client)
├── favorites-provider.tsx       Optimistic favourites context  (client)
├── track-row.tsx                One song row + PlayForUsButton  (client)
├── pwa.tsx                      Service-worker registration + install prompt  (client)
└── player/
    ├── types.ts                 PlayerTrack, RepeatMode, YouTube API typings
    ├── player-provider.tsx      All playback state + the YouTube iframe  (client)
    └── player-bar.tsx           Mini bar + full-screen Now Playing  (client)
```

## 2.3 Server-side library

```
lib/
├── db.ts                        Prisma client singleton (server-only)
├── auth.ts                      requireUser / requireCoupleContext / ownership guards
├── format.ts                    Date, duration, greeting helpers (isomorphic)
├── moods.ts                     The 7 default moods + their blurbs
├── site.ts                       Site name, tagline, canonical URL
├── theme.ts                     Theme names, cookie name, enum↔attribute mapping
├── youtube-config.ts            The one hardcoded playlist id
├── youtube-parse.ts             Pure parsers (duration, thumbnail, artist, playlist id)
├── youtube.ts                   YouTube Data API client (server-only)
├── sync.ts                      Playlist reconciliation + staleness check
├── actions/
│   ├── types.ts                 ActionState + fail/ok/messageFrom helpers
│   ├── couple.ts                create/join/update/theme/invite-code/delete
│   ├── note.ts                  send/read/favourite/delete love notes
│   ├── song.ts                  favourites, memories, mood tags, check-ins
│   └── youtube.ts               syncNow
└── generated/prisma/            Auto-generated Prisma client — never edit
```

## 2.4 Database

```
prisma/
├── schema.prisma                          9 models, 2 enums — the source of truth
└── migrations/
    ├── 20260814055746_init/migration.sql               initial schema
    ├── 20260814071717_single_hardcoded_playlist/…      dropped YouTubeConnection
    └── migration_lock.toml                             records the provider
```

## 2.5 Configuration & tooling

```
package.json           dependencies + npm scripts
package-lock.json      exact resolved dependency tree (committed, machine-generated)
next.config.ts         image hosts, security headers, service-worker headers
tsconfig.json          TypeScript compiler + the "@/*" path alias
next-env.d.ts          Next.js ambient types (generated, do not edit)
types/react-view-transition.d.ts   hand-written types for React's <ViewTransition>
postcss.config.mjs     hooks Tailwind v4 into the CSS pipeline
eslint.config.mjs      lint rules
prisma.config.ts       Prisma CLI config (schema path, migrations path, DIRECT_URL)
proxy.ts               runs before every request; attaches Clerk's auth context
.env / .env.example    secrets and their documented template
.gitignore             what git ignores (including .env and the generated client)
```

## 2.6 Static assets & scripts

```
public/
├── sw.js                    Service worker (deliberately caches almost nothing)
├── icon-192.png             PWA icon
├── icon-512.png             PWA icon
└── icon-maskable-512.png    Full-bleed icon Android can crop

scripts/
└── generate-icons.py        Regenerates every icon + the SVG from one heart curve
```

## 2.7 Documentation & agent files

```
README.md          Setup + architecture summary for a human
PRD.md             The product spec every code comment references
AGENTS.md          Instructions for AI coding agents (written by `next dev`)
CLAUDE.md          One line: @AGENTS.md
.claude/settings.local.json   Local permission allowlist for Claude Code
.agents/skills/**  Vendored Prisma documentation "skills" for agents
skills-lock.json   Hashes pinning those skill files
tsconfig.tsbuildinfo   TypeScript's incremental build cache (git-ignored)
```

Nothing in 2.7 affects the running app.
---

# Part 3 — Tooling & configuration, file by file

## 3.1 `package.json`

[package.json](package.json) declares the project's identity, its scripts, and every dependency.

```json
"scripts": {
  "dev":   "next dev",
  "build": "next build",
  "start": "next start",
  "lint":  "eslint"
}
```

- `npm run dev` — development server with hot reload at `http://localhost:3000`. Next.js 16 uses **Turbopack** here by default (the successor to webpack — much faster).
- `npm run build` — produces the optimised production bundle. This is also where type errors and lint errors will fail the build.
- `npm start` — serves the output of `build`. **This is the only way to test the service worker**, because [components/pwa.tsx](components/pwa.tsx) refuses to register it outside production.
- `npm run lint` — runs ESLint.

### Dependencies (shipped to production)

| Package | What it does here |
| --- | --- |
| `@clerk/nextjs` ^7.7.5 | `<ClerkProvider>`, `<SignIn>`, `<SignUp>`, `<UserButton>`, `<Show>`, and the server helpers `auth()` / `currentUser()` / `clerkMiddleware()` |
| `@prisma/client` ^7.9.1 | the runtime half of Prisma |
| `@prisma/adapter-pg` ^7.9.1 | the **driver adapter** that lets Prisma 7 talk to Postgres through `pg` |
| `pg` ^8.23.0 | the actual Node.js PostgreSQL driver |
| `prisma` ^7.9.1 | the CLI (`migrate`, `generate`, `studio`). Listed as a normal dependency here so it's available wherever the app is deployed |
| `next` 16.3.1 | the framework — pinned exactly (no `^`) because the App Router's conventions change between majors |
| `react` / `react-dom` 19.2.8 | also pinned exactly, since Next.js vendors a matching React build |
| `lucide-react` ^1.31.0 | the icon set — every icon in the UI is a React component from here |
| `zod` ^4.4.3 | schema validation for all form input |

### devDependencies (build/dev only)

| Package | What it does here |
| --- | --- |
| `tailwindcss` ^4 + `@tailwindcss/postcss` | the CSS engine and its PostCSS plugin |
| `typescript` ^5, `@types/node`, `@types/react`, `@types/react-dom`, `@types/pg` | types |
| `eslint` ^9 + `eslint-config-next` 16.3.1 | linting, version-matched to Next |
| `dotenv` ^17.4.2 | loads `.env` for the Prisma CLI (see [prisma.config.ts](prisma.config.ts)) |

### `allowScripts`

```json
"allowScripts": {
  "prisma@7.9.1": true,
  "@prisma/engines@7.9.1": true
}
```

An allowlist of packages permitted to run install-time lifecycle scripts. Prisma needs it to download its query engine binaries. Everything else is blocked, which shuts the door on the most common supply-chain attack (a malicious `postinstall`).

### `package-lock.json`

Machine-generated, and **committed on purpose**. It records the exact resolved version and integrity hash of every transitive dependency, so `npm ci` on another machine or in CI installs a byte-identical tree. Never hand-edit it.

## 3.2 `next.config.ts`

[next.config.ts](next.config.ts) — three concerns.

**1. Remote image hosts.**

```ts
images: {
  remotePatterns: [
    { protocol: "https", hostname: "i.ytimg.com" },
    { protocol: "https", hostname: "img.youtube.com" },
    { protocol: "https", hostname: "yt3.ggpht.com" },
    { protocol: "https", hostname: "img.clerk.com" },
  ],
}
```

Next.js's `<Image>` component refuses to load images from hosts you haven't declared. That's a security measure — otherwise your server could be tricked into fetching and re-serving arbitrary URLs. The three YouTube hosts serve song thumbnails; `img.clerk.com` serves user avatars.

⚠️ Note the code passes `unoptimized` on each `<Image>` (see [track-row.tsx](components/track-row.tsx)). The declaration above is still required — `remotePatterns` gates the component, `unoptimized` just skips the re-encode. YouTube already serves well-compressed JPEGs at the exact sizes requested, so re-encoding would cost server CPU for near-zero benefit.

**2. `poweredByHeader: false`** — removes the `X-Powered-By: Next.js` response header. Pure information hygiene: no reason to advertise your framework version to scanners.

**3. `headers()`** — two rules.

```ts
{ source: "/sw.js", headers: [
    { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
    { key: "Service-Worker-Allowed", value: "/" } ] }
```

🔎 A service worker that gets cached is a *permanent* bug: the browser would keep using an old caching policy forever, and you'd have no way to push a fix. `no-store` guarantees every check hits your server. `Service-Worker-Allowed: /` lets a worker served from `/sw.js` control the whole origin.

```ts
{ source: "/:path*", headers: [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" } ] }
```

- `nosniff` — the browser must trust the declared `Content-Type` instead of guessing, which blocks a class of attack where an uploaded file is interpreted as script.
- `X-Frame-Options: DENY` — no one can embed this app in an `<iframe>`, blocking clickjacking.
- `Referrer-Policy: strict-origin-when-cross-origin` — when a user clicks a link out of the app, only the origin is sent, never the full path. Concretely: this stops an invite URL like `/join/ABCD2345` from leaking to a third-party site.

## 3.3 `tsconfig.json`

[tsconfig.json](tsconfig.json). The lines that matter:

| Option | Effect |
| --- | --- |
| `"strict": true` | all strict checks on — most importantly `strictNullChecks`, so a nullable database column can't be used as if it were always present |
| `"noEmit": true` | TypeScript only *checks*; Turbopack/SWC does the actual compiling |
| `"jsx": "react-jsx"` | modern JSX transform — no need to `import React` in every file |
| `"moduleResolution": "bundler"` | resolve imports the way a bundler does |
| `"isolatedModules": true` | each file must be compilable alone (required for fast per-file transforms) |
| `"incremental": true` | cache results in `tsconfig.tsbuildinfo` for faster re-checks |
| `"plugins": [{ "name": "next" }]` | the Next.js TS plugin: it's what makes `PageProps<'/music'>` autocomplete and flags invalid Server/Client boundary usage in your editor |
| `"paths": { "@/*": ["./*"] }` | the `@/` alias |

🧠 **That alias explains every import in this codebase.** `@/lib/db` means "`lib/db` from the project root", not a relative walk like `../../../lib/db`. Move a file and its imports still resolve.

`include` lists `.next/types/**/*.ts` and `.next/dev/types/**/*.ts` — these are generated during `dev`/`build` and contain the route-literal types. If `PageProps<"/music">` suddenly errors, it's usually because you haven't run `next dev` yet in a fresh checkout.

## 3.4 `next-env.d.ts`

```ts
/// <reference types="next" />
/// <reference types="next/image-types/global" />
import "./.next/dev/types/routes.d.ts";
import "./.next/dev/types/root-params.d.ts";
```

Generated by Next.js, listed in `.gitignore`, and marked "do not edit". It pulls in Next's ambient types and the generated route types. This is where `LayoutProps` and `PageProps` come from without an import statement.

## 3.5 `types/react-view-transition.d.ts`

A **declaration file** you wrote by hand. It exists because of a version mismatch: React's `<ViewTransition>` component ships in the React build Next.js vendors, but `@types/react` hasn't declared it yet.

```ts
declare module "react" {
  interface ViewTransitionProps { … }
  export const ViewTransition: (props: ViewTransitionProps) => ReactNode;
}
```

`declare module "react"` **augments** the existing `react` types rather than replacing them. Without this file, `import { ViewTransition } from "react"` in [app/(app)/layout.tsx](<app/(app)/layout.tsx>) would be a type error, and the usual workaround would be an `any` cast that silently gives up all checking.

The comment even records where the runtime component was verified to exist: `node_modules/next/dist/compiled/react/cjs/react.production.js`. 🔎 That's good practice for any hand-written declaration — it tells the next reader how to confirm the file isn't lying.

The props it declares: `name` (shared name — matching names *morph* between routes), `default` / `enter` / `exit` / `update` / `share` (CSS class hooks per transition kind), and the `onEnter`/`onExit`/`onUpdate`/`onShare` callbacks.

## 3.6 `postcss.config.mjs`

```js
const config = { plugins: { "@tailwindcss/postcss": {} } };
export default config;
```

Four lines. PostCSS is a CSS transformation pipeline; this registers Tailwind v4's plugin. That plugin scans your source files for class names, reads the `@theme` blocks in [app/globals.css](app/globals.css), and generates exactly the CSS you used.

In Tailwind v3 this file would also list `autoprefixer`. v4 handles vendor prefixing internally.

## 3.7 `eslint.config.mjs`

```js
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);
```

ESLint 9's "flat config" format (an array of config objects, replacing the old `.eslintrc`). It composes two presets: `core-web-vitals` (Next.js rules that affect performance and accessibility, e.g. warning about raw `<img>`) and `typescript`.

The `globalIgnores` call re-declares the defaults, because in flat config specifying your own ignores replaces the preset's. Build output and generated types aren't yours to lint.

🔎 You'll spot `// eslint-disable-next-line @next/next/no-img-element` in three places ([home/page.tsx](<app/(app)/home/page.tsx>), [us/page.tsx](<app/(app)/us/page.tsx>)). Those are deliberate: a plain `<img>` is used where the component is a Server Component and the extra machinery of `<Image>` buys nothing. Each disable is scoped to a single line — never file-wide.

## 3.8 `prisma.config.ts`

```ts
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: {
    // CLI-only (migrate/db/studio). The schema engine cannot run through
    // Supabase's transaction pooler (6543), so prefer the session-mode
    // DIRECT_URL here. lib/db.ts keeps using DATABASE_URL at runtime.
    url: process.env["DIRECT_URL"] || process.env["DATABASE_URL"],
  },
});
```

New in Prisma 7: the CLI is configured in TypeScript instead of by convention. Three subtleties:

1. `import "dotenv/config"` — the Prisma CLI is a plain Node process. It doesn't get Next.js's automatic `.env` loading, so it loads `.env` itself.
2. The connection URL now comes from **here**, which is why [prisma/schema.prisma](prisma/schema.prisma) has `datasource db { provider = "postgresql" }` with no `url` line. Older Prisma tutorials put `url = env("DATABASE_URL")` in the schema; in v7 that moved.
3. **The CLI and the app deliberately use different URLs.** `DIRECT_URL` is Supabase's session-mode port; `DATABASE_URL` is the transaction pooler the running app uses. Prisma 7's config `datasource` accepts only `url` and `shadowDatabaseUrl` — there is no `directUrl` field like v6 had in the schema — so the choice is made here. Note `||` rather than `??`: `.env.example` ships `DIRECT_URL=""`, and dotenv sets that as an empty *string*, which `??` would happily pass to the CLI as the connection URL. Full reasoning in §4.12.

## 3.9 `proxy.ts`

```ts
import { clerkMiddleware } from "@clerk/nextjs/server";
export default clerkMiddleware();

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
```

⚠️ **This file used to be called `middleware.ts`.** Next.js 16 renamed the convention to `proxy.ts`. Same behaviour, new name — if you search the web for "Next.js middleware auth" you will find the old filename everywhere.

**What it does:** runs before every matching request and attaches Clerk's authentication context, so that `auth()` and `currentUser()` work inside Server Components and Server Actions.

**What it deliberately does *not* do:** route protection.

🔎 This is the most important architectural decision in the app, so it's worth spelling out. A tempting pattern is:

```ts
// NOT what this app does
const isProtected = createRouteMatcher(["/home(.*)", "/music(.*)"]);
if (isProtected(req)) auth().protect();
```

The problem is drift. Add `/mood` and forget to add it to the list, and that page is silently public. Clerk 7 deprecated `createRouteMatcher` for exactly this reason. This codebase instead puts authorisation **next to the data**:

- [app/(app)/layout.tsx](<app/(app)/layout.tsx>) calls `requireCoupleContext()`, which gates *every* page inside the route group by construction — a new page under `(app)/` is protected the moment you create it.
- Every Server Action calls it again, because actions are reachable by direct POST regardless of what any layout rendered.

**The matcher regex,** read piece by piece:

- `/(...)` — match a path.
- `(?!_next|…)` — a *negative lookahead*: don't match if the path starts with `_next` (Next.js internals) or ends in a static file extension.
- `js(?!on)` — match `.js` but not `.json`, since JSON responses may well need auth.
- `.*` — anything else.
- The second entry, `"/(api|trpc)(.*)"`, force-includes API routes even though the first pattern might exclude some.

Net effect: Clerk's context is attached to real page and data requests, and skipped for static assets where it would be wasted work.

## 3.10 Environment files

[.env.example](.env.example) is the template; `.env` is the real file. Both are git-ignored — `.gitignore` matches `.env*`, which catches the template too, so a fresh clone has neither and you are working from this table. Adding `!.env.example` under that rule would fix it; the template holds no secrets.

| Variable | Required? | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | **yes** | Postgres connection string for the **running app**. On Supabase this is the transaction pooler, port 6543, with `?pgbouncer=true`. Read by [lib/db.ts](lib/db.ts) |
| `DIRECT_URL` | on Supabase | Session-mode connection string, port 5432, used by the **Prisma CLI** for migrations and Studio. Read by [prisma.config.ts](prisma.config.ts). Omit it against a local Postgres and the CLI falls back to `DATABASE_URL` |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | optional in dev | Clerk's browser key |
| `CLERK_SECRET_KEY` | optional in dev | Clerk's server key |
| `YOUTUBE_API_KEY` | yes, for music | Google Cloud API key with YouTube Data API v3 enabled |
| `YOUTUBE_PLAYLIST_ID` | optional | overrides the playlist in [lib/youtube-config.ts](lib/youtube-config.ts) |
| `NEXT_PUBLIC_APP_URL` | optional | canonical origin for link-preview metadata |

🧠 **The `NEXT_PUBLIC_` prefix is a security boundary.** Next.js inlines any `NEXT_PUBLIC_*` variable into the browser bundle. Everything else stays server-side. So `YOUTUBE_API_KEY` (no prefix) can never leak to a user's browser, while the Clerk *publishable* key is designed to be public and carries the prefix.

⚠️ **Percent-encode reserved characters in the password.** These are URLs, so a password containing `@`, `:`, `/`, `?`, `#` or `%` must be encoded — `@` becomes `%40`. This project's password contains an `@`, so both strings carry `%40`. The failure is confusing because it isn't consistent: `pg` (and therefore `npm run check:db`) recovers a raw `@` fine, while Prisma's stricter parser reads everything after the *first* `@` as the host and fails somewhere unrelated.

Clerk runs in **keyless mode** in development if its two variables are blank: `next dev` provisions a temporary instance and prints a claim link, so you can run the app with no signup.

## 3.11 `.gitignore`

Standard Next.js ignores plus three project-specific lines:

```
.env*                     ← never commit secrets (also catches .env.example — see §3.10)
/lib/generated/prisma     ← regenerate it, don't version it
/.clerk/                  ← Clerk's local keyless-mode state, may contain keys
next-env.d.ts             ← generated
*.tsbuildinfo             ← TypeScript's cache
```

⚠️ `/lib/generated/prisma` being ignored means **a fresh clone has no Prisma client until you run `npx prisma generate`** (which `prisma migrate dev` also does). If you see `Cannot find module '@/lib/generated/prisma/client'`, that's the cause.

## 3.12 `AGENTS.md` and `CLAUDE.md`

[CLAUDE.md](CLAUDE.md) is one line: `@AGENTS.md` — an include.

[AGENTS.md](AGENTS.md) is a warning aimed at AI coding assistants: this is Next.js 16, its conventions differ from most training data, read `node_modules/next/dist/docs/` before writing code. The block is regenerated by `next dev` (from `node_modules/next/dist/server/lib/generate-agent-files.js`), so deleting it just brings it back.

You can safely ignore both when reading the app. They're worth knowing about because they explain why the code uses `proxy.ts` and `<Show when="signed-in">` rather than the patterns you'd find in a 2024 tutorial.

## 3.13 `.claude/`, `.agents/`, `skills-lock.json`

Tooling for AI assistants:

- `.claude/settings.local.json` — a local allowlist so `npm install *` doesn't prompt for permission.
- `.agents/skills/prisma-*/` — vendored copies of Prisma's documentation, so an agent can read authoritative Prisma 7 docs offline instead of guessing.
- `skills-lock.json` — SHA-256 hashes pinning those vendored docs to a known version.

None of it runs at build or request time.

## 3.14 `tsconfig.tsbuildinfo`

TypeScript's incremental compilation cache. Git-ignored, machine-generated, safe to delete (it just makes the next `tsc` slower).

---

# Part 4 — The database layer

## 4.1 What Prisma is

Prisma is an **ORM** (Object-Relational Mapper). You describe your tables in one schema file; Prisma generates (a) SQL migration files and (b) a fully typed TypeScript client. You then write:

```ts
const songs = await db.song.findMany({ where: { coupleId, isAvailable: true } });
```

…instead of SQL strings, and `songs` is typed automatically — including the fact that `songs[0].artist` might be `null`.

The workflow:

```
edit prisma/schema.prisma
        ↓
npx prisma migrate dev --name describe_the_change
        ↓
        ├─→ writes prisma/migrations/<timestamp>_describe_the_change/migration.sql
        ├─→ applies it to your database
        └─→ regenerates lib/generated/prisma/
```

⚠️ That workflow is the **local Postgres** one. `migrate dev` needs to create a throwaway *shadow database*, which Supabase's pooled `postgres` user is not allowed to do, so against the hosted database you author migrations locally and apply them with `migrate deploy`. See §4.12.

## 4.2 `prisma/schema.prisma` — top of file

```prisma
generator client {
  provider = "prisma-client"
  output   = "../lib/generated/prisma"
}

datasource db {
  provider = "postgresql"
}
```

- `provider = "prisma-client"` — Prisma 7's ESM-friendly generator. (v6 and earlier used `prisma-client-js`; if you copy a v6 tutorial you'll get the wrong one.)
- `output` — the generated client goes into your repo tree instead of `node_modules`, which is why imports read `@/lib/generated/prisma/client`.
- No `url` in `datasource` — it moved to [prisma.config.ts](prisma.config.ts), as covered in §3.8.

### Prisma schema syntax, briefly

```prisma
model Song {
  id       String  @id @default(cuid())
  duration Int?
  couple   Couple  @relation(fields: [coupleId], references: [id], onDelete: Cascade)
  @@unique([coupleId, youtubeVideoId])
  @@index([coupleId, position])
}
```

| Syntax | Meaning |
| --- | --- |
| `String`, `Int`, `Boolean`, `DateTime` | column types |
| `Type?` | nullable |
| `Type[]` | the *other* side of a relation (no column; it's a list) |
| `@id` | primary key |
| `@default(cuid())` | auto-generate a collision-resistant unique id |
| `@default(now())` | set to insert time |
| `@updatedAt` | Prisma rewrites this on every update |
| `@unique` | unique constraint on one column |
| `@map("emoji")` | the DB column has a different name than the field |
| `@relation(...)` | declares a foreign key |
| `@@id([a, b])` | **composite** primary key |
| `@@unique([a, b])` | composite unique constraint |
| `@@index([a, b])` | index for query performance |
| `///` | a documentation comment — it flows into the generated types |

🧠 **`onDelete` is the most important attribute in this schema.**
- `Cascade` — delete the parent, and this row is deleted too.
- `SetNull` — delete the parent, and this column becomes `null`.

The choice encodes a product decision every single time. Deleting a couple should erase its songs (`Cascade`). Deleting a *song* must not erase the memory attached to it (`SetNull`) — that memory is the point of the whole app.

## 4.3 `model User`

```prisma
model User {
  id          String   @id @default(cuid())
  clerkUserId String   @unique
  name        String?
  email       String   @unique
  avatar      String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  couplesAsPartner1 Couple[]      @relation("Partner1")
  couplesAsPartner2 Couple[]      @relation("Partner2")
  sentNotes         LoveNote[]    @relation("NoteSender")
  receivedNotes     LoveNote[]    @relation("NoteRecipient")
  favorites         Favorite[]
  createdMemories   Memory[]
  moodCheckIns      MoodCheckIn[]

  @@index([clerkUserId])
}
```

🔎 **Why a `User` table at all, when Clerk already stores users?** Because your database needs something for foreign keys to point at. A `LoveNote` has a `senderId`; that must reference a row you own. Clerk remains the source of truth for *identity* (email, name, avatar, password, sessions); this table is a local **mirror** with an id your other tables can reference.

`clerkUserId` is the join key between the two systems, and it's `@unique` so one Clerk account can never produce two rows.

The seven relation fields are **virtual** — no columns exist for them. They're how you write `db.user.findMany({ include: { favorites: true } })`. Note that `LoveNote` needs *named* relations (`"NoteSender"`, `"NoteRecipient"`) because there are two separate foreign keys from `LoveNote` to `User`, and Prisma can't guess which list corresponds to which.

## 4.4 `model Couple`

```prisma
model Couple {
  id         String  @id @default(cuid())
  name       String
  partner1Id String
  partner2Id String?          // null until the invite is accepted

  relationshipStartDate DateTime?
  anniversaryDate       DateTime?

  inviteCode String @unique
  theme      Theme  @default(ROMANTIC)

  playlistLastSyncedAt DateTime?
  playlistSyncStatus   SyncStatus @default(IDLE)
  playlistSyncError    String?

  partner1 User  @relation("Partner1", fields: [partner1Id], references: [id], onDelete: Cascade)
  partner2 User? @relation("Partner2", fields: [partner2Id], references: [id], onDelete: SetNull)
  …
}
```

This is the app's central tenancy boundary. **Every** piece of content hangs off a `coupleId`.

Field-by-field:

- **`partner1Id` required, `partner2Id` nullable.** That asymmetry is the whole invite flow. Partner 1 creates the space; partner 2 is `null` until someone redeems the code. Every page in the app therefore has to handle `partner === null`, and they all do — see the "your space is still missing someone" card on Home.
- **`onDelete: Cascade` on partner1 vs `SetNull` on partner2.** If the creator's account is deleted, the space goes with it. If the partner's account is deleted, the space survives with an empty second slot. Deliberate, and different.
- **`relationshipStartDate` / `anniversaryDate` both optional.** The counter and countdown are conditional UI, not required data.
- **`inviteCode` `@unique`** — 8 characters, and its uniqueness constraint is what makes `findUnique({ where: { inviteCode } })` a valid lookup.
- **`theme`** — an enum, stored on the couple (a *shared* preference, not per-user).
- **The three `playlist*` fields** — sync bookkeeping: when it last succeeded, what state it's in, and the last error message. These moved here from a deleted `YouTubeConnection` table (see §4.11).

```prisma
enum Theme { LIGHT DARK ROMANTIC }
enum SyncStatus { IDLE SYNCING SUCCESS ERROR }
```

An enum becomes a real Postgres type. The database itself rejects `theme = 'PURPLE'` — you can't get an invalid value in by any route, not even hand-written SQL.

## 4.5 `model Song`

```prisma
model Song {
  id             String  @id @default(cuid())
  coupleId       String
  youtubeVideoId String
  title          String
  artist         String?
  thumbnail      String?
  duration       Int?      // seconds
  position       Int
  isAvailable    Boolean @default(true)

  addedAt   DateTime @default(now())
  …
  @@unique([coupleId, youtubeVideoId])
  @@index([coupleId, position])
}
```

- **It stores metadata only, never audio.** That's both a legal position (§6 of the PRD) and a technical one: playback is delegated to YouTube's own player.
- **`position`** mirrors the order in the YouTube playlist, and `@@index([coupleId, position])` makes `orderBy: { position: "asc" }` fast.
- **`isAvailable`** — the single most product-critical boolean in the schema. When a video is deleted or made private upstream, sync sets this to `false` **instead of deleting the row**.

  🔎 Why: memories and favourites have foreign keys into `Song`. Deleting the row would either cascade the memory away or null it out. Losing a memory because YouTube took a video down would be the worst possible bug in an app whose entire purpose is remembering things. So the row stays, gets hidden from the library and the play queue, and is counted in a footnote ("2 songs are no longer in your YouTube playlist. We keep them so your memories stay attached.").
- **`@@unique([coupleId, youtubeVideoId])`** — the same video can appear once per couple. This is what makes sync idempotent: it can match incoming YouTube entries to existing rows by `(couple, video)` and update rather than duplicate.
- **`artist`, `thumbnail`, `duration` all nullable** because the YouTube API genuinely doesn't always provide them.

## 4.6 `model Favorite`

```prisma
model Favorite {
  userId    String
  songId    String
  createdAt DateTime @default(now())
  @@id([userId, songId])
  @@index([songId])
}
```

A **join table** with a composite primary key and no `id` of its own. `@@id([userId, songId])` means one person can favourite one song at most once — enforced by the database, so no application-level "check then insert" race is possible.

This shape is what makes "his / hers / ours" derivable rather than stored: intersect two users' favourite sets and you have the shared ones. See [app/(app)/us/page.tsx](<app/(app)/us/page.tsx>).

The composite key also gives Prisma the `where: { userId_songId: { userId, songId } }` lookup syntax you'll see in [lib/actions/song.ts](lib/actions/song.ts).

## 4.7 `model LoveNote`

```prisma
model LoveNote {
  id          String @id @default(cuid())
  coupleId    String
  senderId    String
  recipientId String
  content    String
  isRead     Boolean @default(false)
  isFavorite Boolean @default(false)
  deliverAt  DateTime?
  createdAt  DateTime  @default(now())
  readAt     DateTime?
  @@index([coupleId, createdAt])
  @@index([recipientId, isRead])
}
```

- **`senderId` *and* `recipientId`** — both point at `User` through named relations. Direction matters for permissions: only the sender may delete a note, only the recipient may mark it read.
- **`deliverAt` nullable** is the entire scheduled-delivery feature. `null` = deliver now. A future timestamp = hidden from the recipient until then. There is **no cron job**: the filter lives in the query, in [app/(app)/love/page.tsx](<app/(app)/love/page.tsx>):

  ```ts
  OR: [{ deliverAt: null }, { deliverAt: { lte: new Date() } }]
  ```

  🔎 A scheduled note becomes visible the next time the recipient loads the page after its time passes. That's a genuinely elegant trade: zero infrastructure, and the only cost is that "delivery" happens on read rather than being pushed.
- **`isRead` + `readAt`** — a boolean for filtering and a timestamp for display.
- **The two indexes** match the two real queries: "the couple's notes newest first" and "this recipient's unread notes".

## 4.8 `model Memory`

```prisma
model Memory {
  id          String    @id @default(cuid())
  coupleId    String
  title       String
  description String?
  date        DateTime?
  image       String?
  songId      String?
  createdById String
  song      Song? @relation(fields: [songId], references: [id], onDelete: SetNull)
  createdBy User  @relation(fields: [createdById], references: [id], onDelete: Cascade)
}
```

- **`songId` optional** — a memory can be tied to a song (PRD §11) or stand alone (PRD §15). One model covers both.
- **`onDelete: SetNull` on the song** — belt and braces alongside `isAvailable`. Even if a song row *were* deleted, the memory would survive with `songId = null`.
- **`image String?`** — schema support for photo memories, with no upload implemented. Adding photos later needs no migration, which is why it's here.
- **`createdById`** — attribution ("Added by Alex").

## 4.9 The mood models

```prisma
model Mood {
  id        String @id @default(cuid())
  coupleId  String
  slug      String
  name      String
  icon      String @map("emoji")
  sortOrder Int    @default(0)
  @@unique([coupleId, slug])
}
```

🔎 **Moods are seeded per couple, not global.** When a couple is created, [lib/actions/couple.ts](lib/actions/couple.ts) inserts seven rows from `DEFAULT_MOODS`. That means a couple could rename "Late Night" to something private to them without affecting anyone else. The cost is duplication (7 rows × N couples); the benefit is that moods are *their* data.

The `@map("emoji")` is a small piece of history worth understanding: the column was created when moods were emoji characters. When the UI moved to icon components, the *field* was renamed to `icon` but the *column* kept its old name — so no migration was needed and rows created before the change still work. The mapping is invisible to your query code.

```prisma
model SongMood {
  songId String
  moodId String
  @@id([songId, moodId])
}
```

Another join table, same pattern as `Favorite`. This is what lets `/music?mood=<id>` filter the library.

```prisma
model MoodCheckIn {
  id       String @id @default(cuid())
  coupleId String
  userId   String
  moodId   String
  createdAt DateTime @default(now())
  @@index([userId, createdAt])
}
```

**Append-only.** Checking in never updates a row; it inserts a new one. "Your current mood" is defined as *the most recent row for you*:

```ts
db.moodCheckIn.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } })
```

🔎 This is a nice pattern to recognise. Storing history and deriving "current" costs one index and gives you a free timeline later; storing only "current" would have thrown the history away irrecoverably.

## 4.10 Reading the whole schema as a graph

```
                       ┌──────┐
              ┌────────│ User │────────┐
              │        └──────┘        │
       partner1/2   favorites,      sender/recipient,
              │     memories,       checkIns
              ▼     checkIns             │
         ┌────────┐                      │
         │ Couple │◄─────────────────────┘
         └───┬────┘
   ┌─────┬───┴────┬──────────┐
   ▼     ▼        ▼          ▼
 Song  LoveNote  Memory     Mood
   │                │         │
   ├── Favorite ────┘         │
   ├── SongMood ──────────────┤
   └── (Memory.songId)        └── MoodCheckIn
```

Two things to notice:

1. **Everything content-shaped carries `coupleId`.** That single column is what makes `where: { coupleId }` a complete tenancy filter, and it's why [lib/auth.ts](lib/auth.ts) hands out a `coupleId` and nothing else.
2. **`User` and `Couple` are the only two entry points.** Everything else is reachable only through them.

## 4.11 `prisma/migrations/`

Migrations are the versioned history of your database. Each folder is one step, named `<timestamp>_<label>`, containing raw SQL. They run in timestamp order and are recorded in a `_prisma_migrations` table so each runs exactly once.

### `20260814055746_init/migration.sql`

The initial schema: two `CREATE TYPE` statements for the enums, ten `CREATE TABLE`s, all the indexes, then all the foreign keys. Note the ordering — tables first, constraints after, so creation order doesn't matter.

Look at this table, which no longer exists in the schema:

```sql
CREATE TABLE "YouTubeConnection" (
    "id" TEXT NOT NULL,
    "coupleId" TEXT NOT NULL,
    "connectedByUserId" TEXT NOT NULL,
    "youtubeAccountId" TEXT,
    "playlistId" TEXT NOT NULL,
    "playlistTitle" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "syncStatus" "SyncStatus" NOT NULL DEFAULT 'IDLE',
    …
);
```

That's the original design: OAuth per couple, each couple picking their own playlist.

### `20260814071717_single_hardcoded_playlist/migration.sql`

```sql
ALTER TABLE "Couple" ADD COLUMN "playlistLastSyncedAt" TIMESTAMP(3),
ADD COLUMN "playlistSyncError" TEXT,
ADD COLUMN "playlistSyncStatus" "SyncStatus" NOT NULL DEFAULT 'IDLE';

DROP TABLE "YouTubeConnection";
```

🔎 **This migration is a design lesson.** The OAuth flow was fully built, then deleted. The reasoning (recorded in PRD §6): this is a private app for two people with exactly *one* playlist. OAuth required a Google Cloud OAuth client, a consent screen, custom credentials configured in Clerk, and a token re-grant whenever scopes changed — all to let the user choose from a list of one. A server-side API key needs a single Google Cloud toggle and stores **no user credentials at all**.

That last part is the real win. PRD §20 requires "YouTube credentials must be securely stored". With an API key, that requirement is trivially satisfied: there are no user credentials to store. Deleting a feature made a security requirement disappear.

The trade-off is real and documented: an API key can read **public and unlisted** playlists, but not fully private ones.

Notice the migration file starts with a `/* Warnings: */` block Prisma generated automatically — dropping a table is destructive, and Prisma makes you see that before applying.

### `migration_lock.toml`

```toml
provider = "postgresql"
```

Records which database engine these migrations were written for, so Prisma can refuse to apply Postgres SQL to, say, MySQL.

## 4.12 Where the database actually lives: Supabase

Nothing in `schema.prisma`, `lib/db.ts`, or any query is Supabase-specific — it is all plain Postgres. What *is* specific is **how you connect**, and that detail has its own set of sharp edges.

The database is a hosted Supabase project (region `ap-northeast-2`, Postgres 17). The local Homebrew Postgres 16 line is still in `.env`, commented out, and still works — see §14.1 for both paths.

### Two ports, not interchangeable

Supabase does not hand you a direct connection. It puts a pooler (**Supavisor**) in front of Postgres and exposes it twice, on one hostname — `aws-0-<region>.pooler.supabase.com` — with the username carrying the project ref, `postgres.<project-ref>`:

| Port | Mode | Who uses it | Why that one |
| --- | --- | --- | --- |
| **6543** | transaction | the running app — `DATABASE_URL`, with `?pgbouncer=true` | A connection is leased only for the duration of a statement. Next.js server rendering opens and abandons connections constantly, and a small instance's direct-connection limit would be exhausted in seconds without this. |
| **5432** | session | the Prisma CLI — `DIRECT_URL` | The migration engine needs a connection it can keep: advisory locks, `SET` statements, and multi-statement DDL transactions all have to land on the *same* backend, which transaction mode cannot promise. |

Point the CLI at 6543 and migrations fail in ways that have nothing to do with your SQL. That is exactly what [prisma.config.ts](prisma.config.ts) exists to prevent (§3.8).

`?pgbouncer=true` on the runtime URL tells Prisma to stop using prepared statements, which a transaction pooler cannot keep alive between statements.

### Migrating: `deploy`, not `dev`

`prisma migrate dev` creates a temporary **shadow database** to work out what changed. Creating a database requires `CREATE DATABASE`, which the pooled `postgres` role does not have. So the loop is:

```bash
# author the migration against LOCAL postgres, where a shadow DB is allowed
npx prisma migrate dev --name describe_the_change   # writes prisma/migrations/<ts>_…

# then apply the committed migration to Supabase
npx prisma migrate status     # what does the remote database have?
npx prisma migrate deploy     # apply pending migrations, no shadow DB needed
npx prisma generate           # refresh lib/generated/prisma
```

`migrate deploy` only ever runs migration files that already exist. It never invents SQL and never resets anything, which is why it is also the right command in CI or on a fresh Supabase project.

To confirm the remote database matches the schema afterwards:

```bash
npx prisma migrate diff --from-config-datasource --to-schema=prisma/schema.prisma --exit-code
# "No difference detected."   exit 0 = in sync, 2 = drift
```

🧠 **`db push` is the other option, and this project doesn't use it.** It syncs the schema without writing a migration file. Fine for a scratch database, wrong here: `prisma/migrations/` is committed history, and skipping it means the next `migrate deploy` on any other environment replays a past that never happened.

### When it breaks

⚠️ **`FATAL: (ENOTFOUND) tenant/user postgres.<ref> not found`** is a Supavisor error, and it means the pooler has no such tenant — not that your password is wrong and not that the port is wrong. Usually the project ref is stale (project deleted, or paused, or a typo). Confirm from outside Prisma before touching any config:

```bash
nslookup db.<project-ref>.supabase.co       # a live project resolves; a dead ref returns nothing
curl -s -o /dev/null -w '%{http_code}\n' https://<project-ref>.supabase.co/rest/v1/
#   401 → project is alive (it wants an API key)
#   000 → no DNS, the ref no longer exists
```

A *paused* project still resolves and serves a paused page; a deleted one has no DNS at all. Both fail identically through Prisma, which is why the DNS check is worth doing first.

`npm run check:db` ([scripts/check-db.mjs](scripts/check-db.mjs)) wraps this in plain language and connects with `pg` directly, which is useful for isolating a Prisma-parsing problem from a genuine connectivity one.

## 4.13 `lib/generated/prisma/` — the generated client

~20,000 lines across 19 files, **entirely generated**, git-ignored, and never to be edited.

| File | Contents |
| --- | --- |
| `client.ts` | exports `PrismaClient` — the import used by [lib/db.ts](lib/db.ts) |
| `models.ts` / `enums.ts` | re-exports the model and enum types |
| `models/User.ts`, `models/Song.ts`, … | per-model types: the row shape plus every possible `where`, `select`, `include`, `orderBy`, `create`, `update` argument |
| `commonInputTypes.ts` | shared filter types (`StringFilter`, `DateTimeNullableFilter`, …) |
| `internal/class.ts`, `internal/prismaNamespace.ts` | client internals |
| `browser.ts`, `internal/prismaNamespaceBrowser.ts` | browser-safe type-only entry points |

🧠 **Why so much code?** This is what makes `db.song.findMany({ where: { isAvailable: true } })` type-check while `db.song.findMany({ where: { isAvailble: true } })` fails at compile time — and what makes the result type know that `artist` is `string | null`. All of it is derived from your schema; every field you add regenerates it.

You will never open these files. You *will* need to remember to regenerate them (`npx prisma generate`) after editing the schema, and after a fresh clone.

## 4.14 `lib/db.ts`

```ts
import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/lib/generated/prisma/client";

function createClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env and point it at your Postgres instance.");
  }
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createClient> | undefined;
};

export const db = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
```

Small file, four separate ideas.

**1. `import "server-only"`.** A marker package with no runtime behaviour. If any Client Component ends up importing this file — even transitively — the build fails with a clear message. Without it, you'd get a confusing bundler error, or worse, a database URL in a client bundle.

**2. The driver adapter.** Prisma 7 requires one for SQL databases: `new PrismaPg({ connectionString })` wraps the `pg` driver. In Prisma 6 you'd just pass a URL. This is the change most likely to break code copied from older tutorials.

**3. The fail-fast check.** Rather than letting the first query die with a cryptic connection error, it throws a message that tells you exactly what to do.

**4. The `globalThis` singleton.** This is the part worth studying.

🧠 In development, saving a file makes Next.js re-evaluate modules. Each evaluation of `new PrismaClient()` opens a **new connection pool**. Edit files for ten minutes and Postgres starts refusing connections with "too many clients already". Stashing the instance on `globalThis` — which survives module reloads — means you reuse the same client. In production there are no hot reloads, so the global isn't set at all, keeping the module clean.

Read the export line as: "use the cached client if one exists, otherwise make one."

**Logging** is `["warn", "error"]` in development and `["error"]` alone in production, so query warnings don't flood production logs.

Everywhere else in the app, this is simply `import { db } from "@/lib/db"`.
---

# Part 5 — Authentication & access control

This is the part of the codebase where a mistake is a privacy breach rather than a bug. It's worth reading twice.

## 5.1 How Clerk works, conceptually

Clerk is a hosted authentication service. This codebase contains **no password hashing, no session tokens, no email verification, no OAuth handshakes**. Instead:

1. [app/layout.tsx](app/layout.tsx) wraps the whole app in `<ClerkProvider>`, which sets up Clerk's context and loads its script.
2. [proxy.ts](proxy.ts) runs `clerkMiddleware()` on every request, reading Clerk's session cookie and attaching an auth context.
3. Any Server Component or Server Action can then call `await auth()` (gives you a user id) or `await currentUser()` (gives you the full Clerk profile).
4. In the browser, `<Show when="signed-in">`, `<SignIn />`, `<SignUp />`, and `<UserButton />` render Clerk's own UI.

⚠️ **Clerk 7 removed `<SignedIn>`, `<SignedOut>`, and `<Protect>`.** The replacement is a single component with a condition:

```tsx
<Show when="signed-in" fallback={<SignInButtons />}>
  <OpenOurSpace />
</Show>
```

If you find a tutorial using `<SignedIn>`, it's for Clerk 5/6.

## 5.2 `lib/auth.ts` — the access-control chokepoint

[lib/auth.ts](lib/auth.ts) is the most security-critical file in the project. Its opening comment states the invariant:

> Every helper here derives the couple from the *session*, never from anything the client sends. Callers get a `coupleId` they can safely scope queries to; no route or action should ever accept a coupleId as input.

Hold onto that sentence — it's the whole design.

### `getUserId()`

```ts
export async function getUserId() {
  const { userId } = await auth();
  return userId;
}
```

Returns the **Clerk** user id, or `null` when signed out. Used only where "signed in or not?" is the question without needing a database row — see [app/join/[code]/page.tsx](<app/join/[code]/page.tsx>), which must render for logged-out visitors.

### `requireUser()`

```ts
export async function requireUser() {
  const clerkUser = await currentUser();
  if (!clerkUser) redirect("/sign-in");

  const email = clerkUser.primaryEmailAddress?.emailAddress
    ?? clerkUser.emailAddresses[0]?.emailAddress;
  if (!email) throw new Error("Clerk user has no email address on file.");

  const name = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ")
    || clerkUser.username
    || email.split("@")[0];

  return db.user.upsert({
    where:  { clerkUserId: clerkUser.id },
    update: { email, name, avatar: clerkUser.imageUrl },
    create: { clerkUserId: clerkUser.id, email, name, avatar: clerkUser.imageUrl },
  });
}
```

Four things happen here.

**1. It enforces sign-in.** `redirect("/sign-in")` throws, so nothing below runs — and TypeScript knows `clerkUser` is non-null afterwards.

**2. Email fallback.** Prefer the primary address, else the first one. Then a hard `throw` if there's none, because `email` is a required non-null column.

**3. Name fallback chain.** `"First Last"` → username → the local part of the email. `[a, b].filter(Boolean).join(" ")` drops missing parts, and `||` (not `??`) is correct here because an *empty string* should also fall through.

**4. The upsert — this is the important one.**

🧠 **What `upsert` means:** "if a row matching `where` exists, apply `update`; otherwise apply `create`." One atomic statement, no read-then-write race.

🔎 **Why sync lazily rather than with a webhook?** Clerk can push webhooks on user changes, which means an endpoint, signature verification, retry handling, and a window where a brand-new user has no local row. This design instead mirrors the user on **every authenticated render**. Cost: one cheap upsert per page load. Benefit: the local row is never missing and never stale, with zero extra infrastructure. Change your name in Clerk and it's correct here on your next page view.

Note also that this is where "Clerk owns identity, we own relationships" is enforced: `update` refreshes email/name/avatar from Clerk every time, so those three fields are never authoritative here.

### `getCoupleForUser()`

```ts
export async function getCoupleForUser(userId: string) {
  return db.couple.findFirst({
    where: { OR: [{ partner1Id: userId }, { partner2Id: userId }] },
    include: { partner1: true, partner2: true },
  });
}
```

"The couple where this user is either partner." The `OR` is what makes the two partner slots symmetric from the app's point of view — nothing else in the UI cares which slot you occupy.

⚠️ Note the `userId` here is the **local** `User.id` (a cuid), not the Clerk id. Mixing those up is the easiest mistake to make in this codebase. Rule of thumb: `clerkUserId` appears only inside `lib/auth.ts`; everything else uses local ids.

`include` fetches both partner rows in the same query — one round trip instead of three.

### `CoupleContext`

```ts
export type CoupleContext = {
  user: Awaited<ReturnType<typeof requireUser>>;
  couple: NonNullable<Awaited<ReturnType<typeof getCoupleForUser>>>;
  partner: { id: string; name: string | null; avatar: string | null } | null;
};
```

Derived types, not hand-written ones. `Awaited<ReturnType<typeof requireUser>>` = "whatever `requireUser` resolves to" — add a column to `User` and this type follows. `NonNullable<…>` strips the `null` that `findFirst` can return, which is safe because the function below redirects in that case.

`partner` is deliberately a **narrow projection** — only `id`, `name`, `avatar`. Pages don't get handed the partner's full record when three fields are all they need.

### `requireCoupleContext()` — the gate

```ts
export async function requireCoupleContext(): Promise<CoupleContext> {
  const user = await requireUser();
  const couple = await getCoupleForUser(user.id);

  if (!couple) redirect("/onboarding");

  const partnerRecord = couple.partner1Id === user.id ? couple.partner2 : couple.partner1;

  return {
    user,
    couple,
    partner: partnerRecord
      ? { id: partnerRecord.id, name: partnerRecord.name, avatar: partnerRecord.avatar }
      : null,
  };
}
```

This one function is called by:
- [app/(app)/layout.tsx](<app/(app)/layout.tsx>) — gating every signed-in page,
- every page inside `(app)/` — to get the couple and partner,
- **every Server Action** — to re-establish trust from scratch.

The `partnerRecord` line reads as: "if I'm partner 1, the other person is partner 2; otherwise it's partner 1." That's how one line of code serves both members of the couple.

Its three failure modes cover everything:
| Situation | Result |
| --- | --- |
| not signed in | `redirect("/sign-in")` (inside `requireUser`) |
| signed in, no couple | `redirect("/onboarding")` |
| signed in, couple, partner not joined | returns with `partner: null` |

### `assertSongInCouple()`

```ts
export async function assertSongInCouple(songId: string, coupleId: string) {
  const song = await db.song.findFirst({
    where: { id: songId, coupleId },
    select: { id: true },
  });
  if (!song) throw new Error("Song not found in this space.");
  return song;
}
```

🔎 **This is the pattern that stops the attack the whole design is worried about.**

Suppose Alice knows a song id belonging to Bob's couple. She POSTs directly to the `toggleFavorite` Server Action with that id — she never needs the UI. Without this guard, she'd create a `Favorite` row pointing into someone else's data.

With it, the query is `WHERE id = ? AND coupleId = ?`, where the `coupleId` came from **her** session. No row matches, and it throws.

Note `select: { id: true }` — it fetches one column, because the only question is existence.

Two ways this pattern shows up across the codebase:
1. **Explicit assert then act** — `assertSongInCouple` before creating a favourite.
2. **Scoped write** — `deleteMany({ where: { id, coupleId } })`, where a wrong id simply matches zero rows. See `deleteMemory` and `markNoteRead`.

Both are correct. The second is preferable when possible since it's a single statement.

## 5.3 `app/sign-in/[[...sign-in]]/page.tsx`

```tsx
import { SignIn } from "@clerk/nextjs";
export const metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-16">
      <div className="text-center">
        <h1 className="display text-4xl">Welcome back, love</h1>
        <p className="mt-2 text-sm text-ink-soft">This little space has been waiting for you.</p>
      </div>
      <SignIn />
    </main>
  );
}
```

The whole login screen. `<SignIn />` renders Clerk's complete widget: email/password, social buttons, error states, MFA, password reset.

🧠 **Why `[[...sign-in]]`?** Clerk's flow uses sub-routes — `/sign-in/factor-one`, `/sign-in/reset-password`, etc. A double-bracket **optional catch-all** matches the bare path *and* any depth beneath it. With a plain `page.tsx` you'd get a 404 halfway through a password reset. The segment name (`sign-in`) is arbitrary; it just has to exist.

`export const metadata = { title: "Sign in" }` combines with the root layout's `template: "%s · Mood Swings"` to produce the browser-tab title "Sign in · Mood Swings".

[app/sign-up/[[...sign-up]]/page.tsx](<app/sign-up/[[...sign-up]]/page.tsx>) is the same file with `<SignUp />` and different copy.

## 5.4 The complete security model, in one place

Worth committing to memory, because every action file repeats it:

| Layer | Mechanism |
| --- | --- |
| Session | Clerk cookie, verified by `clerkMiddleware()` in [proxy.ts](proxy.ts) |
| Identity | `requireUser()` — Clerk session → local `User` row |
| Tenancy | `requireCoupleContext()` — session → `coupleId`, never from input |
| Page gate | `(app)/layout.tsx` calls it once for every route in the group |
| Action gate | every Server Action calls it **again**, independently |
| Row ownership | `assertSongInCouple`, or `where: { id, coupleId }` on the write |
| DB integrity | foreign keys + `onDelete` rules + composite unique constraints |
| Transport | `X-Frame-Options`, `Referrer-Policy`, `nosniff` in [next.config.ts](next.config.ts) |
| Discovery | `robots: { index: false }` in the root layout |
| Cache | service worker never caches HTML ([public/sw.js](public/sw.js)) |

The two rules that generate all of it:

1. **Never accept a `coupleId` (or any owner id) from the client.** Derive it.
2. **Never treat the UI as authorisation.** A Server Action must re-check everything, because it is a public endpoint.

---

# Part 6 — Shared library helpers

Everything in `lib/` that isn't the database, auth, or an action. These are the pure-logic files, and they're the easiest place to start reading real code.

## 6.1 `lib/site.ts`

```ts
export const SITE_NAME = "Mood Swings";
export const SITE_TAGLINE = "A little private corner of the internet that belongs to us.";
export const SITE_DESCRIPTION = "A private space for two people in love, where your YouTube playlist becomes the soundtrack to your memories, messages, and relationship.";

function clean(value: string | undefined) {
  const trimmed = value?.trim().replace(/\/+$/, "");
  return trimmed || undefined;
}

export const SITE_URL =
  clean(process.env.NEXT_PUBLIC_APP_URL) ??
  (clean(process.env.VERCEL_PROJECT_PRODUCTION_URL)
    ? `https://${clean(process.env.VERCEL_PROJECT_PRODUCTION_URL)}`
    : undefined) ??
  "http://localhost:3000";
```

Three constants and one derived URL.

🔎 **Why `SITE_URL` needs to exist at all.** Open Graph and Twitter card images must be **absolute** URLs — a social network fetching your preview has no base to resolve `/opengraph-image` against. But `export const metadata` is *static*: it's evaluated without a request, so it can't read the `Host` header. The origin therefore has to come from the environment.

Compare with [app/onboarding/invite/page.tsx](<app/onboarding/invite/page.tsx>), which *can* use `headers()` to build the invite link, because that's a request-time render.

`clean()` handles a real footgun: `.env.example` ships keys as `""`. An empty string is not `undefined`, so `??` would happily accept it and you'd get a broken URL. `trimmed || undefined` converts empty-ish to genuinely absent. The `.replace(/\/+$/, "")` strips trailing slashes so you never build `https://site.com//path`.

The three-step fallback: explicit env var → Vercel's automatic production domain → localhost. Deploy to Vercel and it just works with no configuration.

## 6.2 `lib/theme.ts`

```ts
export const THEME_COOKIE = "mood-swings-theme";
export const THEMES = ["romantic", "light", "dark"] as const;
export type ThemeName = (typeof THEMES)[number];

export function resolveTheme(value: string | undefined | null): ThemeName {
  return THEMES.includes(value as ThemeName) ? (value as ThemeName) : "romantic";
}

export function themeFromEnum(value: "LIGHT" | "DARK" | "ROMANTIC"): ThemeName {
  return value.toLowerCase() as ThemeName;
}
```

🧠 **`as const` plus `[number]` is a very common TypeScript idiom.** `as const` makes `THEMES` the exact tuple `readonly ["romantic", "light", "dark"]` rather than `string[]`. Then `(typeof THEMES)[number]` means "the type of any element", i.e. the union `"romantic" | "light" | "dark"`. One array now defines both the runtime list and the compile-time type — they can't drift.

`resolveTheme` is defensive parsing: a cookie is user-controlled text, so anything unrecognised falls back to `"romantic"`.

`themeFromEnum` bridges two naming conventions: Prisma enums are `ROMANTIC`, DOM attributes are `romantic`.

🔎 **Why a cookie at all, when the theme is in the database?** The root layout needs the theme to stamp `data-theme` during server rendering. Reading it from Postgres there would mean a database query on *every single navigation*, in the layout that wraps literally everything. Worse, before that query resolved you'd flash the default colours. A cookie is available synchronously in the request. So the database stays the source of truth (it's a shared couple setting, it survives device changes) and the cookie is a fast local mirror written by `setTheme` in [lib/actions/couple.ts](lib/actions/couple.ts).

## 6.3 `lib/format.ts`

Pure formatting helpers, safe on both server and client — which matters, because [components/relationship-counter.tsx](components/relationship-counter.tsx) calls the same functions on both sides.

### `daysTogether(start)`

```ts
export function daysTogether(start: Date | string): number {
  const from = new Date(start);
  const now = new Date();
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const b = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(0, Math.round((b - a) / 86_400_000));
}
```

⚠️ **This looks over-engineered and isn't.** The naive version — `(now - start) / 86400000` — is wrong in two ways:
1. It includes time-of-day, so "days together" would change at a random hour instead of at midnight.
2. Daylight saving means a calendar day is sometimes 23 or 25 hours long, so you'd drift by a day twice a year.

The fix: read the local Y/M/D, then rebuild both as **UTC midnight**. Now the subtraction is an exact multiple of 86,400,000 and the answer is a clean calendar-day count. `Math.round` mops up any residue; `Math.max(0, …)` guards a future start date.

`86_400_000` uses numeric separators — legal JavaScript, purely for readability (86.4 million ms = one day).

### `relationshipDuration(start)`

Produces `{ years, months, days }` for "2 years, 4 months, 13 days".

```ts
let years  = now.getFullYear() - from.getFullYear();
let months = now.getMonth() - from.getMonth();
let days   = now.getDate() - from.getDate();

if (days < 0) {
  months -= 1;
  const prevMonth = new Date(now.getFullYear(), now.getMonth(), 0);
  days += prevMonth.getDate();
}
if (months < 0) { years -= 1; months += 12; }
```

Subtract each component, then **borrow** — exactly like long subtraction by hand.

🧠 The trick worth learning: `new Date(year, month, 0)` gives the **last day of the previous month**. Day `0` of a month is the day before day 1. So `.getDate()` on it returns 28, 29, 30, or 31 — correct for leap years without any special-casing. That's how you borrow the right number of days.

Borrowing order matters: fix days first (which may decrement months), then fix months (which may decrement years).

### `formatDuration(start)`

```ts
const parts = [
  years  > 0 && `${years} ${years === 1 ? "year" : "years"}`,
  months > 0 && `${months} ${months === 1 ? "month" : "months"}`,
  `${days} ${days === 1 ? "day" : "days"}`,
].filter(Boolean);
return parts.join(", ");
```

`condition && string` evaluates to either `false` or the string; `.filter(Boolean)` drops the `false`s. Days are always included (so a brand-new relationship reads "3 days", not ""). Singular/plural handled per unit.

### `formatTime(totalSeconds)`

Seconds → `3:07` or `1:02:11`.

```ts
if (totalSeconds == null || !Number.isFinite(totalSeconds) || totalSeconds < 0) return "--:--";
```

Three guards, all earned: durations are nullable in the schema, and YouTube's player returns `NaN` before a video loads. `== null` (loose) catches both `null` and `undefined` deliberately — this is the one place `==` is the right choice.

```ts
const mm = hours > 0 ? String(minutes).padStart(2, "0") : String(minutes);
return [hours > 0 ? String(hours) : null, mm, String(seconds).padStart(2, "0")]
  .filter((part) => part !== null).join(":");
```

Minutes are zero-padded only when there's an hour in front (`1:02:11`), not otherwise (`3:07` — not `03:07`). Seconds are always padded. `.filter(part => part !== null)` rather than `.filter(Boolean)` — because `"0"` is truthy but a literal `0` hours would be... actually here the entry is `null` when absent, so the explicit comparison documents intent precisely.

### `formatDate(date)`

```ts
return new Date(date).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
```

`undefined` as the locale means "use the viewer's locale". So the same timestamp renders as "August 14, 2026" or "14 August 2026" depending on the browser.

### `formatRelative(date)`

"just now" → "5m ago" → "3h ago" → "2d ago" → then an absolute short date past a week. Cascading `if`s over the millisecond difference. The switch to absolute dates past 7 days is a good UX instinct: "43d ago" is harder to read than "Jul 2".

### `greeting(now = new Date())`

```ts
const h = now.getHours();
if (h < 5)  return "Still up";
if (h < 12) return "Good morning";
if (h < 17) return "Good afternoon";
if (h < 22) return "Good evening";
return "Good night";
```

Note "Still up" before 5am — a small piece of character. The default parameter makes it testable with a fixed date.

⚠️ Called from a Server Component ([home/page.tsx](<app/(app)/home/page.tsx>)), so `getHours()` is the **server's** timezone, not the visitor's. For a two-person app that's fine; for a global one you'd compute it client-side.

### `daysUntilAnniversary(date)`

```ts
let next = new Date(today.getFullYear(), d.getMonth(), d.getDate());
if (next < today) next = new Date(today.getFullYear() + 1, d.getMonth(), d.getDate());
return Math.round((next.getTime() - today.getTime()) / 86_400_000);
```

Take the month and day, put them in the current year, and roll to next year if that's already past. Returns `0` on the day itself, which the Home page checks to switch to "Happy anniversary — today's the day."

## 6.4 `lib/moods.ts`

```ts
export const DEFAULT_MOODS = [
  { slug: "in-love",        name: "In Love",        icon: "heart" },
  { slug: "missing-you",    name: "Missing You",    icon: "heart-crack" },
  { slug: "late-night",     name: "Late Night",     icon: "moon" },
  { slug: "date-night",     name: "Date Night",     icon: "wine" },
  { slug: "need-a-hug",     name: "Need a Hug",     icon: "heart-handshake" },
  { slug: "happy-together", name: "Happy Together", icon: "sun" },
  { slug: "romantic",       name: "Romantic",       icon: "flame" },
] as const;

export const MOOD_BLURBS: Record<string, string> = {
  "in-love": "Everything sounds better right now.",
  …
};
```

The seven moods from PRD §13, seeded into the `Mood` table when a couple is created.

Three separate fields per mood, each with a job:
- **`slug`** — stable machine identifier. Never changes, so it's the fallback lookup key in [components/icons.tsx](components/icons.tsx) and the key into `MOOD_BLURBS`.
- **`name`** — display text. A couple could rename this in their own row.
- **`icon`** — a *key* into the icon registry, not an icon itself. `"heart"` maps to lucide's `Heart` component.

🔎 **Why a string key instead of importing the component here?** Because these values are written into a database column. A database can store `"heart"`; it cannot store a React component. The indirection is what lets the UI be icon-driven while the data stays plain text — and it's exactly why the `Mood.icon` field maps to a column still named `emoji`.

`MOOD_BLURBS` is separate from `DEFAULT_MOODS` because it's presentation copy keyed by slug, shown only after a mood is picked, and it applies even to renamed moods.

## 6.5 `lib/youtube-config.ts`

```ts
import { extractPlaylistId } from "@/lib/youtube-parse";

const DEFAULT_PLAYLIST_ID = "PLS_xDUe-dkeDregcfTw9Wu8jZ2bGfgT6U";
const configured = process.env.YOUTUBE_PLAYLIST_ID?.trim();

export const PLAYLIST_ID =
  (configured ? extractPlaylistId(configured) : null) ?? DEFAULT_PLAYLIST_ID;

export const PLAYLIST_URL = `https://www.youtube.com/playlist?list=${PLAYLIST_ID}`;
export const PLAYLIST_TITLE = "Mood Swings";
```

The entire "YouTube connection" feature, reduced to four constants.

The resolution chain is forgiving: if `YOUTUBE_PLAYLIST_ID` is set, run it through `extractPlaylistId` (which accepts either a bare id **or** a full YouTube URL); if that yields nothing usable, fall back to the hardcoded default. So pasting `https://www.youtube.com/playlist?list=PLxxx` into `.env` works, and so does `PLxxx`.

🔎 As covered in §4.11, this file *is* the design decision: one playlist, app-wide config, no per-couple state, no OAuth, no credentials to protect.

## 6.6 `lib/youtube-parse.ts`

Four pure functions, deliberately kept in a **separate file from the API client**.

🔎 Why separate? Because [lib/youtube.ts](lib/youtube.ts) starts with `import "server-only"`. Anything importing it is server-locked and untestable outside a server context. These parsers are pure string functions with no I/O, so keeping them apart makes them importable and unit-testable anywhere. That's a good instinct to copy: *separate the pure logic from the thing that does I/O.*

### `parseISODuration(iso)`

YouTube reports durations as ISO 8601: `"PT1H2M11S"` = 1 hour 2 minutes 11 seconds.

```ts
const match = /^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
if (!match) return null;
const [, d, h, m, s] = match;
if (d === undefined && h === undefined && m === undefined && s === undefined) return null;
return Number(d ?? 0) * 86400 + Number(h ?? 0) * 3600 + Number(m ?? 0) * 60 + Number(s ?? 0);
```

Reading the regex:
- `^P` / `T` — the literal format markers.
- `(?:(\d+)D)?` — `(?:…)` is a **non-capturing** group (grouping without creating a result slot), `(\d+)` **is** capturing, and the trailing `?` makes the whole unit optional. So each component may or may not be present.
- `$` — anchored, so trailing junk is rejected.

`const [, d, h, m, s] = match` — the leading comma skips element 0 (the full match).

⚠️ The four-way `undefined` check catches a genuine edge case: the string `"PT"` **matches the pattern** (every component is optional) but carries no duration. Without that guard you'd return `0` seconds, and a song would render as `0:00` instead of `--:--`. This is what a carefully-written parser looks like.

### `pickThumbnail(thumbnails)`

```ts
for (const size of ["high", "medium", "default"]) {
  const found = thumbnails[size]?.url;
  if (found) return found;
}
return null;
```

YouTube offers `default` (120×90), `medium` (320×180), `high` (480×360), `standard` (640×480), `maxres` (1280×720). This function **deliberately skips the two largest**.

🔎 The comment records the measurement: the largest on-screen use is a 112px card, and the expanded player shows the real YouTube iframe rather than this image. Across ~85 songs, preferring `high` over `maxres` cut image payload by roughly an order of magnitude with no visible difference. This is a real performance fix (PRD §29 lists it as a regression in the first implementation), not a micro-optimisation.

### `cleanArtist(channelTitle)`

```ts
return channelTitle.replace(/\s*-\s*Topic$/, "").trim() || null;
```

YouTube's auto-generated music channels are named `"Artist - Topic"`. Strip that suffix. `\s*-\s*` tolerates spacing variants, `$` anchors it to the end, and `|| null` turns an empty result into a proper absent value.

### `extractPlaylistId(input)`

```ts
try {
  const url = new URL(trimmed);
  return url.searchParams.get("list") || null;
} catch {
  // Not a URL — fall through to the bare-id check.
}
if (/^[A-Za-z0-9_-]{12,}$/.test(trimmed)) return trimmed;
return null;
```

🧠 **`new URL()` as a validator.** It throws on anything that isn't a valid URL, so `try/catch` doubles as "is this a URL?". If it parses, pull out `?list=`. If it doesn't, check whether the input looks like a bare playlist id (12+ URL-safe characters). Otherwise `null`.

Notice the empty `catch` block with a comment. An empty catch is usually a smell; here the comment makes the intent explicit — failure to parse is *expected* and is the signal to try the other branch.

## 6.7 `lib/youtube.ts`

The YouTube Data API v3 client. `import "server-only"` at the top: the API key must never reach a browser.

### Custom error classes

```ts
export class YouTubeConfigError extends Error {
  constructor(message: string) { super(message); this.name = "YouTubeConfigError"; }
}
export class YouTubeApiError extends Error { … }
```

🔎 Two classes, because the two situations call for different user-facing responses. A **config** error means *you* need to fix something (missing key, API not enabled, wrong restrictions) and retrying won't help. An **API** error is transient or external (quota, 404, 500) and retrying might. Both extend `Error`, so `error instanceof Error` checks still work everywhere.

### `apiKey()`

```ts
const key = process.env.YOUTUBE_API_KEY;
if (!key) throw new YouTubeConfigError("YOUTUBE_API_KEY is not set. Create one in Google Cloud (enable YouTube Data API v3 → Credentials → API key) and add it to .env.");
return key;
```

Read at call time (not module load), so a restart with a new key works without a rebuild. The error message is a set of instructions rather than a diagnosis — the same message you'd otherwise have to look up.

### `ytFetch<T>(path, params)` — the request wrapper

```ts
const url = new URL(`${API}/${path}`);
for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
url.searchParams.set("key", apiKey());

const response = await fetch(url, { cache: "no-store" });
```

Built with `URL` and `searchParams` rather than string concatenation, so values are URL-encoded automatically.

⚠️ `cache: "no-store"` is essential. Next.js's extended `fetch` can cache responses; the whole point of sync is reading *current* upstream state. A cached playlist read would make sync silently do nothing.

Then a translation layer, mapping YouTube's error bodies to human sentences:

| Detection | Class | Message |
| --- | --- | --- |
| `API_KEY_INVALID` / `keyInvalid` | Config | "That YouTube API key was rejected. Check YOUTUBE_API_KEY in .env." |
| `accessNotConfigured` / `SERVICE_DISABLED` | Config | "YouTube Data API v3 isn't enabled for this key's Google Cloud project." |
| `quotaExceeded` | Api | "YouTube's daily quota for this key is used up. It resets at midnight Pacific." |
| `ipRefererBlocked` / `REQUEST_DENIED` | Config | "This API key has referrer/IP restrictions that block server calls…" |
| `404` | Api | "That playlist could not be found. Make sure it is public or unlisted, not private." |
| other `!ok` | Api | generic, with the status code |

🔎 These messages end up in the UI (the `syncError` banner on Music and Settings). Every one of them names the exact cause and the exact fix. That referrer-restriction case in particular is a trap people hit constantly — an HTTP-referrer-restricted key works from a browser and fails from a server, and the raw Google error doesn't say why.

`Promise<T>` with `return (await response.json()) as T` makes the wrapper generic: each caller declares the shape it expects.

### `listPlaylistTracks(playlistId)`

```ts
do {
  const page = await ytFetch<PlaylistItemsResponse>("playlistItems", {
    part: "snippet,status",
    playlistId,
    maxResults: "50",
    ...(pageToken ? { pageToken } : {}),
  });
  …
  pageToken = page.nextPageToken;
} while (pageToken);
```

🧠 **Cursor pagination.** YouTube returns at most 50 items plus a `nextPageToken`. Loop until there's no token. A `do…while` is right here because you always want at least one request.

`...(pageToken ? { pageToken } : {})` — conditional spread. It adds the key only when there's a value, avoiding `pageToken: undefined` in the query string.

`part: "snippet,status"` — the YouTube API makes you name the field groups you want. `snippet` has title/thumbnails/position; `status` has privacy.

Availability detection:

```ts
const isAvailable =
  title !== "Deleted video" &&
  title !== "Private video" &&
  privacy !== "private";
```

⚠️ Not elegant, but correct: YouTube **keeps removed entries in the playlist** with a literal placeholder title rather than dropping them. Three checks because the three signals don't always agree.

Each track is normalised into the app's own `YouTubeTrack` shape — `videoId`, `title`, `artist` (via `cleanArtist`), `thumbnail` (via `pickThumbnail`), `position`, `duration` (`null` for now), `isAvailable`, `addedAt`.

🔎 Normalising at the boundary is a pattern worth adopting: YouTube's response shape stops existing past this function, so if their API changes you fix one file.

Finally:

```ts
await attachDurations(tracks);
return tracks.sort((a, b) => a.position - b.position);
```

### `attachDurations(tracks)`

```ts
const ids = tracks.filter((t) => t.isAvailable).map((t) => t.videoId);
const byId = new Map<string, number>();

for (let i = 0; i < ids.length; i += 50) {
  const batch = ids.slice(i, i + 50);
  const page = await ytFetch<VideosResponse>("videos", { part: "contentDetails", id: batch.join(",") });
  for (const item of page.items ?? []) {
    const seconds = parseISODuration(item.contentDetails?.duration);
    if (seconds !== null) byId.set(item.id, seconds);
  }
}
for (const track of tracks) track.duration = byId.get(track.videoId) ?? null;
```

🧠 **Why a second API call exists at all:** `playlistItems` doesn't include durations. You have to ask `videos` separately. That endpoint takes up to 50 comma-separated ids per call, so the loop chunks by 50 — an ~85-song playlist means 2 requests instead of 85. This is the classic fix for the "N+1 query" problem.

Unavailable tracks are filtered out first: no point spending quota on videos that can't be played.

A `Map` collects the results, then one pass writes them back. `?? null` handles ids YouTube didn't return.

⚠️ Note the `if (seconds !== null)` — a strict comparison, because `0` is a legitimate (if odd) duration and must not be discarded.

## 6.8 `lib/sync.ts`

The reconciliation engine. `server-only`.

### `SyncResult` and `SyncError`

```ts
export type SyncResult = { added: number; removed: number; restored: number; reordered: number; total: number };
export class SyncError extends Error {}
```

The counts exist so the UI can say "Synced — 2 added, 1 reordered" instead of a bare "done".

### `syncPlaylist(coupleId)`

**Step 1 — claim the job.**

```ts
await db.couple.update({
  where: { id: coupleId },
  data: { playlistSyncStatus: "SYNCING", playlistSyncError: null },
});
```

Writing status *before* the work means [isPlaylistStale](lib/sync.ts) can see a sync in flight and decline to start a second one.

**Step 2 — fetch upstream and load local state.**

```ts
const tracks = await listPlaylistTracks(PLAYLIST_ID);
const existing = await db.song.findMany({
  where: { coupleId },
  select: { id: true, youtubeVideoId: true, position: true, isAvailable: true },
});
```

`select` fetches only the four columns the diff needs — not titles, not thumbnails.

**Step 3 — index for O(1) lookups.**

```ts
const existingByVideoId = new Map(existing.map((s) => [s.youtubeVideoId, s]));
const incomingIds = new Set(tracks.map((t) => t.videoId));
```

🧠 **Why not just use `.find()`?** Because `existing.find(...)` inside a loop over `tracks` is O(n²) — 85 songs means ~7,000 comparisons. A `Map` lookup is O(1), so the whole diff is O(n). At this size either works; the habit matters at 10,000.

Note the direction of each structure: the `Map` answers "do I already have this video?", the `Set` answers "is this local song still upstream?". Two questions, two structures.

**Step 4 — build the write list without executing it.**

```ts
const writes = [];

for (const [index, track] of tracks.entries()) {
  const current = existingByVideoId.get(track.videoId);

  if (!current) {
    result.added += 1;
    writes.push(db.song.create({ data: { coupleId, youtubeVideoId: track.videoId, …, position: index } }));
    continue;
  }

  if (current.position !== index) result.reordered += 1;
  if (!current.isAvailable && track.isAvailable) result.restored += 1;

  writes.push(db.song.update({
    where: { id: current.id },
    data: { position: index, title: track.title, artist: track.artist,
            thumbnail: track.thumbnail, duration: track.duration,
            isAvailable: track.isAvailable },
  }));
}
```

⚠️ **This is the part that surprises people.** `db.song.create({...})` *without* `await` does not run the query — Prisma returns a thenable that executes when awaited or when handed to `$transaction`. So this loop is **building a list of pending operations**, not performing them.

Note `position: index` (the loop counter) rather than `track.position` (YouTube's number). If someone deletes a song from the playlist, YouTube's positions can have gaps; re-deriving from the array guarantees a dense 0..n-1 sequence.

Existing songs get *every* metadata field rewritten — titles get edited upstream, thumbnails change, a video can come back from private. This is a full upsert, not just a position fix.

**Step 5 — removals, as flags.**

```ts
const vanished = existing.filter((song) => !incomingIds.has(song.youtubeVideoId) && song.isAvailable);

if (vanished.length > 0) {
  result.removed = vanished.length;
  writes.push(db.song.updateMany({
    where: { id: { in: vanished.map((s) => s.id) } },
    data: { isAvailable: false },
  }));
}
```

The `&& song.isAvailable` matters: already-flagged songs shouldn't be counted as newly removed every sync. One `updateMany` handles all of them.

**Step 6 — one transaction.**

```ts
await db.$transaction(writes);
```

🧠 **Why a transaction.** All of it succeeds or none of it does. Without this, a crash halfway through would leave the library in a mixed state — some songs at new positions, some at old, order visibly scrambled. `$transaction` with an array runs the operations sequentially inside one database transaction.

**Step 7 — record success.**

```ts
await db.couple.update({
  where: { id: coupleId },
  data: { playlistSyncStatus: "SUCCESS", playlistSyncError: null, playlistLastSyncedAt: new Date() },
});
return result;
```

`playlistLastSyncedAt` is what the 5-minute debounce reads and what the UI shows as "Last synced 3m ago".

**Step 8 — persist failures.**

```ts
} catch (error) {
  const message = error instanceof Error ? error.message : "Sync failed for an unknown reason.";
  await db.couple.update({
    where: { id: coupleId },
    data: { playlistSyncStatus: "ERROR", playlistSyncError: message },
  });
  throw new SyncError(message);
}
```

🔎 The error is **written to the database before being re-thrown**. That's why a missing API key still shows a helpful banner on the Music page after a full page reload — the diagnosis survives the request that produced it. Note `playlistLastSyncedAt` is *not* touched on failure, so a failed sync doesn't reset the debounce clock and hide the problem.

`error instanceof Error ? … : …` — in JavaScript you can `throw` anything, so unknown throws get a fallback message.

### `isPlaylistStale(coupleId)`

```ts
const AUTO_SYNC_INTERVAL_MS = 5 * 60 * 1000;

export async function isPlaylistStale(coupleId: string): Promise<boolean> {
  const couple = await db.couple.findUnique({
    where: { id: coupleId },
    select: { playlistLastSyncedAt: true, playlistSyncStatus: true },
  });

  if (!couple || couple.playlistSyncStatus === "SYNCING") return false;

  return !couple.playlistLastSyncedAt ||
    Date.now() - couple.playlistLastSyncedAt.getTime() > AUTO_SYNC_INTERVAL_MS;
}
```

Three conditions:
- No couple, or a sync already running → **not stale** (don't pile on).
- Never synced → **stale** (first visit imports the playlist).
- Last sync older than 5 minutes → **stale**.

🔎 **Why 5 minutes?** YouTube's Data API has a daily quota. Syncing on every page view would burn it on navigation alone: four YouTube round-trips plus ~85 upserts, repeatedly. Five minutes is short enough that a change you make on YouTube shows up promptly, long enough that clicking around is free. And **Sync Now** always runs, bypassing the debounce, so the user is never stuck waiting for a timer.

The function's docstring explains the crucial architectural point: the Music page *checks* staleness during render but doesn't *act* on it. It passes the boolean to [background-sync.tsx](<app/(app)/music/background-sync.tsx>), a Client Component that runs the sync **after paint**. Awaiting sync during render would block first paint on four network round-trips — and the library is already in Postgres, so there's nothing to wait for.
---

# Part 7 — Server Actions

## 7.1 What a Server Action actually is

🧠 A Server Action is a function that lives on the server but can be **called from the browser** as if it were local. Next.js generates the HTTP endpoint, the serialisation, and the client stub for you.

```ts
// lib/actions/note.ts
"use server";
export async function sendNote(prev, formData) { … }
```

```tsx
// love-notes.tsx  — "use client"
import { sendNote } from "@/lib/actions/note";
const [state, formAction, pending] = useActionState(sendNote, null);
<form action={formAction}>…</form>
```

Under the hood: submitting the form POSTs to the current URL with a header identifying the action, Next.js runs `sendNote` on the server, and its return value comes back and lands in `state`. Compared with the classic approach you skip writing an API route, a `fetch` call, request/response types, and JSON parsing.

Two flavours are used in this codebase:

**Form actions** — signature `(previousState, formData) => newState`, driven by `useActionState`:

```ts
export async function sendNote(_prev: ActionState, formData: FormData): Promise<ActionState>
```

**Plain RPC actions** — ordinary arguments, called from a click handler inside `startTransition`:

```ts
export async function toggleFavorite(songId: string): Promise<boolean>
```

⚠️ **The two rules that make this safe**, restated because they're the entire security posture:

1. **A Server Action is a public HTTP endpoint.** Anyone can POST to it with any arguments. The UI hiding a button proves nothing.
2. Therefore every action calls `requireCoupleContext()` itself, and verifies row ownership itself, regardless of what any page already checked.

## 7.2 `lib/actions/types.ts`

```ts
export type ActionState = { error?: string; success?: string } | null;

export function fail(error: string): ActionState { return { error }; }
export function ok(success?: string): ActionState { return { success: success ?? "Saved" }; }

export function messageFrom(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
```

One shared result shape for every form in the app. `null` is the initial state (nothing submitted yet), so components can render `state?.error` and `state?.success` uniformly.

🔎 `fail` and `ok` exist so no action ever hand-builds the object and accidentally sets both keys, or misspells one.

`messageFrom` is the "unknown error" funnel. Its type is `unknown` because JavaScript lets you `throw` anything. It surfaces a real `Error.message` when there is one — which is how the useful YouTube diagnostics from [lib/youtube.ts](lib/youtube.ts) reach the UI — and otherwise substitutes a friendly fallback.

## 7.3 `lib/actions/couple.ts`

The biggest action file: creating, joining, updating, theming, re-coding, and deleting a space.

### Invite code generation

```ts
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateInviteCode(length = 8) {
  let code = "";
  for (let i = 0; i < length; i += 1) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}
```

Two decisions in three lines:

**1. The alphabet omits `I`, `O`, `0`, and `1`.** These codes get read aloud, texted, and typed by hand. `0` vs `O` and `1` vs `I` are the classic transcription failures. 32 characters remain — a happy number, since 32 = 2⁵.

**2. `randomInt` from `node:crypto`, not `Math.random()`.**

⚠️ `Math.random()` is a *pseudo*-random generator, not cryptographically secure: its output is predictable given enough samples. An invite code is a **bearer credential** — anyone holding it can join a private space. `crypto.randomInt` uses the OS entropy source and is also free of modulo bias. 32⁸ ≈ 1.1 trillion possible codes.

```ts
async function uniqueInviteCode() {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = generateInviteCode();
    const taken = await db.couple.findUnique({ where: { inviteCode: code }, select: { id: true } });
    if (!taken) return code;
  }
  throw new Error("Could not allocate an invite code. Please try again.");
}
```

Generate, check, retry — bounded at 8 attempts so a pathological state can't hang the request. With a trillion-code space, collisions are effectively impossible; the loop exists because "effectively impossible" isn't "impossible", and the `@unique` constraint would otherwise throw a raw database error.

### The shared date validator

```ts
const optionalDate = z
  .string().trim().optional()
  .transform((value) => (value ? new Date(value) : null))
  .refine((value) => value === null || !Number.isNaN(value.getTime()), {
    message: "That date doesn't look right.",
  });
```

🧠 **Zod in one paragraph.** You build a *schema* describing valid input, then run untrusted data through it. `safeParse` returns `{ success: true, data }` with a fully typed `data`, or `{ success: false, error }` with messages. It validates **and** converts in one step, which is what you want when the source is `FormData` (everything arrives as a string).

This particular chain: accept a string → trim it → allow it to be missing → `transform` an empty value to `null` and anything else to a `Date` → `refine` to reject an unparseable date (`new Date("banana")` doesn't throw, it produces an `Invalid Date` whose `getTime()` is `NaN`).

`transform` changes the value and its type; `refine` adds a check without changing either. Defining this once and reusing it for `relationshipStartDate` and `anniversaryDate` in three different schemas means the rules can't drift apart.

### `createCouple`

```ts
export async function createCouple(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();

  const existing = await getCoupleForUser(user.id);
  if (existing) redirect("/home");

  const parsed = createCoupleSchema.safeParse({
    name: formData.get("name"),
    relationshipStartDate: formData.get("relationshipStartDate") ?? undefined,
    anniversaryDate: formData.get("anniversaryDate") ?? undefined,
  });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Please check the form.");

  const { name, relationshipStartDate, anniversaryDate } = parsed.data;

  try {
    const inviteCode = await uniqueInviteCode();
    await db.couple.create({
      data: {
        name, partner1Id: user.id, relationshipStartDate, anniversaryDate, inviteCode,
        moods: {
          create: DEFAULT_MOODS.map((mood, index) => ({
            slug: mood.slug, name: mood.name, icon: mood.icon, sortOrder: index,
          })),
        },
      },
    });
  } catch (error) {
    return fail(messageFrom(error, "We couldn't create your space."));
  }

  redirect("/onboarding/invite");
}
```

Walk the order of operations — it's the template every other action follows:

1. **Authenticate** (`requireUser`).
2. **Guard the state** — already in a couple? Nothing to create.
3. **Validate** input with zod. Note `?? undefined`: `formData.get()` returns `null` for a missing field, but zod's `.optional()` wants `undefined`.
4. **Report the first error only** — `parsed.error.issues[0]?.message`. One clear message beats a list.
5. **Write** inside `try/catch`.
6. **Redirect** — outside the `try`.

⚠️ Point 6 again, because it's the most common Server Action bug: `redirect()` works by throwing. Inside that `try`, it would be caught and turned into `fail("We couldn't create your space")`, and the user would sit on a broken form after a successful write.

**The nested `moods: { create: [...] }` is a Prisma feature worth knowing.** It creates the couple *and* its seven mood rows in a single query with a single transaction. No loop, no dangling foreign key, no possibility of a couple existing without moods. `sortOrder: index` preserves the order declared in `DEFAULT_MOODS`.

### `joinCouple`

```ts
const joinSchema = z.object({
  inviteCode: z.string().trim()
    .min(1, "Enter the invite code your partner shared.")
    .transform((value) => value.toUpperCase().replace(/[\s-]/g, "")),
});
```

The transform normalises what humans actually type: `"abcd-2345"`, `"ABCD 2345"`, and `"abcd2345"` all become `ABCD2345`.

Then four ordered checks:

```ts
if (existing)                    return fail("You're already part of a space.");
if (!couple)                     return fail("That invite code doesn't match any space.");
if (couple.partner1Id === user.id) return fail("That's your own invite code.");
if (couple.partner2Id)           return fail("This space already has both partners.");

await db.couple.update({ where: { id: couple.id }, data: { partner2Id: user.id } });
redirect("/home");
```

Each guard maps to a real thing a person will do, and each error message says what happened rather than "invalid input". "That's your own invite code" is the kind of message that only exists because someone thought about the user testing their own link.

⚠️ **A note on the race condition.** Two people redeeming the same code simultaneously could both pass the `partner2Id` check before either writes. In a two-person private app this is not a real risk. If it mattered, the fix would be a conditional update (`updateMany({ where: { id, partner2Id: null } })`) and checking the affected count. Worth recognising the shape of the problem even where you accept it.

### `updateCouple`

```ts
const { couple } = await requireCoupleContext();
const parsed = updateCoupleSchema.safeParse({ … });
if (!parsed.success) return fail(…);

await db.couple.update({ where: { id: couple.id }, data: parsed.data });

revalidatePath("/settings");
revalidatePath("/us");
revalidatePath("/home");
return ok("Saved");
```

Note `where: { id: couple.id }` — the id comes from the *session*, so this can only ever update your own space. There is no code path where a client-supplied couple id could be substituted.

`data: parsed.data` passes the validated object straight through, which is safe precisely because zod already stripped it down to exactly three known keys.

**The three `revalidatePath` calls are the "what else shows this data?" question answered explicitly.** The couple's name and dates appear on Settings, Us, and Home, so all three caches are invalidated. Miss one and a user sees a stale name until they hard-refresh. This is the maintenance cost of caching, and it's paid by hand.

Returns `ok("Saved")` rather than redirecting, because you stay on the settings page.

### `setTheme`

```ts
const parsed = themeSchema.safeParse(formData.get("theme"));
if (!parsed.success) return fail("Unknown theme.");

await db.couple.update({ where: { id: couple.id }, data: { theme: parsed.data } });

const store = await cookies();
store.set(THEME_COOKIE, themeFromEnum(parsed.data), {
  path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax",
});

revalidatePath("/", "layout");
return ok("Theme updated");
```

`z.enum(["LIGHT", "DARK", "ROMANTIC"])` accepts only the three values the Prisma enum allows.

The **double write** is the theme design from §6.2 in action: database for truth and durability, cookie for the root layout to read synchronously during SSR.

Cookie options: `path: "/"` (whole site), `maxAge` one year, `sameSite: "lax"` (sent on normal navigations, withheld on cross-site POSTs — the standard CSRF-conscious default).

`revalidatePath("/", "layout")` — the second argument makes this invalidate the **root layout**, and therefore every page under it. That's the right scope: the theme changes the entire document.

### `regenerateInviteCode`

```ts
export async function regenerateInviteCode(): Promise<ActionState> {
  const { couple } = await requireCoupleContext();
  if (couple.partner2Id) return fail("Both partners have already joined.");
  await db.couple.update({ where: { id: couple.id }, data: { inviteCode: await uniqueInviteCode() } });
  revalidatePath("/onboarding/invite");
  revalidatePath("/settings");
  return ok("New code ready");
}
```

Takes no arguments at all — everything comes from the session. Rotating the code invalidates the old one, which is what you want if you texted it to the wrong person. Refused once both partners are in, since the code has no further purpose.

### `deleteCoupleSpace`

```ts
const confirmation = String(formData.get("confirm") ?? "").trim();
if (confirmation !== couple.name) return fail("Type the name of your space exactly to confirm.");

await db.couple.delete({ where: { id: couple.id } });
redirect("/onboarding");
```

PRD §20 requires that a couple can delete everything.

The **type-the-name confirmation** is the GitHub pattern: it makes destruction impossible to do by reflex. `String(… ?? "")` because `formData.get()` returns `string | File | null`.

`db.couple.delete` is one statement, and the `onDelete: Cascade` rules from §4.4 do the rest: songs, love notes, memories, moods, mood check-ins, plus the join rows (favourites, song-moods) that cascade from songs. The two `User` rows survive — deleting a shared space shouldn't delete anyone's account.

🔎 This is the payoff for defining cascade behaviour in the schema. The alternative is a hand-written deletion in dependency order, which is exactly the kind of code that silently leaves orphans after someone adds a table.

## 7.4 `lib/actions/note.ts`

### The schema

```ts
const noteSchema = z.object({
  content: z.string().trim()
    .min(1, "Write something first.")
    .max(2000, "That's a lot of love — try trimming it a little."),
  deliverAt: z.string().trim().optional()
    .transform((value) => (value ? new Date(value) : null))
    .refine((value) => value === null || !Number.isNaN(value.getTime()), {
      message: "That delivery time doesn't look right.",
    }),
});
```

Note the tone of the error messages — they're written in the app's voice, not a validator's. Small thing; it's the difference between an app that feels made by a person and one that feels generated.

The `max(2000)` matches the `maxLength={2000}` on the textarea. Both exist: the HTML attribute is UX (the browser stops you typing), the zod rule is enforcement (a direct POST can't bypass it).

### `sendNote`

```ts
const { user, couple, partner } = await requireCoupleContext();
if (!partner) return fail("Invite your partner first — there's no one to send this to yet.");

await db.loveNote.create({
  data: {
    coupleId: couple.id,
    senderId: user.id,
    recipientId: partner.id,
    content,
    deliverAt: deliverAt && deliverAt > new Date() ? deliverAt : null,
  },
});

revalidatePath("/love");
revalidatePath("/home");
return ok("Sent");
```

All three ids — couple, sender, recipient — come from the session context. **Nothing about who this note is for comes from the form.** In a two-person app the recipient is always "the other one", so there's no field to tamper with.

```ts
deliverAt && deliverAt > new Date() ? deliverAt : null
```

A past-or-present date is normalised to `null`, i.e. "send now". Storing a past `deliverAt` would work (the `lte: new Date()` filter would match it) but leaves the UI having to label a note "scheduled" when it isn't. Normalising at write time keeps every read simpler.

### `markNoteRead`

```ts
export async function markNoteRead(noteId: string): Promise<void> {
  const { user, couple } = await requireCoupleContext();
  await db.loveNote.updateMany({
    where: { id: noteId, coupleId: couple.id, recipientId: user.id, isRead: false },
    data: { isRead: true, readAt: new Date() },
  });
  revalidatePath("/love");
  revalidatePath("/home");
}
```

🔎 **A four-condition `where` doing all the authorisation work.** Notice it uses `updateMany` rather than `update`. `update` requires a unique `where` and *throws* if nothing matches; `updateMany` matches zero rows and quietly succeeds. That's exactly the behaviour you want for a fire-and-forget read receipt:

- `id` — the target,
- `coupleId` — must be in your space,
- `recipientId: user.id` — **only the recipient can mark a note read**; the sender can't fake a receipt,
- `isRead: false` — already-read notes aren't touched, so `readAt` preserves the *first* read time.

No error path is needed. A malicious id simply does nothing.

### `toggleNoteFavorite`

```ts
const note = await db.loveNote.findFirst({
  where: { id: noteId, coupleId: couple.id },
  select: { id: true, isFavorite: true },
});
if (!note) throw new Error("Note not found.");

await db.loveNote.update({ where: { id: note.id }, data: { isFavorite: !note.isFavorite } });
revalidatePath("/love");
return !note.isFavorite;
```

A read-then-write, because toggling needs to know the current value. The read is scoped by `coupleId`, so the ownership check and the value fetch are the same query.

**Either partner can favourite any note in the thread** — no `recipientId` filter. That's a product decision: "keeping" a note you wrote is as meaningful as keeping one you received.

Returns the new value, so the caller can reconcile its optimistic state.

### `deleteNote`

```ts
await db.loveNote.deleteMany({
  where: { id: noteId, coupleId: couple.id, senderId: user.id },
});
```

`senderId: user.id` — **only the sender can delete.** The docstring says it best: "you can't erase something written to you." Someone else's words in your inbox aren't yours to remove.

Same `deleteMany`-as-guard pattern: a note you didn't write matches zero rows.

## 7.5 `lib/actions/song.ts`

The file header restates the rule:

> Every action here re-derives the couple from the session and checks the target row belongs to it. Server Actions accept direct POSTs, so the UI having hidden the button is never treated as authorisation (PRD §20).

### `toggleFavorite`

```ts
export async function toggleFavorite(songId: string): Promise<boolean> {
  const { user, couple } = await requireCoupleContext();
  await assertSongInCouple(songId, couple.id);

  const existing = await db.favorite.findUnique({
    where: { userId_songId: { userId: user.id, songId } },
  });

  if (existing) {
    await db.favorite.delete({ where: { userId_songId: { userId: user.id, songId } } });
  } else {
    await db.favorite.create({ data: { userId: user.id, songId } });
  }

  revalidatePath("/music");
  revalidatePath("/us");
  revalidatePath("/home");
  return !existing;
}
```

🧠 **`userId_songId` is generated syntax.** Because `Favorite` has `@@id([userId, songId])`, Prisma creates a compound-key selector named after the two fields joined by an underscore. You'll see the same pattern as `songId_moodId` below.

`assertSongInCouple` first — before any write, and using a `coupleId` from the session.

Returns `!existing` — a boolean meaning "is it now a favourite?" — which [favorites-provider.tsx](components/favorites-provider.tsx) uses (or rather, whose *failure* it uses) to reconcile its optimistic update.

Three revalidations because favourites drive the Music list hearts, the Us page groupings, and Home's featured-song choice.

### The memory schema

```ts
const memorySchema = z.object({
  title: z.string().trim().min(1, "Give this memory a title.").max(120, "That title is a little long."),
  description: z.string().trim().max(2000, "That's a long memory — try trimming it.")
    .optional().transform((value) => value || null),
  date: z.string().trim().optional()
    .transform((value) => (value ? new Date(value) : null))
    .refine((value) => value === null || !Number.isNaN(value.getTime()), { message: "That date doesn't look right." }),
  songId: z.string().trim().optional().transform((value) => value || null),
});
```

`.transform(value => value || null)` on `description` and `songId` is the recurring "empty string means absent" conversion. An HTML form submits `""` for an untouched text field and for a `<select>` whose chosen `<option>` has `value=""`. The database wants `NULL`. Without this, you'd store empty strings and every read would have to check for both.

### `createMemory`

```ts
if (songId) await assertSongInCouple(songId, couple.id);

await db.memory.create({
  data: { coupleId: couple.id, createdById: user.id, title, description, date, songId },
});

revalidatePath("/memories");
revalidatePath("/music");
revalidatePath("/home");
return ok("Memory saved");
```

The ownership check is **conditional**, because `songId` is optional — a standalone memory has nothing to verify. But if a song *is* named, it must belong to your couple; otherwise you could attach a memory to a stranger's song row.

One action serves two UIs: the full form on [memory-board.tsx](<app/(app)/memories/memory-board.tsx>) (with a song `<select>`) and the per-song panel in [song-sheet.tsx](<app/(app)/music/song-sheet.tsx>) (which supplies `songId` as a hidden input). Same validation, same authorisation, two entry points.

### `deleteMemory`

```ts
await db.memory.deleteMany({ where: { id: memoryId, coupleId: couple.id } });
```

The comment says it: "Scoped delete — a memory id from another couple simply matches nothing." No pre-read, no error branch. This is the most economical form of the ownership guard.

### `toggleSongMood`

```ts
await assertSongInCouple(songId, couple.id);

const mood = await db.mood.findFirst({ where: { id: moodId, coupleId: couple.id }, select: { id: true } });
if (!mood) throw new Error("Unknown mood.");

const existing = await db.songMood.findUnique({ where: { songId_moodId: { songId, moodId } } });
if (existing) {
  await db.songMood.delete({ where: { songId_moodId: { songId, moodId } } });
} else {
  await db.songMood.create({ data: { songId, moodId } });
}

revalidatePath("/music");
revalidatePath("/mood");
return !existing;
```

⚠️ **Two ownership checks, because there are two foreign keys.** The song must be yours *and* the mood must be yours. Verifying only the song would let someone tag your song with another couple's mood row. Any action that writes a row referencing N owned entities needs N checks — a genuinely easy thing to get wrong.

### `checkInMood`

```ts
const mood = await db.mood.findFirst({ where: { id: moodId, coupleId: couple.id }, select: { id: true } });
if (!mood) throw new Error("Unknown mood.");

await db.moodCheckIn.create({ data: { coupleId: couple.id, userId: user.id, moodId } });

revalidatePath("/mood");
revalidatePath("/home");
```

Always `create`, never `update` — the append-only history from §4.9. "Your current mood" is derived at read time as the newest row.

## 7.6 `lib/actions/youtube.ts`

```ts
export async function syncNow(): Promise<ActionState> {
  const { couple } = await requireCoupleContext();

  try {
    const result = await syncPlaylist(couple.id);

    revalidatePath("/music");
    revalidatePath("/settings");
    revalidatePath("/", "layout");

    const changes = [
      result.added > 0 && `${result.added} added`,
      result.removed > 0 && `${result.removed} removed`,
      result.restored > 0 && `${result.restored} back`,
      result.reordered > 0 && `${result.reordered} reordered`,
    ].filter(Boolean);

    return ok(changes.length > 0 ? `Synced — ${changes.join(", ")}` : "Already up to date");
  } catch (error) {
    return fail(messageFrom(error, "Sync failed."));
  }
}
```

The whole file. All the real work is in [lib/sync.ts](lib/sync.ts); this is the authenticated, cache-aware wrapper.

- **No arguments** — the couple comes from the session, the playlist from config. Nothing to tamper with.
- `revalidatePath("/", "layout")` invalidates the `(app)` layout too, because the layout loads the song library that feeds the player's default queue.
- **The message assembly** turns counts into "Synced — 2 added, 1 reordered" and, crucially, returns the exact string `"Already up to date"` when nothing changed.

🔎 That exact string is **load-bearing**. [background-sync.tsx](<app/(app)/music/background-sync.tsx>) compares against it to decide whether to call `router.refresh()`. A no-op sync therefore costs the user no visible re-render at all.

⚠️ It's also a fragile coupling — changing the copy in this file would silently break the optimisation over in the client component. A shared constant would be the more robust choice. Worth noticing as a pattern to improve rather than imitate.

---

# Part 8 — The global shell

## 8.1 `app/layout.tsx` — the root layout

The outermost component. It renders the literal `<html>` and `<body>` tags and wraps every single page in the app.

### Fonts

```tsx
import { Cormorant_Garamond, Inter } from "next/font/google";

const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  style: ["normal", "italic"],
  display: "swap",
});

const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });
```

🧠 **`next/font/google` does something clever.** At *build* time it downloads the font files and serves them from your own domain. Consequences:
- No request to `fonts.googleapis.com` at runtime → faster, and no third-party tracking.
- Next.js computes fallback font metrics automatically, which prevents layout shift when the real font arrives.

Options explained:
- `variable: "--font-cormorant"` — instead of a class name, expose the font as a CSS variable. That variable is consumed in [globals.css](app/globals.css) as `--font-serif: var(--font-cormorant), Georgia, …`.
- `subsets: ["latin"]` — only ship Latin glyphs; skip Cyrillic, Greek, etc.
- `weight` / `style` — only the four weights and the italic actually used. Every extra weight is another file to download.
- `display: "swap"` — show fallback text immediately, swap when the webfont loads. The alternative (`block`) means invisible text for up to 3 seconds.

Two families, per PRD §23: serif (Cormorant Garamond) for romantic headings, sans (Inter) for UI.

### Metadata

```tsx
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "Mood Swings", template: "%s · Mood Swings" },
  description: "A little private corner of the internet that belongs to us.",
  applicationName: "Mood Swings",
  robots: { index: false, follow: false },
  openGraph: { type: "website", siteName: SITE_NAME, title: SITE_NAME, description: SITE_DESCRIPTION, url: "/", locale: "en_US" },
  twitter: { card: "summary_large_image", title: SITE_NAME, description: SITE_DESCRIPTION },
  appleWebApp: { capable: true, title: "Mood Swings", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};
```

Next.js turns this object into `<meta>` and `<link>` tags. Item by item:

- **`metadataBase`** — the base for resolving relative URLs like `url: "/"`. Required for Open Graph, which demands absolute URLs.
- **`title.template: "%s · Mood Swings"`** — child pages export `{ title: "Music" }` and get "Music · Mood Swings". `default` is used when a page exports no title.
- **`robots: { index: false, follow: false }`** — 🔎 tells search engines not to index anything. This is a private space for two people; it should never appear in search results. Note that link *previews* still work, because those come from a crawler fetching the page directly rather than from an index.
- **`openGraph` / `twitter`** — the cards shown when a link is pasted into a chat app. The copy is deliberately **generic** (site name + tagline, nothing about the couple), so sharing an invite link unfurls nicely without leaking who it's for. That's PRD §20 applied to metadata.
- `og:image` and `twitter:image` are **not listed** — Next.js wires them up automatically from the presence of [app/opengraph-image.tsx](app/opengraph-image.tsx) and [app/twitter-image.tsx](app/twitter-image.tsx).
- **`appleWebApp`** — lets iOS run the app full-screen from the home screen.
- **`formatDetection: { telephone: false }`** — stops iOS Safari turning number-like strings into phone links. Without it, an 8-character invite code can render as a tappable phone number.

### Viewport

```tsx
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fff8f5" },
    { media: "(prefers-color-scheme: dark)",  color: "#140a0e" },
  ],
  viewportFit: "cover",
  initialScale: 1,
  width: "device-width",
};
```

A separate export from `metadata` (Next.js 14+ split them).

- **`themeColor`** — the browser UI colour on mobile, matched to the app's canvas in each scheme so there's no jarring band at the top.
- **`viewportFit: "cover"`** — let content extend into the notch/safe area when installed.
- **`width: "device-width", initialScale: 1`** — the standard responsive viewport. Without this, mobile browsers render at a fake ~980px width and zoom out.

### The component

```tsx
export default async function RootLayout({ children }: LayoutProps<"/">) {
  const theme = resolveTheme((await cookies()).get(THEME_COOKIE)?.value);

  return (
    <ClerkProvider>
      <html lang="en" data-theme={theme}
        className={`${cormorant.variable} ${inter.variable} h-full antialiased`}
        suppressHydrationWarning>
        <body className="min-h-full flex flex-col">
          {children}
          <ServiceWorkerRegistrar />
        </body>
      </html>
    </ClerkProvider>
  );
}
```

Line by line:

- **`async` + `await cookies()`** — cookies are a request-time API, so reading one makes this render dynamic. `resolveTheme` sanitises whatever's there down to one of three known values.
- **`<ClerkProvider>` outermost** — everything, including the `<html>` tag, is inside Clerk's context so any descendant can use its hooks and components.
- **`data-theme={theme}`** — this single attribute selects which palette applies, because [globals.css](app/globals.css) defines its variables under `[data-theme="dark"]` and friends. 🔎 Stamping it during SSR is what prevents the "flash of wrong theme" — the correct colours are in the very first byte of HTML.
- **`className={...cormorant.variable...}`** — puts the font CSS variables in scope for the whole document.
- **`antialiased`** — smoother font rendering.
- **`suppressHydrationWarning`** — ⚠️ needed because the `<html>` attributes can differ marginally between server and client (Clerk and theme handling both touch them). React would otherwise log a hydration mismatch. Scoped to this one element, which is the correct blast radius; do not sprinkle it around.
- **`h-full` on html + `min-h-full flex flex-col` on body** — the full-height flex column that lets pages use `flex-1` to fill the screen. That's how the landing page centres itself vertically.
- **`{children}`** — the current page (and any nested layouts) render here.
- **`<ServiceWorkerRegistrar />`** — a client component rendering `null`; its only job is the registration effect.

## 8.2 `app/globals.css` — the design system

The only stylesheet in the project, imported once by the root layout. Around 400 lines that define everything visual. This is where Tailwind v4's "CSS-first configuration" lives.

### `@import` and the dark variant

```css
@import "tailwindcss";

@custom-variant dark (&:where([data-theme="dark"], [data-theme="dark"] *));
```

One import replaces v3's three `@tailwind` directives.

🔎 **The custom `dark` variant is a deliberate override.** By default Tailwind's `dark:` prefix follows the OS colour scheme. Here the theme is an explicit user choice stored in the database, so `dark:` is redefined to mean "inside `[data-theme='dark']`". `:where()` is used to keep specificity at zero, so `dark:` utilities don't unexpectedly beat other rules.

### `@theme inline` — the token bridge

```css
@theme inline {
  --color-canvas: var(--canvas);
  --color-raised: var(--raised);
  --color-sunken: var(--sunken);
  --color-ink: var(--ink);
  --color-ink-soft: var(--ink-soft);
  --color-ink-faint: var(--ink-faint);
  --color-primary: var(--primary);
  --color-primary-soft: var(--primary-soft);
  --color-accent: var(--accent);
  --color-blush: var(--blush);
  --color-line: var(--line);
  --color-line-strong: var(--line-strong);

  --font-serif: var(--font-cormorant), Georgia, "Times New Roman", serif;
  --font-sans:  var(--font-inter), ui-sans-serif, system-ui, sans-serif;

  --radius-xl2: 1.25rem;
  --radius-xl3: 1.75rem;

  --animate-fade-up: fade-up 0.6s cubic-bezier(0.22, 1, 0.36, 1) both;
  --animate-fade-in: fade-in 0.5s ease both;
  --animate-heartbeat: heartbeat 2.4s ease-in-out infinite;
}
```

🧠 **This block is the entire Tailwind config.** Naming a variable `--color-canvas` inside `@theme` is what causes the utilities `bg-canvas`, `text-canvas`, `border-canvas` to exist. Likewise `--radius-xl2` creates `rounded-xl2`, and `--animate-fade-up` creates `animate-fade-up`.

The `inline` keyword matters: each token *references another variable* (`var(--canvas)`) rather than holding a literal colour. So `bg-canvas` compiles to `background-color: var(--canvas)` — resolved by the browser at runtime. That's the mechanism that makes theme switching instant with no recompilation and no duplicate class sets.

**The naming scheme is worth internalising**, because it's used consistently across every component:

| Token | Role |
| --- | --- |
| `canvas` | page background |
| `raised` | cards, things above the page |
| `sunken` | wells, inset areas, hover fills |
| `ink` | primary text |
| `ink-soft` | secondary text |
| `ink-faint` | tertiary text, metadata |
| `primary` | brand colour, main actions |
| `primary-soft` | hover state for primary |
| `accent` | focus rings, highlights |
| `blush` | soft brand-tinted surface |
| `line` | default borders |
| `line-strong` | emphasised borders |

Semantic names, not colour names. `bg-canvas` still means "the page" in the dark theme, where the actual colour is nearly black. `bg-pink-50` would not have survived the second theme.

### The three palettes

```css
:root, [data-theme="romantic"] {
  --canvas: #fff8f5;  --raised: #fffdfc;  --sunken: #fdeef0;
  --ink: #2a151c;     --ink-soft: #6d4d57; --ink-faint: #a1848c;
  --primary: #8b1e3f; --primary-soft: #b23a5c; --accent: #c44569; --blush: #f8d7da;
  --line: #f2dcdf;    --line-strong: #e6c3c8;
  --glow: rgba(196, 69, 105, 0.16);
  --scrim: rgba(42, 21, 28, 0.42);
}
```

The exact palette from PRD §23 — deep rose `#8B1E3F`, romantic pink `#C44569`, soft pink `#F8D7DA`, warm white `#FFF8F5`. `:root` is included alongside the attribute selector so romantic is the default before any cookie exists.

```css
[data-theme="light"] { … cooler, desaturated greys, same primary … }
```

Neutral greys for the surfaces, but the same rose primary — so the app still feels like itself.

```css
[data-theme="dark"] {
  --canvas: #140a0e;  --raised: #1f1116;  --sunken: #0d0609;
  --ink: #f7ecee;     --ink-soft: #c4a6ad; --ink-faint: #8a6a72;
  --primary: #e8809b; --primary-soft: #f0a3b8; --accent: #c44569; --blush: #3a1f28;
  --line: #332027;    --line-strong: #4a2c35;
  color-scheme: dark;
}
```

Two details worth copying:

1. **`--primary` gets *lighter* in dark mode** (`#8b1e3f` → `#e8809b`). Deep rose on near-black would be unreadable. Inverting a theme isn't flipping a switch; each token needs a role-appropriate value.
2. **`color-scheme: dark`** — tells the browser to render *native* widgets (scrollbars, date pickers, form controls) in dark styling. Without it, the `<input type="date">` in the memory form would be a bright white box in an otherwise dark UI.

`--glow` and `--scrim` are intentionally **not** in `@theme` — they're used through raw `var()` in component classes (box shadows, `bg-(--scrim)`), so they don't need utility generation.

### `@layer base`

```css
* { border-color: var(--line); }
```

Sets a default border colour globally, so `border`, `border-t` etc. don't each need a colour class.

```css
html { -webkit-tap-highlight-color: transparent; }
```

Removes the grey flash on tap on iOS.

```css
body {
  background-color: var(--canvas);
  color: var(--ink);
  font-family: var(--font-sans);
  background-image:
    radial-gradient(ellipse 80% 55% at 12% -8%, var(--glow), transparent 60%),
    radial-gradient(ellipse 70% 50% at 92% 4%, var(--glow), transparent 55%);
  background-attachment: fixed;
}
```

Two very soft radial gradients bleeding in from off-canvas at the top corners — PRD §23's "soft gradients". `background-attachment: fixed` keeps them anchored to the viewport so they don't scroll away. Because they use `var(--glow)`, they re-tint per theme automatically.

```css
h1, h2, h3 { font-family: var(--font-serif); font-weight: 400; letter-spacing: -0.015em; }
```

Headings default to the serif. Slight negative tracking, which large serif type generally needs.

```css
::selection { background: var(--blush); color: var(--primary); }

:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 4px; }
```

🔎 `:focus-visible` (not `:focus`) shows the ring for keyboard navigation but not on mouse clicks — accessible without looking noisy. Never delete a focus style; restyle it.

```css
input, textarea, select, button { font: inherit; color: inherit; }
```

Form controls otherwise use the OS font. This makes them match the app.

```css
button:not(:disabled),
summary,
select:not(:disabled),
label:has(input:not(:disabled)),
[role="button"]:not([aria-disabled="true"]),
[role="tab"]:not([aria-disabled="true"]) { cursor: pointer; }

button:disabled, [aria-disabled="true"] { cursor: not-allowed; }
input[type="range"]:not(:disabled) { cursor: grab; }
input[type="range"]:active { cursor: grabbing; }
```

⚠️ **This block is a real bug fix, recorded in PRD §29.** Tailwind v4's preflight stopped forcing `cursor: pointer` on buttons, deferring to the browser default of `cursor: default`. The result was that every control in the app felt inert. Note the care taken: disabled controls get `not-allowed`, `label:has(input)` covers clickable labels, and sliders get grab/grabbing.

`:has()` is a relatively new CSS selector — "a label that contains an enabled input".

```css
::-webkit-scrollbar { width: 10px; height: 10px; }
::-webkit-scrollbar-thumb {
  background: var(--line-strong);
  border-radius: 99px;
  border: 3px solid var(--canvas);
}
```

Themed scrollbars. The `3px` border in the canvas colour is the trick that makes a 10px thumb look like a slim floating pill.

### `@layer components`

```css
.glass {
  background: color-mix(in srgb, var(--raised) 72%, transparent);
  backdrop-filter: blur(16px) saturate(150%);
  -webkit-backdrop-filter: blur(16px) saturate(150%);
  border: 1px solid color-mix(in srgb, var(--line) 80%, transparent);
}
```

PRD §23's "subtle glassmorphism". `color-mix()` blends a theme colour with transparency so the class works in all three themes. `backdrop-filter` blurs whatever is *behind* the element — the effect only reads as glass because content scrolls under it. Used on the player bar, bottom nav, and install prompt. The `-webkit-` duplicate is for Safari.

```css
.card {
  background: var(--raised);
  border: 1px solid var(--line);
  border-radius: var(--radius-xl2);
  box-shadow: 0 1px 2px rgba(0,0,0,0.03), 0 8px 24px -12px var(--glow);
}
```

Two stacked shadows: a tight dark one for the physical edge, and a wide *rose-tinted* one for the glow. The negative spread (`-12px`) pulls it in so it reads as a soft halo rather than a drop shadow.

```css
.display { font-family: var(--font-serif); font-weight: 300; letter-spacing: -0.02em; line-height: 1.05; }

.label { font-size: 0.6875rem; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink-faint); }
```

The two typographic voices of the app. `.display` is the big romantic serif — light weight, tight tracking and leading. `.label` is the small uppercase section header you see above every section title ("OUR LIBRARY", "PLAYING FOR US"). Wide letter-spacing is essential for small uppercase text.

### Keyframes

```css
@keyframes fade-up   { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
@keyframes fade-in   { from { opacity: 0; } to { opacity: 1; } }
@keyframes heartbeat { 0%,100% { scale 1 } 8% { 1.14 } 16% { 1 } 24% { 1.1 } 32% { 1 } }
@keyframes drift     { 0% { opacity 0, y 0, scale .6 } 10% { opacity .5 } 90% { opacity 0 } 100% { y -90px, scale 1, rotate 22deg } }
@keyframes shimmer   { from { background-position: -200% 0 } to { background-position: 200% 0 } }
@keyframes fade-out  { to { opacity: 0 } }
```

`heartbeat` is a **double** pulse (big then small) with a long pause — that's what makes it read as a heartbeat rather than a throb. Used on the invite page's heart badge.

`drift` powers the floating heart particles: fade in, rise 90px, rotate slightly, fade out. Because it's `infinite` with a per-particle `animation-delay`, a handful of spans produce a continuous ambient effect.

`shimmer` slides a gradient across the loading skeletons.

### View transitions

```css
::view-transition-old(.page) { animation: fade-out 140ms ease-in both; }
::view-transition-new(.page) { animation: fade-up 320ms cubic-bezier(0.22, 1, 0.36, 1) both; }

::view-transition-old(root), ::view-transition-new(root) { animation: none; mix-blend-mode: normal; }
```

🧠 **The View Transitions API** lets the browser animate between two DOM states. React's `<ViewTransition default="page">` in [app/(app)/layout.tsx](<app/(app)/layout.tsx>) tags the page body with the class `page`, and these pseudo-elements style the old and new snapshots.

The asymmetry is intentional: out in 140ms, in over 320ms with an easing curve. Overlapping unequally reads as a soft dissolve; equal-length crossfades tend to look like a smear.

The `root` rule disables the browser's default whole-document fade, which would otherwise animate the sidebar and player too — exactly what wrapping only the page body was meant to avoid.

### `.stagger`

```css
.stagger > * { animation: fade-up 0.45s cubic-bezier(0.22, 1, 0.36, 1) both; }
.stagger > *:nth-child(1) { animation-delay: 0ms; }
.stagger > *:nth-child(2) { animation-delay: 35ms; }
…
.stagger > *:nth-child(n + 10) { animation-delay: 315ms; }
```

Children fade up in sequence. 🔎 The cap at 10 is the interesting part: `:nth-child(n + 10)` means "the 10th and everything after", so all later items share the final 315ms delay. Without the cap, item 40 would wait 1.4 seconds and the choreography would read as lag.

Add `className="stagger"` to a `<ul>` and every child animates in. Used on the notes list, memories grid, and stat cards.

### `.skeleton` and `.hoverable`

```css
.skeleton {
  background: linear-gradient(90deg, var(--sunken) 25%, color-mix(in srgb, var(--line) 60%, var(--sunken)) 50%, var(--sunken) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.6s linear infinite;
  border-radius: 0.75rem;
}

.hoverable { transition: transform 0.2s cubic-bezier(0.22,1,0.36,1), box-shadow 0.2s ease, border-color 0.2s ease; }
.hoverable:hover { transform: translateY(-2px); box-shadow: 0 2px 4px rgba(0,0,0,0.04), 0 16px 32px -18px var(--glow); }
```

The skeleton gradient is twice as wide as the element, and `shimmer` slides it across — the standard loading-shimmer technique.

`.hoverable` lifts a card 2px and deepens its glow. `translateY` (not `margin`) means **no layout reflow**, so neighbouring cards don't shift.

### Reduced motion

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }

  ::view-transition-group(*), ::view-transition-old(*), ::view-transition-new(*) {
    animation: none !important;
  }

  .hoverable:hover { transform: none; }
}
```

An accessibility requirement, not a nicety: motion can cause nausea and migraines for people with vestibular disorders, and the OS exposes their preference.

The technique — `0.01ms` rather than `none` — is deliberate: animations still *complete*, firing their `animationend` events, so any logic depending on them doesn't hang. They just complete instantly.

⚠️ **The view-transition block is the part people miss.** View transitions run on pseudo-elements outside the normal cascade, so the wildcard rule above does *not* reach them. They have to be disabled explicitly. PRD §29 calls this out specifically.
## 8.3 `app/page.tsx` — the landing page

The public route `/`. A Server Component with no data fetching — everything is static except Clerk's signed-in check.

```tsx
const FEATURES: Array<{ icon: LucideIcon; title: string; copy: string }> = [
  { icon: ListMusic, title: "Your playlist, synced", copy: "Add a song on YouTube and it shows up here…" },
  { icon: Mail,      title: "Notes for each other", copy: "Leave something small behind…" },
  { icon: Sparkles,  title: "Songs that remember",  copy: "Attach a memory to a song…" },
];
```

🧠 **Data-driven UI.** Rather than writing three near-identical cards, describe them as data and map over them. Adding a fourth feature is a one-line change. Note that `icon` holds the **component itself** (`ListMusic`, not `"ListMusic"`) — components are first-class values in React, which is why `<feature.icon className="h-5 w-5" />` works further down.

```tsx
<main className="relative flex flex-1 flex-col">
  <HeartDrift count={5} />
```

`relative` establishes the positioning context for `HeartDrift`, which is `absolute inset-0`. `flex-1` fills the body's remaining height (set up by the root layout's flex column).

### The conditional CTA

```tsx
<Show
  when="signed-in"
  fallback={
    <div className="flex items-center gap-2">
      <Link href="/sign-in"><Button variant="ghost" size="sm">Sign in</Button></Link>
      <Link href="/sign-up"><Button size="sm">Get started</Button></Link>
    </div>
  }
>
  <Link href="/home"><Button size="sm">Open our space</Button></Link>
</Show>
```

Clerk 7's `<Show>` replaces `<SignedIn>`/`<SignedOut>`. `children` render when the condition holds, `fallback` otherwise. The same pattern appears twice on this page — once in the nav, once for the hero CTA.

🔎 `<Link>` rather than `<a>` matters: Next.js prefetches the destination on hover and navigates client-side, so the layout, player, and React state survive. A raw `<a>` would do a full page load.

Note the nesting: `<Link>` wrapping `<Button>`. The `Button` component renders a real `<button>`, so this is a button inside a link — the link handles navigation, the button provides styling. (Strictly, nesting interactive elements isn't ideal HTML; a link styled to look like a button is the more correct approach. Worth noticing.)

### The hero

```tsx
<p className="label mb-6 animate-fade-in">For two people, only</p>

<h1 className="display mb-6 text-5xl leading-[1.05] sm:text-7xl animate-fade-up">
  A little private corner<br />of the internet<br />
  <em className="text-primary">that belongs to us.</em>
</h1>
```

`label` and `display` are the two custom component classes from `globals.css`. `text-5xl sm:text-7xl` is mobile-first responsive sizing — 5xl by default, 7xl at ≥640px. `leading-[1.05]` is Tailwind's arbitrary-value syntax for a one-off line-height. The `<em>` gets `text-primary` so the last line lands in rose.

`animate-fade-in` / `animate-fade-up` come from the `--animate-*` tokens in `@theme`.

### The feature grid

```tsx
<section className="relative z-10 mx-auto grid w-full max-w-4xl gap-4 px-6 pb-20 sm:grid-cols-3">
  {FEATURES.map((feature) => (
    <div key={feature.title} className="glass rounded-xl2 p-5 text-left">
      <span aria-hidden className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-blush text-primary">
        <feature.icon className="h-5 w-5" />
      </span>
      <h2 className="mb-1.5 text-base font-medium">{feature.title}</h2>
      <p className="text-sm leading-relaxed text-ink-soft">{feature.copy}</p>
    </div>
  ))}
</section>
```

- `grid` + `sm:grid-cols-3` — one column stacked on mobile, three across on wider screens.
- `key={feature.title}` — titles are unique here; an id would be better practice if these ever came from a database.
- **`aria-hidden` on the icon wrapper.** The icon is decorative; the heading next to it already carries the meaning. Without `aria-hidden`, a screen reader would announce a meaningless graphic. 🔎 This app is consistent about it — every purely decorative icon is hidden, every meaningful one has an `aria-label`.
- `text-primary` on the wrapper and `currentColor` on the icon: lucide icons inherit text colour, so setting it once on the parent colours the icon.

`z-10` on every section keeps content above the `HeartDrift` layer.

## 8.4 `app/manifest.ts`

```tsx
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Mood Swings",
    short_name: "Mood Swings",
    description: "A little private corner of the internet that belongs to us.",
    start_url: "/home",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#fff8f5",
    theme_color: "#8b1e3f",
    categories: ["music", "lifestyle"],
    icons: [ … ],
    shortcuts: [
      { name: "Music", url: "/music", description: "Our playlist" },
      { name: "Love notes", url: "/love", description: "Write something" },
      { name: "Memories", url: "/memories", description: "Our moments" },
    ],
  };
}
```

🧠 **A web app manifest is what makes a website installable.** Next.js turns this file into `/manifest.webmanifest` automatically — no static JSON to keep in sync, and it's type-checked via `MetadataRoute.Manifest`.

Key fields:
- **`start_url: "/home"`** — the installed app opens straight at the dashboard, not the marketing landing page.
- **`display: "standalone"`** — no browser chrome. This is what makes it feel like a native app.
- **`orientation: "portrait"`** — locked, since every layout here is a phone-shaped column.
- **`background_color`** — the splash-screen colour while the app boots. Matching the romantic canvas avoids a white flash.
- **`theme_color`** — the OS/status-bar tint.
- **`icons`** — 192px and 512px `purpose: "any"`, plus a 512px `purpose: "maskable"`. The maskable one is full-bleed so Android can crop it to a circle, squircle, or rounded square without clipping the heart. Getting this wrong is why some installed PWAs show a white square with a tiny logo.
- **`shortcuts`** — long-press the installed icon and you get three jump targets.

## 8.5 `app/opengraph-image.tsx`

Generates the 1200×630 preview image shown when someone pastes a link into a chat app. Next.js recognises the filename and wires up `og:image` automatically.

```tsx
export const alt = `${SITE_NAME} — ${SITE_TAGLINE}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
```

1200×630 is the near-universal social card ratio (1.91:1).

### Top-level `await`

```tsx
const icon = await readFile(join(process.cwd(), "app/icon.svg"), "base64");
const iconSrc = `data:image/svg+xml;base64,${icon}`;
```

🧠 This `await` is at **module scope**, not inside a function — legal in ES modules. It runs once when the module is first loaded, not per request. The SVG is read from disk and inlined as a data URI, so the image generator needs no network access to fetch it. Reusing the favicon's SVG means the shared card and the installed icon can never look different.

### Loading fonts for Satori

```tsx
async function loadGoogleFont(family: string, weight: number) {
  const css = await fetch(
    `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, "+")}:wght@${weight}`,
    { headers: { "User-Agent": "Mozilla/5.0 (Linux; U; Android 4.0.3; …) …Safari/534.30" } },
  ).then((res) => res.text());

  const url = css.match(/src: url\((.+?)\)/)?.[1];
  if (!url) throw new Error(`No TrueType source for ${family} ${weight}`);
  return fetch(url).then((res) => res.arrayBuffer());
}
```

⚠️ **The ancient User-Agent is not a mistake.** Google Fonts serves different formats based on the requesting browser. `next/og` uses **Satori** internally, which can't parse `woff2` — it needs TrueType. Pretending to be a 2011 Android browser is what makes the CSS endpoint hand back a `.ttf` URL. This is a well-known workaround for `next/og`, and the comment documents it so nobody "cleans it up".

Then a regex plucks the font URL out of the returned CSS, and a second fetch downloads the bytes as an `ArrayBuffer`.

```tsx
const fonts = await Promise.all([
  loadGoogleFont("Cormorant Garamond", 600).then((data) => ({ name: "Cormorant Garamond", data, weight: 600 as const, style: "normal" as const })),
  loadGoogleFont("Inter", 500).then((data) => ({ name: "Inter", data, weight: 500 as const, style: "normal" as const })),
]).catch((error) => {
  console.warn("[opengraph-image] Falling back to the built-in font:", error);
  return [];
});
```

Both fonts load in parallel. 🔎 The `.catch` returning `[]` is a good instinct: **a card in the fallback font beats a failed build.** Since this runs at build time, an unhandled rejection here would break the deploy over a cosmetic detail.

### The image itself

```tsx
export default function Image() {
  return new ImageResponse(( <div style={{ … }}> … </div> ), { ...size, fonts: fonts.length ? fonts : undefined });
}
```

⚠️ **The JSX here is not HTML/CSS — it's Satori's subset.** Constraints you must respect:
- **Inline `style` objects only.** No Tailwind, no classes, no external stylesheet.
- **Every container needs an explicit `display`.** Note `display: "flex"` on wrappers that would obviously be flex in a browser; Satori requires it.
- A limited CSS subset (flexbox yes, grid no; no `calc()` in most places).
- Colours are hardcoded hex values lifted from the dark theme, because CSS variables don't exist here.

The layout: a `space-between` column with a diagonal 4-stop gradient background, an absolutely-positioned radial rose glow, then a header row (icon + wordmark + "FOR TWO PEOPLE, ONLY"), the three-line serif headline, and a footer with a hairline rule and "Music · Love notes · Memories · Moods".

`fonts.length ? fonts : undefined` — pass fonts if they loaded, otherwise let Satori use its built-in font.

## 8.6 `app/twitter-image.tsx`

```tsx
export { default, alt, size, contentType } from "./opengraph-image";
```

One line. X/Twitter's `summary_large_image` card is the same 1200×630 shape, so it re-exports everything rather than duplicating a 150-line layout. Next.js needs the *file* to exist to emit `twitter:image`; the file just doesn't need original content.

## 8.7 `app/icon.svg`, `app/apple-icon.png`, `app/favicon.ico`

Next.js has file conventions for icons: put them in `app/` with these names and the correct `<link>` tags are generated automatically.

| File | Used for |
| --- | --- |
| `icon.svg` | modern browsers — crisp at any size |
| `apple-icon.png` (180×180) | iOS home screen |
| `favicon.ico` (16/32/48/64) | older browsers and some tooling |

All three are **generated** by [scripts/generate-icons.py](scripts/generate-icons.py) from one parametric heart curve (§12.2). The SVG's `<path>` is that enormous `M 50.00 36.12 L …` string — 180 sampled points from the curve, emitted as straight line segments. Ugly to read, but it guarantees the vector and raster marks are geometrically identical.

The SVG also carries a `linearGradient` from `#8B1E3F` to `#C44569` and `rx="22"` for the rounded square, so it matches the PNGs exactly.

## 8.8 `app/offline/page.tsx`

```tsx
export const metadata = { title: "Offline" };

export default function OfflinePage() {
  return (
    <main className="relative flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
      <HeartDrift count={3} />
      <div className="relative z-10 max-w-sm">
        <IconBadge icon={WifiOff} className="mb-5" />
        <h1 className="display text-3xl">No connection</h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-soft">
          Our little corner needs the internet to load. Anything already playing
          will keep going — everything else is waiting for you back online.
        </p>
      </div>
    </main>
  );
}
```

A normal route, but it's reached in an unusual way: [public/sw.js](public/sw.js) precaches it at install time and serves it when a navigation fetch fails outright.

🔎 The copy does something specific — it tells you what *still works* ("anything already playing will keep going"), which is true because the YouTube iframe buffers. Most offline pages just say "you're offline".

---

# Part 9 — Reusable components

## 9.1 `components/ui.tsx`

The design-system primitives. **No `"use client"`** — these are presentational with no state or event handlers of their own, so they can render in a Server Component *or* be imported by a Client Component. That dual usability is why they're stateless by design.

### `cn(...)`

```ts
export function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}
```

Joins class names, dropping falsy entries — so you can write:

```tsx
cn("flex items-center", isActive && "text-primary", className)
```

⚠️ Note what it does **not** do: resolve conflicts. If you pass both `"p-4"` and `"p-6"`, both end up in the class list and the winner is decided by stylesheet order, not by argument order. (The popular `tailwind-merge` library solves that; this codebase chose the 2-line version and works around the limitation with the `unstyled` escape hatch below.)

### `Button`

```ts
const buttonBase = "inline-flex items-center justify-center gap-2 rounded-full font-medium transition-all duration-200 disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98] whitespace-nowrap";

const buttonVariants = {
  primary:  "bg-primary text-white hover:bg-primary-soft shadow-[0_6px_20px_-8px_var(--glow)]",
  soft:     "bg-blush text-primary hover:brightness-[0.97]",
  outline:  "border border-line-strong text-ink hover:bg-sunken",
  ghost:    "text-ink-soft hover:text-ink hover:bg-sunken",
  danger:   "border border-line-strong text-primary hover:bg-blush",
  chip:     "border border-line bg-raised text-ink-soft hover:text-ink",
  selected: "bg-primary text-white",
  quiet:    "text-ink-faint hover:text-ink",
  bare:     "text-ink hover:bg-sunken",
} as const;

const buttonSizes = {
  sm: "h-9 px-4 text-sm",   md: "h-11 px-6 text-sm",  lg: "h-13 px-8 text-base",
  icon: "h-10 w-10",  "icon-sm": "h-9 w-9",  "icon-lg": "h-12 w-12",
  chip: "px-3.5 py-1.5 text-xs",
} as const;
```

🧠 **The variant pattern.** Instead of a `className` free-for-all at every call site, enumerate the legal looks in an object and let TypeScript enforce it:

```ts
type ButtonProps = ComponentProps<"button"> & {
  variant?: keyof typeof buttonVariants;
  size?: keyof typeof buttonSizes;
  unstyled?: boolean;
};
```

`keyof typeof buttonVariants` derives the union `"primary" | "soft" | … | "bare"` from the object itself. Add a variant and it's immediately valid; typo one and the build fails. `ComponentProps<"button">` means every real button attribute (`onClick`, `disabled`, `type`, `aria-*`) is accepted and typed.

```tsx
export function Button({ variant = "primary", size = "md", unstyled = false, type = "button", className, ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={unstyled ? className : cn(buttonBase, buttonVariants[variant], buttonSizes[size], className)}
      {...props}
    />
  );
}
```

⚠️ **`type = "button"` is a genuinely important default.** A `<button>` inside a `<form>` defaults to `type="submit"` in HTML. Forgetting that is how a "Show more" toggle accidentally submits a form. Every button in this app is `type="button"` unless it explicitly asks to submit — and you can see the explicit `type="submit"` on the real submit buttons.

**The `unstyled` prop** — worth understanding, because it's unusual. It drops the base/variant/size classes entirely and paints from `className` alone. Its docstring explains why it exists rather than just overriding:

> `cn` only joins strings, so a conflicting override would be settled by stylesheet order rather than by what the call site asked for; this opts out cleanly instead.

So for buttons that are a *bespoke surface* rather than a control — a modal scrim, a clickable song row, a toggle whose colours flip with state — `unstyled` gives you a semantically correct `<button>` (keyboard focus, Enter/Space activation, `aria-pressed`) with zero inherited styling. That's a much better answer than using a `<div onClick>`, which is inaccessible.

`{...props}` spreads the remaining attributes onto the element, which is what makes `aria-label`, `onClick`, and `disabled` pass through.

### `Card`, `Input`, `Textarea`

```tsx
export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("card p-6", className)} {...props} />;
}
```

Wraps the `.card` component class with default padding.

```tsx
export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(
    "h-11 w-full rounded-xl border border-line bg-raised px-4 text-sm",
    "placeholder:text-ink-faint transition-colors",
    "focus:border-accent focus:outline-none",
    className)} {...props} />;
}
```

`focus:outline-none` paired with `focus:border-accent` — removing the outline is only acceptable *because* a visible focus indicator replaces it. (And `:focus-visible` in globals.css still provides a ring for keyboard users.) `Textarea` is the same with `resize-none` and vertical padding.

### `Field`

```tsx
export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-2">
      <span className="label block">{label}</span>
      {children}
      {hint ? <span className="block text-xs text-ink-faint">{hint}</span> : null}
    </label>
  );
}
```

🔎 **An accessibility pattern worth copying.** The input is *nested inside* the `<label>`, which associates them implicitly — no `htmlFor`/`id` pair to keep in sync, and no way for them to drift apart. Clicking the label focuses the input. `space-y-2` handles the vertical rhythm so no call site needs margins.

### `EmptyState`

```tsx
export function EmptyState({ icon: Icon, title, description, action }: { icon: LucideIcon; title: string; description: string; action?: ReactNode }) { … }
```

🧠 **`{ icon: Icon }` is destructuring-with-rename.** It has to be: JSX treats lowercase tags as HTML elements, so `<icon />` would render a literal `<icon>` tag. Renaming to a capital `Icon` makes `<Icon className="h-6 w-6" />` render the component. You'll see this idiom throughout the codebase.

Used on Music (no matches), Love (no notes), Memories (nothing yet), Mood (no moods). The optional `action` slot takes a button.

### `Skeleton` and `PageSkeleton`

```tsx
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("skeleton", className)} />;
}

export function PageSkeleton({ cards = 3 }: { cards?: number }) {
  return (
    <div className="space-y-8" aria-busy="true" aria-label="Loading">
      <div className="space-y-3">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-10 w-64 max-w-full" />
        <Skeleton className="h-3 w-48 max-w-full" />
      </div>
      <div className="space-y-4">
        {Array.from({ length: cards }).map((_, index) => (
          <Skeleton key={index} className="h-28 w-full rounded-xl2" />
        ))}
      </div>
    </div>
  );
}
```

`PageSkeleton` is rendered by every `loading.tsx`. Its shape deliberately mirrors the real pages — a small label, a big heading, a subtitle, then N cards — so the swap to real content doesn't jump.

The `cards` prop is tuned per route: 3 for Home, 6 for Music, 5 for Settings. `Array.from({ length: n })` is the idiomatic "render n things" (you can't `.map()` over `new Array(n)` — the slots are empty).

Accessibility: `aria-busy="true"` + `aria-label="Loading"` on the container announces the state; `aria-hidden` on each bar keeps the individual shapes out of the accessibility tree.

### `HeartDrift`

```tsx
export function HeartDrift({ count = 6 }: { count?: number }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {Array.from({ length: count }).map((_, index) => (
        <span key={index} className="absolute opacity-0"
          style={{
            left: `${8 + index * (84 / count)}%`,
            bottom: "-10px",
            animation: `drift ${7 + (index % 4)}s linear ${index * 1.4}s infinite`,
          }}>
          <Heart className="h-3.5 w-3.5 fill-current text-primary" />
        </span>
      ))}
    </div>
  );
}
```

PRD §23 says heart particles should be used **sparingly**, so this is opt-in per screen (landing, home, us, invite, offline) rather than global.

Three details:
- `left: ${8 + index * (84 / count)}%` — spreads the hearts evenly across 8%–92% regardless of `count`. No magic numbers per particle.
- `animation: drift ${7 + (index % 4)}s linear ${index * 1.4}s infinite` — the duration cycles through 7/8/9/10 seconds and the delay staggers by 1.4s each. 🔎 Varying both is what prevents the hearts from moving in visible lockstep; identical timing would look mechanical.
- `pointer-events-none` — clicks pass straight through, so the decoration can never block a button. Plus `aria-hidden`, since it means nothing to a screen reader.

The parent must be `relative` for `absolute inset-0` to fill it — which is why every page using this has `relative` on its `<main>`.

## 9.2 `components/icons.tsx`

```tsx
const MOOD_ICONS: Record<string, LucideIcon> = {
  heart: Heart, "heart-crack": HeartCrack, "heart-handshake": HeartHandshake,
  moon: Moon, wine: Wine, sun: Sun, flame: Flame,
};
```

The file header states the app-wide rule:

> The app draws icons, never emoji — anything that used to be a glyph in copy comes from `lucide-react` so it inherits colour, size, and stroke weight.

🔎 That's a real design decision. An emoji is a *font glyph*: it renders differently on every platform, can't inherit colour, and can't be given a consistent stroke weight. An icon component obeys `currentColor` and your size scale. Once you notice this, you'll see there is not a single emoji in the app's UI.

`MOOD_ICONS` is the registry mapping the string keys stored in `Mood.icon` to components.

```tsx
const MOOD_ICONS_BY_SLUG: Record<string, LucideIcon | undefined> =
  Object.fromEntries(DEFAULT_MOODS.map((mood) => [mood.slug, MOOD_ICONS[mood.icon]]));

export function moodIcon({ slug, icon }: MoodIconRef): LucideIcon {
  return MOOD_ICONS[icon] ?? MOOD_ICONS_BY_SLUG[slug] ?? Sparkles;
}
```

🧠 **A three-level fallback, and each level exists for a reason.**

1. `MOOD_ICONS[icon]` — the normal path.
2. `MOOD_ICONS_BY_SLUG[slug]` — **the migration path.** Rows seeded before the emoji→icon switch still hold an emoji character in that column. `"❤️"` isn't a key in `MOOD_ICONS`, so it falls through to a lookup by slug, which never changes. This is why no data migration was needed.
3. `Sparkles` — the last resort, so a custom mood with an unknown key still renders *something* rather than crashing.

`Object.fromEntries(...)` builds the second map from `DEFAULT_MOODS` at module load, so the two stay in sync automatically.

```tsx
export function MoodIcon({ mood, className }: { mood: MoodIconRef; className?: string }) {
  const Icon = moodIcon(mood);
  return <Icon aria-hidden className={cn("shrink-0", className)} />;
}
```

The component wrapper. `shrink-0` prevents the icon squashing inside a flex row with long text — a small fix that matters on narrow phones.

`MoodIconRef = { slug: string; icon: string }` is a deliberately minimal structural type. Any object with those two fields works, so this accepts a full Prisma `Mood` row, a trimmed projection, or a literal. 🔎 That's structural typing used well: ask for the least you need.

```tsx
export function IconBadge({ icon: Icon, className, iconClassName }: { … }) {
  return (
    <span aria-hidden className={cn("inline-flex h-14 w-14 items-center justify-center rounded-full bg-blush text-primary", className)}>
      <Icon className={cn("h-6 w-6", iconClassName)} />
    </span>
  );
}
```

The "one big glyph" treatment: a 56px blush circle with a rose icon. Used on the offline page and the three states of the join page. Two separate className props so the caller can style the circle and the icon independently — that's how the invite page adds `animate-heartbeat` to the badge and `fill-current` to the heart inside it.

## 9.3 `components/nav.tsx`

`"use client"` — because it needs `usePathname()` to highlight the active link.

```tsx
const LINKS: Array<{ href: string; label: string; icon: LucideIcon }> = [
  { href: "/home",     label: "Home",     icon: House },
  { href: "/music",    label: "Music",    icon: Music },
  { href: "/love",     label: "Love",     icon: Mail },
  { href: "/memories", label: "Memories", icon: Sparkles },
  { href: "/us",       label: "Us",       icon: Heart },
];
```

Five links, matching PRD §17. Settings sits separately at the bottom of the sidebar.

```tsx
function useIsActive() {
  const pathname = usePathname();
  return (href: string) => pathname === href || pathname.startsWith(`${href}/`);
}
```

🧠 **A custom hook.** Any function named `use*` that calls other hooks is a custom hook — it's just extraction, no special machinery. This one calls `usePathname()` once and returns a *closure* that tests any href against it. Both `Sidebar` and `BottomNav` use it, so the matching logic exists once.

The `||` clause handles nesting: `/music/some-sub-page` should still highlight "Music". Comparing with `===` alone would lose the highlight on sub-routes.

### `Sidebar`

```tsx
<aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-line px-4 py-6 md:flex">
```

- `hidden md:flex` — 🔎 **this is the responsive strategy of the whole app.** Hidden below 768px, flex above. The mobile equivalents (`BottomNav`, `MobileHeader`) do the inverse with `md:hidden`. Both markup trees are always in the DOM; CSS decides which is visible. That's simpler and more reliable than JS-based breakpoint detection, and it works during SSR.
- `sticky top-0 h-dvh` — full viewport height, pinned while content scrolls. `dvh` is *dynamic* viewport height, which accounts for mobile browser chrome appearing and disappearing (`vh` famously doesn't).
- `shrink-0` — never compress; the main content flexes instead.

```tsx
<Link href={link.href}
  aria-current={isActive(link.href) ? "page" : undefined}
  className={cn(
    "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors",
    isActive(link.href) ? "bg-blush font-medium text-primary" : "text-ink-soft hover:bg-sunken hover:text-ink",
  )}>
  <link.icon aria-hidden className="h-4.5 w-4.5 shrink-0" />
  {link.label}
</Link>
```

`aria-current="page"` is the accessible signal for "you are here" — the colour change alone conveys nothing to a screen reader. Setting it to `undefined` (rather than `"false"`) removes the attribute entirely, which is the correct way to express absence.

Settings is rendered separately after the `flex-1` nav, which pushes it to the bottom of the sidebar.

### `BottomNav`

```tsx
<nav className="glass fixed inset-x-0 bottom-0 z-50 flex h-16 items-stretch border-t md:hidden">
```

The mobile tab bar: fixed to the bottom, `glass` so content blurs behind it, `z-50` to sit above page content. Each link is `flex-1` for equal widths with a tiny `text-[0.625rem]` label under the icon.

⚠️ This bar is why every page in the `(app)` layout has `pb-40 md:pb-28` on its `<main>` — without that bottom padding, the last item of a list would sit underneath the nav and the player bar.

### `MobileHeader`

`md:hidden` top bar carrying the wordmark, a truncated couple name, and a settings gear — because the sidebar (which normally holds all three) is hidden on mobile. `truncate` + `max-w-36` keeps a long couple name from pushing the gear off screen.

## 9.4 `components/relationship-counter.tsx`

```tsx
"use client";

export function RelationshipCounter({ startDate, initialDays, initialDuration }: {
  startDate: string; initialDays: number; initialDuration: string;
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
  …
}
```

PRD §5 asks that the duration update automatically. This is a small component with several ideas in it.

**1. Server-rendered first, then live.** The parent ([home/page.tsx](<app/(app)/home/page.tsx>)) computes `initialDays` and `initialDuration` on the server and passes them in as props, which seed the state. 🔎 Why bother? Because the HTML then arrives with the real number already in it — no flash of "0 days", and it's correct even before JavaScript loads. The effect then keeps it live.

**2. `startDate` is a `string`, not a `Date`.**

⚠️ This is a rule you must internalise: **props crossing the server→client boundary must be serialisable.** A `Date` object cannot be. The parent calls `startDate.toISOString()` and this component calls `new Date(startDate)` inside the helpers. You'll see `.toISOString()` at every one of these boundaries in the codebase (love notes, memories, sync timestamps) for exactly this reason.

**3. `update()` is called immediately, then on an interval.** `setInterval` doesn't fire until the first period elapses. Calling `update()` directly reconciles any drift between server render and hydration right away.

**4. The cleanup function.** Returning `() => window.clearInterval(timer)` is what stops the timer when the component unmounts. Without it, navigating away leaves a timer calling `setState` on a dead component — a classic memory leak.

**5. Why 60 seconds?** The value changes at most once per day. A minute of latency at midnight is imperceptible, and a 1s interval would burn 60× the wakeups for nothing.

```tsx
{days.toLocaleString()}
```

`toLocaleString()` on a number adds thousands separators — "1,247 days" rather than "1247 days".

## 9.5 `components/favorites-provider.tsx`

The clearest example of the **optimistic update** pattern in the codebase. Read it carefully; the same shape recurs six or seven times.

```tsx
"use client";

type FavoritesContextValue = {
  isFavorite: (songId: string) => boolean;
  toggle: (songId: string) => void;
};

const FavoritesContext = createContext<FavoritesContextValue | null>(null);

export function useFavorites() {
  const context = useContext(FavoritesContext);
  if (!context) throw new Error("useFavorites must be used inside <FavoritesProvider>");
  return context;
}
```

🧠 **React Context solves prop drilling.** The favourite state is needed by song rows (in the Music list), by the player bar, and by the Us page groups. Threading a prop through every intermediate component would be miserable. A Provider publishes the value at the top; any descendant reads it with `useContext`.

The `null` default plus the throwing hook is a standard safety pattern: instead of silently getting `null` and crashing later on `context.toggle`, you get an immediate, explicit error naming the mistake. It also gives `useFavorites()` a non-nullable return type, so no consumer needs `?.`.

```tsx
export function FavoritesProvider({ initial, children }: { initial: string[]; children: React.ReactNode }) {
  const [ids, setIds] = useState(() => new Set(initial));
  const [, startTransition] = useTransition();
```

- `initial` is an array of song ids, loaded server-side in [app/(app)/layout.tsx](<app/(app)/layout.tsx>) — an array because it has to cross the serialisation boundary.
- `useState(() => new Set(initial))` — the **lazy initialiser**. Passing a function means it runs only on the first render. `useState(new Set(initial))` would construct a new `Set` on *every* render and throw it away, which is wasted work.
- A `Set` because the only operations are has/add/delete, all O(1).

```tsx
const isFavorite = useCallback((songId: string) => ids.has(songId), [ids]);

const toggle = useCallback((songId: string) => {
  setIds((previous) => {
    const next = new Set(previous);
    if (next.has(songId)) next.delete(songId); else next.add(songId);
    return next;
  });

  startTransition(async () => {
    try {
      await toggleFavorite(songId);
    } catch {
      setIds((previous) => {          // roll back
        const next = new Set(previous);
        if (next.has(songId)) next.delete(songId); else next.add(songId);
        return next;
      });
    }
  });
}, []);
```

**The optimistic pattern, in three beats:**

1. **Update local state immediately.** The heart fills the instant you tap. No spinner, no wait for the network.
2. **Fire the Server Action** inside `startTransition`, so React treats it as non-urgent and doesn't block the UI.
3. **On failure, apply the inverse.** Because toggle is its own inverse, the rollback is the same code.

🔎 Why this matters: a favourite round-trip is maybe 100–300ms. Doing it pessimistically (wait, then update) makes every heart feel laggy. Doing it optimistically makes the app feel native. The cost is the rollback branch — and the honest limitation is that a failure produces no user-visible message, just a heart that quietly un-fills. For a low-stakes toggle that's a reasonable trade; for a payment it would not be.

⚠️ **The `new Set(previous)` copy is mandatory.** Mutating the existing Set and returning it would leave the reference unchanged, React would see "same value", and nothing would re-render. This is the single most common state bug with objects, arrays, Maps, and Sets: **always create a new reference.**

`useCallback(..., [])` with an empty dependency array is safe here because the updater form (`setIds(previous => …)`) never reads `ids` from the closure.

```tsx
const value = useMemo(() => ({ isFavorite, toggle }), [isFavorite, toggle]);
return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>;
```

🧠 **Why `useMemo` around the context value.** A context value that's a fresh object literal on every render forces **every consumer** to re-render, even when nothing changed. Memoising it means consumers re-render only when `isFavorite` or `toggle` actually changes identity — and `isFavorite` changes only when `ids` does, which is exactly right.

## 9.6 `components/mood-check-in.tsx`

```tsx
"use client";

export function MoodCheckIn({ moods, currentMoodId, compact = false }: {
  moods: Mood[]; currentMoodId: string | null; compact?: boolean;
}) {
  const [selected, setSelected] = useState(currentMoodId);
  const [, startTransition] = useTransition();

  function choose(mood: Mood) {
    const next = selected === mood.id ? null : mood.id;
    setSelected(next);

    if (next) {
      startTransition(async () => {
        try { await checkInMood(mood.id); }
        catch { setSelected(currentMoodId); }
      });
    }
  }
  …
}
```

Same optimistic shape, with one asymmetry worth noticing: tapping your current mood **deselects it locally but sends nothing**. Since check-ins are append-only, there's no "un-check-in" — the row already exists in history. So deselection is a purely visual affordance.

Rollback restores `currentMoodId` (the server's last known value) rather than toggling, which is correct for a single-select control.

```tsx
const [, startTransition] = useTransition();
```

The leading comma discards the `pending` flag. This component doesn't show a spinner — the fill state is instant feedback enough.

```tsx
const active = moods.find((mood) => mood.id === selected);
```

Derived during render from state, not stored in a second `useState`. 🔎 That's an important habit: **anything computable from existing state should be computed, not stored.** Two pieces of state that must agree will eventually disagree.

```tsx
<Button
  unstyled
  onClick={() => choose(mood)}
  aria-pressed={selected === mood.id}
  className={cn(
    "inline-flex items-center gap-2 rounded-full border transition-all",
    compact ? "px-4 py-2 text-sm" : "px-5 py-3 text-base",
    selected === mood.id
      ? "border-primary bg-blush text-primary shadow-[0_4px_16px_-8px_var(--glow)]"
      : "border-line bg-raised text-ink-soft hover:border-line-strong hover:text-ink",
  )}>
  <MoodIcon mood={mood} className={compact ? "h-4 w-4" : "h-4.5 w-4.5"} />
  {mood.name}
</Button>
```

`unstyled` because the colours flip with state — exactly the case that prop was designed for. `aria-pressed` is the accessible representation of a toggle button's state.

The `compact` prop lets one component serve two contexts: inline on Home (compact, left-aligned) and as the centred hero of the Mood page.

```tsx
{active ? (
  <p>
    {MOOD_BLURBS[active.slug] ?? "Noted."}{" "}
    <Link href={`/music?mood=${active.id}`} className="text-primary underline underline-offset-4">
      Play {active.name.toLowerCase()} songs
    </Link>
  </p>
) : null}
```

Picking a mood reveals its blurb plus a link into the filtered library. `{" "}` is how you force a space in JSX where the formatter would otherwise collapse the newline. The `?? "Noted."` covers a renamed or custom mood with no blurb.

🔎 The `/music?mood=<id>` link is the seam between the two features: [music/page.tsx](<app/(app)/music/page.tsx>) reads that search param and passes it as `initialMoodId`, so arriving from here lands you on a pre-filtered library.

## 9.7 `components/track-row.tsx`

One song row — used by the Music library, the Us page favourite groups, and anywhere else a list of songs appears.

```tsx
export type TrackRowData = PlayerTrack & {
  memory?: string | null;
  moods?: Array<{ id: string; slug: string; icon: string; name: string }>;
};
```

`&` is an **intersection type**: everything `PlayerTrack` has, plus two optional extras. So a row is playable by definition, and optionally carries a memory and mood tags.

```tsx
const player = usePlayer();
const favorites = useFavorites();

const isCurrent = player.current?.id === track.id;
const isPlaying = isCurrent && player.isPlaying;
```

Both bits of global state come from context. `isCurrent` (this is the loaded track) and `isPlaying` (…and it's actually playing) are distinct — a paused current track still gets the highlighted row and the visible overlay, but shows a play icon.

### Three separate buttons in one row

```tsx
<Button unstyled onClick={() => player.playTrack(track, queue)} className="relative shrink-0"
  aria-label={isPlaying ? `Pause ${track.title}` : `Play ${track.title}`}>
  {track.thumbnail ? (
    <Image src={track.thumbnail} alt="" width={48} height={48} unoptimized className="h-12 w-12 rounded-lg object-cover" />
  ) : (
    <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-blush text-primary"><Music2 className="h-5 w-5" /></span>
  )}
  <span className={cn("absolute inset-0 flex items-center justify-center rounded-lg bg-black/45 text-white transition-opacity",
    isCurrent ? "opacity-100" : "opacity-0 group-hover:opacity-100")}>
    {isPlaying ? <Pause … /> : <Play … />}
  </span>
</Button>
```

**1. The artwork button.** Points worth noting:
- `alt=""` — an *empty* alt, which is correct for decorative imagery. The button's `aria-label` already says "Play Until I Found You". A non-empty alt here would make a screen reader read the song twice.
- `width`/`height` are required by `next/image` to reserve space and avoid layout shift.
- `unoptimized` — skip Next's re-encode (see §3.2).
- The play/pause overlay is always in the DOM at `opacity-0`, revealed by `group-hover:opacity-100` (the row has `className="group"`) or forced visible when this is the current track. Animating opacity rather than mounting/unmounting means a smooth transition and no layout work.
- `aria-label` changes with state, so the control's purpose is always announced accurately.

**2. The title/metadata button** — the whole text block is clickable, which is what you expect from a music app.

```tsx
{typeof index === "number" ? (
  <span className="mr-2 text-xs tabular-nums text-ink-faint">{index + 1}</span>
) : null}
```

`typeof index === "number"` rather than `index ?` — because index `0` is falsy, and the first song would lose its number. A small bug avoided deliberately.

`tabular-nums` forces monospaced digits so a column of numbers or timestamps doesn't jitter as it changes. It appears on the index, the duration, and the player's time display.

```tsx
{track.moods?.map((mood) => (
  <span key={mood.id} title={mood.name} aria-label={mood.name}>
    <MoodIcon mood={mood} className="h-3.5 w-3.5" />
  </span>
))}
```

Mood tags as tiny inline icons, with `title` (mouse tooltip) and `aria-label` (screen reader) both supplying the name — because the icon alone is ambiguous.

```tsx
{showMemory && track.memory ? (
  <span className="mt-1 flex items-center gap-1.5 text-xs italic text-primary">
    <Heart className="h-3 w-3 shrink-0 fill-current" aria-hidden />
    <span className="truncate">{track.memory}</span>
  </span>
) : null}
```

🔎 **This is PRD §27's whole thesis rendered in six lines.** A song row isn't just "Perfect — Ed Sheeran"; it's that plus "The song we played on our first trip." `showMemory` defaults to `true` but is set `false` on the Us page, where the favourite lists want to stay compact.

**3. The favourite button.**

```tsx
<Button unstyled onClick={() => favorites.toggle(track.id)}
  aria-pressed={favorites.isFavorite(track.id)}
  aria-label={favorites.isFavorite(track.id) ? `Remove ${track.title} from favourites` : `Add ${track.title} to favourites`}
  className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors",
    favorites.isFavorite(track.id)
      ? "text-primary"
      : "text-ink-faint opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-primary")}>
  <Heart className={cn("h-4.5 w-4.5", favorites.isFavorite(track.id) && "fill-current")} />
</Button>
```

⚠️ **`focus-visible:opacity-100` is the accessibility fix here.** An unfavourited heart is invisible until hover — which means a keyboard user could tab to a control they can't see. Adding the focus-visible rule makes it appear when focused. This is the kind of detail that separates "works with a mouse" from "works".

A favourited heart is always visible (it's information, not an affordance) and gets `fill-current` so it's solid rather than outlined.

### `PlayForUsButton`

```tsx
export function PlayForUsButton({ track, queue }: { track: PlayerTrack; queue?: PlayerTrack[] }) {
  const player = usePlayer();
  const isPlaying = player.current?.id === track.id && player.isPlaying;
  return (
    <Button unstyled onClick={() => player.playTrack(track, queue)}
      className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-medium text-white transition-transform hover:scale-[1.03] active:scale-95">
      {isPlaying ? <Pause … /> : <Play … />}
      {isPlaying ? "Pause" : "Play"}
    </Button>
  );
}
```

The larger play affordance used for Home's "Playing for us" card and on memory cards that have a song. `hover:scale-[1.03]` and `active:scale-95` give it a springy press — and because it's a transform, no layout is affected.
## 9.8 `components/player/types.ts`

Types only — no runtime code. Three sections.

```ts
export type PlayerTrack = {
  id: string;
  youtubeVideoId: string;
  title: string;
  artist: string | null;
  thumbnail: string | null;
  duration: number | null;
};

export type RepeatMode = "off" | "all" | "one";
```

🔎 `PlayerTrack` is deliberately **not** the Prisma `Song` type. It's the minimum the player needs: six fields, no `coupleId`, no `position`, no `createdAt`. Every page that hands songs to the player projects down to this shape. Two benefits: less data crossing the network boundary, and the player has no dependency on the database schema.

`RepeatMode` as a string union rather than an enum — simpler, serialisable, and exhaustively checkable.

```ts
export type YTPlayer = {
  loadVideoById(videoId: string): void;
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  setVolume(volume: number): void;
  mute(): void;
  unMute(): void;
  getCurrentTime(): number;
  getDuration(): number;
  destroy(): void;
};
```

🧠 **Declaring only the API surface you use.** YouTube's IFrame Player has dozens of methods and ships no TypeScript types. Rather than pulling in a third-party `@types` package or reaching for `any`, this declares exactly the ten methods the app calls. If someone calls `player.getPlaybackRate()`, the compiler stops them until they add it here deliberately.

```ts
declare global {
  interface Window {
    YT?: {
      Player: new (element: HTMLElement | string, options: { … }) => YTPlayer;
      PlayerState: { UNSTARTED: number; ENDED: number; PLAYING: number; PAUSED: number; BUFFERING: number; CUED: number };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}
```

**`declare global`** augments the global `Window` type. Necessary because YouTube's script attaches itself to `window.YT` at runtime, and looks for a global callback named `window.onYouTubeIframeAPIReady`. TypeScript needs to be told both exist.

Both are `?` optional — the script loads asynchronously, so `window.YT` genuinely is `undefined` until it arrives. That's why the provider is full of `window.YT?.Player` checks: the optionality is real, not defensive noise.

`Player: new (…) => YTPlayer` is a **constructor signature** — it types something you call with `new`.

## 9.9 `components/player/player-provider.tsx`

The most complex file in the project: all playback state, plus the YouTube iframe it drives. Read this one slowly.

Its header states the two load-bearing facts:

> Playback goes through YouTube's IFrame Player API — we never proxy or re-host audio, only drive their player.
>
> This provider is mounted in the persistent app layout, so the iframe is never unmounted by navigation and music keeps playing across pages.

### The context shape

```ts
type PlayerContextValue = {
  current: PlayerTrack | null;  isPlaying: boolean;  progress: number;  duration: number;
  volume: number;  isMuted: boolean;  shuffle: boolean;  repeat: RepeatMode;  isExpanded: boolean;

  playTrack: (track: PlayerTrack, queue?: PlayerTrack[]) => void;
  playQueue: (queue: PlayerTrack[], startIndex?: number) => void;
  toggle: () => void;  next: () => void;  previous: () => void;
  seek: (seconds: number) => void;  setVolume: (volume: number) => void;
  toggleMute: () => void;  toggleShuffle: () => void;  cycleRepeat: () => void;
  setExpanded: (expanded: boolean) => void;
};
```

Nine values and eleven actions — the complete PRD §8 control set (play, pause, previous, next, seek, volume, shuffle, repeat) plus expand/collapse.

### Loading the IFrame API exactly once

```ts
function loadIframeApi(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.YT?.Player) return Promise.resolve();

  return new Promise((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${IFRAME_API_SRC}"]`);

    const previousCallback = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previousCallback?.();
      resolve();
    };

    if (!existing) {
      const script = document.createElement("script");
      script.src = IFRAME_API_SRC;
      script.async = true;
      document.head.appendChild(script);
    }
  });
}
```

Four guards, each for a real situation:

1. `typeof window === "undefined"` — during SSR there is no `window`. Resolve immediately rather than crash.
2. `window.YT?.Player` — already loaded (e.g. after a fast remount). Don't reload.
3. `document.querySelector(script[src=...])` — the `<script>` tag exists but hasn't finished executing. Don't inject a duplicate; just wait.
4. **The callback chain.** YouTube's API only supports *one* global ready callback. Overwriting it would break any earlier registration, so this captures the previous one and calls it before resolving. 🔎 A small, careful piece of defensive code for integrating with an API designed in 2010.

Wrapping a callback API in a `Promise` is the standard way to make it `await`-able.

### The shuffle algorithm

```ts
function shuffleOrder(length: number, keepFirst: number): number[] {
  const order = Array.from({ length }, (_, i) => i).filter((i) => i !== keepFirst);

  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }

  return [keepFirst, ...order];
}
```

🧠 **This is the Fisher–Yates shuffle**, the correct way to shuffle an array. Walk from the end, swap each element with a random earlier one (or itself). Every permutation is equally likely. The naive `array.sort(() => Math.random() - 0.5)` is *not* uniformly random and is a genuinely common bug.

`[order[i], order[j]] = [order[j], order[i]]` is destructuring assignment used as a swap — no temporary variable.

`keepFirst` is pulled out first and prepended after, so the song you clicked plays *now* and everything else is randomised behind it. Shuffling and then jumping to the clicked song would be wrong; shuffling around it is what users expect.

**Critically, this shuffles an array of *indices*, not the queue itself.** The queue keeps its real order; `order` is a separate playback sequence. That means turning shuffle off restores the original order instantly, with no need to remember what it was.

### State

```ts
const hostRef = useRef<HTMLDivElement | null>(null);
const playerRef = useRef<YTPlayer | null>(null);

const [queue, setQueue] = useState<PlayerTrack[]>([]);
const [index, setIndex] = useState(0);
const [isPlaying, setIsPlaying] = useState(false);
const [isReady, setIsReady] = useState(false);
const [progress, setProgress] = useState(0);
const [duration, setDuration] = useState(0);
const [volume, setVolumeState] = useState(80);
const [isMuted, setIsMuted] = useState(false);
const [shuffle, setShuffle] = useState(false);
const [repeat, setRepeat] = useState<RepeatMode>("off");
const [isExpanded, setExpanded] = useState(false);
const [order, setOrder] = useState<number[]>([]);

const current = queue[index] ?? null;
```

🧠 **Two `useRef`s, and neither is state.** `hostRef` points at the DOM `<div>` YouTube replaces with its iframe. `playerRef` holds the YouTube player *instance*. Neither belongs in `useState` because changing them shouldn't re-render — and re-creating a player on every render would be catastrophic. **Rule: `useRef` for things you need to remember but don't render.**

`volume` starts at 80, not 100 — a small kindness.

`current` is **derived**, not stored. Store both and they can disagree; derive and they can't.

### Reading fresh state from stale callbacks

```ts
const stateRef = useRef({ repeat, order, index });

useEffect(() => {
  stateRef.current = { repeat, order, index };
}, [repeat, order, index]);
```

⚠️ **This solves a real and subtle problem.** The YouTube player's event handlers are registered **once**, when the player is constructed, and the API offers no way to replace them. Those closures therefore capture the values of `repeat`, `order`, and `index` **as they were at construction time** — forever.

So when a song ends 20 minutes later and the handler checks `repeat`, it would see `"off"` even if you'd since turned repeat on.

The fix: keep a ref that a small effect refreshes whenever those values change. The handler reads `stateRef.current`, which always holds the latest committed values. This is the canonical workaround for "callback registered once, needs current state."

The comment notes it's written in an effect rather than during render — because a render can be discarded, while an effect only runs after a commit. So the ref never holds a value that was never actually rendered.

### Advancing the queue

```ts
const advance = useCallback((direction: 1 | -1) => {
  const { order: currentOrder, index: currentIndex, repeat: currentRepeat } = stateRef.current;

  if (currentOrder.length === 0) return;

  const positionInOrder = currentOrder.indexOf(currentIndex);
  const nextPosition = positionInOrder + direction;

  if (nextPosition < 0) {
    setIndex(currentOrder[currentOrder.length - 1]);   // wrap to the end
    return;
  }

  if (nextPosition >= currentOrder.length) {
    if (currentRepeat === "all") setIndex(currentOrder[0]);
    else setIsPlaying(false);
    return;
  }

  setIndex(currentOrder[nextPosition]);
}, []);
```

The queue-navigation logic. Note the **two levels of indirection**: `index` is a position in `queue`, and `order` is the playback sequence *of indices*. So "next" means: find where the current index sits inside `order`, step one along, and read the index there.

- Going back from the first track wraps to the last (always — pressing previous should never dead-end).
- Going forward past the last track either loops (`repeat === "all"`) or stops.
- `repeat === "one"` never reaches here; it's handled in the `ENDED` event by seeking to 0.
- `useCallback(…, [])` with no dependencies is correct precisely *because* everything is read from `stateRef`.

### Creating the player

```ts
useEffect(() => {
  let cancelled = false;

  loadIframeApi().then(() => {
    if (cancelled || !hostRef.current || !window.YT?.Player) return;

    playerRef.current = new window.YT.Player(hostRef.current, {
      height: "100%", width: "100%",
      playerVars: { playsinline: 1, rel: 0, modestbranding: 1 },
      events: {
        onReady: (event) => {
          if (cancelled) return;
          event.target.setVolume(volume);
          setIsReady(true);
        },
        onStateChange: (event) => {
          const states = window.YT?.PlayerState;
          if (!states) return;

          if (event.data === states.PLAYING) {
            setIsPlaying(true);
            setDuration(event.target.getDuration() || 0);
          } else if (event.data === states.PAUSED) {
            setIsPlaying(false);
          } else if (event.data === states.ENDED) {
            if (stateRef.current.repeat === "one") {
              event.target.seekTo(0, true);
              event.target.playVideo();
            } else {
              advance(1);
            }
          }
        },
        onError: () => advance(1),
      },
    });
  });

  return () => {
    cancelled = true;
    playerRef.current?.destroy();
    playerRef.current = null;
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);
```

**`playerVars`:**
- `playsinline: 1` — ⚠️ **essential on iOS.** Without it, Safari hijacks playback into a native full-screen video player, and your entire UI disappears.
- `rel: 0` — reduce related-video suggestions at the end.
- `modestbranding: 1` — minimise the YouTube logo.

**The `cancelled` flag** is the standard async-effect cleanup guard. If the component unmounts while `loadIframeApi()` is still pending, the `.then` would otherwise construct a player attached to a removed DOM node. The flag is checked before construction and again in `onReady`.

**Events:**
- `PLAYING` → set the flag and capture the real duration (which YouTube only knows once loading starts).
- `PAUSED` → clear the flag.
- `ENDED` → repeat-one seeks back to 0 and replays; otherwise advance.
- `onError` → 🔎 **advance past it.** Some videos are region-locked or embed-restricted. Stalling forever on a song that will never load is a much worse failure than skipping it.

**The `eslint-disable` for `exhaustive-deps`** is deliberate and documented: the effect reads `volume` and `advance` but must run exactly once. A dependency array including `volume` would destroy and rebuild the player on every volume change, restarting playback. Volume is applied separately in `onReady` and in `setVolume`. 🔎 This is the *right* way to disable a lint rule: one line, with a comment saying why.

**The cleanup** calls `destroy()`, which removes the iframe and its listeners.

### Loading the current track

```ts
useEffect(() => {
  const player = playerRef.current;
  if (!player || !isReady || !current) return;

  player.loadVideoById(current.youtubeVideoId);
  setProgress(0);
  setDuration(current.duration ?? 0);
}, [current, isReady]);
```

Whenever `current` changes — from a click, from `advance`, from shuffle — load that video. `isReady` gates it so nothing is called before `onReady` fired. Progress resets to 0, and duration is seeded from the database value so the seek bar has a sane maximum before YouTube reports the real one.

### Polling progress

```ts
useEffect(() => {
  if (!isPlaying) return;

  const timer = window.setInterval(() => {
    const player = playerRef.current;
    if (!player) return;

    setProgress(player.getCurrentTime() || 0);
    const total = player.getDuration() || 0;
    if (total > 0) setDuration(total);
  }, 500);

  return () => window.clearInterval(timer);
}, [isPlaying]);
```

⚠️ **Polling, because YouTube's API has no "time changed" event.** There is genuinely no alternative.

500ms is the tuned compromise: fine enough that the seek bar looks smooth (helped by the CSS `transition-[width]` on the fill), coarse enough to avoid 60 re-renders a second.

The effect keys on `isPlaying`, so **the timer stops when paused** — no wasted work, no battery drain while the app sits idle.

`|| 0` guards `NaN`, which `getCurrentTime()` returns before a video loads.

### Media Session — lock screen controls

```ts
useEffect(() => {
  if (!current || !("mediaSession" in navigator)) return;

  navigator.mediaSession.metadata = new MediaMetadata({
    title: current.title,
    artist: current.artist ?? "",
    artwork: current.thumbnail ? [{ src: current.thumbnail, sizes: "480x360", type: "image/jpeg" }] : [],
  });
}, [current]);
```

🧠 **The Media Session API** publishes "what's playing" to the operating system. The payoff: the song title and artwork appear on the phone's lock screen, in the notification shade, on a smartwatch, and on a car display. Headphone play/pause buttons work.

`"mediaSession" in navigator` is a **feature detection** — not every browser has it, and touching a missing API throws.

`sizes: "480x360"` matches exactly what `pickThumbnail` chose in [lib/youtube-parse.ts](lib/youtube-parse.ts). The two files agree because both were changed together.

### `playQueue`

```ts
const playQueue = useCallback((nextQueue: PlayerTrack[], startIndex = 0) => {
  if (nextQueue.length === 0) return;

  const safeIndex = Math.max(0, Math.min(startIndex, nextQueue.length - 1));

  setQueue(nextQueue);
  setIndex(safeIndex);
  setOrder(shuffle
    ? shuffleOrder(nextQueue.length, safeIndex)
    : Array.from({ length: nextQueue.length }, (_, i) => i));
  setIsPlaying(true);
}, [shuffle]);
```

`Math.max(0, Math.min(startIndex, length - 1))` **clamps** the index into range — cheap insurance against an out-of-bounds caller.

The `order` is built here: shuffled if shuffle is on, otherwise the identity sequence `[0, 1, 2, …]`. Having an explicit identity order (rather than special-casing "no order") means `advance` has exactly one code path.

### `playTrack`

```ts
const playTrack = useCallback((track: PlayerTrack, nextQueue?: PlayerTrack[]) => {
  const source = nextQueue ?? (queue.length > 0 ? queue : library);
  const position = source.findIndex((item) => item.id === track.id);

  if (position === -1) {
    playQueue([track, ...source], 0);
    return;
  }

  if (current?.id === track.id && playerRef.current) {
    if (isPlaying) playerRef.current.pauseVideo();
    else playerRef.current.playVideo();
    return;
  }

  playQueue(source, position);
}, [queue, library, current, isPlaying, playQueue]);
```

The main entry point, called from every play button. Three behaviours:

**1. Queue resolution:** an explicit queue if given (the filtered Music list, a favourites group), else the current queue, else the whole library. 🔎 This is what makes "click a song in the *In Love* filter" play only In Love songs afterwards, while "click a song on Home" plays the full library.

**2. Not in the queue** (`position === -1`) → prepend it. Happens when playing a memory's song that isn't in the current filter.

**3. Same track already loaded** → treat the tap as play/pause. Without this, clicking the currently playing row would reload the video and restart it from zero. Exactly the right behaviour, and easy to forget.

### The remaining controls

```ts
const toggle = useCallback(() => {
  const player = playerRef.current;
  if (!player) return;
  if (!current && library.length > 0) { playQueue(library, 0); return; }
  if (isPlaying) player.pauseVideo(); else player.playVideo();
}, [current, isPlaying, library, playQueue]);
```

Pressing play with nothing loaded starts the library from the top.

```ts
const seek = useCallback((seconds: number) => {
  playerRef.current?.seekTo(seconds, true);
  setProgress(seconds);
}, []);
```

Sets local progress immediately as well as calling the player, so the seek bar doesn't visibly snap back for up to 500ms until the next poll.

```ts
const setVolume = useCallback((next: number) => {
  const clamped = Math.max(0, Math.min(100, next));
  setVolumeState(clamped);
  playerRef.current?.setVolume(clamped);

  if (clamped > 0 && playerRef.current) {
    playerRef.current.unMute();
    setIsMuted(false);
  }
}, []);
```

Clamped to 0–100, and moving the slider above zero **automatically unmutes** — because a user dragging the volume up while muted clearly wants sound. Without this, the slider would move and nothing would happen.

```ts
const toggleMute = useCallback(() => {
  const player = playerRef.current;
  if (!player) return;
  setIsMuted((muted) => {
    if (muted) { player.unMute(); player.setVolume(volume); }
    else { player.mute(); }
    return !muted;
  });
}, [volume]);
```

Unmuting restores the remembered volume, so mute→unmute round-trips exactly.

⚠️ Note the side effects (`player.mute()`) live *inside* the state updater. That's technically impure — React may call updaters more than once in development's strict mode — and calling `mute()` twice is harmless here, but as a pattern it's better to compute the next value first and act outside. Worth recognising rather than copying.

```ts
const toggleShuffle = useCallback(() => {
  setShuffle((on) => {
    const next = !on;
    setOrder(next
      ? shuffleOrder(queue.length, index)
      : Array.from({ length: queue.length }, (_, i) => i));
    return next;
  });
}, [queue.length, index]);
```

Turning shuffle on reshuffles from the current position; turning it off restores the natural order — instantly, because the queue itself was never reordered.

```ts
const cycleRepeat = useCallback(() => {
  setRepeat((mode) => (mode === "off" ? "all" : mode === "all" ? "one" : "off"));
}, []);
```

off → all → one → off. The nested ternary reads as a cycle table.

```ts
const previous = useCallback(() => {
  if (progress > 3) { seek(0); return; }
  advance(-1);
}, [progress, seek, advance]);
```

🔎 **The 3-second rule.** Every music player does this: press previous early in a track and you go to the previous track; press it later and you restart the current one. Matching an established convention is worth more than any novel behaviour.

### The provider and the iframe host

```tsx
const value = useMemo<PlayerContextValue>(() => ({ current, isPlaying, … }), [current, isPlaying, …]);

return (
  <PlayerContext.Provider value={value}>
    {children}
    <YouTubeHost hostRef={hostRef} expanded={isExpanded} hasTrack={Boolean(current)} />
  </PlayerContext.Provider>
);
```

Same `useMemo` reasoning as the favourites context. Note `setExpanded` is in the value but not the dependency array — `useState` setters are guaranteed stable, so including it would be noise.

```tsx
function YouTubeHost({ hostRef, expanded, hasTrack }: { … }) {
  return (
    <div
      aria-hidden={!expanded}
      className={expanded
        ? "fixed left-1/2 top-24 z-70 aspect-video w-[min(92vw,44rem)] -translate-x-1/2 overflow-hidden rounded-xl2 bg-black shadow-2xl transition-all duration-300"
        : "pointer-events-none fixed bottom-0 left-0 -z-10 h-1 w-1 overflow-hidden opacity-0"}
      style={hasTrack ? undefined : { visibility: "hidden" }}>
      <div ref={hostRef} className="h-full w-full" />
    </div>
  );
}
```

⚠️ **This is the trick that makes the whole player work, and it's worth understanding fully.**

The iframe must **never unmount** — unmounting it destroys the player and stops the music. So instead of conditionally rendering it, the component always renders the same `<div>` and only swaps its **CSS classes**:

- **Collapsed:** a 1×1 pixel box, `opacity-0`, `-z-10`, `pointer-events-none`, pinned to the corner. Present and playing; invisible and unclickable.
- **Expanded:** a centred 16:9 video up to 44rem wide, animating over 300ms.

Because it's the same element with the same React key in the same position, React never remounts it. The audio doesn't blink.

`aspect-video` = 16:9. `w-[min(92vw,44rem)]` uses CSS `min()` so it's responsive without a media query. `left-1/2 -translate-x-1/2` is the standard horizontal centring trick.

🔎 The corresponding piece is in [player-bar.tsx](components/player/player-bar.tsx)'s expanded view:

```tsx
<div className="aspect-video w-full shrink-0" aria-hidden />
```

An **empty spacer** occupying exactly where the iframe will be positioned. The iframe is `fixed`, so it's outside the layout flow; the spacer reserves the room so the title and controls sit below the video instead of underneath it. Two files cooperating through a shared layout assumption — fragile, but the only way to move an element without remounting it.

`aria-hidden={!expanded}` hides the collapsed iframe from assistive tech, since the visible controls are the real interface.

## 9.10 `components/player/player-bar.tsx`

The player's UI: a compact bar plus a full-screen "Now Playing".

```tsx
export function PlayerBar({ songMemory }: { songMemory?: string | null }) {
  const player = usePlayer();
  const favorites = useFavorites();

  if (!player.current) return null;
  const track = player.current;
  …
}
```

`if (!player.current) return null` — 🔎 **an early return is how a component renders nothing.** Before any song is chosen, the bar simply doesn't exist, so no space is reserved and no controls are dangling.

Assigning `track = player.current` after the guard gives TypeScript a non-null value for the rest of the function.

### The bar

```tsx
<div className={cn(
  "fixed inset-x-0 z-50 transition-all duration-300",
  "bottom-16 md:bottom-0",
  player.isExpanded && "pointer-events-none translate-y-4 opacity-0",
)}>
```

- `bottom-16 md:bottom-0` — sits **above** the 64px mobile tab bar, and flush to the bottom on desktop where no tab bar exists.
- When expanded, the bar slides down 16px and fades out, with `pointer-events-none` so its invisible buttons can't be clicked. Again: hidden by CSS, never unmounted.

```tsx
<div className="glass mx-auto max-w-6xl border-t md:rounded-none md:border-x-0">
  <Seek />
  <div className="flex items-center gap-3 px-3 py-2.5 sm:px-4"> … </div>
</div>
```

The seek bar sits at the very top edge of the bar, doubling as a progress indicator — a pattern borrowed from most mobile music apps.

### Artwork + metadata → expand

```tsx
<Button unstyled onClick={() => player.setExpanded(true)}
  className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-label="Open now playing">
  <Artwork track={track} />
  <span className="min-w-0 flex-1">
    <span className="block truncate text-sm font-medium">{track.title}</span>
    <span className="block truncate text-xs text-ink-soft">{track.artist ?? "Unknown artist"}</span>
  </span>
</Button>
```

⚠️ **`min-w-0` appears twice, and it's not decoration.** Flex items have `min-width: auto` by default, which means they refuse to shrink below their content's intrinsic width — so `truncate` (which needs a constrained width) does nothing, and long titles blow out the layout. `min-w-0` is the fix. This is one of the most common Flexbox+truncation bugs, and this codebase gets it right everywhere.

### Transport controls

```tsx
<Button unstyled onClick={() => favorites.toggle(track.id)} … className="hidden … sm:flex">
<Button unstyled onClick={player.previous} aria-label="Previous song" className="hidden … sm:flex">
<PlayButton />
<Button unstyled onClick={player.next} aria-label="Next song" className="flex …">
<span className="ml-1 hidden text-xs tabular-nums text-ink-faint lg:inline">
  {formatTime(player.progress)} / {formatTime(player.duration)}
</span>
```

🔎 **Progressive disclosure by breakpoint.** On a phone: play and next. From `sm` up: favourite and previous appear. From `lg`: the time readout. Nothing is cramped at any size, and the two most important controls are always present.

Every icon-only button has an `aria-label`.

### `Artwork`

```tsx
function Artwork({ track }: { track: { thumbnail: string | null; title: string } }) {
  if (!track.thumbnail) {
    return <span className="flex h-11 w-11 … bg-blush text-primary" aria-hidden><Music2 className="h-5 w-5" /></span>;
  }
  return <Image src={track.thumbnail} alt="" width={44} height={44} unoptimized className="h-11 w-11 shrink-0 rounded-lg object-cover" />;
}
```

Note the **structural prop type** — it accepts anything with `thumbnail` and `title`, not specifically a `PlayerTrack`. Asking for the minimum makes the component reusable.

The fallback tile matters: `thumbnail` is nullable in the schema, and a broken image would look like a bug.

### `PlayButton`

```tsx
function PlayButton({ large }: { large?: boolean }) {
  const player = usePlayer();
  return (
    <Button unstyled onClick={player.toggle} aria-label={player.isPlaying ? "Pause" : "Play"}
      className={cn("flex items-center justify-center rounded-full bg-primary text-white transition-transform hover:scale-105 active:scale-95",
        large ? "h-16 w-16" : "h-11 w-11")}>
      {player.isPlaying
        ? <Pause className={large ? "h-7 w-7" : "h-5 w-5"} fill="currentColor" />
        : <Play className={cn(large ? "h-7 w-7" : "h-5 w-5", "translate-x-px")} fill="currentColor" />}
    </Button>
  );
}
```

One component, two sizes — used in the bar (`h-11`) and the expanded view (`large`, `h-16`).

🔎 `translate-x-px` on the play triangle is a **1-pixel optical correction**. A triangle's visual centre of mass sits left of its geometric centre, so inside a circle it looks off. Nudging it one pixel right makes it look centred. Real attention to detail.

`fill="currentColor"` makes lucide's outline icons solid, which is what transport controls want.

### `Seek`

```tsx
function Seek({ tall }: { tall?: boolean }) {
  const player = usePlayer();
  const max = player.duration || player.current?.duration || 0;

  return (
    <div className={cn("group relative w-full", tall ? "py-2" : "")}>
      <div className={cn("w-full overflow-hidden bg-line", tall ? "h-1.5 rounded-full" : "h-0.75")}>
        <div className="h-full bg-primary transition-[width] duration-200"
          style={{ width: `${max > 0 ? (player.progress / max) * 100 : 0}%` }} />
      </div>

      <input type="range" min={0} max={max || 100} step={1}
        value={Math.min(player.progress, max || 100)}
        onChange={(event) => player.seek(Number(event.target.value))}
        aria-label="Seek"
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
    </div>
  );
}
```

🧠 **The invisible-native-input technique, and it's the right answer.** Styling `<input type="range">` consistently across browsers is genuinely painful (`::-webkit-slider-thumb`, `::-moz-range-track`, and so on). So instead:

- Draw the visual bar yourself with two divs (track + fill).
- Lay a **real, fully functional** `<input type="range">` over it at `opacity-0`.

You get complete visual control *and* keep every native behaviour for free: click-to-seek, drag, arrow keys, Home/End, screen-reader support, and correct touch handling. Trying to reimplement all that with `onMouseDown`/`onMouseMove` is how you end up with a seek bar that doesn't work on mobile.

`max = player.duration || player.current?.duration || 0` — prefer YouTube's live duration, fall back to the database value, then 0. `max || 100` avoids a degenerate `max={0}` range.

`Math.min(player.progress, max)` keeps the value in range if progress momentarily exceeds a stale max.

`transition-[width] duration-200` smooths the 500ms polling into continuous motion — the fill animates between samples rather than jumping.

### `ExpandedView`

```tsx
<div className={cn(
  "fixed inset-0 z-60 flex flex-col bg-canvas transition-all duration-300",
  player.isExpanded ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-full opacity-0",
)}>
```

A full-screen overlay that slides up from the bottom. Same always-mounted, CSS-toggled approach.

The z-index ladder is worth noting: bottom nav `z-50`, player bar `z-50`, expanded view `z-60`, the iframe when expanded `z-70`, and modals `z-70`. Consistent layering means no surprise stacking bugs.

```tsx
{track.thumbnail ? (
  <div aria-hidden className="absolute inset-0 scale-125 bg-cover bg-center opacity-25 blur-3xl"
    style={{ backgroundImage: `url(${track.thumbnail})` }} />
) : null}
```

PRD §23's "album artwork with blurred background". `scale-125` oversizes it so `blur-3xl` doesn't reveal soft edges at the borders — a standard trick when blurring a background image.

```tsx
<div className="aspect-video w-full shrink-0" aria-hidden />
```

The spacer for the fixed iframe, as explained in §9.9.

```tsx
{songMemory ? (
  <div className="card bg-blush/40 px-5 py-4 text-center">
    <p className="label mb-1.5 flex items-center justify-center gap-1.5">
      <Heart className="h-3.5 w-3.5 fill-current text-primary" /> Our memory
    </p>
    <p className="font-serif text-lg italic leading-snug text-primary">&ldquo;{songMemory}&rdquo;</p>
  </div>
) : null}
```

The PRD §11 payoff — the memory shown alongside the playing song.

⚠️ **Note the prop is currently unused in practice.** [app/(app)/layout.tsx](<app/(app)/layout.tsx>) renders `<PlayerBar />` with no `songMemory`, because the layout doesn't know which track is playing (that's client state). Wiring it up would mean either fetching the memory client-side when `current` changes, or including memories in the library payload the layout already loads. The UI is built and ready; the data isn't connected. Worth knowing so you don't hunt for a bug — see §14.4.

The rest of the expanded view: the transport row (shuffle · previous · big play · next · repeat), with shuffle and repeat using `variant={player.shuffle ? "soft" : "quiet"}` so active state is a filled chip; then favourite-with-label and a real visible volume slider (`accent-primary` colours the native thumb, which is fine here since the control isn't being restyled).

## 9.11 `components/pwa.tsx`

Two exports. `"use client"`, since both touch browser-only APIs.

### `ServiceWorkerRegistrar`

```tsx
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // A failed registration just means no offline support; the app works.
      });
    };

    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);

  return null;
}
```

Four decisions:

1. **Production only.** ⚠️ In development the worker would cache build assets that Turbopack is actively rewriting, producing stale-JavaScript bugs that are maddening to diagnose. `process.env.NODE_ENV` is inlined at build time, so this branch is eliminated entirely from the production bundle.
2. **Feature detection** — older browsers and some privacy modes have no `serviceWorker`.
3. **Wait for `load`.** Registering during initial load competes with fetching the resources the page actually needs. The `readyState === "complete"` check handles the case where load already happened (e.g. a client-side navigation mounted this).
4. **Swallow the error.** A failed registration means no offline page. The app is otherwise fine, so there's nothing to tell the user.

`return null` — the component renders nothing; it exists purely for the effect. That's a legitimate pattern.

### Install eligibility as an external store

```ts
type InstallEnv = "server" | "installed" | "dismissed" | "ios" | "eligible";

const DISMISS_KEY = "mood-swings-install-dismissed";
let cachedEnv: InstallEnv | null = null;
const listeners = new Set<() => void>();

function notify() { for (const listener of listeners) listener(); }

function computeEnv(): InstallEnv {
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;

  if (standalone) return "installed";

  try { if (localStorage.getItem(DISMISS_KEY)) return "dismissed"; }
  catch { /* private browsing can throw */ }

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) &&
    !(window as Window & { MSStream?: unknown }).MSStream;

  return isIOS ? "ios" : "eligible";
}

function getSnapshot(): InstallEnv { cachedEnv ??= computeEnv(); return cachedEnv; }

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onInstalled = () => { cachedEnv = "installed"; notify(); };
  window.addEventListener("appinstalled", onInstalled);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("appinstalled", onInstalled);
  };
}
```

🧠 **`useSyncExternalStore` and why it's used here.** Install eligibility is *browser* state, not React state: it comes from `matchMedia`, `localStorage`, the user agent, and an `appinstalled` event. React 18+ provides a dedicated hook for subscribing to exactly this kind of source. It needs three things:

- `subscribe(cb)` — register a listener, return an unsubscribe function.
- `getSnapshot()` — read the current value **synchronously**, and return a *referentially stable* result.
- `getServerSnapshot()` — what to return during SSR.

⚠️ The stability requirement is why `cachedEnv` exists at module scope. If `getSnapshot()` recomputed and returned a fresh value each call, React would see a changed snapshot on every render and loop infinitely. `cachedEnv ??= computeEnv()` computes once and caches.

The five states each drive different UI:
- `"server"` — during SSR, so nothing renders and there's no hydration mismatch.
- `"installed"` — already installed; never nag.
- `"dismissed"` — the user said no once; respect it.
- `"ios"` — iOS has **no `beforeinstallprompt` event**, so show manual instructions instead.
- `"eligible"` — Chromium; wait for the event, then offer a real install button.

Detection details worth noting:
- Two standalone checks, because iOS reports it on `navigator.standalone` while everyone else uses `matchMedia("(display-mode: standalone)")`.
- The `try/catch` around `localStorage` — 🔎 Safari private browsing **throws** on access. Untrapped, that would crash the component.
- `!window.MSStream` excludes old IE11-on-Windows-Phone, which spoofed an iPhone UA.

```ts
function markDismissed() {
  try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* … */ }
  cachedEnv = "dismissed";
  notify();
}
```

Even if persisting fails, the in-memory state changes and listeners fire — so the dismissal works for this session at least.

### `InstallPrompt`

```tsx
export function InstallPrompt() {
  const env = useSyncExternalStore(subscribe, getSnapshot, () => "server" as const);
  const [deferred, setDeferred] = useState<InstallPromptEvent | null>(null);

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setDeferred(event as InstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  const showable = env === "ios" || (env === "eligible" && deferred !== null);
  if (!showable) return null;
  …
}
```

🧠 **The deferred install prompt.** Chromium fires `beforeinstallprompt` when it decides the site is installable. Calling `event.preventDefault()` **suppresses the browser's own banner** and lets you save the event and trigger it later from your own UI, at a moment that makes sense. That's the entire pattern.

```tsx
<Button size="sm" onClick={async () => {
  await deferred.prompt();
  await deferred.userChoice;
  setDeferred(null);
  markDismissed();
}}>
  <Download className="h-4 w-4" /> Install
</Button>
```

`prompt()` shows the native dialog; `userChoice` resolves with the outcome. Either way the prompt is dismissed — 🔎 including on "accept", because `appinstalled` will fire and set the state to `"installed"` anyway, and re-offering after a decline would be nagging.

```tsx
<div className={cn("fixed inset-x-3 z-40 mx-auto max-w-sm animate-fade-up", "bottom-36 md:bottom-24")} role="dialog" aria-label="Install Mood Swings">
```

`bottom-36 md:bottom-24` clears **both** the mobile nav and the player bar. `z-40` puts it under the player (`z-50`) — deliberate: playback controls should never be covered by a promo.

`role="dialog"` + `aria-label` announce it properly. iOS gets `Tap Share, then <strong>Add to Home Screen</strong>` instead of a button, since there's nothing to trigger programmatically.
---

# Part 10 — Every route, page by page

## 10.1 `app/(app)/layout.tsx` — the authenticated shell

```tsx
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { user, couple } = await requireCoupleContext();

  const [songs, favorites] = await Promise.all([
    db.song.findMany({
      where: { coupleId: couple.id, isAvailable: true },
      orderBy: { position: "asc" },
      select: { id: true, youtubeVideoId: true, title: true, artist: true, thumbnail: true, duration: true },
    }),
    db.favorite.findMany({
      where: { userId: user.id, song: { coupleId: couple.id } },
      select: { songId: true },
    }),
  ]);
  …
}
```

This one file does four jobs.

**1. It's the auth gate.** `requireCoupleContext()` runs here, so every route under `(app)/` is protected by construction. Add a new page tomorrow and it's already gated — nothing to remember.

**2. It loads the player's default library.** `select` narrows to exactly the six `PlayerTrack` fields, and `isAvailable: true` keeps removed songs out of the play queue. 🔎 Loading it in the *layout* rather than in each page is what lets the player work everywhere — press play on the Love page and the whole library is already queued.

**3. It loads your favourites.** Note the nested filter:

```ts
where: { userId: user.id, song: { coupleId: couple.id } }
```

The `song: { coupleId }` part filters `Favorite` rows **by a property of the related song** — Prisma translates that into a join. Belt and braces: it prevents a stray favourite pointing at another couple's song from leaking in.

**4. `Promise.all`** runs both queries concurrently rather than sequentially. Two 20ms queries take 20ms total, not 40ms. This pattern appears in every data-loading page in the app.

```tsx
return (
  <FavoritesProvider initial={favorites.map((favorite) => favorite.songId)}>
    <PlayerProvider library={songs}>
      <div className="flex min-h-dvh flex-1">
        <Sidebar coupleName={couple.name} />
        <div className="flex min-w-0 flex-1 flex-col">
          <MobileHeader coupleName={couple.name} />
          <main className="flex-1 px-5 pt-6 pb-40 sm:px-8 md:pb-28">
            <ViewTransition default="page">
              <div className="mx-auto w-full max-w-5xl">{children}</div>
            </ViewTransition>
          </main>
        </div>
      </div>
      <PlayerBar />
      <BottomNav />
      <InstallPrompt />
    </PlayerProvider>
  </FavoritesProvider>
);
```

**The provider order matters.** `FavoritesProvider` is outside `PlayerProvider` because the player bar's heart button calls `useFavorites()`. Reverse them and that hook would find no context.

**The layout skeleton:**
- `flex min-h-dvh` — sidebar and content side by side, full dynamic viewport height.
- `min-w-0` on the content column — the same Flexbox truncation fix as §9.10, at page scale.
- `pb-40 md:pb-28` — bottom padding clearing the mobile nav (64px) plus the player bar; less needed on desktop where there's no tab bar.
- `max-w-5xl mx-auto` — content caps at 1024px and centres, so text lines don't become unreadably long on a wide monitor.

**`<ViewTransition default="page">`** wraps only `{children}`.

🔎 This placement is the entire point. The sidebar, mobile header, player bar, and bottom nav are all **outside** the transition, so they stay visually anchored while the page content dissolves. Wrapping the whole layout would fade the sidebar too, which feels like the app is reloading. `default="page"` sets the `view-transition-class` that `::view-transition-old(.page)` in [globals.css](app/globals.css) styles.

⚠️ Needs no configuration in Next.js 16, and degrades to an instant swap where the View Transitions API is missing (Safari, older Firefox). No polyfill, no feature detection.

`<PlayerBar />`, `<BottomNav />`, and `<InstallPrompt />` sit outside the scrolling `<div>` because all three are `fixed`.

## 10.2 `app/(app)/home/page.tsx` — the romantic dashboard

PRD §9 and §24. The docstring says it: "deliberately not a music dashboard."

```tsx
const { user, couple, partner } = await requireCoupleContext();

const [featured, latestNote, memories, moods, myLastCheckIn] = await Promise.all([
  pickFeaturedSong(couple.id, user.id, partner?.id),
  partner
    ? db.loveNote.findFirst({
        where: {
          coupleId: couple.id,
          recipientId: user.id,
          OR: [{ deliverAt: null }, { deliverAt: { lte: new Date() } }],
        },
        orderBy: { createdAt: "desc" },
        include: { sender: { select: { name: true } } },
      })
    : null,
  db.memory.findMany({ where: { coupleId: couple.id }, orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: 4, select: { id: true, title: true, date: true } }),
  db.mood.findMany({ where: { coupleId: couple.id }, orderBy: { sortOrder: "asc" } }),
  db.moodCheckIn.findFirst({ where: { coupleId: couple.id, userId: user.id }, orderBy: { createdAt: "desc" }, include: { mood: true } }),
]);
```

Five concurrent queries. Details:

- **The `partner ? … : null` ternary inside `Promise.all`.** With no partner there are no notes, so the query is skipped entirely rather than run and discarded. `Promise.all` happily accepts a non-promise value.
- **The scheduled-note filter** — `OR: [{ deliverAt: null }, { deliverAt: { lte: new Date() } }]` — is the read-time delivery mechanism from §4.7. Note it also filters `recipientId: user.id`: Home shows notes *for you*, not ones you sent.
- **`orderBy: [{ date: "desc" }, { createdAt: "desc" }]`** — an array means "sort by date, then by creation time as a tiebreaker". Since `date` is nullable, this gives memories with no date a sensible position.
- **`take: 4`** — Home shows a preview, not everything.
- **`include: { sender: { select: { name: true } } }`** — join to the sender but fetch only their name.

```tsx
const firstName = user.name?.split(" ")[0] ?? "love";
const startDate = couple.relationshipStartDate;
const anniversary = couple.anniversaryDate ?? couple.relationshipStartDate;
const untilAnniversary = anniversary ? daysUntilAnniversary(anniversary) : null;
```

`?? "love"` is a graceful fallback for a nameless user — and on brand. `anniversary ?? relationshipStartDate` means the countdown works even if only one date was entered.

### The header

```tsx
<header className="relative overflow-hidden pt-4 text-center">
  <HeartDrift count={4} />
  <p className="relative z-10 flex items-center justify-center gap-1.5 text-sm text-ink-soft">
    {greeting()}, {firstName}
    <Heart className="h-3.5 w-3.5 fill-current text-primary" aria-hidden />
  </p>
  <h1 className="display relative z-10 mt-3 text-4xl sm:text-5xl">{couple.name}</h1>
  <p className="relative z-10 mt-2 text-sm italic text-ink-faint">This little space belongs to us.</p>
</header>
```

"Good morning, Sarah ❤️" — except the heart is an icon, per the no-emoji rule. `overflow-hidden` keeps the drifting hearts inside the header.

### Conditional sections

The page is a chain of conditional cards, and each condition is a real product state:

```tsx
{startDate ? <Card><RelationshipCounter … /></Card> : <Card>Add the day you got together…</Card>}
```

```tsx
{untilAnniversary !== null ? (
  <p className="mt-5 … border-t border-line pt-4 …">
    {untilAnniversary === 0
      ? <><PartyPopper … /> Happy anniversary — today&rsquo;s the day.</>
      : `${untilAnniversary} ${untilAnniversary === 1 ? "day" : "days"} until your anniversary`}
  </p>
) : null}
```

`untilAnniversary !== null` — explicit, because `0` is both falsy *and* the most important value (it means today).

```tsx
{!partner ? <Card className="border-dashed">Your space is still missing someone…</Card> : null}
```

`border-dashed` signals "incomplete" without a warning colour.

```tsx
{featured ? <Card>…</Card> : <Card>Connect your YouTube playlist…</Card>}
{latestNote ? <Card>…</Card> : partner ? <Card>No notes yet…</Card> : null}
{moods.length > 0 ? <MoodCheckIn moods={moods} currentMoodId={myLastCheckIn?.moodId ?? null} compact /> : null}
{memories.length > 0 ? <div>…chips…</div> : <Card>Save the moments you want to keep.</Card>}
```

🔎 **Notice the three-way note logic:** a note if there is one; otherwise a "be the one who starts" prompt *if you have a partner*; otherwise nothing (the invite card above already covers that case). Every empty state is filled with something that tells the user what to do next — there is no blank region anywhere on this page.

### The featured song card

```tsx
{featured.thumbnail ? (
  // eslint-disable-next-line @next/next/no-img-element
  <img src={featured.thumbnail} alt="" className="h-28 w-28 shrink-0 rounded-xl2 object-cover" />
) : null}
```

A plain `<img>` with a scoped lint disable. Defensible here: this is a Server Component, the image is a fixed 112px, and the URL is a well-compressed YouTube JPEG. `<Image>` would add client-side machinery for no benefit.

```tsx
<PlayForUsButton track={featured} />
```

`featured` was projected into exactly `PlayerTrack` shape (plus `memory`) by the helper below, so it drops straight into a client component.

### `pickFeaturedSong`

```tsx
async function pickFeaturedSong(coupleId: string, userId: string, partnerId: string | undefined) {
  const withMemory = {
    memories: { orderBy: { createdAt: "desc" }, take: 1, select: { description: true, title: true } },
  } as const;

  const shared = partnerId && (await db.song.findFirst({
    where: {
      coupleId, isAvailable: true,
      AND: [
        { favorites: { some: { userId } } },
        { favorites: { some: { userId: partnerId } } },
      ],
    },
    include: withMemory,
  }));

  const song = shared
    || (await db.song.findFirst({ where: { coupleId, isAvailable: true, favorites: { some: {} } }, include: withMemory }))
    || (await db.song.findFirst({ where: { coupleId, isAvailable: true }, orderBy: { position: "asc" }, include: withMemory }));

  if (!song) return null;

  const memory = song.memories[0];
  return { id: song.id, youtubeVideoId: song.youtubeVideoId, title: song.title, artist: song.artist,
           thumbnail: song.thumbnail, duration: song.duration,
           memory: memory ? (memory.description ?? memory.title) : null };
}
```

🔎 **A three-tier preference cascade, and this is what makes Home feel personal rather than generated:**

1. A song **you both** favourited — the most meaningful possible choice.
2. Failing that, a song **either** of you favourited.
3. Failing that, the top of the playlist.

The Prisma relation filters are worth learning:
- `favorites: { some: { userId } }` — "has at least one favourite row belonging to this user".
- `AND: [ {some: A}, {some: B} ]` — ⚠️ **two separate `some` clauses.** Writing `favorites: { some: { userId: { in: [a, b] } } }` would match a song favourited by *either* person, not both. The `AND` of two independent existence checks is the correct encoding of "both".
- `favorites: { some: {} }` — an empty `some` means "has at least one favourite by anyone".

`||` short-circuits, so tier 2 and 3 only execute when the earlier tier found nothing.

The `withMemory` include is extracted so all three queries share it — a rare `as const` on a query fragment, which keeps its literal types intact for Prisma.

`memory.description ?? memory.title` — prefer the story, fall back to the title. Since `description` is nullable, this always yields something displayable.

## 10.3 `app/(app)/music/page.tsx` — the library server component

```tsx
export default async function MusicPage({ searchParams }: PageProps<"/music">) {
  const { user, couple, partner } = await requireCoupleContext();

  const stale = await isPlaylistStale(couple.id);

  const { mood: moodParam } = await searchParams;
  const initialMoodId = typeof moodParam === "string" ? moodParam : null;
  …
}
```

`searchParams` is a Promise in Next.js 16, hence the `await`. `typeof moodParam === "string"` is necessary because a repeated query param (`?mood=a&mood=b`) arrives as an array.

`stale` is computed here but **not acted on** — it's passed down to `<BackgroundSync>`, which runs the sync after paint. See §6.8.

```tsx
const [songs, moods, syncState, unavailableCount] = await Promise.all([
  db.song.findMany({
    where: { coupleId: couple.id, isAvailable: true },
    orderBy: { position: "asc" },
    include: {
      moodTags: { select: { moodId: true } },
      favorites: { select: { userId: true } },
      memories: { orderBy: { createdAt: "desc" }, select: { id: true, title: true, description: true } },
    },
  }),
  db.mood.findMany({ where: { coupleId: couple.id }, orderBy: { sortOrder: "asc" } }),
  db.couple.findUnique({ where: { id: couple.id }, select: { playlistLastSyncedAt: true, playlistSyncError: true } }),
  db.song.count({ where: { coupleId: couple.id, isAvailable: false } }),
]);
```

Four concurrent queries. The first is the interesting one: it loads every available song **with** its mood tags, its favourite rows, and its memories, in one round trip.

🔎 **Why load everything at once instead of paginating or filtering server-side?** Because the playlist is ~85 songs for two people. Loading it all means search, favourite filters, and mood filters are pure client-side operations — instant, no network, no loading states. That's the right call at this scale and the wrong call at 100,000 songs. Recognising which situation you're in is the skill.

```tsx
<MusicLibrary
  songs={songs.map((song) => ({
    id: song.id, youtubeVideoId: song.youtubeVideoId, title: song.title, artist: song.artist,
    thumbnail: song.thumbnail, duration: song.duration,
    moodIds: song.moodTags.map((tag) => tag.moodId),
    favoritedByMe: song.favorites.some((f) => f.userId === user.id),
    favoritedByPartner: partner ? song.favorites.some((f) => f.userId === partner.id) : false,
    memories: song.memories.map((m) => ({ id: m.id, title: m.title, description: m.description })),
  }))}
  moods={moods}
  initialMoodId={initialMoodId}
  partnerName={partner?.name ?? null}
  playlistTitle={PLAYLIST_TITLE}
  lastSyncedAt={syncState?.playlistLastSyncedAt?.toISOString() ?? null}
  syncError={syncState?.playlistSyncError ?? null}
  unavailableCount={unavailableCount}
  stale={stale}
/>
```

🧠 **This `.map()` is the server→client boundary, and it does real work.** Three transformations:

1. **Flattening relations into scalars.** `moodTags: [{ moodId: "x" }]` becomes `moodIds: ["x"]`. Less data over the wire and a simpler shape for the client's filter code.
2. **Resolving "who favourited this" into two booleans.** The client never sees user ids at all — it just gets `favoritedByMe` and `favoritedByPartner`. 🔎 That's both less data *and* less exposure: the partner's user id never reaches the browser.
3. **`.toISOString()` on the timestamp.** The mandatory `Date` → string conversion for anything crossing to a client component.

This is the pattern to internalise: **the server component's job is to fetch, authorise, and shape; the client component's job is to interact.**

## 10.4 `app/(app)/music/music-library.tsx`

`"use client"` — the interactive library.

```tsx
const [query, setQuery] = useState("");
const [filter, setFilter] = useState<Filter>("all");
const [moodId, setMoodId] = useState<string | null>(initialMoodId);
const [openSong, setOpenSong] = useState<LibrarySong | null>(null);
```

Four pieces of state: the search text, the favourite filter, the mood filter, and which song's detail sheet is open. Note `moodId` is *seeded* from `initialMoodId` — arriving from `/music?mood=xyz` pre-selects that mood, but the user can then change it freely.

`openSong` holds the whole song object, not just an id. That saves a lookup and means the sheet always has complete data.

```tsx
const visible = useMemo(() => {
  const needle = query.trim().toLowerCase();

  return songs.filter((song) => {
    if (moodId && !song.moodIds.includes(moodId)) return false;
    if (filter === "mine" && !song.favoritedByMe) return false;
    if (filter === "theirs" && !song.favoritedByPartner) return false;
    if (filter === "ours" && !(song.favoritedByMe && song.favoritedByPartner)) return false;

    if (needle) {
      const haystack = `${song.title} ${song.artist ?? ""}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });
}, [songs, query, filter, moodId]);
```

🧠 **`useMemo` prevents re-filtering on unrelated renders.** Every keystroke re-runs this (correctly — `query` changed), but a re-render triggered by, say, the player's progress does not.

The filter reads as a series of **early rejections** — the standard, readable way to compose predicates. Cheap checks first, string search last.

`title + " " + artist` searched together means typing "sanchez" finds "Until I Found You". Case-insensitive on both sides.

```tsx
const queue = visible.map((song) => ({
  id: song.id, youtubeVideoId: song.youtubeVideoId, title: song.title,
  artist: song.artist, thumbnail: song.thumbnail, duration: song.duration,
}));
```

🔎 **The queue is the *filtered* list.** This is a meaningful behaviour: filter to "Late Night", press a song, and next/previous walk only Late Night songs. That's what a user expects from a filtered view, and it falls out of passing `queue` down to each `TrackRow`.

```tsx
const filters: Array<{ key: Filter; label: string; icon: LucideIcon }> = [
  { key: "all",    label: "All songs",      icon: ListMusic },
  { key: "mine",   label: "My favourites",  icon: Heart },
  { key: "theirs", label: `${partnerName?.split(" ")[0] ?? "Their"} favourites`, icon: UserRound },
  { key: "ours",   label: "Ours",           icon: HeartHandshake },
];
```

The "theirs" label uses the partner's actual first name — "Sarah's favourites", not "Their favourites". Small personalisation, big effect.

### Header and controls

```tsx
<p className="mt-1.5 text-xs text-ink-faint">
  {songs.length} {songs.length === 1 ? "song" : "songs"}
  {lastSyncedAt ? ` · Last synced ${formatRelative(lastSyncedAt)}` : ""}
</p>
```

Exactly PRD §7's "Last synced: Today, 10:42 AM" — as a relative time.

```tsx
<Button size="sm" onClick={() => queue.length > 0 && player.playQueue(queue, 0)} disabled={queue.length === 0}>
  <Play className="h-4 w-4" fill="currentColor" /> Play all
</Button>

<Button size="sm" variant="outline" disabled={queue.length === 0}
  onClick={() => {
    if (queue.length === 0) return;
    if (!player.shuffle) player.toggleShuffle();
    player.playQueue(queue, Math.floor(Math.random() * queue.length));
  }}>
  <Shuffle className="h-4 w-4" /> Shuffle
</Button>
```

The shuffle button does two things: it **turns shuffle mode on** (if it isn't), and starts from a random index. Just shuffling the order but starting at song 1 would feel wrong. Both buttons are `disabled` when nothing is visible, and both re-check inside the handler — belt and braces.

```tsx
<Input value={query} onChange={(event) => setQuery(event.target.value)}
  placeholder="Search our songs…" aria-label="Search songs" className="h-9 w-full max-w-56 sm:ml-auto" />
```

A controlled input. `sm:ml-auto` pushes it to the right on wider screens; on mobile it takes a full row.

```tsx
{filters.map((item) => (
  <Button key={item.key} size="chip" variant={filter === item.key ? "selected" : "chip"}
    onClick={() => setFilter(item.key)} aria-pressed={filter === item.key}>
    <item.icon aria-hidden className="h-3.5 w-3.5" /> {item.label}
  </Button>
))}
```

Chip filters driven by the variant system. `aria-pressed` again.

```tsx
{moods.map((mood) => (
  <Button key={mood.id} size="chip" variant={moodId === mood.id ? "soft" : "quiet"}
    onClick={() => setMoodId(moodId === mood.id ? null : mood.id)} aria-pressed={moodId === mood.id}>
    <MoodIcon mood={mood} className="h-3.5 w-3.5" /> {mood.name}
  </Button>
))}
```

Mood chips are self-toggling — clicking the active one clears it. There's also an explicit "Any mood" chip, because discoverable is better than clever.

🔎 Note the two chip rows use *different* variant pairs (`selected`/`chip` vs `soft`/`quiet`). That's a visual hierarchy: the favourite filter is the primary axis, mood is secondary.

### The list

```tsx
{visible.length === 0 ? (
  <EmptyState icon={SearchX} title="Nothing here yet"
    description={songs.length === 0
      ? "Your playlist synced, but it looks empty. Add a song on YouTube and press Sync Now."
      : "No songs match this filter. Try another mood or clear the search."} />
) : (
  <div className="animate-fade-in space-y-0.5">
    {visible.map((song, index) => (
      <div key={song.id} className="flex items-center gap-1">
        <div className="min-w-0 flex-1">
          <TrackRow
            track={{
              …song fields…,
              memory: song.memories[0]?.description ?? song.memories[0]?.title ?? null,
              moods: moods.filter((mood) => song.moodIds.includes(mood.id)),
            }}
            index={index}
            queue={queue}
          />
        </div>
        <Button variant="quiet" size="icon-sm" onClick={() => setOpenSong(song)}
          aria-label={`Details for ${song.title}`} className="shrink-0 hover:bg-sunken">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </div>
    ))}
  </div>
)}
```

🔎 **Two different empty states from one component.** "Your library is genuinely empty" and "your filter matched nothing" are different problems needing different instructions. Collapsing them into one generic message is a small failure of care that users notice.

`moods.filter(mood => song.moodIds.includes(mood.id))` resolves the flat id array back into full mood objects for display — the inverse of the flattening done in the server component.

`memory: memories[0]?.description ?? memories[0]?.title ?? null` — the same "story, else title, else nothing" chain as Home.

```tsx
{unavailableCount > 0 ? (
  <p className="text-center text-xs text-ink-faint">
    {unavailableCount} {unavailableCount === 1 ? "song is" : "songs are"} no longer in your
    YouTube playlist. We keep them so your memories stay attached.
  </p>
) : null}
```

🔎 **This footnote is the `isAvailable` design surfacing to the user**, and it does something rare: it explains a *deliberate* behaviour that might otherwise look like a bug ("why is my count 85 when YouTube says 83?"). Note it even conjugates "is"/"are" correctly.

```tsx
{openSong ? <SongSheet song={openSong} moods={moods} onClose={() => setOpenSong(null)} /> : null}
```

The modal is conditionally *mounted* here — unlike the player, there's no state to preserve, so mounting/unmounting is correct and simpler.

## 10.5 `app/(app)/music/song-sheet.tsx`

The per-song panel: tag moods, view memories, attach a new one.

```tsx
const [taggedIds, setTaggedIds] = useState(new Set(song.moodIds));
const [, startTransition] = useTransition();
const [state, formAction, pending] = useActionState(createMemory, null);
```

Three state hooks. Note `new Set(song.moodIds)` **without** a lazy initialiser here — a minor inconsistency with `FavoritesProvider`; the Set is tiny, so it's inconsequential, but the lazy form is the better habit.

```tsx
useEffect(() => {
  if (state?.success) onClose();
}, [state?.success, onClose]);
```

🧠 **Reacting to an action result via an effect.** `useActionState` gives you the result as state, so "close the sheet on success" becomes "run an effect when success appears". Depending on `state?.success` (the value, not the object) means the effect fires when it changes from `undefined` to `"Memory saved"`.

```tsx
useEffect(() => {
  function onKey(event: KeyboardEvent) {
    if (event.key === "Escape") onClose();
  }
  window.addEventListener("keydown", onKey);
  return () => window.removeEventListener("keydown", onKey);
}, [onClose]);
```

Escape-to-close, with the listener properly removed on unmount. 🔎 This is a baseline expectation for any modal — along with the click-outside handler below and the `aria-modal` attributes. (A full implementation would also trap focus inside the dialog; this one doesn't, which is the main accessibility gap in the app.)

```tsx
function tag(moodId: string) {
  setTaggedIds((previous) => {
    const next = new Set(previous);
    if (next.has(moodId)) next.delete(moodId); else next.add(moodId);
    return next;
  });

  startTransition(async () => {
    try { await toggleSongMood(song.id, moodId); }
    catch { setTaggedIds(new Set(song.moodIds)); }
  });
}
```

The optimistic pattern again. Rollback resets to the original prop rather than inverting — for a multi-select, resetting to known-good server state is safer than trying to undo one step.

```tsx
<div className="fixed inset-0 z-70 flex items-end justify-center sm:items-center"
  role="dialog" aria-modal="true" aria-label={`Details for ${song.title}`}>

  <Button unstyled aria-label="Close" onClick={onClose}
    className="absolute inset-0 bg-(--scrim) backdrop-blur-sm" />

  <div className="relative max-h-[88dvh] w-full max-w-lg overflow-y-auto rounded-t-xl3 border border-line bg-raised p-6 shadow-2xl sm:rounded-xl3">
```

- `items-end sm:items-center` — 🔎 a **bottom sheet on mobile, a centred modal on desktop.** One component, two idioms, chosen by a single responsive utility. Reinforced by `rounded-t-xl3 sm:rounded-xl3`: only the top corners are rounded when it's a sheet.
- **The scrim is a `<Button unstyled>`, not a `<div onClick>`.** That's the accessibility-correct choice: it's keyboard focusable, activates on Enter, and carries `aria-label="Close"`. Using `unstyled` is exactly what that prop is for.
- `bg-(--scrim)` — Tailwind v4 syntax for a raw CSS variable, so the overlay darkness is theme-aware.
- `max-h-[88dvh] overflow-y-auto` — never taller than the viewport, scrolls internally.
- `role="dialog" aria-modal="true"` announce it as a modal.

```tsx
<form action={formAction} className="space-y-4">
  <input type="hidden" name="songId" value={song.id} />
  <Field label="Title"><Input name="title" required maxLength={120} placeholder="Our first road trip" /></Field>
  <Field label="What happened?"><Textarea name="description" rows={3} maxLength={2000} placeholder="We listened to this the whole way there." /></Field>
  <Field label="When"><Input name="date" type="date" /></Field>
  …
</form>
```

🧠 **`<form action={formAction}>` with named inputs, and no `onSubmit`, no state per field.** The browser collects the values into `FormData` and Next.js posts them to the Server Action. That's the whole data flow.

The hidden `songId` is why this form and the standalone memory form can share one action.

⚠️ **The hidden input is *not* trusted.** `createMemory` calls `assertSongInCouple` on whatever arrives. A tampered value matches nothing and throws. This is the concrete illustration of "the UI is not authorisation".

`required` and `maxLength` mirror the zod rules — client-side for UX, server-side for enforcement.

```tsx
{state?.error ? <p role="alert" className="text-sm text-primary">{state.error}</p> : null}
```

`role="alert"` makes screen readers announce the message immediately when it appears. Used consistently for errors across every form in the app; `role="status"` (politer) is used for successes.

```tsx
<Button type="submit" disabled={pending} className="flex-1">
  <Heart className="h-4 w-4 fill-current" />
  {pending ? "Saving…" : "Save memory"}
</Button>
```

`pending` from `useActionState` drives both the disabled state (no double submits) and the label. Note `type="submit"` explicitly, because `Button` defaults to `"button"`.

### `MemoryItem`

```tsx
function MemoryItem({ memory }: { memory: { id: string; title: string; description: string | null } }) {
  const [, startTransition] = useTransition();
  const [removed, setRemoved] = useState(false);

  if (removed) return null;

  return (
    <li …>
      …
      <Button unstyled onClick={() => {
        setRemoved(true);
        startTransition(async () => {
          try { await deleteMemory(memory.id); }
          catch { setRemoved(false); }
        });
      }} …>
        <Trash2 className="h-3.5 w-3.5" aria-hidden /> Remove
      </Button>
    </li>
  );
}
```

🔎 **Optimistic deletion via self-removal.** The item hides itself immediately by returning `null`, then calls the action; on failure it reappears. The alternative — lifting a "deleted ids" set into the parent — would be more code for the same effect. This same `removed` pattern appears in `NoteCard` and `MemoryCard`.

## 10.6 `app/(app)/music/sync-button.tsx`

```tsx
export function SyncButton() {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-3">
      {message ? <span className="text-xs text-ink-soft" role="status">{message}</span> : null}

      <Button type="button" variant="outline" size="sm" disabled={pending}
        onClick={() => startTransition(async () => {
          setMessage(null);
          const result = await syncNow();
          setMessage(result?.error ?? result?.success ?? null);
          setTimeout(() => setMessage(null), 6000);
        })}>
        <RefreshCw className={cn("h-4 w-4", pending && "animate-spin")} />
        {pending ? "Syncing…" : "Sync now"}
      </Button>
    </div>
  );
}
```

PRD §7's "Sync Now". Notes:

- **A plain action, not a form action** — there's no input, so `useTransition` + a direct call is simpler than `useActionState`.
- `animate-spin` on the refresh icon while pending. Tailwind's built-in spin; a genuinely good use of animation as status.
- `result?.error ?? result?.success ?? null` — one message slot for either outcome.
- `setTimeout(… 6000)` auto-clears the message. ⚠️ The timeout isn't cleared on unmount, so navigating away within 6 seconds leaves a `setState` on an unmounted component. React 18+ no longer warns and it's harmless, but the tidy version would store the id in a ref and clear it. Worth noticing as the one small rough edge in an otherwise careful file.
- `disabled={pending}` prevents concurrent syncs from the button.

🔎 This component is reused verbatim by [youtube-settings.tsx](<app/(app)/settings/youtube-settings.tsx>) — a Server Component importing a Client Component from another route folder. Perfectly legal, and the right call over duplicating it.

## 10.7 `app/(app)/music/background-sync.tsx`

```tsx
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

      if (result?.success && result.success !== "Already up to date") {
        router.refresh();
      }
    });
  }, [stale, router]);

  if (!syncing) return null;

  return (
    <p role="status" className="animate-fade-in text-xs text-ink-faint" aria-live="polite">
      Checking YouTube for changes…
    </p>
  );
}
```

Small component, and the resolution of PRD §7's central performance problem.

**The problem:** syncing during server render would block first paint on ~4 YouTube round-trips plus ~85 database upserts — every five minutes, for a library that's already sitting in Postgres.

**The solution:** the server decides *whether* a sync is due; this client component performs it *after paint*.

Four mechanisms:

1. **`fired` as a `useRef` guard.** ⚠️ Effects can run twice in development (React Strict Mode intentionally double-invokes them to surface bugs), and could re-run if `router` changed identity. A ref survives re-renders and is *not* state, so setting it triggers nothing. This is the standard "run exactly once, ever" guard — and getting it wrong here would mean double-syncing.

2. **`router.refresh()` only when something changed.** Comparing against the literal `"Already up to date"` avoids a pointless re-render of the whole route. 🔎 `router.refresh()` re-runs the Server Components and reconciles the new tree into the existing one — so client state (your search text, the playing song) survives. It's not a page reload.

3. **`role="status"` + `aria-live="polite"`** — announces "Checking YouTube for changes…" to screen readers without interrupting. `polite` waits for a pause; `assertive` would cut in.

4. **Renders `null` when idle** — zero visual footprint most of the time.

⚠️ The string comparison is the fragile coupling flagged in §7.6. A shared constant would be better.

## 10.8 `app/(app)/love/page.tsx`

```tsx
const { user, couple, partner } = await requireCoupleContext();

if (!partner) {
  return (
    <EmptyState icon={Mail} title="Notes need someone to read them"
      description="Once your partner joins your space, you can start leaving little messages for each other."
      action={<Link href="/onboarding/invite"><Button><UserPlus className="h-4 w-4" />Invite your partner</Button></Link>} />
  );
}
```

An early return for the no-partner case — the whole feature is meaningless alone, so rather than render a disabled composer it explains why and offers the fix.

```tsx
const notes = await db.loveNote.findMany({
  where: {
    coupleId: couple.id,
    OR: [
      { senderId: user.id },
      {
        recipientId: user.id,
        OR: [{ deliverAt: null }, { deliverAt: { lte: new Date() } }],
      },
    ],
  },
  orderBy: { createdAt: "desc" },
  include: { sender: { select: { id: true, name: true } } },
});
```

🧠 **This nested `OR` is the most intricate query in the codebase, and it encodes a real rule.** Read it as two branches:

- **`senderId: user.id`** — notes you wrote, *unconditionally*. Including scheduled ones that haven't landed yet, so you can see what you've queued up.
- **`recipientId: user.id` AND (`deliverAt` is null OR in the past)** — notes written to you, but **only if they're due**.

So a scheduled note is visible to its author immediately and invisible to its recipient until the appointed time. Both halves of the feature, in one `where` clause, with no cron job. That's PRD §10's "optional scheduled delivery" implemented as a query.

⚠️ Everything is scoped by `coupleId` first, so no other couple's notes can appear regardless of the OR logic.

```tsx
<LoveNotes
  notes={notes.map((note) => ({
    id: note.id, content: note.content, isRead: note.isRead, isFavorite: note.isFavorite,
    createdAt: note.createdAt.toISOString(),
    deliverAt: note.deliverAt?.toISOString() ?? null,
    isMine: note.senderId === user.id,
    senderName: note.sender.name,
  }))}
  partnerName={partner.name}
/>
```

Again the boundary shaping: dates to ISO strings, and `senderId === user.id` resolved into an `isMine` boolean so the client never handles user ids.

## 10.9 `app/(app)/love/love-notes.tsx`

```tsx
const [tab, setTab] = useState<Tab>("all");

const visible = notes.filter((note) => {
  if (tab === "received")   return !note.isMine;
  if (tab === "sent")       return note.isMine;
  if (tab === "favourites") return note.isFavorite;
  return true;
});

const unread = notes.filter((note) => !note.isMine && !note.isRead).length;
```

Client-side tab filtering — no `useMemo` here, and that's a defensible call: the list is small and the filter is trivial. (Consistency with the music library would argue for it; correctness doesn't require it.)

```tsx
{ key: "received", label: `For me${unread > 0 ? ` (${unread})` : ""}`, icon: Mail },
```

An unread badge folded into the tab label, hidden at zero.

### `Composer`

```tsx
const [state, formAction, pending] = useActionState(sendNote, null);
const [showSchedule, setShowSchedule] = useState(false);
const formRef = useRef<HTMLFormElement>(null);

useEffect(() => {
  if (state?.success) formRef.current?.reset();
}, [state?.success]);
```

🧠 **`useRef` on a DOM node.** `formRef.current` is the real `<form>` element, so `.reset()` clears every field natively — no per-field state to manage. Attaching the ref is just `<form ref={formRef}>`.

🔎 The comment notes that the schedule panel deliberately **stays open** after a successful send, so you can queue several notes in a row. Resetting everything would be the naive choice; this preserves the user's mode.

```tsx
{showSchedule ? (
  <label className="block space-y-1.5">
    <span className="label block">Deliver later</span>
    <input type="datetime-local" name="deliverAt" className="h-10 rounded-xl border border-line bg-raised px-3 text-sm focus:border-accent focus:outline-none" />
    <span className="block text-xs text-ink-faint">They won&rsquo;t see it until then.</span>
  </label>
) : null}
```

⚠️ When hidden, the input is **not in the DOM**, so `formData.get("deliverAt")` returns `null` and the zod `.optional()` handles it. Rendering it hidden with CSS would submit an empty string instead — which the transform also handles, but not rendering it is cleaner.

`datetime-local` gives a native date+time picker. The hint sentence is what makes the feature comprehensible.

```tsx
<Button type="button" variant="ghost" size="sm" onClick={() => setShowSchedule((on) => !on)}>
  {showSchedule ? <Send className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
  {showSchedule ? "Send now instead" : "Schedule it"}
</Button>
```

Both the icon and the label reflect the *next* action. `type="button"` is critical — inside a form, a default-type button would submit it.

### `NoteCard`

```tsx
const [isFavorite, setIsFavorite] = useState(note.isFavorite);
const [removed, setRemoved] = useState(false);
const [, startTransition] = useTransition();
const seen = useRef(note.isRead || note.isMine);

useEffect(() => {
  if (seen.current) return;
  seen.current = true;
  startTransition(async () => {
    try { await markNoteRead(note.id); }
    catch { /* stays unread; retry next visit */ }
  });
}, [note.id]);
```

🔎 **Opening the page is the read receipt.** No "mark as read" button — rendering the note *is* reading it, which is how messaging apps behave.

`seen` is initialised to `note.isRead || note.isMine`: already-read notes and your own notes need no receipt, so the effect returns immediately. A ref rather than state, because flipping it must not re-render.

The silent catch is right for this: a failed receipt just means the note stays unread and the next visit retries.

```tsx
const scheduled = note.deliverAt ? new Date(note.deliverAt) > new Date() : false;
```

Recomputed client-side, so a note whose time passes while you're on the page will show as delivered on the next render.

```tsx
<Card className={cn("transition-colors", !note.isMine && !note.isRead && "border-line-strong bg-blush/40")}>
```

Unread notes *addressed to you* get a tinted background — a subtle, non-badge way to say "new".

```tsx
<p className="label">
  {note.isMine ? "From me" : `From ${note.senderName ?? "them"}`}
  {scheduled ? " · scheduled" : ""}
</p>
<span className="text-xs text-ink-faint">
  {scheduled && note.deliverAt
    ? `arrives ${new Date(note.deliverAt).toLocaleString()}`
    : formatRelative(note.createdAt)}
</span>
```

A scheduled note shows its **future** arrival time; a delivered one shows a relative creation time. Two different questions, two different answers.

```tsx
<p className="font-serif text-lg leading-relaxed whitespace-pre-wrap">{note.content}</p>
```

⚠️ **`whitespace-pre-wrap` is essential and easy to forget.** HTML collapses newlines by default, so a note written across several lines would render as one paragraph. This preserves the author's line breaks while still wrapping long lines.

`font-serif` — love notes are set in the romantic serif, unlike UI text.

Below: an optimistic Keep/Kept favourite toggle, and a Delete button **rendered only when `note.isMine`** — matching the server-side rule in `deleteNote`. The UI and the action agree, and the action doesn't depend on the UI.
## 10.10 `app/(app)/memories/page.tsx`

```tsx
const [memories, songs] = await Promise.all([
  db.memory.findMany({
    where: { coupleId: couple.id },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    include: {
      song: { select: { id: true, youtubeVideoId: true, title: true, artist: true, thumbnail: true, duration: true } },
      createdBy: { select: { name: true } },
    },
  }),
  db.song.findMany({
    where: { coupleId: couple.id, isAvailable: true },
    orderBy: { position: "asc" },
    select: { id: true, title: true, artist: true },
  }),
]);
```

Two queries: the memories (with their optional song and their author's name), and a lightweight song list for the "attach a song" `<select>`.

Note the second query selects only three fields — the dropdown needs id, title, and artist, nothing else. Compare with the first query's `song` include, which pulls the full `PlayerTrack` shape because those songs are *playable* from memory cards.

```tsx
memories.map((memory) => ({
  id: memory.id, title: memory.title, description: memory.description,
  date: memory.date?.toISOString() ?? null,
  createdByName: memory.createdBy.name,
  song: memory.song,
}))
```

`date?.toISOString() ?? null` — optional chaining then a null fallback, for a nullable `Date` crossing to the client. `memory.song` passes through as-is because it's already all scalars.

## 10.11 `app/(app)/memories/memory-board.tsx`

```tsx
const [composing, setComposing] = useState(false);
```

One piece of state: is the form open?

```tsx
<Button size="sm" onClick={() => setComposing((on) => !on)}>
  {composing ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
  {composing ? "Never mind" : "Add a memory"}
</Button>
```

The same "label reflects the next action" pattern, with the app's voice ("Never mind", not "Cancel").

```tsx
{memories.length === 0 ? (
  <EmptyState icon={Sparkles} title="No memories yet"
    description="Write down the first one — a trip, a night in, the day everything changed."
    action={<Button onClick={() => setComposing(true)}><Plus className="h-4 w-4" />Add a memory</Button>} />
) : (
  <ul className="stagger grid gap-4 sm:grid-cols-2">
    {memories.map((memory) => <MemoryCard key={memory.id} memory={memory} />)}
  </ul>
)}
```

🔎 The empty-state description gives **examples** rather than instructions. "A trip, a night in, the day everything changed" tells you what kind of thing belongs here far better than "Enter a memory title".

`className="stagger grid gap-4 sm:grid-cols-2"` — combining the custom stagger animation with a responsive grid: one column on mobile, two above 640px, children fading up in sequence.

### `MemoryForm`

```tsx
const [state, formAction, pending] = useActionState(createMemory, null);
const formRef = useRef<HTMLFormElement>(null);

useEffect(() => {
  if (state?.success) {
    formRef.current?.reset();
    onDone();
  }
}, [state?.success, onDone]);
```

Same pattern as the composer, but here it also closes the form via the `onDone` callback — a memory is a one-off, unlike notes you might write several of.

```tsx
<Field label="Song" hint="Optional — ties the memory to your music.">
  <select name="songId" defaultValue=""
    className="h-11 w-full rounded-xl border border-line bg-raised px-3 text-sm focus:border-accent focus:outline-none">
    <option value="">No song</option>
    {songs.map((song) => (
      <option key={song.id} value={song.id}>
        {song.title}{song.artist ? ` — ${song.artist}` : ""}
      </option>
    ))}
  </select>
</Field>
```

An uncontrolled `<select>` with `defaultValue=""`. The `<option value="">No song</option>` submits an empty string, which `memorySchema`'s `.transform(value => value || null)` converts to `null`. That's the empty-string→null conversion from §7.5 doing its job.

`{song.artist ? \` — ${song.artist}\` : ""}` — the em dash only appears when there's an artist to put after it.

🔎 A native `<select>` rather than a custom dropdown: it's keyboard accessible, works with screen readers, and on mobile it opens the OS picker. Only the box is styled; the popup is the platform's.

### `MemoryCard`

```tsx
<Card className="hoverable flex h-full flex-col">
  {memory.date ? <p className="label mb-2">{formatDate(memory.date)}</p> : null}
  <h2 className="display text-2xl leading-tight">{memory.title}</h2>

  {memory.description ? (
    <p className="mt-2 flex-1 text-sm leading-relaxed text-ink-soft">{memory.description}</p>
  ) : (
    <div className="flex-1" />
  )}
  …
</Card>
```

⚠️ **The `<div className="flex-1" />` is a deliberate layout spacer.** In a two-column grid, cards in the same row stretch to the tallest. `h-full flex flex-col` plus a `flex-1` element in the middle pushes the song block and footer to the bottom. Without the spacer, a card with no description would have its footer floating in the middle while its neighbour's sat at the bottom. That's the kind of misalignment that makes a grid look broken.

```tsx
{memory.song ? (
  <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-sunken px-4 py-3">
    <div className="min-w-0">
      <p className="flex items-center gap-1.5 text-sm font-medium">
        <Music2 className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
        <span className="truncate">{memory.song.title}</span>
      </p>
      <p className="truncate text-xs text-ink-soft">{memory.song.artist ?? "Unknown artist"}</p>
    </div>
    <PlayForUsButton track={memory.song} />
  </div>
) : null}
```

🔎 **This block is PRD §27's thesis from the other direction.** On the Music page, a song shows its memory. Here, a memory shows its song — and you can play it, right there, from the memory. The two features point at each other, which is what makes the app more than a playlist with a diary bolted on.

`min-w-0` + `truncate` again, so a long title can't push the play button off the card.

Footer: attribution ("Added by Alex") and the same optimistic self-removing delete as `MemoryItem`.

## 10.12 `app/(app)/us/page.tsx`

The relationship page — PRD §3 "Us", §5, and §12.

```tsx
const [myFavorites, theirFavorites, counts] = await Promise.all([
  favoritesFor(couple.id, user.id),
  partner ? favoritesFor(couple.id, partner.id) : Promise.resolve([]),
  Promise.all([
    db.song.count({ where: { coupleId: couple.id, isAvailable: true } }),
    db.loveNote.count({ where: { coupleId: couple.id } }),
    db.memory.count({ where: { coupleId: couple.id } }),
  ]),
]);

const [songCount, noteCount, memoryCount] = counts;
```

🧠 **A nested `Promise.all`.** The inner one runs three `count` queries concurrently; the outer runs those *and* the two favourite queries concurrently. Five queries, one round-trip's worth of latency.

`Promise.resolve([])` for the no-partner case keeps the array shape uniform — the destructuring below doesn't need a special case.

```tsx
const theirIds = new Set(theirFavorites.map((song) => song.id));
const shared = myFavorites.filter((song) => theirIds.has(song.id));
const sharedIds = new Set(shared.map((song) => song.id));

const mineOnly = myFavorites.filter((song) => !sharedIds.has(song.id));
const theirsOnly = theirFavorites.filter((song) => !sharedIds.has(song.id));
```

🧠 **Set intersection and difference, computed in the app rather than SQL.** Build a Set of their ids, filter yours against it → the shared songs. Build a Set of *those* ids, filter both lists against it → the exclusive songs.

🔎 Why in JavaScript? Because both lists are already loaded and small. Doing it in SQL would mean two more queries with `INTERSECT`/`EXCEPT` for no benefit. Note the use of Sets rather than nested `.includes()` — the same O(1)-vs-O(n) instinct as `lib/sync.ts`.

The result is exactly PRD §12's three groups: "Ours 💖", "Alex's favorites ❤️", "Sarah's favorites 💕" — with each song appearing in exactly one group.

```tsx
const myFirstName = user.name?.split(" ")[0] ?? "Me";
const theirFirstName = partner?.name?.split(" ")[0] ?? "Them";
```

First names for the group headings, with fallbacks.

### `favoritesFor`

```tsx
async function favoritesFor(coupleId: string, userId: string) {
  const rows = await db.favorite.findMany({
    where: { userId, song: { coupleId, isAvailable: true } },
    orderBy: { createdAt: "desc" },
    include: { song: { select: { id: true, youtubeVideoId: true, title: true, artist: true, thumbnail: true, duration: true } } },
  });
  return rows.map((row) => row.song);
}
```

Query the join table, filter through the relation (`song: { coupleId, isAvailable }`), include the song, then **map to just the songs**. The caller gets `PlayerTrack[]` and never sees a `Favorite` row.

`orderBy: { createdAt: "desc" }` — most recently favourited first, so newly loved songs surface.

### The stats and info cards

```tsx
function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card className="hoverable py-5 text-center">
      <p className="display text-3xl text-primary">{value.toLocaleString()}</p>
      <p className="label mt-1">{label}</p>
    </Card>
  );
}
```

Big serif number, small uppercase label. `toLocaleString()` for separators.

```tsx
<dl className="space-y-3 text-sm">
  <div className="flex justify-between gap-4">
    <dt className="text-ink-soft">Together since</dt>
    <dd>{startDate ? formatDate(startDate) : "—"}</dd>
  </div>
  …
</dl>
```

🔎 **`<dl>`/`<dt>`/`<dd>` is the correct semantic markup for label–value pairs.** A description list, not a table and not divs. Screen readers announce the relationship. The em dash `—` for missing values is better than an empty cell — it says "known to be absent".

```tsx
<ul className="space-y-3">
  <PartnerRow name={user.name} avatar={user.avatar} suffix="(you)" />
  {partner ? <PartnerRow name={partner.name} avatar={partner.avatar} /> : (
    <li className="flex items-center justify-between gap-3">
      <span className="text-sm text-ink-soft">Waiting for your partner</span>
      <Link href="/onboarding/invite"><Button variant="soft" size="sm"><UserPlus className="h-4 w-4" />Invite</Button></Link>
    </li>
  )}
</ul>
```

```tsx
function PartnerRow({ name, avatar, suffix }: { … }) {
  return (
    <li className="flex items-center gap-3">
      {avatar ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatar} alt="" className="h-9 w-9 rounded-full object-cover" />
      ) : (
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-blush text-sm font-medium text-primary">
          {name ? name.charAt(0).toUpperCase() : <UserRound className="h-4 w-4" aria-hidden />}
        </span>
      )}
      <span className="text-sm">{name ?? "Someone"}{suffix ? <span className="ml-1.5 text-ink-faint">{suffix}</span> : null}</span>
    </li>
  );
}
```

**A two-level avatar fallback:** the Clerk image, else a monogram circle, else a generic person icon. Each layer handles a real case — avatar is nullable, and so is name.

### `FavoriteGroup`

```tsx
{songs.length === 0 ? (
  <p className="text-sm text-ink-faint">{empty}</p>
) : (
  <div className="space-y-0.5">
    {songs.map((song) => <TrackRow key={song.id} track={song} queue={songs} showMemory={false} />)}
  </div>
)}
```

- **`queue={songs}`** — playing from a favourites group queues *that group*. Play "Ours" and you're listening to your shared favourites, in order.
- **`showMemory={false}`** — memories are omitted here to keep the three lists scannable. The same `TrackRow` component, configured differently per context.
- Each group has bespoke empty copy: "Nothing you both love yet — favourite the same song and it lands here." 🔎 That sentence *teaches the feature*. A generic "No songs" would leave the user with no idea how "Ours" gets populated.

## 10.13 `app/(app)/mood/page.tsx`

```tsx
const [moods, myCheckIn, theirCheckIn, taggedCounts] = await Promise.all([
  db.mood.findMany({ where: { coupleId: couple.id }, orderBy: { sortOrder: "asc" } }),
  db.moodCheckIn.findFirst({ where: { coupleId: couple.id, userId: user.id }, orderBy: { createdAt: "desc" }, include: { mood: true } }),
  partner ? db.moodCheckIn.findFirst({ where: { coupleId: couple.id, userId: partner.id }, orderBy: { createdAt: "desc" }, include: { mood: true } }) : null,
  db.songMood.groupBy({ by: ["moodId"], _count: { songId: true }, where: { mood: { coupleId: couple.id } } }),
]);
```

The two `findFirst` + `orderBy: { createdAt: "desc" }` queries are the append-only "current mood" derivation from §4.9 — the newest row wins.

```ts
db.songMood.groupBy({ by: ["moodId"], _count: { songId: true }, where: { mood: { coupleId: couple.id } } })
```

🧠 **`groupBy` is Prisma's `GROUP BY`.** This returns one row per mood with a count of tagged songs — `SELECT moodId, COUNT(songId) FROM SongMood WHERE … GROUP BY moodId`. The alternative would be seven separate count queries, or loading every `SongMood` row and counting in JavaScript. This is one query that does the aggregation in the database, which is where aggregation belongs.

`where: { mood: { coupleId } }` filters through the relation, so another couple's tags can't be counted.

```tsx
const countByMood = new Map(taggedCounts.map((row) => [row.moodId, row._count.songId]));
```

`groupBy` returns an array; a `Map` makes the per-mood lookup in the render loop O(1).

```tsx
if (moods.length === 0) {
  return <EmptyState icon={SmilePlus} title="No moods yet"
    description="Something went wrong seeding your moods. Try recreating your space, or tag songs from the Music page." />;
}
```

🔎 A "this shouldn't happen" guard. Moods are seeded atomically with the couple, so an empty list means something genuinely broke — and the message says so honestly and offers a workaround, rather than rendering an empty grid.

```tsx
<MoodCheckIn moods={moods} currentMoodId={myCheckIn?.moodId ?? null} />
```

Non-compact here — this is the page's hero, centred and larger.

```tsx
{theirCheckIn ? (
  <Card className="text-center">
    <p className="label mb-2">{partner?.name?.split(" ")[0] ?? "They"} felt</p>
    <p className="display flex items-center justify-center gap-2.5 text-3xl">
      <MoodIcon mood={theirCheckIn.mood} className="h-6 w-6 text-primary" />
      {theirCheckIn.mood.name}
    </p>
    <p className="mt-1.5 text-xs text-ink-faint">{formatRelative(theirCheckIn.createdAt)}</p>
  </Card>
) : null}
```

🔎 **"Sarah felt Late Night · 2h ago" is the emotional payload of the whole mood feature.** Past tense ("felt") plus a relative timestamp, which is honest — a check-in from this morning shouldn't be presented as how they feel right now. That's a careful choice.

`<MoodIcon mood={theirCheckIn.mood} …>` receives the full Prisma `Mood` row, which satisfies the minimal `MoodIconRef` structural type from §9.2.

```tsx
<Link href={`/music?mood=${mood.id}`} className="card hoverable flex items-center gap-4 px-5 py-4 hover:border-line-strong">
  <span aria-hidden className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blush text-primary">
    <MoodIcon mood={mood} className="h-5 w-5" />
  </span>
  <span className="min-w-0 flex-1">
    <span className="block text-sm font-medium">{mood.name}</span>
    <span className="block text-xs text-ink-faint">
      {count === 0 ? "No songs tagged yet" : `${count} ${count === 1 ? "song" : "songs"}`}
    </span>
  </span>
</Link>
```

Each mood links to the pre-filtered library. Note the `card` class applied directly to a `<Link>` — the component classes in `globals.css` aren't tied to the `Card` component.

⚠️ Note the children are `<span>`s, not `<div>`s. An `<a>` may not contain block-level elements in valid HTML; `block`-displayed spans give the same layout legally.

```tsx
<p className="mt-4 text-center text-xs text-ink-faint">
  Tag songs with a mood from the details menu on any song in{" "}
  <Link href="/music" className="underline underline-offset-4">Music</Link>.
</p>
```

Inline documentation. The mood-tagging UI lives behind a `⋯` button on the Music page, which is genuinely hard to discover — so the page that depends on it says where to find it.

## 10.14 `app/(app)/settings/page.tsx`

```tsx
const { user, couple, partner } = await requireCoupleContext();
const songCount = await db.song.count({ where: { coupleId: couple.id } });
```

Note this count has **no `isAvailable` filter** — Settings shows the total row count including hidden songs, because that's the honest number for a status panel.

Five sections, each with a `label` heading and an icon:

```tsx
<section>
  <h2 className="label mb-3 flex items-center gap-1.5">
    <UserRound className="h-3.5 w-3.5" aria-hidden /> Account
  </h2>
  <Card className="flex items-center justify-between gap-4">
    <div className="min-w-0">
      <p className="truncate text-sm font-medium">{user.name}</p>
      <p className="truncate text-xs text-ink-faint">{user.email}</p>
    </div>
    <UserButton />
  </Card>
</section>
```

🔎 `<UserButton />` is Clerk's avatar menu — profile management, security settings, sign out, all handled by Clerk. That's the entire "Account" section of PRD §18, delegated. Writing profile editing yourself would be weeks of work for a worse result.

```tsx
<CoupleSettings
  name={couple.name}
  relationshipStartDate={couple.relationshipStartDate?.toISOString().slice(0, 10) ?? ""}
  anniversaryDate={couple.anniversaryDate?.toISOString().slice(0, 10) ?? ""}
  inviteCode={couple.inviteCode}
  partnerName={partner?.name ?? null}
/>
```

⚠️ **`.toISOString().slice(0, 10)` is a required conversion.** `<input type="date">` accepts *only* `YYYY-MM-DD`. A full ISO timestamp (`2026-08-14T00:00:00.000Z`) is silently rejected and the field renders empty. Slicing the first 10 characters gives exactly the date portion. `?? ""` for a missing date, since an uncontrolled input needs a string.

```tsx
<YouTubeSettings
  songCount={songCount}
  lastSyncedLabel={couple.playlistLastSyncedAt ? formatRelative(couple.playlistLastSyncedAt) : null}
  syncError={couple.playlistSyncError}
  needsApiKey={!process.env.YOUTUBE_API_KEY}
/>
```

🔎 **`needsApiKey={!process.env.YOUTUBE_API_KEY}`** — reading a server-only env var in a Server Component and passing down a **boolean**. The key itself never crosses the boundary; only the fact of its absence. That's exactly the right shape for this.

`formatRelative` is called on the server here, so "3m ago" is fixed at render time. Acceptable for a settings panel.

## 10.15 `app/(app)/settings/couple-settings.tsx`

```tsx
const [state, formAction, pending] = useActionState(updateCouple, null);
```

```tsx
<Field label="Name of our space">
  <Input name="name" defaultValue={name} required maxLength={60} />
</Field>

<div className="grid gap-4 sm:grid-cols-2">
  <Field label="Together since"><Input name="relationshipStartDate" type="date" defaultValue={relationshipStartDate} /></Field>
  <Field label="Anniversary"><Input name="anniversaryDate" type="date" defaultValue={anniversaryDate} /></Field>
</div>
```

🧠 **`defaultValue`, not `value` — these are uncontrolled inputs.** The browser owns the value; React sets only the initial one. No `useState` per field, no re-render per keystroke, and the Server Action reads the final values from `FormData`. For a form that posts to the server, this is strictly less code and less to go wrong than controlled inputs.

Both error and success messages render, with `role="alert"` and `role="status"` respectively.

### `InviteCode`

```tsx
{partnerName ? (
  <p className="flex items-center gap-1.5 text-sm">
    {partnerName}
    <span className="flex items-center gap-1.5 text-ink-faint">
      — you&rsquo;re both here
      <Heart className="h-3.5 w-3.5 fill-current text-primary" aria-hidden />
    </span>
  </p>
) : (
  <InviteCode code={inviteCode} />
)}
```

Once both partners are in, the invite section becomes a small confirmation instead. The code isn't just hidden — it's replaced with something meaningful.

```tsx
<p className="display text-2xl tracking-[0.28em] text-primary select-all">{code}</p>
```

- `tracking-[0.28em]` — wide letter spacing so each character is individually legible. Essential for something people read aloud.
- **`select-all`** — 🔎 clicking anywhere on the code selects the whole thing, so a copy can't accidentally omit a character. A one-word fix for a real failure mode.

```tsx
<Button type="button" variant="ghost" size="sm" disabled={pending}
  onClick={() => startTransition(async () => {
    const result = await regenerateInviteCode();
    setError(result?.error ?? null);
  })}>
  <RefreshCw className={cn("h-4 w-4", pending && "animate-spin")} />
  {pending ? "Refreshing…" : "Generate a new code"}
</Button>
```

`useTransition` + a direct call, since there's no form data. The new code appears because `regenerateInviteCode` calls `revalidatePath("/settings")`, which re-runs the Server Component and streams down the new value.

## 10.16 `app/(app)/settings/appearance-settings.tsx`

```tsx
const OPTIONS: Array<{ value: string; label: string; hint: string; icon: LucideIcon }> = [
  { value: "ROMANTIC", label: "Romantic", hint: "Warm cream and deep rose", icon: Heart },
  { value: "LIGHT",    label: "Light",    hint: "Clean and quiet",         icon: Sun },
  { value: "DARK",     label: "Dark",     hint: "For late nights",         icon: Moon },
];
```

The three themes from PRD §18, with descriptions that convey the *feeling* rather than the hex codes.

```tsx
<form action={formAction} className="space-y-3">
  <div className="grid gap-3 sm:grid-cols-3">
    {OPTIONS.map((option) => (
      <Button key={option.value} unstyled type="submit" name="theme" value={option.value}
        disabled={pending} aria-pressed={current === option.value}
        className={cn("rounded-xl2 border px-4 py-4 text-left transition-colors",
          current === option.value ? "border-primary bg-blush" : "border-line hover:border-line-strong")}>
        …
      </Button>
    ))}
  </div>
</form>
```

🧠 **Three submit buttons in one form, each with `name="theme"` and a different `value`.** This is a genuinely elegant piece of plain-HTML technique: when a `<button type="submit" name="x" value="y">` is clicked, `x=y` is included in the submitted form data — and only the clicked button contributes. So one form and no JavaScript state gives you a three-way radio group where each option is a one-click action.

No "Save" button needed. Click a theme and it applies.

The whole card is the button (`unstyled` + a bespoke bordered surface), so the entire tile is clickable rather than just a small radio dot.

`aria-pressed={current === option.value}` communicates selection accessibly.

🔎 What happens next is worth tracing: `setTheme` writes the database, sets the cookie, and calls `revalidatePath("/", "layout")`. The root layout re-renders, reads the new cookie, and stamps a new `data-theme` on `<html>`. Every colour in the app changes because the CSS variables under that selector now resolve differently. No client-side theme provider, no `localStorage` sync, no flash.

## 10.17 `app/(app)/settings/youtube-settings.tsx`

⚠️ **Note: no `"use client"`.** This is a **Server Component** that imports and renders `<SyncButton />`, a Client Component. That direction is allowed (server can render client, never the reverse) and it means the setup instructions and playlist status are server-rendered while only the interactive button ships JavaScript.

```tsx
<p className="text-sm font-medium">{PLAYLIST_TITLE}</p>
<p className="mt-0.5 text-xs text-ink-faint">
  {songCount} {songCount === 1 ? "song" : "songs"}
  {lastSyncedLabel ? ` · Last synced ${lastSyncedLabel}` : " · Never synced"}
</p>
<a href={PLAYLIST_URL} target="_blank" rel="noreferrer" className="…">
  Open on YouTube <ExternalLink className="h-3.5 w-3.5" aria-hidden />
</a>
```

- `" · Never synced"` — an explicit state rather than an absent one. "Never synced" tells you something; a missing line doesn't.
- `target="_blank" rel="noreferrer"` — 🔎 `rel="noreferrer"` is a security measure. Without it, the opened page gets a `window.opener` reference back to your page and can navigate it elsewhere ("tabnabbing"), plus it receives your URL as a referrer.
- A raw `<a>` (not `<Link>`) because it's an external URL — `<Link>` is for internal routes only.

```tsx
{needsApiKey ? (
  <div className="space-y-2 rounded-xl border border-line-strong bg-blush/40 px-4 py-3.5">
    <p className="text-sm text-primary">YouTube API key missing — the library can&rsquo;t load yet.</p>
    <ol className="list-decimal space-y-1 pl-4 text-xs text-ink-soft">
      <li>Google Cloud → <strong>APIs &amp; Services → Library</strong> → enable <strong>YouTube Data API v3</strong></li>
      <li><strong>Credentials → Create credentials → API key</strong></li>
      <li>Add it to <code>.env</code> as <code>YOUTUBE_API_KEY=…</code>, then restart <code>npm run dev</code></li>
    </ol>
    <p className="text-xs text-ink-faint">
      No consent screen, no OAuth client, and nothing to reconnect — the key only reads one public playlist.
    </p>
  </div>
) : syncError ? (
  <p className="rounded-xl border border-line-strong bg-blush/40 px-4 py-3 text-sm text-primary">{syncError}</p>
) : null}
```

🔎 **In-app setup instructions.** Rather than "Configuration error", the missing-key state renders the exact three steps, in order, with the actual UI labels from Google Cloud. That's documentation placed where the problem is discovered.

The `needsApiKey ? … : syncError ? … : null` chain sets a priority: a missing key is the *cause* of most sync errors, so showing both would be noise.

```tsx
<p className="border-t border-line pt-4 text-xs text-ink-faint">
  Add or remove songs in the YouTube playlist itself and press Sync now —
  the library follows it, including order. Songs removed upstream are kept
  but hidden, so any memories attached to them survive.
</p>
```

The mental model, stated plainly: YouTube is the source of truth, and removals are soft. Users who understand this won't be surprised by the "2 songs are no longer in your playlist" footnote on Music.

## 10.18 `app/(app)/settings/danger-zone.tsx`

```tsx
const [state, formAction, pending] = useActionState(deleteCoupleSpace, null);
const [open, setOpen] = useState(false);
```

```tsx
<Card className="border-line-strong">
  <p className="text-sm font-medium">Delete our space</p>
  <p className="mt-1 text-sm text-ink-soft">
    This removes every song, note, memory, and mood in{" "}
    <strong className="text-ink">{coupleName}</strong>. It cannot be undone.
  </p>
```

🔎 **The warning enumerates what is destroyed** ("every song, note, memory, and mood") and names the space. Vague warnings get dismissed; specific ones get read.

```tsx
{open ? (
  <form action={formAction} className="mt-5 space-y-4">
    <Field label={`Type "${coupleName}" to confirm`}>
      <Input name="confirm" autoComplete="off" placeholder={coupleName} />
    </Field>
    …
  </form>
) : (
  <Button type="button" variant="danger" size="sm" className="mt-4" onClick={() => setOpen(true)}>
    <Trash2 className="h-4 w-4" /> Delete our space
  </Button>
)}
```

**Two-step destruction:** click to reveal, then type the exact name. Matched server-side in `deleteCoupleSpace` — the client-side reveal is convenience, the string comparison on the server is the actual gate.

`autoComplete="off"` stops the browser helpfully offering to fill it in, which would defeat the purpose.

The `danger` variant is an *outlined* rose button rather than a solid red one. 🔎 Consistent with the app's restraint: it reads as serious without shouting, and the two-step flow carries the weight instead.

"Keep it" as the cancel label, rather than "Cancel".

## 10.19 The `loading.tsx` files

Seven nearly identical files, one per route:

```tsx
import { PageSkeleton } from "@/components/ui";
export default function Loading() { return <PageSkeleton cards={3} />; }
```

| Route | `cards` |
| --- | --- |
| home | 3 |
| music | 6 |
| love | 3 |
| memories | 4 |
| us | 3 |
| mood | 3 |
| settings | 5 |

🧠 **How `loading.tsx` works.** Next.js automatically wraps the sibling `page.tsx` in a React `<Suspense>` boundary with this file as the fallback. While the page's server-side `await`s are pending, the skeleton streams to the browser immediately — so the user sees the app's structure right away instead of a blank screen or a spinner. When the data resolves, the real content streams in and replaces it.

The `cards` count is tuned so each skeleton roughly matches the density of its page, which minimises the visual jump on swap.

🔎 **This is streaming SSR in three lines per route.** No loading state in your components, no `isLoading` booleans, no spinner components. The framework does it because the file exists.

## 10.20 `app/onboarding/page.tsx`

```tsx
export default async function OnboardingPage() {
  const user = await requireUser();
  const couple = await getCoupleForUser(user.id);

  if (couple) redirect("/home");
  …
}
```

⚠️ Note it calls `requireUser()`, **not** `requireCoupleContext()`. Using the latter would redirect to `/onboarding`… from `/onboarding`. An infinite loop. The guard here is the inverse: *already* have a couple? Go home.

🔎 This is why `lib/auth.ts` exports both helpers. Pages inside `(app)/` need "must have a couple"; onboarding needs "must be signed in, must *not* have a couple".

```tsx
<main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-6 py-16">
  <div className="mb-8 text-center">
    <p className="label mb-3">Step one</p>
    <h1 className="display text-4xl sm:text-5xl">Create our space</h1>
    <p className="mt-3 text-sm leading-relaxed text-ink-soft">
      Somewhere that belongs to the two of you. You can change any of this later.
    </p>
  </div>
  <OnboardingForms />
</main>
```

"Step one" plus "You can change any of this later" — 🔎 both reduce commitment anxiety at the exact moment a new user might hesitate.

Note there's no `(app)` layout here: no sidebar, no player, no nav. Onboarding is a focused single-purpose screen, which is why it sits outside the route group.

## 10.21 `app/onboarding/onboarding-forms.tsx`

```tsx
const [mode, setMode] = useState<Mode>("create");

<div role="tablist" aria-label="Set up your space" className="grid grid-cols-2 gap-1 rounded-full border border-line bg-sunken p-1">
  <TabButton active={mode === "create"} onClick={() => setMode("create")} label="Start a new space" />
  <TabButton active={mode === "join"}   onClick={() => setMode("join")}   label="Join with a code" />
</div>

{mode === "create" ? <CreateSpaceForm /> : <JoinSpaceForm />}
```

🔎 **Both paths on one screen.** Partner 1 creates; partner 2 joins. Putting them side by side means neither person has to hunt for the right entry point, and it's immediately obvious that both exist.

`role="tablist"` + `role="tab"` + `aria-selected` on the buttons (see `TabButton`) is the ARIA tabs pattern, so screen readers understand this is a mode switch rather than two unrelated buttons.

The pill container is `bg-sunken` with `p-1`, and the active tab is `bg-raised` — a "physical inset track with a raised thumb" look, which is the standard segmented-control idiom.

```tsx
function CreateSpaceForm() {
  const [state, formAction, pending] = useActionState(createCouple, null);
  return (
    <Card>
      <form action={formAction} className="space-y-5">
        <Field label="What should we call it?" hint="For example: Alex + Sarah">
          <Input name="name" required maxLength={60} autoComplete="off" placeholder="Alex + Sarah" />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Together since" hint="Powers your day counter."><Input name="relationshipStartDate" type="date" /></Field>
          <Field label="Anniversary" hint="Optional."><Input name="anniversaryDate" type="date" /></Field>
        </div>
        …
      </form>
    </Card>
  );
}
```

Every field has a hint doing real work: an example for the name, and "Powers your day counter" explaining *why* the start date is worth entering. That's the difference between a form people fill in and one they skip.

```tsx
function JoinSpaceForm() {
  …
  <Field label="Invite code" hint="The eight characters your partner shared with you.">
    <Input name="inviteCode" required autoComplete="off" autoCapitalize="characters" spellCheck={false}
      placeholder="ABCD2345" className="text-center text-lg tracking-[0.3em] uppercase" />
  </Field>
  …
}
```

🔎 **Four attributes tuned for entering a code**, and each one prevents a real annoyance:
- `autoCapitalize="characters"` — mobile keyboards start in caps.
- `spellCheck={false}` — no red squiggle under a random string.
- `autoComplete="off"` — no irrelevant saved-value dropdown.
- `uppercase tracking-[0.3em] text-center` — visually matches how the code is displayed on the invite screen, so it *looks* like the same thing.

(And `joinSchema` uppercases and strips separators server-side anyway, so even a sloppy paste works.)

## 10.22 `app/onboarding/invite/page.tsx`

```tsx
const user = await requireUser();
const couple = await getCoupleForUser(user.id);

if (!couple) redirect("/onboarding");
if (couple.partner2Id) redirect("/home");
```

Two guards: no couple → go back a step; both partners already in → this step is done.

```tsx
const headerList = await headers();
const host = headerList.get("host") ?? "localhost:3000";
const protocol = host.startsWith("localhost") ? "http" : "https";
const inviteUrl = `${protocol}://${host}/join/${couple.inviteCode}`;
```

🧠 **Building an absolute URL from the request.** `headers()` is a request-time API (and async in Next.js 16), so unlike static `metadata` this page *can* read the real host. That means the invite link is correct on localhost, on a preview deployment, and in production, with no environment variable.

The protocol sniff is a pragmatic heuristic: localhost is http, everything else https. (A `x-forwarded-proto` check would be more rigorous behind some proxies.)

Compare with [lib/site.ts](lib/site.ts) §6.1, which *can't* do this because static metadata is evaluated without a request. Two different problems, two different solutions — worth understanding the distinction.

The rest of the page: "Step two", the couple name in bold, the `<InviteShare>` card, a "Continue to our home" button, and the reassurance "You can share this code any time from Settings" — so nobody feels trapped on this screen.

## 10.23 `app/onboarding/invite/invite-share.tsx`

```tsx
const [copied, setCopied] = useState<"code" | "link" | null>(null);

async function copy(value: string, which: "code" | "link") {
  try {
    await navigator.clipboard.writeText(value);
    setCopied(which);
    setTimeout(() => setCopied(null), 2000);
  } catch {
    // Clipboard blocked (insecure origin or denied permission) — the code is
    // on screen to type manually, so there's nothing to recover from.
  }
}
```

🔎 **One state value tracking *which* thing was copied**, typed as a union rather than two booleans. Two booleans could both be true, which is a state that shouldn't exist.

The `setTimeout` reverts the button to "Copy" after 2 seconds — feedback that doesn't need dismissing.

⚠️ **The `try/catch` around the Clipboard API is necessary.** `navigator.clipboard` requires a secure context (HTTPS or localhost) and can be permission-denied. The comment explains the reasoning for swallowing it: the code is visible on screen, so a failed copy has an obvious manual fallback and an error message would just be noise. That's a well-reasoned empty catch.

```tsx
<p className="display text-4xl tracking-[0.28em] text-primary select-all">{code}</p>
```

Same treatment as Settings: wide tracking, `select-all`.

```tsx
<code className="flex-1 truncate rounded-lg bg-sunken px-3 py-2.5 text-xs text-ink-soft">{url}</code>
```

The link in a `<code>` element — semantically correct for a literal string, and monospaced so it's clearly something to copy rather than read.

Two copy targets, because the two work in different situations: the code for reading aloud or typing, the link for pasting into a chat.

## 10.24 `app/join/[code]/page.tsx`

The public invite landing page. The most state-dependent page in the app.

```tsx
export default async function JoinPage({ params }: PageProps<"/join/[code]">) {
  const { code } = await params;
  const inviteCode = code.toUpperCase();

  const couple = await db.couple.findUnique({
    where: { inviteCode },
    select: { id: true, name: true, partner1Id: true, partner2Id: true, partner1: { select: { name: true } } },
  });

  const clerkUserId = await getUserId();
  …
}
```

- `await params` — dynamic segments are Promises in Next.js 16.
- `.toUpperCase()` — so `/join/abcd2345` works as well as `/join/ABCD2345`.
- **`getUserId()`, not `requireUser()`.** ⚠️ Critical: this page must render for people who aren't signed in — that's the whole point of an invite link. `requireUser()` would redirect them to sign-in and they'd lose the context of who invited them.
- The `select` is narrow: enough to render the invitation, nothing more. 🔎 Deliberate, since this page is reachable by anyone with the URL.

```tsx
{!couple ? <InvalidCode /> : couple.partner2Id ? <FullSpace name={couple.name} /> : <Invitation … />}
```

Three states, three components:

**1. Bad code:**

```tsx
<Card className="space-y-4 text-center">
  <IconBadge icon={SearchX} />
  <h1 className="display text-3xl">This invite didn&rsquo;t work</h1>
  <p className="text-sm text-ink-soft">
    The code <strong className="text-ink">{inviteCode}</strong> doesn&rsquo;t match any space.
    Double-check it with your partner.
  </p>
  <Link href="/"><Button variant="outline"><ArrowLeft className="h-4 w-4" />Back to start</Button></Link>
</Card>
```

Echoes the code back so the user can spot a typo, and gives an action rather than a dead end.

**2. Already full:** "{name} is complete — Both partners have already joined this space."

**3. A real invitation:**

```tsx
async function Invitation({ coupleName, inviterName, inviteCode, isSignedIn }: { … }) {
  if (isSignedIn) {
    const user = await requireUser();
    const existing = await getCoupleForUser(user.id);
    if (existing) redirect("/home");
  }
  …
}
```

🧠 **An `async` child component doing its own data fetching.** Server Components compose freely — the parent doesn't need to hoist this query. And it's conditional: the extra lookup only happens for signed-in visitors, so a logged-out invitee pays nothing.

The check prevents a confusing state: someone already in a space clicking an invite link would otherwise see a join button that's guaranteed to fail.

```tsx
<IconBadge icon={Heart} className="mb-4 animate-heartbeat" iconClassName="fill-current" />
<h1 className="display text-3xl leading-tight">{coupleName}</h1>
<p className="mt-3 text-sm leading-relaxed text-ink-soft">
  {inviterName ? (
    <><strong className="font-medium text-ink">{inviterName}</strong> made a little space for the two of you.</>
  ) : (
    <>Someone made a little space for the two of you.</>
  )}
</p>
```

🔎 **"Alex made a little space for the two of you."** This is the emotional peak of the onboarding flow, and it's carried by one sentence and a beating heart. The `animate-heartbeat` double-pulse (§8.2) is used exactly once in the app, here, where it means the most. That's what "use animation sparingly" looks like in practice.

The two `className` props on `IconBadge` (§9.2) are what allow the animation on the circle and the fill on the heart.

```tsx
{isSignedIn ? (
  <AcceptInvite inviteCode={inviteCode} />
) : (
  <div className="space-y-3">
    <Link href={`/sign-up?redirect_url=${encodeURIComponent(`/join/${inviteCode}`)}`} className="block">
      <Button size="lg" className="w-full"><UserPlus className="h-4.5 w-4.5" />Create an account to join</Button>
    </Link>
    <Link href={`/sign-in?redirect_url=${encodeURIComponent(`/join/${inviteCode}`)}`} className="block">
      <Button variant="ghost" size="sm" className="w-full">I already have an account</Button>
    </Link>
  </div>
)}
```

🧠 **`redirect_url` is what makes the flow survive authentication.** Clerk reads that parameter and returns the user to it after sign-up/sign-in — so they land back on `/join/ABCD2345`, now signed in, and see the join button. Without it they'd end up on `/home`, hit the onboarding redirect, and have to find the code again.

`encodeURIComponent` correctly escapes the path so the `/` characters don't break the query string.

Sign-up is the primary action (an invitee usually has no account); sign-in is the quiet secondary.

## 10.25 `app/join/[code]/accept-invite.tsx`

```tsx
export function AcceptInvite({ inviteCode }: { inviteCode: string }) {
  const [state, formAction, pending] = useActionState(joinCouple, null);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="inviteCode" value={inviteCode} />
      {state?.error ? <p role="alert" className="text-sm text-primary">{state.error}</p> : null}
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        <Heart className="h-4.5 w-4.5 fill-current" />
        {pending ? "Joining…" : "Join our space"}
      </Button>
    </form>
  );
}
```

The smallest client component in the app. It reuses `joinCouple` — the same action the manual code form on onboarding uses — with the code supplied as a hidden input instead of typed.

⚠️ And once more: the hidden input is untrusted. `joinCouple` validates the code, checks the couple exists, checks it isn't yours, checks the second slot is free. A tampered value fails on the server, which is the only place it matters.
---

# Part 11 — End-to-end feature traces

Reading files one at a time tells you what each does. These traces show how they cooperate. Follow one with the files open beside you and the architecture clicks.

## 11.1 Trace: sign up → create a space → invite → partner joins

```
1.  Visitor opens  /
    app/page.tsx renders. <Show when="signed-in"> is false → "Get started" button.

2.  Clicks "Get started" → /sign-up
    app/sign-up/[[...sign-up]]/page.tsx renders Clerk's <SignUp />.
    Clerk handles email verification / OAuth entirely. No app code involved.

3.  Clerk redirects to /home
    proxy.ts has attached the session.
    app/(app)/layout.tsx runs requireCoupleContext()
      → requireUser()  → currentUser() succeeds
                       → db.user.upsert(...)  ← the local User row is created HERE
      → getCoupleForUser(user.id) → null
      → redirect("/onboarding")

4.  /onboarding
    app/onboarding/page.tsx: requireUser() ok, getCoupleForUser → null, so it renders.
    <OnboardingForms /> mounts with mode = "create".

5.  Fills in "Alex + Sarah" + dates, submits.
    <form action={formAction}> POSTs FormData to createCouple.

6.  lib/actions/couple.ts → createCouple
      requireUser()                    → authenticate
      getCoupleForUser()               → still null, proceed
      createCoupleSchema.safeParse()   → validate + convert dates
      uniqueInviteCode()               → crypto.randomInt loop, DB uniqueness check
      db.couple.create({ …, moods: { create: DEFAULT_MOODS… } })
                                       → 1 Couple row + 7 Mood rows, one transaction
      redirect("/onboarding/invite")   ← OUTSIDE the try block

7.  /onboarding/invite
    Guards pass (couple exists, partner2Id null).
    headers() → host → builds  https://host/join/ABCD2345
    <InviteShare code url /> renders both copy buttons.

8.  Alex copies the link and texts it to Sarah.

9.  Sarah opens /join/ABCD2345  (not signed in)
    app/join/[code]/page.tsx
      await params → "ABCD2345"
      db.couple.findUnique({ where: { inviteCode } }) → found, partner2Id null
      getUserId() → null   ← note: getUserId, not requireUser
      → <Invitation isSignedIn={false} />
        "Alex made a little space for the two of you."
        → /sign-up?redirect_url=%2Fjoin%2FABCD2345

10. Sarah signs up. Clerk returns her to /join/ABCD2345, now signed in.

11. Same page, different branch
      getUserId() → a Clerk id
      <Invitation isSignedIn>  → requireUser() upserts Sarah's User row
                               → getCoupleForUser → null, so no redirect
      → <AcceptInvite inviteCode="ABCD2345" />

12. Sarah clicks "Join our space"
    Hidden input carries the code → joinCouple

13. lib/actions/couple.ts → joinCouple
      requireUser()                     → Sarah's row
      getCoupleForUser()                → null, proceed
      joinSchema.safeParse()            → uppercase, strip separators
      db.couple.findUnique({inviteCode}) → found
      partner1Id === user.id?           → no
      partner2Id already set?           → no
      db.couple.update({ partner2Id: sarah.id })
      redirect("/home")

14. /home now renders for both of them.
    requireCoupleContext() returns { user, couple, partner } with partner populated.
    The "your space is still missing someone" card disappears.
    Love notes become available (partner is no longer null).
```

**What to notice:** the `User` row is created lazily on first authenticated render, not by a webhook. Every guard is a redirect or a `fail()` with a specific message. And the same `joinCouple` action serves both the typed-code form and the invite link.

## 11.2 Trace: the first visit to Music (playlist import)

```
1.  Sarah clicks "Music" in the sidebar.
    <Link href="/music"> → client-side navigation. The player keeps playing.

2.  Next.js immediately renders app/(app)/music/loading.tsx
    → <PageSkeleton cards={6} />  streams to the browser at once.

3.  app/(app)/music/page.tsx runs on the server
      requireCoupleContext()
      isPlaylistStale(couple.id)
        → playlistLastSyncedAt is null (never synced) → TRUE
      await searchParams → no ?mood
      Promise.all([ songs, moods, syncState, unavailableCount ])
        → songs: []   ← the library is genuinely empty on first visit

4.  Server maps rows → the client shape and renders <MusicLibrary … stale={true} />
    Real HTML replaces the skeleton. The user sees an empty library
    with the EmptyState: "Your playlist synced, but it looks empty…"

    ↑ IMPORTANT: nothing has been fetched from YouTube yet. Paint is not blocked.

5.  Hydration. <BackgroundSync stale={true} /> mounts.
    Its useEffect fires AFTER paint:
      fired.current = true    (so it can never run twice)
      setSyncing(true)        → "Checking YouTube for changes…" appears
      syncNow()

6.  lib/actions/youtube.ts → syncNow
      requireCoupleContext()
      syncPlaylist(couple.id)

7.  lib/sync.ts → syncPlaylist
      db.couple.update → playlistSyncStatus = "SYNCING"
      listPlaylistTracks(PLAYLIST_ID)
        ├─ lib/youtube.ts → ytFetch("playlistItems", …)  page 1 (50 items)
        ├─                → ytFetch("playlistItems", …)  page 2 (35 items)
        ├─ attachDurations:  ytFetch("videos", ids 1–50)
        └─                   ytFetch("videos", ids 51–85)
                             = 4 HTTP round-trips total
      db.song.findMany → existing = []
      diff:  85 creates queued into `writes`, 0 updates, 0 removals
      db.$transaction(writes)   → all 85 rows inserted atomically
      db.couple.update → SUCCESS + playlistLastSyncedAt = now
      returns { added: 85, removed: 0, restored: 0, reordered: 0, total: 85 }

8.  back in syncNow
      revalidatePath("/music"), ("/settings"), ("/", "layout")
      returns ok("Synced — 85 added")

9.  BackgroundSync receives it
      setSyncing(false)                → the notice disappears
      result.success !== "Already up to date"  → router.refresh()

10. router.refresh() re-runs the Server Components.
    MusicPage queries again → 85 songs.
    The new tree reconciles into the existing page:
      - the song list appears
      - client state SURVIVES (search box, selected filter, playing track)
    (app)/layout.tsx also re-runs, so PlayerProvider now has an 85-song library.
```

**The second visit** (within 5 minutes) takes a different path at step 3: `isPlaylistStale` returns `false`, `<BackgroundSync stale={false} />` does nothing, and the library renders from Postgres with zero YouTube traffic.

**The key insight to take away:** this design decouples *displaying* the library from *reconciling* it. Postgres is the read path; YouTube is a background reconciliation. That's why the page is instant even though a sync takes several seconds.

## 11.3 Trace: playing a song

```
1.  User clicks a row's artwork in the Music list.
    TrackRow → player.playTrack(track, queue)
    `queue` is the CURRENTLY FILTERED list from music-library.tsx.

2.  player-provider.tsx → playTrack
      source = nextQueue           (the filtered list)
      position = source.findIndex(id match)   → e.g. 12
      current?.id === track.id?    → no
      → playQueue(source, 12)

3.  playQueue
      safeIndex = clamp(12)
      setQueue(source); setIndex(12)
      setOrder(shuffle ? shuffleOrder(len, 12) : [0,1,2,…])
      setIsPlaying(true)

4.  React re-renders. `current = queue[12]` is now the clicked track.

5.  Effect [current, isReady] fires
      playerRef.current.loadVideoById(current.youtubeVideoId)
      setProgress(0); setDuration(current.duration ?? 0)

6.  The YouTube iframe loads the video and starts.
    Its onStateChange fires with data === PlayerState.PLAYING
      setIsPlaying(true)
      setDuration(event.target.getDuration())   ← the real duration

7.  Effect [isPlaying] starts a 500ms interval
      setProgress(player.getCurrentTime())
      → the Seek fill width updates, smoothed by transition-[width]

8.  Effect [current] sets navigator.mediaSession.metadata
      → title + artist + artwork appear on the lock screen

9.  Context value changes → consumers re-render
      PlayerBar         → appears (player.current is no longer null)
      the clicked TrackRow → bg-blush/50 highlight, pause icon, overlay visible
      other TrackRows   → unchanged

10. Song ends. onStateChange fires with ENDED.
      stateRef.current.repeat === "one"?  → no
      → advance(1)
          reads order/index/repeat from stateRef (always fresh)
          positionInOrder = order.indexOf(12) → 12
          nextPosition = 13  → in range
          setIndex(order[13])
      → back to step 4 with the next track

11. User navigates to /love
    Only {children} inside <ViewTransition> swaps.
    (app)/layout.tsx, PlayerProvider, and YouTubeHost are NOT remounted.
    → the music keeps playing, uninterrupted.

12. User taps the player bar → setExpanded(true)
    YouTubeHost's className swaps from the 1×1 hidden box to the
    centred 16:9 frame. Same DOM element → no remount → no restart.
    ExpandedView slides up; its aspect-video spacer reserves the room.
```

**The two non-obvious mechanisms here** are the ones worth remembering: `stateRef` (so once-registered YouTube callbacks read current state) and CSS-only show/hide of the iframe (so nothing ever remounts).

## 11.4 Trace: favouriting a song (optimistic round-trip)

```
1.  User taps the heart on a TrackRow.
    → favorites.toggle(song.id)     [components/favorites-provider.tsx]

2.  setIds(previous => { const next = new Set(previous); next.add(id); return next; })
    A NEW Set → a new reference → React re-renders.

3.  T + ~0ms:  the heart is already filled.
      Every consumer of the context updates at once:
        - this TrackRow's heart      → text-primary + fill-current
        - the player bar's heart     → filled (same song)
        - any other row for the same song
    No spinner. No network wait.

4.  startTransition(async () => { await toggleFavorite(songId) })
    A POST goes out to the Server Action.

5.  lib/actions/song.ts → toggleFavorite
      requireCoupleContext()                    → session → user + couple
      assertSongInCouple(songId, couple.id)     → ownership check
      db.favorite.findUnique({ userId_songId }) → not found
      db.favorite.create({ userId, songId })
      revalidatePath("/music"), ("/us"), ("/home")
      return true

6a. SUCCESS (the normal case)
      The client already shows the right thing. The return value isn't even read.
      The revalidations mean the NEXT server render of those routes is fresh —
      so Home's featured-song pick and the Us page groups will reflect it.

6b. FAILURE (network error, or the ownership check threw)
      The catch block applies the inverse mutation:
        setIds(previous => { … next.delete(id) … })
      The heart quietly un-fills.
      ⚠️ No error message is shown — an accepted trade-off for a
         low-stakes toggle. It would NOT be acceptable for, say, a payment.
```

**Why this is worth studying:** three lines of state code buy the difference between an app that feels native and one that feels like a website. And the rollback branch is the price — always ask whether the operation is safe to show as done before it is.

## 11.5 Trace: sending a scheduled love note

```
1.  On /love, the user opens the composer, clicks "Schedule it".
    setShowSchedule(true) → an <input type="datetime-local" name="deliverAt"> mounts.

2.  Types a message, picks tomorrow 9:00, submits.
    FormData = { content: "…", deliverAt: "2026-08-15T09:00" }

3.  lib/actions/note.ts → sendNote
      requireCoupleContext()  → { user, couple, partner }
      partner null?           → no
      noteSchema.safeParse
        content  → trimmed, 1–2000 chars
        deliverAt → new Date("2026-08-15T09:00")  → valid
      deliverAt > now?        → yes, so it is KEPT (not normalised to null)
      db.loveNote.create({ coupleId, senderId: user.id, recipientId: partner.id, content, deliverAt })
      revalidatePath("/love"), ("/home")
      return ok("Sent")

4.  useActionState puts { success: "Sent" } into `state`.
    Composer's effect: state.success → formRef.current.reset()
    ⚠️ showSchedule stays true, deliberately — you can queue another.
    "Sent" renders with role="status".

5.  THE SENDER's view (immediately)
    /love re-renders. The query's first OR branch is `senderId: user.id`,
    UNCONDITIONAL — so the note appears right away, labelled:
      "From me · scheduled"    "arrives 15/08/2026, 09:00"

6.  THE RECIPIENT's view (before 9:00 tomorrow)
    Their /love runs the same query. The second OR branch requires
      recipientId: user.id AND (deliverAt: null OR deliverAt <= now)
    9:00 tomorrow is NOT <= now → the row does not match → invisible.
    Home's latestNote query has the same filter → also invisible.

7.  THE RECIPIENT's view (after 9:00)
    Next time they load /love, `new Date()` has moved past deliverAt.
    The row matches. It renders with bg-blush/40 (unread).
    NoteCard's effect fires: seen.current was false → markNoteRead(note.id)
      updateMany({ id, coupleId, recipientId: user.id, isRead: false })
      → isRead = true, readAt = now
    On the next render the tint is gone.
```

**The thing to appreciate:** there is no scheduler, no cron, no queue, no worker. "Delivery" is a `WHERE` clause evaluated at read time. The only functional cost is that the note becomes visible at the recipient's next page load rather than being pushed to them — and for this app, that's exactly right.

## 11.6 Trace: changing the theme

```
1.  On /settings, the user clicks the "Dark" tile.
    It is <Button type="submit" name="theme" value="DARK"> inside a <form>.
    The browser submits FormData { theme: "DARK" } — only the clicked
    button contributes its name/value pair.

2.  lib/actions/couple.ts → setTheme
      requireCoupleContext()
      z.enum(["LIGHT","DARK","ROMANTIC"]).safeParse("DARK")   → ok
      db.couple.update({ theme: "DARK" })          ← source of truth
      cookies().set("mood-swings-theme", "dark", { path:"/", maxAge: 1y, sameSite:"lax" })
                                                   ← fast SSR mirror
      revalidatePath("/", "layout")                ← invalidate EVERYTHING
      return ok("Theme updated")

3.  The root layout re-renders on the server
      (await cookies()).get(THEME_COOKIE) → "dark"
      resolveTheme("dark") → "dark"
      <html data-theme="dark" …>

4.  The browser receives the new document/RSC payload.
    Because data-theme changed, [data-theme="dark"] in globals.css now applies:
      --canvas: #140a0e   (was #fff8f5)
      --ink:    #f7ecee   (was #2a151c)
      --primary:#e8809b   (was #8b1e3f)
      color-scheme: dark
    Every utility built on those variables — bg-canvas, text-ink, bg-primary,
    border-line — resolves differently. The whole app recolours at once.
    Native scrollbars and date pickers go dark too, via color-scheme.

5.  Next page load, next day, next device on the same browser:
    the cookie is read during SSR, so the first byte of HTML already
    carries data-theme="dark". No flash of the wrong theme.

6.  A different browser (same couple):
    the cookie is absent → resolveTheme(undefined) → "romantic".
    ⚠️ Known limitation: the DB value isn't read back into the cookie on
    login, so the theme is effectively per-browser until it's set again.
    Fixing it would mean seeding the cookie from couple.theme in the
    (app) layout on first render.
```

**What to take from this:** one HTML attribute + CSS variables = a complete theming system, with no client-side JavaScript, no theme context, and no hydration flash. It works because the tokens are semantic (`--ink`, not `--dark-grey`).

## 11.7 Trace: attaching a memory to a song

```
1.  On /music, the user clicks the ⋯ button on a row.
    setOpenSong(song) → <SongSheet> mounts (a bottom sheet on mobile,
    a centred modal from sm: up).

2.  Two effects register:
      - Escape key → onClose
      - state.success → onClose

3.  The user types a title, a description, picks a date, submits.
    The form contains <input type="hidden" name="songId" value={song.id} />
    → FormData { songId, title, description, date }

4.  lib/actions/song.ts → createMemory
      requireCoupleContext()
      memorySchema.safeParse
        title       → 1–120 chars
        description → "" transformed to null
        date        → "2026-07-04" → Date, validated
        songId      → kept as a string
      songId present → assertSongInCouple(songId, couple.id)
        db.song.findFirst({ where: { id: songId, coupleId } })
        ⚠️ THIS is what makes the hidden input safe. A tampered id
           belonging to another couple matches nothing → throws.
      db.memory.create({ coupleId, createdById: user.id, title, description, date, songId })
      revalidatePath("/memories"), ("/music"), ("/home")
      return ok("Memory saved")

5.  useActionState → state.success → the effect calls onClose()
    setOpenSong(null) → the sheet unmounts.

6.  The revalidations make the next server render of three routes fresh:
      /music     → the row now shows  ♥ "We listened to this the whole way there"
      /memories  → a new card, with a play button for the song
      /home      → the featured song may now carry this memory

7.  The same memory is now reachable from three directions:
      - under the song title in the library      (track-row.tsx)
      - as a card on /memories                    (memory-board.tsx)
      - in the expanded player's "Our memory" box (player-bar.tsx, when wired)
```

## 11.8 Trace: a song is deleted from the YouTube playlist

This trace is the one that shows why `isAvailable` exists.

```
   Starting state: 85 songs. Song "X" is at position 40, has 1 memory
   attached and is favourited by both partners.

1. Someone deletes song X from the playlist on youtube.com.

2. Six minutes later, a partner opens /music.
   isPlaylistStale → last sync > 5 min → true
   The page renders from Postgres (still 85 songs, X included).
   <BackgroundSync> fires after paint.

3. syncPlaylist
     listPlaylistTracks → YouTube returns 84 items. X is absent.
     existing = 85 rows.
     existingByVideoId: 85 entries.  incomingIds: 84 ids.

     Loop over the 84 incoming tracks:
       - each is found in existingByVideoId → an UPDATE is queued
       - the 44 songs after X's old slot now have position = index,
         one lower than before → result.reordered = 44

     Removals:
       vanished = existing.filter(s => !incomingIds.has(s.youtubeVideoId) && s.isAvailable)
                = [ X ]
       → updateMany({ where: { id: X }, data: { isAvailable: false } })
         ⚠️ NOT a delete.

     db.$transaction([...84 updates, 1 updateMany])
       All positions and the flag change together — no intermediate state
       where the order is half-updated.

4. Result: { added: 0, removed: 1, restored: 0, reordered: 44, total: 84 }
   → ok("Synced — 1 removed, 44 reordered")
   → not "Already up to date" → router.refresh()

5. What the user now sees
     /music     → 84 songs. A footnote: "1 song is no longer in your YouTube
                  playlist. We keep them so your memories stay attached."
     /memories  → the memory is STILL THERE, still shows song X, still playable
                  (the Song row exists; only isAvailable is false)
     /us        → X no longer appears in the favourite groups
                  (favoritesFor filters on song: { isAvailable: true })
     the player → X is not in the library queue (the layout filters it too)
     /settings  → still reports 85 songs (no isAvailable filter there — the
                  honest total row count)

6. If the video is later re-added to the playlist:
     the next sync finds it in existingByVideoId with isAvailable === false
     and the incoming track available → result.restored += 1
     → isAvailable = true. Memory and favourites were never touched.
```

**The lesson:** a soft delete is the right call whenever other user-created data hangs off a row you don't control. The upstream system (YouTube) can remove things at will; your users' memories must not be collateral damage.

## 11.9 Trace: installing the app, then going offline

```
1.  A production build is running (npm run build && npm start).
    Root layout renders <ServiceWorkerRegistrar />.
    Its effect: NODE_ENV === "production" ✓, "serviceWorker" in navigator ✓
      → waits for window "load"
      → navigator.serviceWorker.register("/sw.js")

2.  next.config.ts served /sw.js with:
      Cache-Control: no-cache, no-store, must-revalidate
      Service-Worker-Allowed: /
    So the browser always fetches a fresh worker, and it may control the origin.

3.  public/sw.js "install" event
      caches.open("mood-swings-static-v1")
      Promise.allSettled([ cache.add("/offline"), cache.add("/icon-192.png"), cache.add("/icon-512.png") ])
        ⚠️ allSettled, not all — one 404 must not fail the whole install.
      self.skipWaiting()  → activate immediately instead of waiting for all tabs to close

4.  "activate" event
      delete every cache whose key doesn't end in "v1"  → old versions purged
      self.clients.claim()  → take control of already-open pages

5.  Meanwhile Chromium decides the site is installable and fires
    "beforeinstallprompt".
      InstallPrompt's listener calls event.preventDefault()
        → suppresses the browser's own banner
      setDeferred(event)
      env === "eligible" && deferred !== null  → the nudge card renders
      (bottom-36 md:bottom-24, so it clears the nav AND the player bar)

6.  User taps "Install"
      await deferred.prompt()       → the native install dialog
      await deferred.userChoice     → { outcome: "accepted" }
      setDeferred(null); markDismissed()
      The OS installs it; "appinstalled" fires
        → subscribe's handler sets cachedEnv = "installed"; notify()
        → useSyncExternalStore re-reads → env === "installed" → the card never returns

7.  Launched from the home screen
      app/manifest.ts gave: start_url "/home", display "standalone",
      orientation "portrait", background_color #fff8f5, theme_color #8b1e3f
      → opens at /home, full screen, no browser chrome, rose status bar.

8.  While online, every request passes through sw.js "fetch":
      request.method !== "GET"          → NOT intercepted (Server Actions are POSTs)
      request.mode === "navigate"       → network only, no caching of HTML
      /_next/static/* or /icon*         → cache-first (content-hashed, immutable)
      i.ytimg.com thumbnails           → cache-first in the images cache
      everything else                  → straight to the network

9.  Aeroplane mode, then tap the app icon.
      A navigation request is issued. fetch() rejects.
      The catch returns cache.match("/offline")
      → app/offline/page.tsx renders: "No connection… Anything already
        playing will keep going."
      Song artwork still displays, from the image cache.

    ⚠️ NO private page is ever served from cache. That is the entire
       point of the policy: a stale or mis-attributed page in a couples
       app is a privacy bug, not a UX wrinkle.
```

---

# Part 12 — PWA files

## 12.1 `public/sw.js`

The service worker. Plain JavaScript in `public/`, so it's served verbatim at `/sw.js` — it must **not** be bundled, because a service worker runs in its own worker context with a different global (`self`, not `window`).

Its header is a policy statement:

> Caching policy is deliberately conservative. Every page in this app is authenticated and personal — love notes, memories, a partner's name — so HTML responses are **NEVER** written to the cache. A stale or mis-attributed page here would be a privacy bug, not just a UX wrinkle.

🔎 Read that twice. Most PWA tutorials tell you to cache HTML for offline browsing. That advice is **wrong for an authenticated multi-user app**. A cached page could be served to a different signed-in user on a shared device, or show a partner's note after they deleted it. Caching *nothing* is strictly safer than caching carefully, and the only thing lost is offline page viewing — which this app doesn't need.

```js
const VERSION = "v1";
const STATIC_CACHE = `mood-swings-static-${VERSION}`;
const IMAGE_CACHE = `mood-swings-images-${VERSION}`;
const OFFLINE_URL = "/offline";
const PRECACHE = [OFFLINE_URL, "/icon-192.png", "/icon-512.png"];
```

🧠 **Cache names carry the version.** Bump `VERSION` to `"v2"` and the activate handler below deletes every `v1` cache. That's the standard invalidation strategy — you can't "clear" a cache by name pattern otherwise.

### Install

```js
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => Promise.allSettled(PRECACHE.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  );
});
```

- **`event.waitUntil(promise)`** — tells the browser "don't consider install finished until this resolves". Without it the worker could be killed mid-precache.
- **`Promise.allSettled`, not `Promise.all`** — ⚠️ this matters. `allSettled` resolves once every promise settles, success or failure. With `Promise.all`, a single 404 on one icon would reject and **the entire install would fail**, leaving no service worker at all. Partial precaching is far better than none.
- **`self.skipWaiting()`** — by default a new worker waits until every tab using the old one closes. This activates it immediately, so a fix ships on the next page load rather than "eventually".

### Activate

```js
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => !key.endsWith(VERSION)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});
```

Delete every cache not matching the current version, then `clients.claim()` to take control of already-open pages (which would otherwise stay with the previous worker).

### Route predicates

```js
function isImmutableAsset(url) { return url.pathname.startsWith("/_next/static/"); }
function isOwnIcon(url) { return /^\/(icon|apple-icon|favicon)/.test(url.pathname); }
function isThumbnail(url) {
  return url.hostname === "i.ytimg.com" || url.hostname === "img.youtube.com" || url.hostname === "yt3.ggpht.com";
}
```

🧠 **Why `/_next/static/` is safe to cache forever.** Next.js gives those files content-hashed names — `main-a1b2c3d4.js`. Change the content, and the filename changes. So a cached copy can never be stale: it's either the exact file you asked for, or a different URL entirely. This is why "cache-first, indefinitely" is correct here and wrong almost everywhere else.

Thumbnail hosts match the `remotePatterns` in [next.config.ts](next.config.ts) — the two lists have to agree.

### `cacheFirst`

```js
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;

  const response = await fetch(request);
  if (response && (response.ok || response.type === "opaque")) {
    cache.put(request, response.clone());
  }
  return response;
}
```

Check the cache, return a hit; otherwise fetch, store, return.

Two details:
- **`response.type === "opaque"`** — a cross-origin request without CORS (like a YouTube thumbnail) returns an *opaque* response whose `status` is `0` and whose body you can't read. `response.ok` is false for these, so without this check thumbnails would never cache. They're still perfectly usable as an `<img>` source.
- **`response.clone()`** — ⚠️ a `Response` body is a **stream that can only be read once**. Putting the original into the cache would consume it, and the caller would get an empty body. You must clone before storing. This is the single most common service-worker bug.

### Fetch

```js
self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(STATIC_CACHE);
        return (await cache.match(OFFLINE_URL))
          || new Response("You're offline.", { status: 503, headers: { "Content-Type": "text/plain" } });
      }),
    );
    return;
  }

  if (isImmutableAsset(url) || isOwnIcon(url)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE).catch(() => fetch(request)));
    return;
  }

  if (isThumbnail(url)) {
    event.respondWith(cacheFirst(request, IMAGE_CACHE).catch(() => new Response("", { status: 504 })));
    return;
  }

  // Everything else — including all app data — goes straight to the network.
});
```

Four branches, in priority order:

**1. Non-GET → return without calling `respondWith`.** 🔎 This is critical: **Server Actions are POSTs.** Returning early means the worker doesn't handle them at all and the browser proceeds normally. Interfering with them would break every form and every toggle in the app.

**2. Navigations → network, with an offline fallback.** Never a cached page. The `catch` serves the precached `/offline`, with an inline plain-text 503 as a last resort if even that is missing.

**3. Immutable assets and icons → cache-first**, with `.catch(() => fetch(request))` as a belt-and-braces retry.

**4. Thumbnails → cache-first** in a separate cache, falling back to an empty 504 (a broken image beats an unhandled rejection).

**5. Everything else → no `respondWith` at all**, so the request goes to the network untouched. That includes every RSC payload and every piece of couple data.

⚠️ **What's deliberately missing: a `push` event handler.** Push notifications (PRD §16) would need one, plus VAPID keys and a subscription store. The README names this as the notable gap rather than pretending it works.

## 12.2 `scripts/generate-icons.py`

A Python script (needs Pillow) that generates every icon from a single mathematical curve. Not part of the build — run it by hand after a palette change.

```python
DEEP_ROSE = (139, 30, 63)       # #8B1E3F
ROMANTIC_PINK = (196, 69, 105)  # #C44569
WARM_WHITE = (255, 248, 245)    # #FFF8F5
SS = 4  # supersampling factor
```

The PRD §23 palette, in RGB.

```python
def heart_points(cx, cy, scale, steps=720):
    Y_OFFSET = 2.5
    points = []
    for i in range(steps):
        t = 2 * math.pi * i / steps
        x = 16 * math.sin(t) ** 3
        y = 13 * math.cos(t) - 5 * math.cos(2*t) - 2 * math.cos(3*t) - math.cos(4*t)
        points.append((cx + x * scale, cy - (y + Y_OFFSET) * scale))
    return points
```

🧠 **The classic parametric heart curve:**

```
x = 16 sin³t
y = 13 cos t − 5 cos 2t − 2 cos 3t − cos 4t
```

Sampling `t` from 0 to 2π gives points around the outline. 720 samples for the PNGs (one every half degree) — smooth enough that a polygon looks like a curve.

**`Y_OFFSET = 2.5`** is a considered correction, documented in the docstring: the curve spans y ∈ [−17, +12], so its midpoint sits 2.5 units *above* the origin. Centring naively puts the heart visibly low in the frame. Shifting by half the asymmetry centres it **optically** rather than mathematically.

Note `cy - (...)`: screen coordinates have y increasing downward, so the mathematical y is negated.

```python
def rounded_gradient(size, radius_ratio, full_bleed=False):
    gradient = Image.new("RGB", (size, size))
    draw = ImageDraw.Draw(gradient)
    for y in range(size):
        ratio = y / max(1, size - 1)
        colour = tuple(int(DEEP_ROSE[c] + (ROMANTIC_PINK[c] - DEEP_ROSE[c]) * ratio) for c in range(3))
        draw.line([(0, y), (size, y)], fill=colour)

    if full_bleed:
        return gradient.convert("RGBA")

    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, size - 1, size - 1], radius=int(size * radius_ratio), fill=255)

    result = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    result.paste(gradient, (0, 0), mask)
    return result
```

The gradient is drawn one horizontal line at a time, **linearly interpolating** each RGB channel from deep rose to pink: `start + (end - start) * ratio`. That formula (lerp) is worth knowing — it's the same one behind every colour ramp.

Rounded corners are done with a **mask**: an 8-bit greyscale image where white means "keep". `paste(image, position, mask)` composites through it. `full_bleed=True` skips the mask entirely, because maskable icons are cropped by the platform.

```python
def make_icon(size, heart_ratio=0.0185, radius_ratio=0.22, full_bleed=False):
    big = size * SS
    canvas = rounded_gradient(big, radius_ratio, full_bleed=full_bleed)
    draw = ImageDraw.Draw(canvas)
    draw.polygon(heart_points(big / 2, big / 2, big * heart_ratio), fill=WARM_WHITE + (255,))
    return canvas.resize((size, size), Image.LANCZOS)
```

🧠 **Supersampling (also called SSAA).** Render at 4× the target size, then downscale with a high-quality filter (`LANCZOS`). The downscale averages neighbouring pixels, which produces smooth anti-aliased edges. Drawing a polygon directly at 32×32 would give visibly jagged edges — `draw.polygon` has no anti-aliasing of its own. This is the standard trick for crisp small raster art.

```python
def main():
    save(make_icon(192), "public", "icon-192.png")
    save(make_icon(512), "public", "icon-512.png")
    save(make_icon(512, heart_ratio=0.0150, full_bleed=True), "public", "icon-maskable-512.png")

    apple = make_icon(180, radius_ratio=0.0)
    save(apple.convert("RGB"), "app", "apple-icon.png")

    ico = make_icon(64, radius_ratio=0.16)
    ico.save(os.path.join(ROOT, "app", "favicon.ico"), sizes=[(16,16), (32,32), (48,48), (64,64)])

    write_svg()
```

Each output has different parameters, and each difference is a platform requirement:

| Output | Parameters | Why |
| --- | --- | --- |
| `icon-192.png`, `icon-512.png` | defaults | standard PWA icons |
| `icon-maskable-512.png` | `heart_ratio=0.0150`, `full_bleed=True` | 🔎 full bleed + a **smaller** heart, so it stays inside Android's 80% safe zone no matter which silhouette the OS crops to |
| `apple-icon.png` | `radius_ratio=0.0`, converted to RGB | ⚠️ iOS applies its **own** rounding and does not support transparency — supplying rounded corners would produce dark fringes |
| `favicon.ico` | `radius_ratio=0.16`, multi-size | slightly tighter radius reads better at 16px; `.ico` embeds several resolutions |

```python
def write_svg():
    size = 100
    points = heart_points(size / 2, size / 2, size * 0.0185, steps=180)
    path = "M " + " L ".join(f"{x:.2f} {y:.2f}" for x, y in points) + " Z"
    svg = f"""<svg …><rect … rx="22" fill="url(#g)"/><path d="{path}" fill="#FFF8F5"/></svg>"""
```

🔎 **The SVG is generated from the same function**, so the vector and raster marks are geometrically identical by construction — they cannot drift when someone tweaks one of them. 180 samples instead of 720 (a vector is scaled by the renderer, so half-degree precision is unnecessary), emitted as `M x y L x y … Z` — moveto, a chain of linetos, closepath.

That's why [app/icon.svg](app/icon.svg) contains 180 line segments instead of four elegant Bézier curves. Uglier to read; impossible to get out of sync.

## 12.3 `public/icon-*.png`, `app/apple-icon.png`, `app/favicon.ico`

Generated binaries, committed so the app works without Python installed. Regenerate with:

```bash
python3 scripts/generate-icons.py   # needs Pillow
```
---

# Part 13 — Patterns cheat-sheet & glossary

## 13.1 Server Component or Client Component?

The decision that trips up every newcomer. Use this table.

| You need to… | Component type |
| --- | --- |
| query the database | **Server** |
| read a secret env var | **Server** |
| `await` anything at render time | **Server** |
| use `cookies()` / `headers()` / `auth()` | **Server** |
| handle `onClick`, `onChange`, `onSubmit` | **Client** |
| use `useState` / `useEffect` / any hook | **Client** |
| touch `window`, `document`, `localStorage`, `navigator` | **Client** |
| use React Context | **Client** (both provider and consumer) |
| render static markup with no interaction | **Server** (the default — prefer it) |

**Rules that follow from that:**

1. **Server is the default.** Add `"use client"` only when you hit something in the right column.
2. **Push `"use client"` as far down the tree as you can.** The boundary is where the JavaScript bundle starts. This codebase does it well: [music/page.tsx](<app/(app)/music/page.tsx>) (server) fetches and shapes, [music-library.tsx](<app/(app)/music/music-library.tsx>) (client) interacts.
3. **A Server Component can render a Client Component.** Never the reverse.
4. **Props crossing the boundary must be serialisable.** No functions, no class instances, no `Date`. Call `.toISOString()`.
5. **A Client Component *can* import a Server Action** — that's how forms and toggles reach the server.
6. **`import "server-only"`** turns an accidental boundary violation into a clear build error. [lib/db.ts](lib/db.ts), [lib/auth.ts](lib/auth.ts), [lib/youtube.ts](lib/youtube.ts), and [lib/sync.ts](lib/sync.ts) all use it.

## 13.2 The recurring patterns, with file references

### Pattern: fetch on the server, shape at the boundary

```tsx
// page.tsx  (server)
const rows = await db.song.findMany({ include: { favorites: true, moodTags: true } });

return <Library songs={rows.map((song) => ({
  id: song.id,
  favoritedByMe: song.favorites.some((f) => f.userId === user.id),   // resolve
  moodIds: song.moodTags.map((t) => t.moodId),                       // flatten
  lastSyncedAt: song.updatedAt.toISOString(),                        // serialise
}))} />;
```

Seen in: [music/page.tsx](<app/(app)/music/page.tsx>), [love/page.tsx](<app/(app)/love/page.tsx>), [memories/page.tsx](<app/(app)/memories/page.tsx>).

The three jobs: **resolve** relations into scalars, **flatten** nested shapes, **serialise** dates. Less data over the wire, simpler client code, and no user ids exposed.

### Pattern: form → Server Action → `useActionState`

```tsx
"use client";
const [state, formAction, pending] = useActionState(myAction, null);

<form action={formAction}>
  <Input name="title" required maxLength={120} />
  {state?.error   ? <p role="alert">{state.error}</p>    : null}
  {state?.success ? <p role="status">{state.success}</p> : null}
  <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
</form>
```

Seen in: every form. No `onSubmit`, no per-field state, no `fetch`.

### Pattern: click → Server Action via `useTransition`

```tsx
const [pending, startTransition] = useTransition();

onClick={() => startTransition(async () => {
  const result = await someAction();
  setMessage(result?.error ?? result?.success ?? null);
})}
```

Seen in: [sync-button.tsx](<app/(app)/music/sync-button.tsx>), [couple-settings.tsx](<app/(app)/settings/couple-settings.tsx>).

For actions with no form data.

### Pattern: optimistic update with rollback

```tsx
setLocalState(next);                      // 1. update immediately

startTransition(async () => {
  try { await serverAction(id); }         // 2. tell the server
  catch { setLocalState(previous); }      // 3. undo on failure
});
```

Seen in: [favorites-provider.tsx](components/favorites-provider.tsx), [mood-check-in.tsx](components/mood-check-in.tsx), [song-sheet.tsx](<app/(app)/music/song-sheet.tsx>), [love-notes.tsx](<app/(app)/love/love-notes.tsx>), [memory-board.tsx](<app/(app)/memories/memory-board.tsx>).

### Pattern: optimistic delete by self-removal

```tsx
const [removed, setRemoved] = useState(false);
if (removed) return null;

onClick={() => {
  setRemoved(true);
  startTransition(async () => {
    try { await deleteThing(id); } catch { setRemoved(false); }
  });
}}
```

Seen in: `MemoryItem`, `NoteCard`, `MemoryCard`.

### Pattern: authorise, then act

```ts
"use server";
export async function mutate(targetId: string) {
  const { user, couple } = await requireCoupleContext();   // session → tenancy
  await assertSongInCouple(targetId, couple.id);           // ownership
  await db.thing.update({ … });
  revalidatePath("/affected");
}
```

Or the single-statement form:

```ts
await db.thing.deleteMany({ where: { id: targetId, coupleId: couple.id } });
```

Seen in: every file in [lib/actions/](lib/actions/).

### Pattern: validate with zod, report the first issue

```ts
const parsed = schema.safeParse({ name: formData.get("name") ?? undefined });
if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Please check the form.");
const { name } = parsed.data;   // fully typed
```

### Pattern: `Promise.all` for independent queries

```ts
const [a, b, c] = await Promise.all([queryA(), queryB(), condition ? queryC() : null]);
```

Seen in: every data-loading page. A non-promise in the array is fine, which is how conditional queries are skipped.

### Pattern: hide with CSS, never unmount

```tsx
<div className={visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-full opacity-0"}>
```

Seen in: [player-provider.tsx](components/player/player-provider.tsx) (`YouTubeHost`), [player-bar.tsx](components/player/player-bar.tsx) (`ExpandedView`).

Required whenever unmounting would destroy state you need — the YouTube player being the canonical case. `pointer-events-none` is essential so invisible controls aren't clickable.

### Pattern: refs for state that YouTube callbacks must read

```tsx
const stateRef = useRef({ repeat, order, index });
useEffect(() => { stateRef.current = { repeat, order, index }; }, [repeat, order, index]);
// inside a once-registered callback:
if (stateRef.current.repeat === "one") { … }
```

Seen in: [player-provider.tsx](components/player/player-provider.tsx). The fix for any callback registered once with an API that can't swap handlers.

### Pattern: run-once effect guard

```tsx
const fired = useRef(false);
useEffect(() => {
  if (!condition || fired.current) return;
  fired.current = true;
  …
}, [condition]);
```

Seen in: [background-sync.tsx](<app/(app)/music/background-sync.tsx>), and `seen` in `NoteCard`.

### Pattern: variant objects for component styling

```ts
const variants = { primary: "…", ghost: "…" } as const;
type Props = { variant?: keyof typeof variants };
```

Seen in: [components/ui.tsx](components/ui.tsx). One object defines both the styles and the valid prop values.

### Pattern: data-driven lists

```ts
const ITEMS = [{ key: "a", label: "A", icon: IconA }, …];
{ITEMS.map((item) => <Thing key={item.key} {...item} />)}
```

Seen in: [nav.tsx](components/nav.tsx), [page.tsx](app/page.tsx), the filter chips, the theme options.

### Pattern: an every-state-covered component

```tsx
if (!data)          return <EmptyState … />;      // nothing exists
if (filtered === 0) return <EmptyState … />;      // nothing matches
return <TheList />;                               // content
```

Seen in: Music, Love, Memories, Mood. **No screen in this app can render blank**, and the two "empty" cases always get different copy.

## 13.3 Common mistakes this codebase avoids

Worth reading as a checklist for your own code.

| Mistake | What this codebase does |
| --- | --- |
| Trusting a client-supplied `coupleId` | derives it from the session, every time |
| Treating a hidden UI as authorisation | re-checks ownership in every action |
| `Math.random()` for a security token | `crypto.randomInt` for invite codes |
| Ambiguous characters in a shared code | alphabet excludes `I O 0 1` |
| `redirect()` inside `try/catch` | always called outside |
| Mutating a Set/array in state | always constructs a new one |
| Naive day arithmetic | UTC-midnight normalisation in `daysTogether` |
| `array.sort(() => Math.random() - 0.5)` | proper Fisher–Yates shuffle |
| Reading `Response` twice in a SW | `response.clone()` before caching |
| `Promise.all` in a SW install | `Promise.allSettled` so one 404 doesn't abort |
| Caching HTML in an authed PWA | HTML is never cached |
| N+1 API calls | durations batched 50 at a time |
| `find()` inside a loop | `Map`/`Set` lookups |
| Hard-deleting a row other data hangs off | `isAvailable = false` |
| Non-atomic multi-row writes | `db.$transaction(writes)` |
| Blocking first paint on a slow sync | post-paint `<BackgroundSync>` |
| A new pool per hot reload | `globalThis` Prisma singleton |
| `<div onClick>` for a clickable surface | `<Button unstyled>` |
| Icon-only button with no label | `aria-label` on every one |
| Decorative icon announced by a reader | `aria-hidden` on every one |
| Colour as the only "you are here" cue | `aria-current="page"` |
| Removing focus outlines | `:focus-visible` ring, `focus-visible:opacity-100` |
| Ignoring `prefers-reduced-motion` | all motion collapses, view transitions included |
| Truncation that doesn't truncate | `min-w-0` on every flex parent |
| `<input type="date">` fed a full ISO string | `.slice(0, 10)` |
| Newlines collapsing in user text | `whitespace-pre-wrap` |
| `if (index)` where `0` is valid | `typeof index === "number"` |
| `if (days)` where `0` means today | `untilAnniversary !== null` |
| Empty string stored instead of NULL | `.transform(v => v || null)` |
| Blank env var treated as configured | `clean()` in `lib/site.ts` |
| A timer left running after unmount | cleanup returned from every effect |

Two rough edges it *doesn't* avoid, for balance:
- `setTimeout` in [sync-button.tsx](<app/(app)/music/sync-button.tsx>) isn't cleared on unmount.
- The `"Already up to date"` string couples [lib/actions/youtube.ts](lib/actions/youtube.ts) to [background-sync.tsx](<app/(app)/music/background-sync.tsx>) by literal text.

## 13.4 Glossary

**App Router** — Next.js's routing system based on the `app/` directory, with Server Components by default. (The older system is the Pages Router.)

**Client Component** — a component in a file starting with `"use client"`. Bundled and sent to the browser; can use hooks and events.

**Composite key** — a primary key made of two columns, e.g. `@@id([userId, songId])` on `Favorite`.

**Context (React)** — a way to pass a value down the tree without threading props. Requires a Client Component.

**Controlled / uncontrolled input** — controlled: React state owns the value. Uncontrolled: the DOM owns it, React sets only `defaultValue`.

**cuid** — a collision-resistant unique id. Prisma's `@default(cuid())`.

**Driver adapter** — Prisma 7's required wrapper around a real database driver. Here `PrismaPg` around `pg`.

**Debounce** — suppressing repeated work within a time window. `AUTO_SYNC_INTERVAL_MS = 5 minutes`.

**Dynamic segment** — a bracketed folder like `[code]`, matching any value and exposing it via `params`.

**Effect** — `useEffect`. Code that runs after render to synchronise with something outside React.

**Fisher–Yates** — the correct uniform array shuffle.

**Hydration** — the browser attaching React to server-rendered HTML, making it interactive.

**Hydration mismatch** — server HTML and first client render disagree. React warns; `suppressHydrationWarning` silences it for one element.

**Idempotent** — safe to run repeatedly with the same result. `syncPlaylist` is idempotent.

**JSX** — the HTML-like syntax compiled into React function calls.

**Lazy initialiser** — `useState(() => expensive())`, so the value is computed only on the first render.

**Layout** — `layout.tsx`. Wraps everything below it and persists across navigation within its subtree.

**Lerp** — linear interpolation, `start + (end - start) * ratio`. The icon gradient.

**Maskable icon** — a full-bleed PWA icon the OS may crop to any silhouette.

**Migration** — a versioned SQL file describing one schema change.

**Optimistic update** — updating the UI before the server confirms, then rolling back on failure.

**Opaque response** — a cross-origin no-CORS response with `status: 0` and an unreadable body. Still usable as an image source.

**ORM** — Object-Relational Mapper. Prisma.

**PostCSS** — a CSS transformation pipeline. Hosts the Tailwind v4 plugin.

**Prefetch** — Next.js fetching a route's payload on `<Link>` hover so navigation is instant.

**Proxy** — Next.js 16's name for what used to be Middleware. `proxy.ts`.

**PWA** — Progressive Web App: installable, offline-capable, manifest + service worker.

**Route group** — a parenthesised folder like `(app)` that shares a layout without appearing in the URL.

**RSC** — React Server Component.

**`revalidatePath`** — invalidates the cached render of a route so the next request re-renders it.

**Satori** — the renderer inside `next/og` that turns JSX into an image. Supports a CSS subset and needs TrueType fonts.

**Serialisable** — convertible to JSON. The requirement for props crossing the server→client boundary.

**Server Action** — a `"use server"` function callable from the browser but executed on the server. A public HTTP endpoint.

**Server Component** — the default in the App Router. Runs only on the server; can `await` data.

**Service worker** — a background script that intercepts network requests. Enables offline behaviour.

**Soft delete** — flagging a row inactive rather than deleting it. `Song.isAvailable`.

**SSR** — server-side rendering.

**Streaming** — sending HTML in chunks as it becomes ready. What makes `loading.tsx` work.

**Supersampling** — rendering large and downscaling for anti-aliasing. `SS = 4`.

**Suspense** — the React boundary that shows a fallback while children are pending. `loading.tsx` creates one.

**Tailwind utility** — a single-purpose class like `flex` or `text-sm`.

**Transaction** — a group of database statements that all succeed or all fail. `db.$transaction`.

**Transition (React)** — an update marked non-urgent via `useTransition`, so the UI stays responsive.

**Turbopack** — the Rust bundler Next.js 16 uses by default.

**Upsert** — insert if absent, update if present. `db.user.upsert`.

**View Transitions API** — a browser API for animating between DOM states. Driven here by React's `<ViewTransition>`.

**Zod** — a runtime schema validator that also produces TypeScript types.

---

# Part 14 — Running, verifying, and extending

## 14.1 Getting it running

**Against the hosted Supabase database** (what this project uses day to day):

```bash
# 1. Environment
cp .env.example .env
#    Supabase → Project Settings → Database → Connection string:
#      DATABASE_URL = transaction pooler, port 6543, + ?pgbouncer=true
#      DIRECT_URL   = session pooler,     port 5432
#    percent-encode reserved characters in the password (@ → %40)
#    also set YOUTUBE_API_KEY (Clerk is optional in dev)

# 2. Schema + generated client
npx prisma migrate deploy     # applies committed migrations (no shadow DB)
npx prisma generate

# 3. Run
npm run dev                   # http://localhost:3000
```

**Against a local Postgres** (useful for authoring migrations — see §4.12):

```bash
brew services start postgresql@16
createdb mood_swings
#    DATABASE_URL="postgresql://<you>@localhost:5432/mood_swings?schema=public"
#    leave DIRECT_URL unset; the CLI falls back to DATABASE_URL
npx prisma migrate dev        # applies migrations AND runs `generate`
npm run dev
```

Clerk runs in **keyless mode** with blank keys: `next dev` provisions a temporary instance and prints a claim link.

The YouTube key:
1. Google Cloud → **APIs & Services → Library** → enable **YouTube Data API v3**
2. **Credentials → Create credentials → API key**
3. `YOUTUBE_API_KEY="AIza…"` in `.env`

⚠️ If you restrict the key, use **None** or an **IP** restriction. An *HTTP referrer* restriction blocks server-side calls — the app will report that exact problem, thanks to the error mapping in [lib/youtube.ts](lib/youtube.ts).

## 14.2 Verification commands

```bash
npx tsc --noEmit    # type check
npx eslint .        # lint
npm run build       # production build (also type-checks)
npm start           # serve the build — the only way to test the service worker
npx prisma studio   # browse the database in a GUI
npm run check:db    # explains a bad DATABASE_URL in plain language
npx prisma migrate status   # which migrations the connected database has
```

## 14.3 A first-day debugging guide

| Symptom | Likely cause |
| --- | --- |
| `Cannot find module '@/lib/generated/prisma/client'` | run `npx prisma generate` (the folder is git-ignored) |
| `DATABASE_URL is not set` | no `.env`, or the Prisma CLI can't see it — check `prisma.config.ts` loads `dotenv/config` |
| `(ENOTFOUND) tenant/user postgres.<ref> not found` | Supabase project ref is stale — deleted, paused, or mistyped. Check DNS before config; §4.12 |
| Prisma can't connect but `npm run check:db` can | a reserved character in the password isn't percent-encoded (`@` → `%40`); §3.10 |
| `migrate dev` fails on shadow database / `CREATE DATABASE` | you're pointed at Supabase — use `migrate deploy`; §4.12 |
| Migrations hang or error oddly against Supabase | the CLI is on port 6543 (transaction pooler); it needs `DIRECT_URL` on 5432 |
| `PageProps<'/music'>` is an unknown type | run `next dev` once to generate `.next/dev/types/` |
| Music page is empty, no error | `YOUTUBE_API_KEY` missing — Settings shows setup steps |
| "This API key has referrer/IP restrictions…" | change the key restriction to None or IP |
| Sync says "quota exceeded" | YouTube's daily quota; resets midnight Pacific |
| Redirected to `/onboarding` in a loop | a page inside `(app)/` used `requireUser()` instead of… or vice versa; check §10.20 |
| "too many clients already" from Postgres | the `globalThis` singleton in [lib/db.ts](lib/db.ts) was bypassed |
| Theme flashes the wrong colours | the cookie isn't being read in the root layout |
| Service worker doesn't register | you're in `dev`; it's production-only by design |
| A form silently does nothing | check the `<Button>` has `type="submit"` — the default is `"button"` |
| Text won't truncate in a flex row | add `min-w-0` to the flex parent |
| A `<input type="date">` renders empty | you passed a full ISO string; `.slice(0, 10)` it |
| An optimistic toggle snaps back | the Server Action threw — check the ownership guard and the server console |

## 14.4 What is deliberately not built

From PRD §21, Version 2+:

| Feature | Status |
| --- | --- |
| Photo memories | ⚠️ schema ready (`Memory.image`), **no upload UI or storage** |
| Relationship timeline | not built; `Memory.date` would support it |
| Push notifications | not built — no `push` handler in [public/sw.js](public/sw.js), no VAPID keys, no subscription store |
| Anniversary reminders | countdown is shown; no notification |
| "Open When" letters | not built |
| AI features (§21 v3) | not built |

Two smaller gaps worth knowing:

- **`PlayerBar`'s `songMemory` prop is never passed.** The "Our memory" block in the expanded player is built but unfed, because [app/(app)/layout.tsx](<app/(app)/layout.tsx>) doesn't know which track is playing (client state). See §9.10.
- **Theme is effectively per-browser.** The DB value isn't seeded back into the cookie on a fresh browser. See §11.6.

## 14.5 Exercises, roughly in order of difficulty

Each one is chosen to exercise a specific layer.

**1. Add a fourth theme** (CSS only)
Add `[data-theme="sepia"]` to [globals.css](app/globals.css) with a full token set. Add `"sepia"` to `THEMES` in [lib/theme.ts](lib/theme.ts), `SEPIA` to the Prisma `Theme` enum (then `npx prisma migrate dev`), the zod enum in `setTheme`, and an entry in `OPTIONS` in [appearance-settings.tsx](<app/(app)/settings/appearance-settings.tsx>).
*Teaches: the token system, and how many places an enum lives.*

**2. Show a note count on the Love nav item** (client state + props)
Pass a count from [app/(app)/layout.tsx](<app/(app)/layout.tsx>) into `Sidebar`/`BottomNav` and render a badge.
*Teaches: server data reaching a client component through a layout.*

**3. Sort memories oldest-first with a toggle** (client state)
Add a `useState` sort direction to [memory-board.tsx](<app/(app)/memories/memory-board.tsx>) and sort in a `useMemo`.
*Teaches: derived state and `useMemo`.*

**4. Let a memory be edited** (a new Server Action, end to end)
Add `updateMemory(prev, formData)` to [lib/actions/song.ts](lib/actions/song.ts) — with a zod schema, `requireCoupleContext`, a `where: { id, coupleId }` scoped update, and the right `revalidatePath` calls. Then a form.
*Teaches: the whole write path, including the ownership guard.*

**5. Wire up `songMemory` in the player** (crossing the boundary)
Make the expanded player show the current song's memory. Either include memories in the layout's library query, or fetch on `current` change in a client component.
*Teaches: why this wasn't trivial in the first place.*

**6. Add a "Most played" stat** (schema change + migration)
Add a `playCount` column to `Song`, an action to increment it, a call from the player when a track starts, and a stat card on Us.
*Teaches: migrations, and where playback events actually originate.*

**7. Implement photo memories** (the real Version 2 item)
Add an upload (Vercel Blob, S3, UploadThing…), store the URL in `Memory.image`, render it on the card, and add the host to `remotePatterns` in [next.config.ts](next.config.ts).
*Teaches: file handling, external services, and the image config.*

**8. Add push notifications for new love notes** (the hardest)
Generate VAPID keys, add a `PushSubscription` model, a subscribe action, a `push` event handler in [public/sw.js](public/sw.js), and a send call in `sendNote`.
*Teaches: service worker lifecycle, the Web Push protocol, and a whole new failure surface.*

## 14.6 A suggested reading order for the code itself

If you want to read the source rather than this document:

1. [prisma/schema.prisma](prisma/schema.prisma) — the data shape. Everything else serves it.
2. [lib/auth.ts](lib/auth.ts) — the security model.
3. [app/(app)/layout.tsx](<app/(app)/layout.tsx>) — the shell, and where the gate is applied.
4. [app/(app)/memories/page.tsx](<app/(app)/memories/page.tsx>) + [memory-board.tsx](<app/(app)/memories/memory-board.tsx>) — the simplest complete server/client pair.
5. [lib/actions/song.ts](lib/actions/song.ts) — the write path.
6. [components/ui.tsx](components/ui.tsx) — the design primitives.
7. [app/globals.css](app/globals.css) — the token system.
8. [lib/sync.ts](lib/sync.ts) + [lib/youtube.ts](lib/youtube.ts) — the external integration.
9. [components/player/player-provider.tsx](components/player/player-provider.tsx) — the hardest file. Save it for last.

## 14.7 The five ideas worth carrying to your next project

1. **Derive authority from the session, never from input.** One helper (`requireCoupleContext`) is the only source of tenancy, and every write re-checks ownership. That single discipline eliminates an entire category of bug.

2. **Semantic design tokens beat literal ones.** `--ink` survived three themes; `--dark-grey` would not have. Name things by role.

3. **Soft-delete anything other people's data hangs off.** `isAvailable = false` instead of `DELETE` is the difference between "a video went away" and "we lost your memory".

4. **Don't block first paint on work you can do afterwards.** The library renders from Postgres; YouTube reconciliation happens after paint and only re-renders if something changed.

5. **Comment the *why*, not the *what*.** Every non-obvious decision in this codebase carries a comment explaining the reasoning — the ancient User-Agent for Satori, the `Y_OFFSET` in the heart curve, the `stateRef` for YouTube callbacks, the empty `catch` around the clipboard. Those comments are why the code is readable a year later, and why an unusual line doesn't get "cleaned up" by the next person.

---

*Every file in the repository is covered above. If you get stuck on a specific line, find its file in Part 3–12 — the section order matches the project map in Part 2.*
