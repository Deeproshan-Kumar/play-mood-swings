import { redirect } from "next/navigation";

import { getCoupleForUser, requireUser } from "@/lib/auth";
import { OnboardingForms } from "./onboarding-forms";

export const metadata = { title: "Create our space" };

export default async function OnboardingPage() {
  const user = await requireUser();
  const couple = await getCoupleForUser(user.id);

  // Already set up — nothing to onboard.
  if (couple) {
    redirect("/home");
  }

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-6 py-16">
      <div className="mb-8 text-center">
        <p className="label mb-3">Step one</p>
        <h1 className="display text-4xl sm:text-5xl">Create our space</h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-soft">
          Somewhere that belongs to the two of you. You can change any of this
          later.
        </p>
      </div>

      <OnboardingForms />
    </main>
  );
}
