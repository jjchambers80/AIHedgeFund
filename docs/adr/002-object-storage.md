# ADR-002: Object Storage — S3-Compatible (Cloudflare R2 / MinIO)

**Status:** Accepted

## Context

ARF-OS produces and consumes large binary artefacts that are not suited to PostgreSQL column storage: Pine source bundles, TradingView CSV exports, backtest report archives, equity series snapshots, raw model outputs, and chart exports. These artefacts are immutable once written — they correspond to a specific strategy version or backtest run and must be reproducible from their stored form. Access control must follow organisation boundaries, and client browsers need to upload CSV files directly without routing multi-megabyte payloads through the API process.

## Decision

Use **S3-compatible object storage** throughout. In production the target is **Cloudflare R2**, which eliminates egress fees and is hosted close to Cloudflare Workers if edge delivery is added later. For local development and CI, **MinIO** provides a self-hosted S3-compatible endpoint that requires no external credentials.

The `packages/db/src/storage.ts` module wraps the AWS SDK v3 S3 client and exposes four operations: presigned PUT URL, presigned GET URL, direct put (for workers), and direct get. All callers go through this module — no other code imports the S3 client directly.

Object keys follow an org-scoped path convention: `orgs/{orgId}/strategies/{strategyId}/versions/{versionId}/{subPath}`. The `buildObjectKey` helper enforces this layout. The API verifies organisation ownership before issuing any presigned URL, ensuring a user from org A cannot construct a key for org B's data.

Presigned PUT URLs are valid for 15 minutes. Presigned GET URLs are valid for 1 hour. Both values are configurable in the storage module.

## Alternatives

**PostgreSQL `bytea` columns** — simple to operate but unsuitable for files above a few MB, adds bloat to the primary database, and cannot support direct browser uploads. Rejected.

**Cloudflare Workers KV** — key/value store unsuitable for binary blobs of arbitrary size and without the streaming semantics needed for large report files. Rejected.

**Self-hosted Ceph** — full S3 API compatibility with high durability. Operationally heavier than MinIO for a small team and provides no benefit over R2 in production. Not selected for MVP.

## Consequences

- Object keys are the permanent external reference to artefacts. Once written, a key must not be reused for different content.
- Upload size is capped at 50 MB in the multipart plugin configuration; this covers all expected CSV and report sizes.
- The API must validate file type and checksum after the browser upload completes, before marking the verification task as uploaded.
- R2 credentials (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`) must be present in all non-development environments.

## Security implications

Presigned URLs grant unauthenticated access for their duration. The API must validate the requesting user's organisation membership before issuing them. Object keys must not be guessable — use UUIDs or content-addressed hashes, not user-supplied filenames. Bucket policy must deny public listing. Credentials must rotate on a schedule and must never appear in logs or model payloads.

## Migration/rollback

Because the storage layer is isolated behind `packages/db/src/storage.ts`, switching providers requires only updating the client factory and environment variables. Existing object keys remain valid as long as the bucket and path convention are preserved. A bulk copy (`aws s3 sync` or equivalent) migrates artefacts between buckets if the provider changes.
