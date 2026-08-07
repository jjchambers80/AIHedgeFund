import type { ResearchState, Role } from "@arf-os/contracts";

export interface TransitionRule {
  from: ResearchState;
  to: ResearchState;
  /** Roles that may trigger this transition. */
  allowedRoles: Role[];
  /** True when a human must explicitly approve (not just any role). */
  requiresHumanApproval: boolean;
  /** Evidence type IDs that must be present before this transition is allowed. */
  requiredEvidenceTypes: string[];
  /** Description for ADR / audit records. */
  description: string;
}

export const TRANSITION_RULES: TransitionRule[] = [
  {
    from: "CAMPAIGN_BACKLOG",
    to: "IDEA_RESEARCH",
    allowedRoles: ["RESEARCHER", "ADMIN", "SERVICE_ACCOUNT"],
    requiresHumanApproval: false,
    requiredEvidenceTypes: [],
    description: "Start idea research for the campaign",
  },
  {
    from: "IDEA_RESEARCH",
    to: "HYPOTHESIS_DRAFT",
    allowedRoles: ["RESEARCHER", "DEVELOPER", "ADMIN", "SERVICE_ACCOUNT"],
    requiresHumanApproval: false,
    requiredEvidenceTypes: ["idea_card"],
    description: "Idea accepted; begin hypothesis formalisation",
  },
  {
    from: "IDEA_RESEARCH",
    to: "REJECTED",
    allowedRoles: ["RESEARCHER", "VALIDATOR", "ADMIN"],
    requiresHumanApproval: false,
    requiredEvidenceTypes: [],
    description: "Idea rejected at scout stage",
  },
  {
    from: "HYPOTHESIS_DRAFT",
    to: "PINE_DEVELOPMENT",
    allowedRoles: ["DEVELOPER", "ADMIN", "SERVICE_ACCOUNT"],
    requiresHumanApproval: false,
    requiredEvidenceTypes: ["strategy_definition"],
    description: "Strategy definition complete; begin Pine implementation",
  },
  {
    from: "PINE_DEVELOPMENT",
    to: "TRADINGVIEW_VERIFICATION",
    allowedRoles: ["DEVELOPER", "ADMIN", "SERVICE_ACCOUNT"],
    requiresHumanApproval: false,
    requiredEvidenceTypes: ["pine_revision"],
    description: "Pine source ready; queue TradingView verification",
  },
  {
    from: "PINE_DEVELOPMENT",
    to: "REJECTED",
    allowedRoles: ["DEVELOPER", "VALIDATOR", "ADMIN"],
    requiresHumanApproval: false,
    requiredEvidenceTypes: [],
    description: "Pine implementation rejected (compile failure, static errors)",
  },
  {
    from: "TRADINGVIEW_VERIFICATION",
    to: "PAPER_APPROVAL_REVIEW",
    allowedRoles: ["DEVELOPER", "OPERATOR", "ADMIN"],
    requiresHumanApproval: false,
    requiredEvidenceTypes: ["parity_report"],
    description: "Parity verified; send to paper approval committee",
  },
  {
    from: "TRADINGVIEW_VERIFICATION",
    to: "REJECTED",
    allowedRoles: ["DEVELOPER", "VALIDATOR", "ADMIN"],
    requiresHumanApproval: false,
    requiredEvidenceTypes: ["parity_report"],
    description: "TradingView parity failed",
  },
  {
    from: "PAPER_APPROVAL_REVIEW",
    to: "PAPER_APPROVED",
    allowedRoles: ["COMMITTEE_MEMBER", "ADMIN"],
    requiresHumanApproval: true,
    requiredEvidenceTypes: ["committee_decision", "parity_report"],
    description: "Committee approves paper testing",
  },
  {
    from: "PAPER_APPROVAL_REVIEW",
    to: "REJECTED",
    allowedRoles: ["COMMITTEE_MEMBER", "ADMIN"],
    requiresHumanApproval: true,
    requiredEvidenceTypes: ["committee_decision"],
    description: "Committee rejects the strategy",
  },
  {
    from: "PAPER_APPROVAL_REVIEW",
    to: "HYPOTHESIS_DRAFT",
    allowedRoles: ["COMMITTEE_MEMBER", "ADMIN"],
    requiresHumanApproval: true,
    requiredEvidenceTypes: ["committee_decision"],
    description: "Committee requests rework with a new version",
  },
  // allow any state → BLOCKED
  ...([
    "CAMPAIGN_BACKLOG",
    "IDEA_RESEARCH",
    "HYPOTHESIS_DRAFT",
    "PINE_DEVELOPMENT",
    "TRADINGVIEW_VERIFICATION",
    "PAPER_APPROVAL_REVIEW",
  ] as ResearchState[]).map((from) => ({
    from,
    to: "BLOCKED" as ResearchState,
    allowedRoles: ["RESEARCHER", "DEVELOPER", "OPERATOR", "ADMIN", "SERVICE_ACCOUNT"] as Role[],
    requiresHumanApproval: false,
    requiredEvidenceTypes: [],
    description: "Block due to missing data or external dependency",
  })),
];

/** Index for fast lookup: "from → to" */
export const TRANSITION_MAP: Map<string, TransitionRule> = new Map(
  TRANSITION_RULES.map((r) => [`${r.from}→${r.to}`, r]),
);

export function findRule(
  from: ResearchState,
  to: ResearchState,
): TransitionRule | undefined {
  return TRANSITION_MAP.get(`${from}→${to}`);
}
