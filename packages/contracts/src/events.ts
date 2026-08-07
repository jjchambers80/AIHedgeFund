import { z } from "zod";

/** Envelope for all domain events stored in the outbox. */
export const DomainEventSchema = z.object({
  id: z.string(),
  eventType: z.string(),       // e.g. "strategy_version.created"
  eventVersion: z.string().default("1.0"),
  aggregateType: z.string(),
  aggregateId: z.string(),
  correlationId: z.string().nullable(),
  causationId: z.string().nullable(),
  actorId: z.string().nullable(),
  payload: z.record(z.unknown()),
  traceId: z.string().nullable(),
  occurredAt: z.string().datetime(),
});
export type DomainEvent = z.infer<typeof DomainEventSchema>;

export const OutboxEventSchema = z.object({
  id: z.string(),
  event: DomainEventSchema,
  publishedAt: z.string().datetime().nullable(),
  attempts: z.number().int().default(0),
  createdAt: z.string().datetime(),
});
export type OutboxEvent = z.infer<typeof OutboxEventSchema>;

/** Idempotency record for commands. */
export const IdempotencyRecordSchema = z.object({
  id: z.string(),
  idempotencyKey: z.string(),
  requestHash: z.string(),
  responseRef: z.string().nullable(),
  actorId: z.string(),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
});
export type IdempotencyRecord = z.infer<typeof IdempotencyRecordSchema>;

/** API error shape (RFC 9457 problem-details). */
export const ProblemDetailSchema = z.object({
  type: z.string().url().optional(),
  title: z.string(),
  status: z.number().int(),
  detail: z.string(),
  instance: z.string().optional(),
  code: z.string(),
  traceId: z.string().optional(),
  errors: z.array(z.object({ field: z.string(), message: z.string() })).optional(),
});
export type ProblemDetail = z.infer<typeof ProblemDetailSchema>;

/** Cursor-paginated list response envelope. */
export const PageSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    items: z.array(itemSchema),
    nextCursor: z.string().nullable(),
    total: z.number().int().optional(),
  });
