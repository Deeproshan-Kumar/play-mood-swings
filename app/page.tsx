import Link from "next/link";
import { Show } from "@clerk/nextjs";
import {
  Heart,
  ListMusic,
  Mail,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

import { Button, HeartDrift } from "@/components/ui";

const FEATURES: Array<{ icon: LucideIcon; title: string; copy: string }> = [
  {
    icon: ListMusic,
    title: "Your playlist, synced",
    copy: "Add a song on YouTube and it shows up here. Remove one and we notice.",
  },
  {
    icon: Mail,
    title: "Notes for each other",
    copy: "Leave something small behind for them to find later.",
  },
  {
    icon: Sparkles,
    title: "Songs that remember",
    copy: "Attach a memory to a song and it plays back with the music.",
  },
];

/** Public landing page — the "Welcome" step of PRD §22. */
export default function LandingPage() {
  return (
    <main className="relative flex flex-1 flex-col">
      <HeartDrift count={5} />

      <nav className="relative z-10 flex items-center justify-between px-6 py-6 sm:px-10">
        <span className="display text-xl tracking-tight">
          Mood <em className="not-italic text-primary">Swings</em>
        </span>

        <Show
          when="signed-in"
          fallback={
            <div className="flex items-center gap-2">
              <Link href="/sign-in">
                <Button variant="ghost" size="sm">
                  Sign in
                </Button>
              </Link>
              <Link href="/sign-up">
                <Button size="sm">Get started</Button>
              </Link>
            </div>
          }
        >
          <Link href="/home">
            <Button size="sm">Open our space</Button>
          </Link>
        </Show>
      </nav>

      <div className="relative z-10 mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center px-6 py-16 text-center">
        <p className="label mb-6 animate-fade-in">For two people, only</p>

        <h1 className="display mb-6 text-5xl leading-[1.05] sm:text-7xl animate-fade-up">
          A little private corner
          <br />
          of the internet
          <br />
          <em className="text-primary">that belongs to us.</em>
        </h1>

        <p className="mb-10 max-w-xl text-base leading-relaxed text-ink-soft sm:text-lg">
          Your YouTube playlist becomes the soundtrack to your relationship —
          wrapped in love notes, memories, and the songs that mean something
          only the two of you understand.
        </p>

        <Show
          when="signed-in"
          fallback={
            <div className="flex flex-col items-center gap-3 sm:flex-row">
              <Link href="/sign-up">
                <Button size="lg">
                  <Heart className="h-4.5 w-4.5 fill-current" />
                  Create our space
                </Button>
              </Link>
              <Link href="/sign-in">
                <Button variant="outline" size="lg">
                  I already have one
                </Button>
              </Link>
            </div>
          }
        >
          <Link href="/home">
            <Button size="lg">
              <Heart className="h-4.5 w-4.5 fill-current" />
              Take me home
            </Button>
          </Link>
        </Show>
      </div>

      <section className="relative z-10 mx-auto grid w-full max-w-4xl gap-4 px-6 pb-20 sm:grid-cols-3">
        {FEATURES.map((feature) => (
          <div key={feature.title} className="glass rounded-xl2 p-5 text-left">
            <span
              aria-hidden
              className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-blush text-primary"
            >
              <feature.icon className="h-5 w-5" />
            </span>
            <h2 className="mb-1.5 text-base font-medium">{feature.title}</h2>
            <p className="text-sm leading-relaxed text-ink-soft">{feature.copy}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
