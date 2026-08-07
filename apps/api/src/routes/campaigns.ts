import type { FastifyInstance } from "fastify";
import { getDb } from "@arf-os/db";
import { CreateCampaignRequestSchema } from "@arf-os/contracts";
import {
  listCampaigns,
  getCampaign,
  createCampaign,
  listResearchTasks,
} from "../services/campaign-service.js";
import { DomainValidationError } from "../lib/errors.js";

export async function registerCampaignRoutes(server: FastifyInstance) {
  const db = getDb();

  server.get("/campaigns", async (request) => {
    const q = request.query as { cursor?: string; limit?: string };
    return listCampaigns({
      db,
      orgId: request.auth.orgId,
      actorId: request.auth.userId,
      cursor: q.cursor ?? null,
      limit: q.limit ? parseInt(q.limit, 10) : 25,
    });
  });

  server.get<{ Params: { id: string } }>("/campaigns/:id", async (request) => {
    return getCampaign(db, request.auth.orgId, request.params.id);
  });

  server.post("/campaigns", async (request, reply) => {
    const parsed = CreateCampaignRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new DomainValidationError("Validation failed", parsed.error.issues);
    }
    const campaign = await createCampaign({
      db,
      orgId: request.auth.orgId,
      actorId: request.auth.userId,
      data: parsed.data,
      traceId: request.id,
    });
    return reply.status(201).send(campaign);
  });

  server.get<{ Params: { id: string } }>("/campaigns/:id/tasks", async (request) => {
    return listResearchTasks(db, request.auth.orgId, request.params.id);
  });
}
