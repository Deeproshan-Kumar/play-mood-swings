"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Heart,
  House,
  Mail,
  Music,
  Settings,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/components/ui";

/** Navigation from PRD §17 — sidebar on desktop, bottom bar on mobile. */
const LINKS: Array<{ href: string; label: string; icon: LucideIcon }> = [
  { href: "/home", label: "Home", icon: House },
  { href: "/music", label: "Music", icon: Music },
  { href: "/love", label: "Love", icon: Mail },
  { href: "/memories", label: "Memories", icon: Sparkles },
  { href: "/us", label: "Us", icon: Heart },
];

function useIsActive() {
  const pathname = usePathname();
  return (href: string) => pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar({ coupleName }: { coupleName: string }) {
  const isActive = useIsActive();

  return (
    <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-line px-4 py-6 md:flex">
      <Link href="/home" className="mb-8 px-3">
        <span className="display block text-lg leading-tight">
          Mood <em className="not-italic text-primary">Swings</em>
        </span>
        <span className="mt-0.5 block truncate text-xs text-ink-faint">
          {coupleName}
        </span>
      </Link>

      <nav className="flex-1 space-y-1">
        {LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            aria-current={isActive(link.href) ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors",
              isActive(link.href)
                ? "bg-blush font-medium text-primary"
                : "text-ink-soft hover:bg-sunken hover:text-ink",
            )}
          >
            <link.icon aria-hidden className="h-4.5 w-4.5 shrink-0" />
            {link.label}
          </Link>
        ))}
      </nav>

      <Link
        href="/settings"
        aria-current={isActive("/settings") ? "page" : undefined}
        className={cn(
          "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors",
          isActive("/settings")
            ? "bg-blush font-medium text-primary"
            : "text-ink-soft hover:bg-sunken hover:text-ink",
        )}
      >
        <Settings aria-hidden className="h-4.5 w-4.5 shrink-0" />
        Settings
      </Link>
    </aside>
  );
}

export function BottomNav() {
  const isActive = useIsActive();

  return (
    <nav className="glass fixed inset-x-0 bottom-0 z-50 flex h-16 items-stretch border-t md:hidden">
      {LINKS.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          aria-current={isActive(link.href) ? "page" : undefined}
          className={cn(
            "flex flex-1 flex-col items-center justify-center gap-1 text-[0.625rem] transition-colors",
            isActive(link.href) ? "text-primary" : "text-ink-faint",
          )}
        >
          <link.icon aria-hidden className="h-5 w-5" />
          {link.label}
        </Link>
      ))}
    </nav>
  );
}

/** Mobile-only top bar, since the sidebar is hidden there. */
export function MobileHeader({ coupleName }: { coupleName: string }) {
  return (
    <header className="flex items-center justify-between border-b border-line px-5 py-3.5 md:hidden">
      <Link href="/home" className="min-w-0">
        <span className="display block text-base leading-tight">
          Mood <em className="not-italic text-primary">Swings</em>
        </span>
      </Link>
      <div className="flex items-center gap-3">
        <span className="max-w-36 truncate text-xs text-ink-faint">
          {coupleName}
        </span>
        <Link href="/settings" aria-label="Settings" className="text-ink-soft">
          <Settings aria-hidden className="h-5 w-5" />
        </Link>
      </div>
    </header>
  );
}
