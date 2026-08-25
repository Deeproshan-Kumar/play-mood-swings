import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";

import { getCoupleForUser, requireUser } from "@/lib/auth";
import { Button, Card, HeartDrift } from "@/components/ui";
import { InviteShare } from "./invite-share";

export const metadata = { title: "Invite your partner" };

export default async function InvitePage() {
  const user = await requireUser();
  const couple = await getCoupleForUser(user.id);

  if (!couple) {
    redirect("/onboarding");
  }

  // Both partners are in — this step is done.
  if (couple.partner2Id) {
    redirect("/home");
  }

  const headerList = await headers();
  const host = headerList.get("host") ?? "localhost:3000";
  const protocol = host.startsWith("localhost") ? "http" : "https";
  const inviteUrl = `${protocol}://${host}/join/${couple.inviteCode}`;

  return (
    <main className="relative mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-6 py-16">
      <HeartDrift count={4} />

      <div className="relative z-10">
        <div className="mb-8 text-center">
          <p className="label mb-3">Step two</p>
          <h1 className="display text-4xl sm:text-5xl">Invite them in</h1>
          <p className="mt-3 text-sm leading-relaxed text-ink-soft">
            <strong className="font-medium text-ink">{couple.name}</strong> is
            ready. Send this to your partner so they can join.
          </p>
        </div>

        <Card className="space-y-6">
          <InviteShare code={couple.inviteCode} url={inviteUrl} />
        </Card>

        <div className="mt-6 flex flex-col items-center gap-3">
          <Link href="/home" className="w-full">
            <Button size="lg" className="w-full">
              Continue to our home
            </Button>
          </Link>
          <p className="text-center text-xs text-ink-faint">
            You can share this code any time from Settings.
          </p>
        </div>
      </div>
    </main>
  );
}
