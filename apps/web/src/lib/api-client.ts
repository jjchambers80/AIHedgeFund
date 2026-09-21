/**
 * Typed API client for ARF-OS web application.
 * All requests go to the Fastify API — no direct DB access from the web app.
 *
 * In stub mode (NEXT_PUBLIC_STUB_AUTH=true), injects X-Stub-* headers.
 * In production, the auth cookie/header is managed by Clerk.
 */

const API_BASE = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3001/api/v1";

function stubHeaders(): Record<string, string> {
  if (process.env["NEXT_PUBLIC_STUB_AUTH"] !== "true") return {};
  return {
    "X-Stub-User-Id": process.env["NEXT_PUBLIC_STUB_USER_ID"] ?? "user_dev",
    "X-Stub-Org-Id": process.env["NEXT_PUBLIC_STUB_ORG_ID"] ?? "org_dev",
    "X-Stub-Role": process.env["NEXT_PUBLIC_STUB_ROLE"] ?? "ADMIN",
  };
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...stubHeaders(),
      ...(init.headers as Record<string, string> | undefined),
    },
  });

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { detail?: string; title?: string };
      detail = body.detail ?? body.title ?? detail;
    } catch {
      // ignore JSON parse error
    }
    throw new Error(detail);
  }

  return res.json() as Promise<T>;
}

// ── Types (mirroring contracts without importing — no duplicate contract types) ──
// We re-use the Zod-inferred types from @arf-os/contracts on the client side.
// These are compile-time only — no runtime Zod in the browser.

export interface Campaign {
  id: string;
  orgId: string;
  title: string;
  objective: string;
  markets: string[];
  symbols: string[];
  timeframes: string[];
  strategyFamilies: string[];
  constraints: string[];
  status: string;
  modelBudgetUsd: string | null;
  computeRunsLimit: number | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface Strategy {
  id: string;
  orgId: string;
  campaignId: string | null;
  name: string;
  family: string;
  status: string;
  currentVersionId: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface StrategyVersion {
  id: string;
  strategyId: string;
  parentVersionId: string | null;
  versionNumber: number;
  status: string;
  lifecycleState: string;
  definitionId: string | null;
  pineRevisionId: string | null;
  definitionHash: string | null;
  pineSourceHash: string | null;
  manifestHash: string | null;
  changeReason: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface MetricSnapshot {
  id: string;
  name: string;
  value: string;
  unit: string;
  calculationVersion: string;
  scopeType: string;
  scopeId: string;
  computedAt: string;
}

export interface EquityPoint {
  tradeNumber: number;
  timestamp: string;
  equity: string;
}

export interface DrawdownPoint {
  tradeNumber: number;
  timestamp: string;
  drawdownAbs: string;
  drawdownPct: string;
}

export interface ParityReport {
  id: string;
  verificationId: string;
  backtestRunId: string;
  status: "PASS" | "WARN" | "FAIL" | "INSUFFICIENT_DATA";
  tvTradeCount: number | null;
  arfTradeCount: number | null;
  tvNetProfit: string | null;
  arfNetProfit: string | null;
  tvMaxDrawdown: string | null;
  arfMaxDrawdown: string | null;
  firstTradeDivergence: string | null;
  warnings: string[];
  policyVersion: string;
  createdAt: string;
}

export interface CommitteeDecision {
  id: string;
  orgId: string;
  strategyVersionId: string;
  decision: string;
  fromState: string;
  toState: string;
  reasonCodes: string[];
  summary: string;
  conditions: string[];
  reviewDate: string | null;
  actorId: string;
  humanOverride: boolean;
  createdAt: string;
}

export interface AuditEvent {
  id: string;
  actorType: string;
  actorId: string;
  action: string;
  aggregateType: string;
  aggregateId: string;
  priorStateSummary: Record<string, unknown> | null;
  newStateSummary: Record<string, unknown> | null;
  reason: string | null;
  createdAt: string;
}

export interface TradingViewVerification {
  id: string;
  orgId: string;
  strategyVersionId: string;
  pineRevisionId: string;
  symbol: string;
  timeframe: string;
  dateFrom: string | null;
  dateTo: string | null;
  status: string;
  parityReportId: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReportUpload {
  id: string;
  verificationId: string;
  reportType: "PERFORMANCE_SUMMARY" | "LIST_OF_TRADES";
  objectKey: string;
  checksumSha256: string;
  fileSizeBytes: number;
  parserVersion: string | null;
  parseStatus: string;
  parseWarnings: { code: string; message: string }[];
  createdAt: string;
  updatedAt: string;
}

export interface PresignResult {
  uploadId: string;
  presignedUrl: string;
  objectKey: string;
  expiresAt: string;
}

export interface Trade {
  id: string;
  backtestRunId: string;
  tradeNumber: number;
  direction: "LONG" | "SHORT";
  entryTime: string;
  exitTime: string;
  entryPrice: string;
  exitPrice: string;
  quantity: string;
  grossPnl: string;
  commission: string;
  netPnl: string;
  entryReason: string | null;
  exitReason: string | null;
  parityStatus: string;
}

// ── Campaign endpoints ────────────────────────────────────────────────────────

export const campaigns = {
  list: (cursor?: string) =>
    request<{ items: Campaign[]; nextCursor: string | null }>(
      `/campaigns${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
    ),

  get: (id: string) => request<Campaign>(`/campaigns/${id}`),

  create: (data: {
    title: string;
    objective: string;
    markets?: string[];
    symbols?: string[];
    timeframes?: string[];
    strategyFamilies?: string[];
    constraints?: string[];
    modelBudgetUsd?: string | null;
    computeRunsLimit?: number | null;
  }) =>
    request<Campaign>("/campaigns", {
      method: "POST",
      body: JSON.stringify(data),
    }),
};

// ── Strategy endpoints ────────────────────────────────────────────────────────

export const strategies = {
  list: () => request<Strategy[]>("/strategies"),

  get: (id: string) => request<Strategy>(`/strategies/${id}`),

  create: (data: { name: string; family: string; campaignId?: string | null }) =>
    request<Strategy>("/strategies", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  listVersions: (strategyId: string) =>
    request<StrategyVersion[]>(`/strategies/${strategyId}/versions`),

  createVersion: (strategyId: string, data: { parentVersionId?: string | null; changeReason?: string | null }) =>
    request<StrategyVersion>(`/strategies/${strategyId}/versions`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  getVersion: (versionId: string) => request<StrategyVersion>(`/versions/${versionId}`),

  getMetrics: (versionId: string) =>
    request<{ backtestRunId: string | null; snapshots: MetricSnapshot[] }>(
      `/versions/${versionId}/metrics`,
    ),

  getEquity: (versionId: string) =>
    request<{ backtestRunId: string | null; points: EquityPoint[] }>(
      `/versions/${versionId}/equity`,
    ),

  getDrawdown: (versionId: string) =>
    request<{ backtestRunId: string | null; points: DrawdownPoint[] }>(
      `/versions/${versionId}/drawdown`,
    ),

  getParity: (versionId: string) => request<ParityReport | null>(`/versions/${versionId}/parity`),
};

// ── Decision endpoints ────────────────────────────────────────────────────────

export const decisions = {
  list: (strategyVersionId: string) =>
    request<CommitteeDecision[]>(`/decisions?strategyVersionId=${encodeURIComponent(strategyVersionId)}`),

  create: (data: {
    strategyVersionId: string;
    decision: string;
    reasonCodes?: string[];
    summary: string;
    conditions?: string[];
    humanOverride?: boolean;
    overrideReason?: string | null;
  }) =>
    request<CommitteeDecision>("/decisions", {
      method: "POST",
      body: JSON.stringify({ ...data, reasonCodes: data.reasonCodes ?? [], conditions: data.conditions ?? [], humanOverride: data.humanOverride ?? false }),
    }),
};

// ── Audit endpoints ───────────────────────────────────────────────────────────

export const audit = {
  list: (aggregateType: string, aggregateId: string, cursor?: string) =>
    request<{ items: AuditEvent[]; nextCursor: string | null }>(
      `/audit?aggregateType=${encodeURIComponent(aggregateType)}&aggregateId=${encodeURIComponent(aggregateId)}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
    ),
};

// ── Verification endpoints ────────────────────────────────────────────────────

export const verifications = {
  get: (id: string) => request<TradingViewVerification>(`/verifications/${id}`),

  create: (data: {
    strategyVersionId: string;
    pineRevisionId: string;
    symbol: string;
    timeframe: string;
    dateFrom?: string | null;
    dateTo?: string | null;
  }) =>
    request<TradingViewVerification>("/verifications", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  presign: (verificationId: string, reportType: "PERFORMANCE_SUMMARY" | "LIST_OF_TRADES") =>
    request<PresignResult>(`/verifications/${verificationId}/presign`, {
      method: "POST",
      body: JSON.stringify({ reportType }),
    }),

  listUploads: (verificationId: string) =>
    request<ReportUpload[]>(`/verifications/${verificationId}/uploads`),

  completeUpload: (verificationId: string, uploadId: string, data: { checksumSha256: string; fileSizeBytes: number }) =>
    request<{ uploadId: string; parseStatus: string }>(`/verifications/${verificationId}/uploads/${uploadId}/complete`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
};

// ── Trades endpoints ──────────────────────────────────────────────────────────

export const trades = {
  listForVersion: (versionId: string, cursor?: string) =>
    request<{ items: Trade[]; nextCursor: string | null }>(
      `/versions/${versionId}/trades${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
    ),
};
