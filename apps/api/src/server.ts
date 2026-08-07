/**
 * Fastify server factory.
 * Registers plugins, auth middleware, error handler, and all routes.
 */
import Fastify, { type FastifyInstance, type FastifyRequest, type FastifyReply } from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { stubAuthFromHeaders, isStubMode } from "@arf-os/auth";
import { UnauthorizedError, ForbiddenError } from "@arf-os/auth";
import type { AuthContext } from "@arf-os/auth";
// ProblemDetailSchema not imported directly since URNs fail z.string().url() validation
import { NotFoundError, DomainValidationError, ConflictError } from "./lib/errors.js";
import { registerCampaignRoutes } from "./routes/campaigns.js";
import { registerStrategyRoutes } from "./routes/strategies.js";
import { registerVerificationRoutes } from "./routes/verifications.js";
import { registerDecisionRoutes } from "./routes/decisions.js";
import { registerAuditRoutes } from "./routes/audit.js";

declare module "fastify" {
  interface FastifyRequest {
    auth: AuthContext;
  }
}

export async function buildServer(): Promise<FastifyInstance> {
  const server = Fastify({
    logger: {
      level: process.env["LOG_LEVEL"] ?? "info",
      transport:
        process.env["NODE_ENV"] !== "production"
          ? { target: "pino-pretty", options: { colorize: true } }
          : undefined,
    },
    ajv: {
      customOptions: {
        strict: false,
      },
    },
  });

  // ── Plugins ──────────────────────────────────────────────────────────────────

  await server.register(cors, {
    origin: process.env["CORS_ORIGIN"] ?? "http://localhost:3000",
    credentials: true,
  });

  await server.register(multipart, {
    limits: {
      fileSize: 50 * 1024 * 1024, // 50 MB
      files: 1,
    },
  });

  // ── Auth middleware ───────────────────────────────────────────────────────────

  server.addHook("onRequest", async (request: FastifyRequest, _reply: FastifyReply) => {
    if (request.url === "/health" || request.url === "/ready") return;

    if (isStubMode()) {
      const ctx = stubAuthFromHeaders(request.headers as Record<string, string | string[] | undefined>);
      if (!ctx) {
        throw new UnauthorizedError("Stub auth headers missing");
      }
      request.auth = ctx;
    } else {
      // Production Clerk auth — not yet implemented; placeholder
      throw new UnauthorizedError("Production auth not configured. Set STUB_AUTH=true for development.");
    }
  });

  // ── Health ────────────────────────────────────────────────────────────────────

  server.get("/health", async () => ({ status: "ok" }));
  server.get("/ready", async () => ({ status: "ready" }));

  // ── Routes ───────────────────────────────────────────────────────────────────

  await server.register(registerCampaignRoutes, { prefix: "/api/v1" });
  await server.register(registerStrategyRoutes, { prefix: "/api/v1" });
  await server.register(registerVerificationRoutes, { prefix: "/api/v1" });
  await server.register(registerDecisionRoutes, { prefix: "/api/v1" });
  await server.register(registerAuditRoutes, { prefix: "/api/v1" });

  // ── Error handler ─────────────────────────────────────────────────────────────

  server.setErrorHandler((error, request, reply) => {
    // Don't log 4xx as errors
    if (error instanceof UnauthorizedError) {
      return reply.status(401).send({
        type: "urn:arf-os:error:unauthorized",
        title: "Unauthorized",
        status: 401,
        detail: error.message,
        instance: request.url,
        code: "UNAUTHORIZED",
        traceId: request.id,
      });
    }

    if (error instanceof ForbiddenError) {
      return reply.status(403).send({
        type: "urn:arf-os:error:forbidden",
        title: "Forbidden",
        status: 403,
        detail: error.message,
        instance: request.url,
        code: "FORBIDDEN",
        traceId: request.id,
      });
    }

    // Typed domain errors
    if (error instanceof DomainValidationError) {
      return reply.status(422).send({
        type: "urn:arf-os:error:validation",
        title: "Validation Error",
        status: 422,
        detail: error.message,
        instance: request.url,
        code: "VALIDATION_ERROR",
        traceId: request.id,
        errors: error.issues,
      });
    }

    if (error instanceof NotFoundError) {
      return reply.status(404).send({
        type: "urn:arf-os:error:not-found",
        title: "Not Found",
        status: 404,
        detail: error.message,
        instance: request.url,
        code: "NOT_FOUND",
        traceId: request.id,
      });
    }

    if (error instanceof ConflictError) {
      return reply.status(409).send({
        type: "urn:arf-os:error:conflict",
        title: "Conflict",
        status: 409,
        detail: error.message,
        instance: request.url,
        code: "CONFLICT",
        traceId: request.id,
      });
    }

    // Fastify-built not-found (404) for unregistered routes
    if (error.statusCode === 404) {
      return reply.status(404).send({
        type: "urn:arf-os:error:not-found",
        title: "Not Found",
        status: 404,
        detail: error.message,
        instance: request.url,
        code: "NOT_FOUND",
        traceId: request.id,
      });
    }

    // Old name-based check for errors thrown as plain Error objects
    if (error.name === "DomainValidationError") {
      return reply.status(422).send({
        type: "urn:arf-os:error:validation",
        title: "Validation Error",
        status: 422,
        detail: error.message,
        instance: request.url,
        code: "VALIDATION_ERROR",
        traceId: request.id,
        errors: (error as { issues?: unknown }).issues,
      });
    }

    // Default 500
    server.log.error({ err: error, url: request.url }, "Unhandled error");
    return reply.status(500).send({
      type: "urn:arf-os:error:internal",
      title: "Internal Server Error",
      status: 500,
      detail: "An unexpected error occurred.",
      instance: request.url,
      code: "INTERNAL_ERROR",
      traceId: request.id,
    });
  });

  return server;
}
