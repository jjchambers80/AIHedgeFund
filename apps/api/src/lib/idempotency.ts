/**
 * Idempotency-Key support (CLAUDE.md §3.6 / §17.5).
 *
 * Commands accept an `Idempotency-Key` header. Retried requests with the same
 * key and body replay the original response; the same key with a different
 * body is rejected with 409. Backed by the `idempotency_records` table.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import type { Db } from "@arf-os/db";
import { idempotencyRecords } from "@arf-os/db";
import { ConflictError } from "./errors.js";

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(record[k])}`).join(",")}}`;
}

function hashRequest(method: string, url: string, body: unknown): string {
  return createHash("sha256")
    .update(`${method} ${url}\n${stableStringify(body ?? null)}`)
    .digest("hex");
}

declare module "fastify" {
  interface FastifyRequest {
    idempotency?: { key: string; requestHash: string };
  }
}

export function registerIdempotency(server: FastifyInstance, db: Db): void {
  server.addHook("preHandler", async (request: FastifyRequest, reply: FastifyReply) => {
    const header = request.headers["idempotency-key"];
    if (!header || request.method === "GET") return;

    const key = Array.isArray(header) ? header[0]! : header;
    const requestHash = hashRequest(request.method, request.url, request.body);

    const existingRows = await db
      .select()
      .from(idempotencyRecords)
      .where(eq(idempotencyRecords.idempotencyKey, key));
    const record = existingRows[0];

    if (record) {
      if (record.expiresAt.getTime() < Date.now()) {
        // Expired — treat as a fresh request; a new record will overwrite via re-insert below.
      } else if (record.requestHash !== requestHash) {
        throw new ConflictError(
          `Idempotency-Key '${key}' was already used with a different request body.`,
        );
      } else {
        const stored = record.responseRef
          ? (JSON.parse(record.responseRef) as { status: number; body: unknown })
          : { status: 200, body: null };
        reply.status(stored.status);
        reply.type("application/json");
        await reply.send(stored.body);
        return;
      }
    }

    request.idempotency = { key, requestHash };
  });

  server.addHook("onSend", async (request: FastifyRequest, reply: FastifyReply, payload: unknown) => {
    const info = request.idempotency;
    if (!info) return payload;
    if (reply.statusCode < 200 || reply.statusCode >= 300) return payload;

    try {
      const body = typeof payload === "string" ? (payload.length > 0 ? JSON.parse(payload) : null) : payload;
      const responseRef = JSON.stringify({ status: reply.statusCode, body });
      await db
        .insert(idempotencyRecords)
        .values({
          id: uuidv7(),
          idempotencyKey: info.key,
          requestHash: info.requestHash,
          responseRef,
          actorId: request.auth?.userId ?? "unknown",
          expiresAt: new Date(Date.now() + IDEMPOTENCY_TTL_MS),
        })
        .onConflictDoNothing();
    } catch (err) {
      // Idempotency recording is best-effort — never fail the actual response over it.
      request.log.warn({ err }, "Failed to persist idempotency record");
    }

    return payload;
  });
}
