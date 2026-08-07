/**
 * The ARF-OS workflow state machine.
 *
 * This is the single authority for lifecycle transitions.
 * Workers NEVER call this directly — they emit domain events.
 * The API/orchestrator calls transition() after validating evidence.
 */
import type { ResearchState, Role } from "@arf-os/contracts";
import { TERMINAL_STATES } from "./states.js";
import { findRule } from "./transitions.js";

export interface TransitionInput {
  from: ResearchState;
  to: ResearchState;
  actorRole: Role;
  actorId: string;
  evidenceTypes: string[];   // e.g. ["parity_report", "committee_decision"]
  humanApproved?: boolean;
  reason?: string;
  policyVersion?: string;
}

export type TransitionResult =
  | { ok: true; to: ResearchState }
  | { ok: false; code: TransitionErrorCode; message: string };

export type TransitionErrorCode =
  | "NO_RULE"
  | "TERMINAL_STATE"
  | "ROLE_DENIED"
  | "HUMAN_APPROVAL_REQUIRED"
  | "MISSING_EVIDENCE";

export function transition(input: TransitionInput): TransitionResult {
  const { from, to, actorRole, evidenceTypes, humanApproved } = input;

  if (TERMINAL_STATES.has(from)) {
    return { ok: false, code: "TERMINAL_STATE", message: `State ${from} is terminal` };
  }

  const rule = findRule(from, to);
  if (!rule) {
    return { ok: false, code: "NO_RULE", message: `No transition defined from ${from} to ${to}` };
  }

  if (!rule.allowedRoles.includes(actorRole)) {
    return {
      ok: false,
      code: "ROLE_DENIED",
      message: `Role ${actorRole} is not permitted to trigger ${from}→${to}`,
    };
  }

  if (rule.requiresHumanApproval && !humanApproved) {
    return {
      ok: false,
      code: "HUMAN_APPROVAL_REQUIRED",
      message: `Transition ${from}→${to} requires explicit human approval`,
    };
  }

  const missing = rule.requiredEvidenceTypes.filter((e) => !evidenceTypes.includes(e));
  if (missing.length > 0) {
    return {
      ok: false,
      code: "MISSING_EVIDENCE",
      message: `Missing required evidence: ${missing.join(", ")}`,
    };
  }

  return { ok: true, to };
}
