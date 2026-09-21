import { describe, it, expect } from "vitest";
import { transition } from "../machine.js";

describe("workflow state machine", () => {
  it("allows a valid transition with correct role", () => {
    const result = transition({
      from: "CAMPAIGN_BACKLOG",
      to: "IDEA_RESEARCH",
      actorRole: "RESEARCHER",
      actorId: "user_1",
      evidenceTypes: [],
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.to).toBe("IDEA_RESEARCH");
  });

  it("rejects a transition with wrong role", () => {
    const result = transition({
      from: "CAMPAIGN_BACKLOG",
      to: "IDEA_RESEARCH",
      actorRole: "VIEWER",
      actorId: "user_1",
      evidenceTypes: [],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("ROLE_DENIED");
  });

  it("rejects a transition from a terminal state", () => {
    const result = transition({
      from: "REJECTED",
      to: "IDEA_RESEARCH",
      actorRole: "ADMIN",
      actorId: "user_1",
      evidenceTypes: [],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("TERMINAL_STATE");
  });

  it("rejects undefined transition", () => {
    const result = transition({
      from: "CAMPAIGN_BACKLOG",
      to: "RESEARCH_APPROVED", // no direct path
      actorRole: "ADMIN",
      actorId: "user_1",
      evidenceTypes: [],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("NO_RULE");
  });

  it("rejects when required evidence is missing", () => {
    // IDEA_RESEARCH → HYPOTHESIS_DRAFT requires "idea_card"
    const result = transition({
      from: "IDEA_RESEARCH",
      to: "HYPOTHESIS_DRAFT",
      actorRole: "RESEARCHER",
      actorId: "user_1",
      evidenceTypes: [], // missing idea_card
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("MISSING_EVIDENCE");
  });

  it("passes when required evidence is present", () => {
    const result = transition({
      from: "IDEA_RESEARCH",
      to: "HYPOTHESIS_DRAFT",
      actorRole: "RESEARCHER",
      actorId: "user_1",
      evidenceTypes: ["idea_card"],
    });
    expect(result.ok).toBe(true);
  });

  it("ADMIN can perform any allowed transition", () => {
    const result = transition({
      from: "CAMPAIGN_BACKLOG",
      to: "IDEA_RESEARCH",
      actorRole: "ADMIN",
      actorId: "admin_1",
      evidenceTypes: [],
    });
    expect(result.ok).toBe(true);
  });

  it("is pure — calling it twice with identical input yields identical output and no side effects", () => {
    // transition() itself has no state to dedupe against (CLAUDE.md §3.6's
    // "idempotent transition command" requirement is satisfied one layer up,
    // via the API's Idempotency-Key handling — see apps/api/src/lib/idempotency.ts
    // — since a *command* like "record this decision" is what must not be
    // double-applied, not this pure rule evaluation). What this function must
    // guarantee is that it's safe to call repeatedly: same input in, same
    // result out, nothing mutated.
    const input = {
      from: "IDEA_RESEARCH" as const,
      to: "HYPOTHESIS_DRAFT" as const,
      actorRole: "RESEARCHER" as const,
      actorId: "user_1",
      evidenceTypes: ["idea_card"],
    };
    const first = transition(input);
    const second = transition(input);
    const third = transition({ ...input }); // fresh object, same values
    expect(second).toEqual(first);
    expect(third).toEqual(first);
  });
});
