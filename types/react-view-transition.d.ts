import type { ReactNode } from "react";

/**
 * `<ViewTransition>` ships in the React build Next.js vendors for the App
 * Router, but `@types/react` has not caught up. Declared here so the component
 * is typed rather than reached through `any`.
 *
 * Verified present at: node_modules/next/dist/compiled/react/cjs/react.production.js
 */
declare module "react" {
  type ViewTransitionClass = string | Record<string, string>;

  interface ViewTransitionInstance {
    group: Element;
    old: Element | null;
    new: Element | null;
  }

  interface ViewTransitionProps {
    children?: ReactNode;
    /** Shared name — matching names morph between routes. */
    name?: string;
    /** `view-transition-class` applied when no more specific prop matches. */
    default?: ViewTransitionClass;
    enter?: ViewTransitionClass;
    exit?: ViewTransitionClass;
    update?: ViewTransitionClass;
    share?: ViewTransitionClass;
    onEnter?: (instance: ViewTransitionInstance, types: string[]) => void;
    onExit?: (instance: ViewTransitionInstance, types: string[]) => void;
    onUpdate?: (instance: ViewTransitionInstance, types: string[]) => void;
    onShare?: (instance: ViewTransitionInstance, types: string[]) => void;
  }

  export const ViewTransition: (props: ViewTransitionProps) => ReactNode;
}
