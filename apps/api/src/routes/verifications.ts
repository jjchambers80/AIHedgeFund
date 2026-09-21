import type { FastifyInstance } from "fastify";
import { getDb } from "@arf-os/db";
import { DomainValidationError } from "../lib/errors.js";
import { CreateVerificationRequestSchema, CompleteUploadRequestSchema } from "@arf-os/contracts";
import {
  createVerification,
  getVerification,
  presignUpload,
  completeUpload,
  listUploads,
} from "../services/verification-service.js";

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

export async function registerVerificationRoutes(server: FastifyInstance) {
  const db = getDb();

  server.post("/verifications", async (request, reply) => {
    const data = parseBody(CreateVerificationRequestSchema, request.body);
    const verif = await createVerification(
      db,
      request.auth.orgId,
      request.auth.userId,
      data,
      request.id,
    );
    return reply.status(201).send(verif);
  });

  server.get<{ Params: { id: string } }>("/verifications/:id", async (request) => {
    return getVerification(db, request.auth.orgId, request.params.id);
  });

  server.get<{ Params: { id: string } }>("/verifications/:id/uploads", async (request) => {
    return listUploads(db, request.auth.orgId, request.params.id);
  });

  server.post<{ Params: { id: string } }>(
    "/verifications/:id/presign",
    async (request, reply) => {
      const { reportType } = request.body as { reportType: "PERFORMANCE_SUMMARY" | "LIST_OF_TRADES" };
      if (reportType !== "PERFORMANCE_SUMMARY" && reportType !== "LIST_OF_TRADES") {
        throw new DomainValidationError("reportType must be PERFORMANCE_SUMMARY or LIST_OF_TRADES");
      }
      const result = await presignUpload(
        db,
        request.auth.orgId,
        request.auth.userId,
        request.params.id,
        reportType,
        request.id,
      );
      return reply.status(201).send(result);
    },
  );

  server.post<{ Params: { id: string; uploadId: string } }>(
    "/verifications/:id/uploads/:uploadId/complete",
    async (request) => {
      const data = parseBody(CompleteUploadRequestSchema, request.body);
      return completeUpload(
        db,
        request.auth.orgId,
        request.auth.userId,
        request.params.id,
        request.params.uploadId,
        data,
        request.id,
      );
    },
  );
}
