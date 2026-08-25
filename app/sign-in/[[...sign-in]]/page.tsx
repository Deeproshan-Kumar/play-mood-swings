import { SignIn } from "@clerk/nextjs";

export const metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-16">
      <div className="text-center">
        <h1 className="display text-4xl">Welcome back, love</h1>
        <p className="mt-2 text-sm text-ink-soft">
          This little space has been waiting for you.
        </p>
      </div>

      <SignIn />
    </main>
  );
}
