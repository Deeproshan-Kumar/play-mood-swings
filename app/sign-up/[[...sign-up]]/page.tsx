import { SignUp } from "@clerk/nextjs";

export const metadata = { title: "Create your account" };

export default function SignUpPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-16">
      <div className="text-center">
        <h1 className="display text-4xl">Let&rsquo;s begin</h1>
        <p className="mt-2 text-sm text-ink-soft">
          One account each. One space for the two of you.
        </p>
      </div>

      <SignUp />
    </main>
  );
}
