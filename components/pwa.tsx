"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Download, Smartphone, X } from "lucide-react";

import { Button, cn } from "@/components/ui";

/**
 * Registers the service worker. Production only — in development the SW would
 * cache build assets that Turbopack is actively rewriting.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // A failed registration just means no offline support; the app works.
      });
    };

    // Wait for load so the SW never competes with the first paint.
    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });
    }
  }, []);

  return null;
}

// ── Install eligibility, modelled as an external store ───────────
//
// Whether we can offer installation is browser state, not React state, so it's
// read through `useSyncExternalStore`. Snapshots are cached in a module value
// because the hook requires a referentially stable result between renders.

type InstallEnv = "server" | "installed" | "dismissed" | "ios" | "eligible";

const DISMISS_KEY = "mood-swings-install-dismissed";

let cachedEnv: InstallEnv | null = null;
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

function computeEnv(): InstallEnv {
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS reports installed state on navigator, not via matchMedia.
    (navigator as Navigator & { standalone?: boolean }).standalone === true;

  if (standalone) return "installed";

  try {
    if (localStorage.getItem(DISMISS_KEY)) return "dismissed";
  } catch {
    // Private browsing can throw on localStorage; treat as not dismissed.
  }

  const isIOS =
    /iPad|iPhone|iPod/.test(navigator.userAgent) &&
    !(window as Window & { MSStream?: unknown }).MSStream;

  // iOS has no `beforeinstallprompt`, so it gets instructions instead.
  return isIOS ? "ios" : "eligible";
}

function getSnapshot(): InstallEnv {
  cachedEnv ??= computeEnv();
  return cachedEnv;
}

function subscribe(listener: () => void) {
  listeners.add(listener);

  const onInstalled = () => {
    cachedEnv = "installed";
    notify();
  };

  window.addEventListener("appinstalled", onInstalled);

  return () => {
    listeners.delete(listener);
    window.removeEventListener("appinstalled", onInstalled);
  };
}

function markDismissed() {
  try {
    localStorage.setItem(DISMISS_KEY, "1");
  } catch {
    // Non-persistent dismissal is still better than ignoring the click.
  }
  cachedEnv = "dismissed";
  notify();
}

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/**
 * "Add to home screen" nudge.
 *
 * Chromium fires `beforeinstallprompt`, which we defer and trigger from our own
 * button. Hidden once installed, or after the user dismisses it once.
 */
export function InstallPrompt() {
  const env = useSyncExternalStore(subscribe, getSnapshot, () => "server" as const);

  // Set from an event listener, which is the supported way to track an
  // external system — not synchronously inside an effect body.
  const [deferred, setDeferred] = useState<InstallPromptEvent | null>(null);

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setDeferred(event as InstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  const showable =
    env === "ios" || (env === "eligible" && deferred !== null);

  if (!showable) return null;

  return (
    <div
      className={cn(
        "fixed inset-x-3 z-40 mx-auto max-w-sm animate-fade-up",
        // Clear of the mobile nav and the player bar.
        "bottom-36 md:bottom-24",
      )}
      role="dialog"
      aria-label="Install Mood Swings"
    >
      <div className="glass rounded-xl2 px-4 py-3.5 shadow-lg">
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blush text-primary"
          >
            <Smartphone className="h-4.5 w-4.5" />
          </span>

          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Keep us on your home screen</p>

            {env === "ios" ? (
              <p className="mt-1 text-xs leading-relaxed text-ink-soft">
                Tap Share, then <strong>Add to Home Screen</strong>.
              </p>
            ) : (
              <p className="mt-1 text-xs text-ink-soft">
                Opens full screen, like a real app.
              </p>
            )}

            <div className="mt-3 flex gap-2">
              {deferred ? (
                <Button
                  size="sm"
                  onClick={async () => {
                    await deferred.prompt();
                    await deferred.userChoice;
                    setDeferred(null);
                    markDismissed();
                  }}
                >
                  <Download className="h-4 w-4" />
                  Install
                </Button>
              ) : null}

              <Button variant="ghost" size="sm" onClick={markDismissed}>
                <X className="h-4 w-4" />
                Not now
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
