import type { FastifyInstance } from "fastify";
import { getDb } from "@arf-os/db";
import { DomainValidationError } from "../lib/errors.js";
import {
  CreateStrategyRequestSchema,
  CreateStrategyVersionRequestSchema,
  UploadSDLRequestSchema,
  UploadPineRequestSchema,
} from "@arf-os/contracts";
import {
  listStrategies,
  getStrategy,
  createStrategy,
  listVersions,
  getVersion,
  createVersion,
  uploadSDL,
  uploadPine,
  getPineRevision,
} from "../services/strategy-service.js";
import {
  getBacktestMetrics,
  getEquityCurve,
  getDrawdownCurve,
  getParityReport,
  getTrades,
} from "../services/verification-service.js";

function parseBody<T>(schema: { safeParse(v: unknown): { success: true; data: T } | { success: false; error: { issues: unknown } } }, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new DomainValidationError("Validation failed", (parsed as { success: false; error: { issues: unknown } }).error.issues);
  }
  return parsed.data;
}

export async function registerStrategyRoutes(server: FastifyInstance) {
  const db = getDb();

  // ── Strategies ──────────────────────────────────────────────────────────────

  server.get("/strategies", async (request) => {
    return listStrategies(db, request.auth.orgId);
  });

  server.get<{ Params: { id: string } }>("/strategies/:id", async (request) => {
    return getStrategy(db, request.auth.orgId, request.params.id);
  });

  server.post("/strategies", async (request, reply) => {
    const data = parseBody(CreateStrategyRequestSchema, request.body);
    const strategy = await createStrategy(db, request.auth.orgId, request.auth.userId, data, request.id);
    return reply.status(201).send(strategy);
  });

  // ── Versions ────────────────────────────────────────────────────────────────

  server.get<{ Params: { id: string } }>("/strategies/:id/versions", async (request) => {
    return listVersions(db, request.auth.orgId, request.params.id);
  });

  server.post<{ Params: { id: string } }>("/strategies/:id/versions", async (request, reply) => {
    const data = parseBody(CreateStrategyVersionRequestSchema, request.body);
    const version = await createVersion(
      db,
      request.auth.orgId,
      request.auth.userId,
      request.params.id,
      data,
      request.id,
    );
    return reply.status(201).send(version);
  });

  server.get<{ Params: { versionId: string } }>("/versions/:versionId", async (request) => {
    return getVersion(db, request.auth.orgId, request.params.versionId);
  });

  // ── SDL ──────────────────────────────────────────────────────────────────────

  server.put<{ Params: { versionId: string } }>("/versions/:versionId/sdl", async (request) => {
    const data = parseBody(UploadSDLRequestSchema, request.body);
    return uploadSDL(db, request.auth.orgId, request.auth.userId, request.params.versionId, data, request.id);
  });

  // ── Pine ─────────────────────────────────────────────────────────────────────

  server.put<{ Params: { versionId: string } }>("/versions/:versionId/pine", async (request) => {
    const data = parseBody(UploadPineRequestSchema, request.body);
    return uploadPine(db, request.auth.orgId, request.auth.userId, request.params.versionId, data, request.id);
  });

  server.get<{ Params: { versionId: string } }>("/versions/:versionId/pine", async (request) => {
    return getPineRevision(db, request.auth.orgId, request.params.versionId);
  });

  // ── Metrics / Equity / Drawdown / Parity / Trades ────────────────────────────

  server.get<{ Params: { versionId: string } }>("/versions/:versionId/metrics", async (request) => {
    const result = await getBacktestMetrics(db, request.auth.orgId, request.params.versionId);
    if (!result) return { backtestRunId: null, snapshots: [] };
    return result;
  });

  server.get<{ Params: { versionId: string } }>("/versions/:versionId/equity", async (request) => {
    const result = await getEquityCurve(db, request.auth.orgId, request.params.versionId);
    if (!result) return { backtestRunId: null, points: [] };
    return result;
  });

  server.get<{ Params: { versionId: string } }>("/versions/:versionId/drawdown", async (request) => {
    const result = await getDrawdownCurve(db, request.auth.orgId, request.params.versionId);
    if (!result) return { backtestRunId: null, points: [] };
    return result;
  });

  server.get<{ Params: { versionId: string } }>("/versions/:versionId/parity", async (request) => {
    return getParityReport(db, request.auth.orgId, request.params.versionId);
  });

  server.get<{ Params: { versionId: string } }>("/versions/:versionId/trades", async (request) => {
    const q = request.query as { cursor?: string; limit?: string };
    return getTrades(
      db,
      request.auth.orgId,
      request.params.versionId,
      q.cursor,
      q.limit ? parseInt(q.limit, 10) : 100,
    );
  });
}
