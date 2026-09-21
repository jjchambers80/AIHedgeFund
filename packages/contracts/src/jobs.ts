import { z } from "zod";
import { ReportTypeSchema } from "./enums.js";

/** BullMQ queue name for TradingView report-upload parsing jobs.
 *  BullMQ forbids ':' in queue names (used internally as a Redis key delimiter). */
export const PARSE_REPORT_QUEUE = "arf-os-parse-report";

export const ParseReportJobDataSchema = z.object({
  uploadId: z.string(),
  verificationId: z.string(),
  objectKey: z.string(),
  reportType: ReportTypeSchema,
  orgId: z.string(),
});
export type ParseReportJobData = z.infer<typeof ParseReportJobDataSchema>;
