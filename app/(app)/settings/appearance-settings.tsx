"use client";

import { useActionState } from "react";
import { Heart, Moon, Sun, type LucideIcon } from "lucide-react";

import { setTheme } from "@/lib/actions/couple";
import { Button, Card, cn } from "@/components/ui";

const OPTIONS: Array<{
  value: string;
  label: string;
  hint: string;
  icon: LucideIcon;
}> = [
  {
    value: "ROMANTIC",
    label: "Romantic",
    hint: "Warm cream and deep rose",
    icon: Heart,
  },
  { value: "LIGHT", label: "Light", hint: "Clean and quiet", icon: Sun },
  { value: "DARK", label: "Dark", hint: "For late nights", icon: Moon },
];

export function AppearanceSettings({ current }: { current: string }) {
  const [state, formAction, pending] = useActionState(setTheme, null);

  return (
    <Card>
      <form action={formAction} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">
          {OPTIONS.map((option) => (
            <Button
              key={option.value}
              unstyled
              type="submit"
              name="theme"
              value={option.value}
              disabled={pending}
              aria-pressed={current === option.value}
              className={cn(
                "rounded-xl2 border px-4 py-4 text-left transition-colors",
                current === option.value
                  ? "border-primary bg-blush"
                  : "border-line hover:border-line-strong",
              )}
            >
              <span
                className={cn(
                  "flex items-center gap-2 text-sm font-medium",
                  current === option.value && "text-primary",
                )}
              >
                <option.icon aria-hidden className="h-4 w-4" />
                {option.label}
              </span>
              <span className="mt-0.5 block text-xs text-ink-faint">
                {option.hint}
              </span>
            </Button>
          ))}
        </div>

        {state?.error ? (
          <p role="alert" className="text-sm text-primary">
            {state.error}
          </p>
        ) : null}
      </form>
    </Card>
  );
}
