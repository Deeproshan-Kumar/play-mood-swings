/** Shared shape for `useActionState` results across every form in the app. */
export type ActionState = {
  error?: string;
  success?: string;
} | null;

export function fail(error: string): ActionState {
  return { error };
}

export function ok(success?: string): ActionState {
  return { success: success ?? "Saved" };
}

/** Narrows unknown thrown values to a message we're willing to show a user. */
export function messageFrom(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
