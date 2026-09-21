/**
 * BullMQ producer connections used by API route handlers.
 * The API only enqueues jobs — job execution lives in the workers
 * (CLAUDE.md §3.2: workers execute, the API/orchestrator applies policy).
 */
import { Queue } from "bullmq";
import { PARSE_REPORT_QUEUE, type ParseReportJobData } from "@arf-os/contracts";

const REDIS_URL = process.env["REDIS_URL"] ?? "redis://localhost:6379";

let parseReportQueue: Queue<ParseReportJobData> | undefined;

function getParseReportQueue(): Queue<ParseReportJobData> {
  parseReportQueue ??= new Queue<ParseReportJobData>(PARSE_REPORT_QUEUE, {
    connection: { url: REDIS_URL },
  });
  return parseReportQueue;
}

export async function enqueueParseReportJob(data: ParseReportJobData): Promise<void> {
  await getParseReportQueue().add("parse", data, {
    jobId: `${data.uploadId}`, // dedupes retries of the same upload
  });
}
