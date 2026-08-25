import { WifiOff } from "lucide-react";

import { HeartDrift } from "@/components/ui";
import { IconBadge } from "@/components/icons";

export const metadata = { title: "Offline" };

/** Served by the service worker when a navigation fails with no connection. */
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
