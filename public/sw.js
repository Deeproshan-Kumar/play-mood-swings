/*
 * Service worker for Mood Swings.
 *
 * Caching policy is deliberately conservative. Every page in this app is
 * authenticated and personal — love notes, memories, a partner's name — so
 * HTML responses are NEVER written to the cache. A stale or mis-attributed
 * page here would be a privacy bug, not just a UX wrinkle.
 *
 * What is cached:
 *   - build assets under /_next/static (immutable, content-hashed)
 *   - our own icons
 *   - YouTube thumbnails (public images, cheap to re-fetch, nice offline)
 *
 * Everything else goes to the network. When a navigation fails entirely we
 * show a small offline page instead of the browser's error.
 */

const VERSION = "v1";
const STATIC_CACHE = `mood-swings-static-${VERSION}`;
const IMAGE_CACHE = `mood-swings-images-${VERSION}`;
const OFFLINE_URL = "/offline";

const PRECACHE = [OFFLINE_URL, "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      // Individually, so one 404 can't fail the whole install.
      .then((cache) => Promise.allSettled(PRECACHE.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => !key.endsWith(VERSION))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

/** Content-hashed build output — safe to serve from cache indefinitely. */
function isImmutableAsset(url) {
  return url.pathname.startsWith("/_next/static/");
}

function isOwnIcon(url) {
  return /^\/(icon|apple-icon|favicon)/.test(url.pathname);
}

function isThumbnail(url) {
  return (
    url.hostname === "i.ytimg.com" ||
    url.hostname === "img.youtube.com" ||
    url.hostname === "yt3.ggpht.com"
  );
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;

  const response = await fetch(request);
  // Opaque responses (no-cors) report status 0 but are still usable.
  if (response && (response.ok || response.type === "opaque")) {
    cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Never interfere with mutations — Server Actions are POSTs.
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Navigations: always network. Fall back to the offline page, never to a
  // cached copy of someone's private page.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(STATIC_CACHE);
        return (
          (await cache.match(OFFLINE_URL)) ||
          new Response("You're offline.", {
            status: 503,
            headers: { "Content-Type": "text/plain" },
          })
        );
      }),
    );
    return;
  }

  if (isImmutableAsset(url) || isOwnIcon(url)) {
    event.respondWith(
      cacheFirst(request, STATIC_CACHE).catch(() => fetch(request)),
    );
    return;
  }

  if (isThumbnail(url)) {
    event.respondWith(
      cacheFirst(request, IMAGE_CACHE).catch(
        () => new Response("", { status: 504 }),
      ),
    );
    return;
  }

  // Everything else — including all app data — goes straight to the network.
});
