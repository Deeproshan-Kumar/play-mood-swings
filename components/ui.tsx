import type { ComponentProps, ReactNode } from "react";
import { Heart, type LucideIcon } from "lucide-react";

/** Presentational primitives. No client state, so these render in either environment. */

export function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-full font-medium transition-all duration-200 disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98] whitespace-nowrap";

const buttonVariants = {
  primary:
    "bg-primary text-white hover:bg-primary-soft shadow-[0_6px_20px_-8px_var(--glow)]",
  soft: "bg-blush text-primary hover:brightness-[0.97]",
  outline: "border border-line-strong text-ink hover:bg-sunken",
  ghost: "text-ink-soft hover:text-ink hover:bg-sunken",
  danger: "border border-line-strong text-primary hover:bg-blush",
  /** Filter / mood chip, unselected. */
  chip: "border border-line bg-raised text-ink-soft hover:text-ink",
  /** Filter / mood chip, selected. */
  selected: "bg-primary text-white",
  /** Low-emphasis, no surface — secondary icons and inline text actions. */
  quiet: "text-ink-faint hover:text-ink",
  /** Full-contrast, no surface until hover — the player transport controls. */
  bare: "text-ink hover:bg-sunken",
} as const;

const buttonSizes = {
  sm: "h-9 px-4 text-sm",
  md: "h-11 px-6 text-sm",
  lg: "h-13 px-8 text-base",
  icon: "h-10 w-10",
  "icon-sm": "h-9 w-9",
  "icon-lg": "h-12 w-12",
  chip: "px-3.5 py-1.5 text-xs",
} as const;

type ButtonProps = ComponentProps<"button"> & {
  variant?: keyof typeof buttonVariants;
  size?: keyof typeof buttonSizes;
  /**
   * Drop the base/variant/size classes and paint from `className` alone. For
   * buttons that are a bespoke surface rather than a control — a modal scrim, a
   * clickable row, a toggle whose colours flip with its state. `cn` only joins
   * strings, so a conflicting override would be settled by stylesheet order
   * rather than by what the call site asked for; this opts out cleanly instead.
   */
  unstyled?: boolean;
};

export function Button({
  variant = "primary",
  size = "md",
  unstyled = false,
  type = "button",
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={
        unstyled
          ? className
          : cn(buttonBase, buttonVariants[variant], buttonSizes[size], className)
      }
      {...props}
    />
  );
}

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("card p-6", className)} {...props} />;
}

export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-11 w-full rounded-xl border border-line bg-raised px-4 text-sm",
        "placeholder:text-ink-faint transition-colors",
        "focus:border-accent focus:outline-none",
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "w-full rounded-xl border border-line bg-raised px-4 py-3 text-sm leading-relaxed",
        "placeholder:text-ink-faint transition-colors resize-none",
        "focus:border-accent focus:outline-none",
        className,
      )}
      {...props}
    />
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-2">
      <span className="label block">{label}</span>
      {children}
      {hint ? <span className="block text-xs text-ink-faint">{hint}</span> : null}
    </label>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="card flex flex-col items-center px-6 py-14 text-center">
      <span
        aria-hidden
        className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-blush text-primary"
      >
        <Icon className="h-6 w-6" />
      </span>
      <h3 className="display mb-2 text-2xl">{title}</h3>
      <p className="mb-6 max-w-sm text-sm text-ink-soft">{description}</p>
      {action}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("skeleton", className)} />;
}

/**
 * Route-level loading placeholder. Mirrors the real page's rhythm — a header
 * block then a stack of cards — so the swap to content doesn't jump.
 */
export function PageSkeleton({ cards = 3 }: { cards?: number }) {
  return (
    <div className="space-y-8" aria-busy="true" aria-label="Loading">
      <div className="space-y-3">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-10 w-64 max-w-full" />
        <Skeleton className="h-3 w-48 max-w-full" />
      </div>

      <div className="space-y-4">
        {Array.from({ length: cards }).map((_, index) => (
          <Skeleton key={index} className="h-28 w-full rounded-xl2" />
        ))}
      </div>
    </div>
  );
}

/** Heart particles — PRD §23 says use these sparingly, so it's opt-in per screen. */
export function HeartDrift({ count = 6 }: { count?: number }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      {Array.from({ length: count }).map((_, index) => (
        <span
          key={index}
          className="absolute opacity-0"
          style={{
            left: `${8 + index * (84 / count)}%`,
            bottom: "-10px",
            animation: `drift ${7 + (index % 4)}s linear ${index * 1.4}s infinite`,
          }}
        >
          <Heart className="h-3.5 w-3.5 fill-current text-primary" />
        </span>
      ))}
    </div>
  );
}
