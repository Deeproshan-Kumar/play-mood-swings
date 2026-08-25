# PRD — Romantic Music App for Couples

**Working name:** *Mood Swings*
**Product type:** Private couple-focused music & romance app
**Primary platform:** Installable web app (PWA), mobile-responsive
**Music source:** One shared YouTube playlist
**Authentication:** Clerk

> **Status: MVP built.** Every §21 must-have ships, plus the mood system (§13)
> and PWA packaging (originally §21 v3). Sections below marked
> *"As built"* record where the implementation deliberately diverged from the
> original spec. Setup lives in [README.md](README.md).

---

## 1. Product Vision

Create a private, beautiful, romantic music experience for couples where music becomes part of their relationship.

The app connects to **your YouTube playlist**, automatically keeps the app's song library synchronized with it, and wraps the music experience in romantic features such as love notes, memories, moods, messages, and personalized moments.

The goal is:

> **“A little private corner of the internet that belongs to us.”**

It should feel intimate, warm, playful, and personal—not like another generic music streaming app.

---

# 2. Target Users

### Primary users

Two people in a romantic relationship.

For the MVP, the main scenario is:

* You create the app/account.
* Your GF creates/signs into her account.
* You connect your YouTube playlist.
* Both of you can listen to the songs.
* The app automatically reflects changes to your YouTube playlist.
* You add romantic content around the music.

### User types

**Couple Owner**

* Creates the couple space.
* Connects/configures the YouTube playlist.
* Manages romantic content.
* Invites partner.

**Partner**

* Joins the couple space.
* Can listen to music.
* Can interact with romantic features.
* Can contribute content depending on permissions.

---

# 3. Core Product Experience

The app should have five major areas:

### 🎵 Music

Your YouTube playlist becomes the app's music library.

### ❤️ Us

A private relationship/home space showing things like:

* Relationship timer
* Favorite memories
* Photos
* Love notes
* Special dates

### 💌 Love

A place to leave messages for each other.

Examples:

> “I hope you're having a beautiful day ❤️”

> “This song always reminds me of you.”

### 🌙 Mood

Choose a romantic mood and get a corresponding playlist experience.

Examples:

* ❤️ In Love
* 🌙 Late Night
* 🥰 Missing You
* 💕 Date Night
* ☀️ Happy Together
* 🫂 Need a Hug
* 🔥 Romantic

### ✨ Moments

Special experiences around songs.

For example, while playing a particular song:

**“This song reminds me of our first date ❤️”**

---

# 4. MVP Features

## 4.1 Authentication — Clerk

Use **Clerk** for authentication.

Supported login options can include:

* Email/password
* Google
* Other Clerk-supported providers

### Authentication flow

```text
Landing Page
     ↓
Sign In / Sign Up
     ↓
Create Couple Space
     ↓
Invite Partner
     ↓
Dashboard
```

Each user should have a unique account.

A couple should have a shared **Couple Space**.

---

# 5. Couple Space

After authentication, users should belong to a couple.

### Couple profile

Store:

* Couple name
* Partner 1
* Partner 2
* Profile photos
* Relationship start date
* Couple anniversary
* Shared preferences
* Theme

Example:

**X ❤️ Y**

> Together for
> **2 years, 4 months, 13 days**

The exact relationship duration should update automatically.

---

# 6. YouTube Playlist Integration

This is one of the most important features.

The app should use a **YouTube playlist as the source of truth for music**.

### Initial flow

**As built —** the connect flow was removed. This is a private app for two
people with exactly one playlist, so the playlist id is configured once in
`lib/youtube-config.ts` and read with a server-side YouTube Data API key.

```text
Playlist id in config
   ↓
Open Music
   ↓
Auto-import + sync
   ↓
Music Library
```

The original design — OAuth per couple, a playlist picker, connect/disconnect —
was implemented first and then deleted. It required a Google Cloud OAuth client,
a consent screen, custom credentials in Clerk, and a token re-grant whenever
scopes changed, all to select from a list of one. An API key needs a single
Google Cloud toggle and stores no user credentials at all, which also makes
§20's "YouTube credentials must be securely stored" trivially true: there are
none.

The trade-off: an API key reads **public and unlisted** playlists only. A fully
private playlist would still require OAuth.

The app stores YouTube video/playlist metadata rather than hosting copyrighted music itself.

Each imported song could contain:

```text
Song
├── YouTube Video ID
├── Title
├── Artist
├── Thumbnail
├── Duration
├── Playlist position
└── Added date
```

---

# 7. Playlist Synchronization

The app should stay synchronized with the YouTube playlist.

For example:

### You add a song to YouTube

```text
YouTube Playlist
      ↓
Sync
      ↓
App
      ↓
New song appears
```

### You remove a song

```text
YouTube Playlist
      ↓
Sync
      ↓
App
      ↓
Song marked unavailable (row kept)
```

**As built —** removed songs are flagged `isAvailable = false`, never deleted.
Memories and favourites hang off those rows; losing a memory because a video was
taken down would be the worst possible bug in this app. They are hidden from the
library and playback queue, and counted in a footnote.

### You reorder songs

The app should reflect the new order.

---

## Important technical requirement

YouTube does not necessarily provide an unlimited real-time “playlist changed” event that your app can simply subscribe to.

Therefore, the PRD should define **periodic synchronization**.

For example:

* Sync when the user opens the Music page.
* Sync when the user manually presses **Sync Now**.
* Optionally run a scheduled background sync.

**As built —** the Music page renders instantly from Postgres and reconciles
*after* paint, via a client component that refreshes the route only when
something actually changed. Awaiting the sync during render would have blocked
first paint on four YouTube round-trips plus ~85 upserts every five minutes.
Auto-sync is debounced to 5 minutes; **Sync Now** always runs.

Example:

```text
Last synced:
Today, 10:42 AM

[ Sync Now ]
```

The backend should compare the YouTube playlist with the app's stored playlist and apply additions, removals, and ordering changes.

---

# 8. Music Player

The music player is the heart of the application.

### Basic controls

* Play
* Pause
* Previous
* Next
* Seek
* Volume
* Shuffle
* Repeat

### Player UI

Large album/video artwork.

Example:

```text
┌─────────────────────────────┐
│                             │
│       Song Artwork          │
│                             │
│                             │
│     Until I Found You       │
│       Stephen Sanchez       │
│                             │
│  ━━━━━━━━━●────────────     │
│                             │
│     ◀      ▶      ▶▶       │
│                             │
│       ❤️ Add to Favorites   │
└─────────────────────────────┘
```

The app should use YouTube's supported playback mechanisms rather than downloading or rehosting the audio.

---

# 9. Romantic Home Screen

The home screen should **not** look like a normal music dashboard.

It should immediately feel personal.

Example:

```text
Good morning, Sarah ❤️

        Alex + Sarah

      Together for
      842 days

────────────────────────

🎵 Playing for us

   Until I Found You
   Stephen Sanchez

        ▶ Play

────────────────────────

💌 A little message from Alex

"Just wanted to remind you
that I love you."

────────────────────────

✨ Our memories

[ First Date ] [ First Trip ]

────────────────────────

❤️ Made for us
```

---

# 10. Love Notes

Users can send private romantic notes to their partner.

### Features

* Write note
* Send note
* Mark as read
* Favorite
* Delete
* Optional scheduled delivery

Example:

> **For you ❤️**
> “No matter how busy today gets, remember that someone is thinking about you.”

### Future feature

**Open When**

Create notes like:

* Open when you miss me
* Open when you're sad
* Open when you can't sleep
* Open when you need motivation
* Open on our anniversary

This could become one of the app's strongest emotional features.

---

# 11. Song Memories

Users can attach memories to songs.

Example:

**Song:** *Until I Found You*

**Memory:**

> “We listened to this on our first road trip.”

When the song plays, the app can display:

❤️ **Our Memory**

> “Our first road trip — July 2025.”

This makes the music library feel unique to the couple.

---

# 12. Favorite Songs

Each person can favorite songs.

Display:

### Our Favorites

**Alex's favorites ❤️**

**Sarah's favorites 💕**

**Our shared favorites 💖**

This gives the couple a way to discover each other's music preferences.

---

# 13. Mood-Based Experience

Users can select how they're feeling.

Example:

```text
How are you feeling?

❤️ In Love

🥰 Missing You

🌙 Late Night

💕 Date Night

🫂 Need a Hug

☀️ Happy

🔥 Romantic
```

Selecting a mood can filter the connected playlist or eventually create curated experiences.

For MVP, this can simply provide a romantic UI/theme and allow users to tag songs with moods.

---

# 14. Relationship Timeline

Create a timeline of important moments.

Example:

```text
❤️ Our Story

June 12, 2024
We first met

July 02, 2024
Our first date

August 18, 2024
Our first trip

December 25, 2024
Our first Christmas together
```

Each timeline event can contain:

* Date
* Title
* Description
* Photos
* Song
* Location

---

# 15. Photos & Memories

Allow couples to save memories.

Each memory can include:

* Photo
* Title
* Description
* Date
* Song
* Location

Example:

**Our First Date**

> December 2025

🎵 *Perfect — Ed Sheeran*

This connects the music and relationship aspects together.

---

# 16. Notifications

Notifications should be romantic rather than spammy.

Examples:

**❤️ New Love Note**

> “Alex left something for you.”

**🎵 New Song**

> “A new song was added to your playlist.”

**💕 Memory**

> “One year ago today, you went on your first trip together.”

**💌 Anniversary**

> “Happy anniversary ❤️”

Users should be able to control notification preferences.

---

# 17. Main Navigation

Recommended navigation:

```text
┌─────────────────────────────────┐
│             OURS ❤️             │
├─────────────────────────────────┤
│                                 │
│  🏠 Home                        │
│  🎵 Music                       │
│  💌 Love                        │
│  ✨ Memories                    │
│  ❤️ Us                          │
│                                 │
│              ⚙️ Settings        │
└─────────────────────────────────┘
```

On mobile, use a bottom navigation bar:

```text
🏠     🎵     ❤️     💌     ✨
Home  Music   Us    Love  Memories
```

---

# 18. Settings

### Account

* Profile
* Name
* Profile picture
* Email
* Authentication

### Couple

* Partner
* Couple name
* Relationship date
* Anniversary

### YouTube

*As built —* there is nothing to connect or disconnect, so this is status only:

* Playlist name and link
* Song count
* Last sync
* Sync Now

### Notifications

* Love notes
* Memories
* Playlist updates
* Anniversaries

### Appearance

* Light
* Dark
* Romantic theme

---

# 19. Data Model

A possible initial database structure:

```text
User
├── id
├── clerkUserId
├── name
├── email
├── avatar
└── createdAt

Couple
├── id
├── name
├── partner1Id
├── partner2Id  (null until the partner joins)
├── relationshipStartDate
├── anniversaryDate
├── inviteCode
├── theme
└── createdAt

(YouTubeConnection — removed. The playlist is app-wide config, not per-couple
data, so only sync state remained and it moved onto Couple:)

Couple (sync fields)
├── playlistLastSyncedAt
├── playlistSyncStatus
└── playlistSyncError

Song
├── id
├── coupleId
├── youtubeVideoId
├── title
├── artist
├── thumbnail
├── duration
├── position
├── isAvailable
└── addedAt

LoveNote
├── id
├── coupleId
├── senderId
├── recipientId
├── content
├── isRead
├── createdAt
└── readAt

Memory
├── id
├── coupleId
├── title
├── description
├── date
├── image
└── songId

Favorite
├── userId
└── songId

Mood
├── id
├── coupleId
├── slug
├── name
├── emoji
└── sortOrder

SongMood          (tags a song with a mood)
├── songId
└── moodId

MoodCheckIn       ("how are you feeling" — latest row per user wins)
├── id
├── coupleId
├── userId
└── moodId

TimelineEvent     (not built — Version 2)
├── id
├── coupleId
├── title
├── description
├── date
├── image
└── songId
```

---

# 20. Privacy & Security

Because this is a private relationship app, privacy is a major product requirement.

### Requirements

* A user can only access their own couple space.
* Couple content must not be publicly accessible.
* Love notes must only be visible to the intended couple.
* YouTube credentials/tokens must be securely stored.
* Backend authorization must verify couple membership.
* Never rely solely on frontend checks.
* Users should be able to disconnect YouTube.
* Users should be able to delete their couple space/data.

---

# 21. MVP Scope

I'd keep the first version relatively focused.

### Must have — shipped

* [x] Clerk authentication
* [x] Create couple
* [x] Invite partner — 8-character code or `/join/<code>` link
* [x] Couple dashboard
* [x] YouTube playlist connection — as fixed config, see §6
* [x] Import playlist
* [x] Playlist synchronization
* [x] YouTube music player
* [x] Play/pause/next/previous — plus seek, volume, shuffle, repeat
* [x] Favorites — his / hers / ours
* [x] Love notes — incl. optional scheduled delivery
* [x] Song memories
* [x] Relationship counter — live, calendar-accurate
* [x] Basic romantic theme — three themes: romantic, light, dark
* [x] Mobile-responsive UI
* [x] Privacy/access control

### Version 2

* [ ] Photo memories — schema ready (`Memory.image`), no upload yet
* [ ] Relationship timeline
* [x] Mood system — pulled forward; 7 moods, song tagging, check-ins
* [x] Scheduled love notes — pulled forward, small addition to the note model
* [ ] Push notifications
* [ ] Anniversary reminders — countdown shown, no notification
* [ ] “Open When” letters
* [x] Shared favorites — “Ours 💖” on the Us page
* [x] More themes — romantic / light / dark

### Version 3

* [ ] AI-generated romantic experiences
* [ ] AI-written love messages
* [ ] “Our Story” automatically generated from memories
* [ ] Personalized daily romantic message
* [ ] Song-based memories
* [ ] Couple activity insights
* [ ] Interactive relationship timeline
* [x] PWA/mobile app packaging — pulled forward, see §29

---

# 22. Key User Journey

The ideal first-time experience should be:

```text
                  START
                    │
                    ▼
             Welcome ❤️
                    │
                    ▼
              Sign Up
             with Clerk
                    │
                    ▼
          Create "Our Space"
                    │
                    ▼
          Invite Your Partner
                    │
                    ▼
        Connect YouTube Playlist
                    │
                    ▼
          Select Your Playlist
                    │
                    ▼
           Import & Sync 🎵
                    │
                    ▼
          Romantic Home ❤️
                    │
          ┌─────────┼─────────┐
          ▼         ▼         ▼
        Music     Love      Memories
          │         │         │
          ▼         ▼         ▼
       Listen    Message    Remember
```

---

# 23. Design Direction

The visual identity should be **romantic but sophisticated**.

Avoid making it look like a Valentine's Day website.

### Suggested style

**Colors**

* Deep burgundy
* Rose
* Soft pink
* Cream
* Warm white
* Dark charcoal

Example palette:

```text
#8B1E3F  Deep Rose
#C44569  Romantic Pink
#F8D7DA  Soft Pink
#FFF8F5  Warm White
#171717  Dark
```

### Typography

Use an elegant serif for romantic headings and a clean sans-serif for UI.

For example:

**Heading**

> Our little world

**UI**

> Playlists · Memories · Love Notes

### Visual effects

* Soft gradients
* Subtle glassmorphism
* Gentle animations
* Heart particles used sparingly
* Smooth page transitions
* Album artwork with blurred background
* Dark romantic music-player mode

---

# 24. Homepage Concept

The first screen after login could be something like:

> **Welcome back, love ❤️**

> *This little space belongs to us.*

Then:

**842 days together**

**Now playing**

🎵 *Until I Found You*

> “Our song.”

And underneath:

**A little note for you 💌**

> *I hope you know how special you are to me.*

This establishes the app's identity immediately.

---

# 25. Success Metrics

For a personal/couple app, traditional DAU isn't the only useful metric.

Track:

### Activation

* User signs up
* Couple created
* Partner joins
* YouTube playlist connected
* First song played

### Engagement

* Songs played
* Love notes sent
* Memories created
* Songs favorited
* Sessions per couple

### Relationship engagement

* Messages exchanged
* Memories revisited
* Shared songs played
* Anniversary/milestone interactions

A particularly meaningful metric could be:

**“Couples who return together each week.”**

---

# 26. Technical Architecture — High Level

A sensible architecture would be:

```text
                 ┌───────────────┐
                 │     Clerk     │
                 │ Authentication│
                 └───────┬───────┘
                         │
                         ▼
┌──────────────┐   ┌───────────────┐
│   Frontend   │──▶│    Backend    │
│ React/Next.js│   │ API / Server  │
└──────┬───────┘   └───────┬───────┘
       │                   │
       │                   ▼
       │             ┌───────────┐
       │             │ Database  │
       │             └───────────┘
       │
       ▼
┌────────────────────┐
│ YouTube Player/API │
└────────────────────┘
```

Stack as built:

* **Next.js 16.3** (App Router, Turbopack) / **React 19**
* **TypeScript**
* **Clerk 7** — authentication
* **PostgreSQL 16** — database
* **Prisma 7** — ORM, via `@prisma/adapter-pg`
* **Tailwind CSS v4** — CSS-first `@theme` tokens
* **YouTube Data API v3** (server-side key) + **YouTube IFrame Player API**
* Object storage for photos — not yet needed
* No cron: sync runs on page open (debounced) and on demand, so there is no
  background job to operate

Two conventions differ from what most Next.js references describe:
`middleware.ts` is now **`proxy.ts`**, and Clerk 7 removed
`<SignedIn>` / `<SignedOut>` / `<Protect>` in favour of
`<Show when="signed-in">`.

---

# 27. Important Product Decision

I would **not** try to build a Spotify clone.

The differentiator isn't the music player.

The differentiator is:

> **Music + memories + messages + relationship**

For example, a song isn't just:

> 🎵 *Perfect — Ed Sheeran*

It becomes:

> 🎵 *Perfect — Ed Sheeran*
>
> ❤️ **Our Memory**
> “The song we played on our first trip together.”
>
> 💌 **A note from Alex**
> “Still one of my favorite memories with you.”

That's what can make this app genuinely special.

---

# 28. MVP Product Statement

**Our app is a private digital space for two people in love, where their YouTube music playlist becomes the soundtrack to their shared memories, messages, and relationship.**

The MVP should nail **three things**:

### 🎵 Music

Automatically keep the app synchronized with the couple's YouTube playlist.

### ❤️ Relationship

Show their relationship, memories, favorites, and milestones.

### 💌 Emotion

Give them simple, beautiful ways to express love to each other.

---

# 29. Installable App & Motion — As Built

Not in the original spec; added once the MVP was working.

## Progressive Web App

The app installs to a home screen and runs full screen.

| Piece | Where |
| --- | --- |
| Manifest | `app/manifest.ts` — standalone, portrait, shortcuts to Music / Love / Memories |
| Icons | `scripts/generate-icons.py` generates every size from one heart curve |
| Service worker | `public/sw.js` |
| Offline page | `app/offline/page.tsx` |
| Install nudge | `components/pwa.tsx` — Chromium prompt, iOS instructions |

**Caching is deliberately narrow.** Every page here is authenticated and
personal, so HTML is **never** written to the cache — a stale or
mis-attributed page would be a privacy bug, not a UX wrinkle. The worker caches
only content-hashed build output, our own icons, and YouTube thumbnails.
Navigations always hit the network and fall back to the offline page. `GET`
only, so Server Actions are untouched.

The icon is the classic heart curve
(`x = 16sin³t`, `y = 13cos t − 5cos2t − 2cos3t − cos4t`) in warm white on the
§23 deep-rose gradient, rendered at 4× and downsampled. The SVG favicon is
generated from the same curve, so the vector and raster marks cannot drift.

## Motion

Per §23's "gentle animations" and "smooth page transitions":

* **Route transitions** — React's `<ViewTransition>` wraps only the page body,
  so the sidebar, header, and player stay anchored while content dissolves.
  Needs no configuration in Next.js 16; degrades to an instant swap where the
  View Transitions API is missing.
* **Staggered reveals** — lists fade up in sequence, capped at 10 steps so long
  lists read as choreography rather than lag.
* **Loading skeletons** — a `loading.tsx` per route, shaped like the real page.
* **Heart particles** — still used sparingly: landing, home, us, invite, offline.

All of it collapses under `prefers-reduced-motion`, including the view
transitions, which ignore ordinary animation overrides and had to be disabled
explicitly.

## Performance notes

Two fixes worth recording, both regressions in the first implementation:

* **Thumbnail sizing.** The importer originally stored YouTube's `maxres`
  (1280×720) artwork for what renders as a 48px row. Preferring `high`
  (480×360) cut image payload by roughly an order of magnitude across ~85 songs
  with no visible difference.
* **Non-blocking sync.** See §7.

Buttons also needed an explicit `cursor: pointer`: Tailwind v4's preflight
defers to the browser default of `cursor: default`, which made every control
feel inert.

