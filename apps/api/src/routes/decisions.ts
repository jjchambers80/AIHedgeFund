import type { FastifyInstance } from "fastify";
import { getDb } from "@arf-os/db";
import { DomainValidationError } from "../lib/errors.js";
import { CreateDecisionRequestSchema } from "@arf-os/contracts";
import { createDecision, listDecisions } from "../services/decision-service.js";

function parseBody<T>(
  schema: {
    safeParse(v: unknown):
      | { success: true; data: T }
      | { success: false; error: { issues: unknown } };
  },
  body: unknown,
): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new DomainValidationError("Validation failed", (parsed as { success: false; error: { issues: unknown } }).error.issues);
  }
  return parsed.data;
}

export async function registerDecisionRoutes(server: FastifyInstance) {
  const db = getDb();

  server.post("/decisions", async (request, reply) => {
    const data = parseBody(CreateDecisionRequestSchema, request.body);
    const decision = await createDecision(
      db,
      request.auth.orgId,
      request.auth.userId,
      request.auth.role,
      data,
      request.id,
    );
    return reply.status(201).send(decision);
  });

  server.get("/decisions", async (request) => {
    const q = request.query as { strategyVersionId?: string };
    if (!q.strategyVersionId) {
      throw new DomainValidationError("strategyVersionId query param is required");
    }
    return listDecisions(db, request.auth.orgId, q.strategyVersionId);
  });
}
