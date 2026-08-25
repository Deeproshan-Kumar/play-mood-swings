import { clerkMiddleware } from "@clerk/nextjs/server";

/**
 * Next.js 16 renamed the `middleware` convention to `proxy`.
 *
 * This only attaches Clerk's auth context to the request — it deliberately does
 * no route matching. Clerk 7 deprecated `createRouteMatcher` because path
 * patterns can drift from how Next.js actually routes, leaving protected data
 * reachable. Authorisation instead lives next to the data it protects:
 * `requireCoupleContext()` in `app/(app)/layout.tsx` guards every signed-in
 * page, and each Server Action re-checks couple membership itself (PRD §20).
 */
export default clerkMiddleware();

export const config = {
  matcher: [
    // Skip Next.js internals and static files, unless found in search params.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes.
    "/(api|trpc)(.*)",
  ],
};
