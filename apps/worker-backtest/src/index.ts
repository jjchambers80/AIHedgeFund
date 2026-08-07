/**
 * worker-backtest — processes TradingView CSV report upload jobs.
 *
 * Job types:
 *   parse-report: Download CSV from R2, parse, store trades + metrics, trigger parity.
 *
 * Workers NEVER directly change strategy lifecycle state.
 * They emit events; the API/orchestrator applies transitions.
 */
import { Worker, type Job } from "bullmq";
import { getDb } from "@arf-os/db";
import { parseReportJob, PARSE_REPORT_QUEUE } from "./jobs/parse-report.js";

const REDIS_URL = process.env["REDIS_URL"] ?? "redis://localhost:6379";
const redisConfig = { url: REDIS_URL };

const db = getDb();

const parseWorker = new Worker(
  PARSE_REPORT_QUEUE,
  async (job: Job) => {
    return parseReportJob(db, job);
  },
  {
    connection: { url: REDIS_URL },
    concurrency: 5,
  },
);

parseWorker.on("completed", (job) => {
  console.log(`[parse-report] Job ${job.id} completed`);
});

parseWorker.on("failed", (job, err) => {
  console.error(`[parse-report] Job ${job?.id} failed: ${(err as Error).message}`);
});

console.log(`ARF-OS worker-backtest started. Queue: ${PARSE_REPORT_QUEUE}`);
console.log(`Redis: ${REDIS_URL.replace(/:[^@]+@/, ":***@")}`);

// Graceful shutdown
process.on("SIGTERM", async () => {
  await parseWorker.close();
  process.exit(0);
});

void redisConfig; // used inline above
