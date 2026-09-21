/**
 * Cloudflare R2 (S3-compatible) object storage client.
 * Provides presigned upload URLs and raw put/get operations.
 */
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

function getS3Client(): S3Client {
  const accountId = process.env["R2_ACCOUNT_ID"];
  const accessKeyId = process.env["R2_ACCESS_KEY_ID"];
  const secretAccessKey = process.env["R2_SECRET_ACCESS_KEY"];

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error("R2 credentials (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY) are not set");
  }

  return new S3Client({
    region: "auto",
    endpoint: process.env["R2_ENDPOINT"] ?? `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: !!process.env["R2_ENDPOINT"],
  });
}

const bucket = () => {
  const b = process.env["R2_BUCKET"];
  if (!b) throw new Error("R2_BUCKET is not set");
  return b;
};

/** Generate a presigned PUT URL for direct browser upload. Expires in 15 min. */
export async function createPresignedUploadUrl(
  objectKey: string,
  contentType: string,
  expiresInSeconds = 900,
): Promise<string> {
  const client = getS3Client();
  const command = new PutObjectCommand({
    Bucket: bucket(),
    Key: objectKey,
    ContentType: contentType,
  });
  return getSignedUrl(client, command, { expiresIn: expiresInSeconds });
}

/** Generate a presigned GET URL for temporary access. */
export async function createPresignedDownloadUrl(
  objectKey: string,
  expiresInSeconds = 3600,
): Promise<string> {
  const client = getS3Client();
  const command = new GetObjectCommand({ Bucket: bucket(), Key: objectKey });
  return getSignedUrl(client, command, { expiresIn: expiresInSeconds });
}

/** Put a buffer directly (used by workers after receiving a file). */
export async function putObject(
  objectKey: string,
  body: Buffer | Uint8Array | string,
  contentType = "application/octet-stream",
): Promise<void> {
  const client = getS3Client();
  await client.send(
    new PutObjectCommand({ Bucket: bucket(), Key: objectKey, Body: body, ContentType: contentType }),
  );
}

/** Get an object as a Buffer. */
export async function getObject(objectKey: string): Promise<Buffer> {
  const client = getS3Client();
  const res = await client.send(new GetObjectCommand({ Bucket: bucket(), Key: objectKey }));
  if (!res.Body) throw new Error(`Object ${objectKey} has no body`);
  return Buffer.from(await res.Body.transformToByteArray());
}

/** Check if an object exists. */
export async function objectExists(objectKey: string): Promise<boolean> {
  const client = getS3Client();
  try {
    await client.send(new HeadObjectCommand({ Bucket: bucket(), Key: objectKey }));
    return true;
  } catch {
    return false;
  }
}

/** Build an org-scoped object key path. */
export function buildObjectKey(parts: {
  orgId: string;
  strategyId?: string;
  versionId?: string;
  subPath: string;
}): string {
  const segments = [`orgs/${parts.orgId}`];
  if (parts.strategyId) segments.push(`strategies/${parts.strategyId}`);
  if (parts.versionId) segments.push(`versions/${parts.versionId}`);
  segments.push(parts.subPath);
  return segments.join("/");
}
