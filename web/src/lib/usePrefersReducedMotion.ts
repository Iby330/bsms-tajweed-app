"use client";

import { useSyncExternalStore } from "react";

/**
 * Whether this visitor has asked the system for less motion.
 *
 * A media query is external state, so it is subscribed to rather than copied
 * into React state inside an effect. Doing it the other way renders twice and
 * quietly makes the query the owner of a value the UI often needs to let the
 * visitor override — which is how a pause button ends up fighting a preference.
 */
const QUERY = "(prefers-reduced-motion: reduce)";

const subscribe = (onChange: () => void) => {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
};

const read = () => window.matchMedia(QUERY).matches;

/**
 * The server has no media queries, and guessing "reduce" would render every
 * animation in its finished state and then start it moving during hydration —
 * the exact jolt the setting exists to prevent. False is safe because the CSS
 * carries its own `prefers-reduced-motion` rules regardless of what JS thinks.
 */
const readOnServer = () => false;

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, read, readOnServer);
}
