import type { ResearchState } from "@arf-os/contracts";

/** Every valid state in the research lifecycle. */
export const ALL_STATES: readonly ResearchState[] = [
  "CAMPAIGN_BACKLOG",
  "IDEA_RESEARCH",
  "HYPOTHESIS_DRAFT",
  "PINE_DEVELOPMENT",
  "TRADINGVIEW_VERIFICATION",
  "PAPER_APPROVAL_REVIEW",
  "PAPER_APPROVED",
  "FORWARD_TESTING",
  "FINAL_REVIEW",
  "RESEARCH_APPROVED",
  "LIVE_CANDIDATE",
  "REJECTED",
  "ARCHIVED",
  "BLOCKED",
] as const;

/** Terminal states — no further transitions possible. */
export const TERMINAL_STATES = new Set<ResearchState>([
  "REJECTED",
  "ARCHIVED",
  "LIVE_CANDIDATE",
]);
