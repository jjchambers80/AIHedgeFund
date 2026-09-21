/**
 * @arf-os/ui — shared UI component library.
 *
 * Components are co-located in apps/web for this milestone.
 * This package provides shared primitives and token exports.
 */

export type { ReactNode } from "react";

/** Design token identifiers used across the UI. */
export const tokens = {
  colours: {
    success: "var(--success)",
    danger: "var(--danger)",
    warning: "var(--warning)",
    accent: "var(--accent)",
    mutedFg: "var(--muted-fg)",
    cardBorder: "var(--card-border)",
    card: "var(--card)",
    background: "var(--background)",
    foreground: "var(--foreground)",
  },
} as const;

/** Status colour helper — maps a lifecycle state string to a CSS class fragment. */
export function lifecycleColour(state: string): string {
  if (state === "RESEARCH_APPROVED" || state === "LIVE_CANDIDATE") return "text-[var(--success)]";
  if (state === "REJECTED" || state === "ARCHIVED") return "text-[var(--danger)]";
  if (
    state === "TRADINGVIEW_VERIFICATION" ||
    state === "PINE_DEVELOPMENT" ||
    state === "PAPER_APPROVAL_REVIEW"
  )
    return "text-[var(--warning)]";
  return "text-[var(--muted-fg)]";
}

/** Parity status colour helper. */
export function parityColour(status: string): string {
  if (status === "PASS") return "text-[var(--success)]";
  if (status === "WARN") return "text-[var(--warning)]";
  if (status === "FAIL") return "text-[var(--danger)]";
  return "text-[var(--muted-fg)]";
}
