"use client";
/**
 * Strategy Detail — the core evidence view.
 *
 * Shows:
 * - Strategy metadata and version history (immutable — read-only for tested versions)
 * - Equity curve (TradingView CSV derived — clearly labelled as such)
 * - Drawdown curve (independently computed by ARF-OS)
 * - Independent metric table
 * - Parity report (TV vs ARF-OS comparison)
 * - Committee decisions
 * - Audit trail
 *
 * Labels are mandatory per CLAUDE.md §18.1:
 * - Source of each number (TradingView / ARF-OS calculated)
 * - Scope (backtest run, date range)
 * - Status (gross, net, simulated)
 */
import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import {
  strategies as strategyApi,
  decisions as decisionsApi,
  verifications as verificationsApi,
  audit,
  type Strategy,
  type StrategyVersion,
  type MetricSnapshot,
  type EquityPoint,
  type DrawdownPoint,
  type ParityReport,
  type CommitteeDecision,
  type AuditEvent,
} from "@/lib/api-client";

interface Trade {
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

// ── Badge components ──────────────────────────────────────────────────────────

function LifecycleBadge({ state }: { state: string }) {
  const colour = () => {
    if (state === "RESEARCH_APPROVED" || state === "LIVE_CANDIDATE") return "text-[var(--success)] border-[var(--success)]";
    if (state === "REJECTED" || state === "ARCHIVED") return "text-[var(--danger)] border-[var(--danger)]";
    if (state === "TRADINGVIEW_VERIFICATION" || state === "PINE_DEVELOPMENT") return "text-[var(--warning)] border-[var(--warning)]";
    return "text-[var(--muted-fg)] border-[var(--card-border)]";
  };
  return (
    <span className={`inline-block text-xs font-mono border rounded px-2 py-0.5 ${colour()}`}>
      {state.replace(/_/g, " ")}
    </span>
  );
}

function ParityBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    PASS: "text-[var(--success)] bg-green-900/30",
    WARN: "text-[var(--warning)] bg-yellow-900/30",
    FAIL: "text-[var(--danger)] bg-red-900/30",
    INSUFFICIENT_DATA: "text-[var(--muted-fg)] bg-gray-800",
  };
  return (
    <span className={`inline-block text-xs font-bold px-2 py-0.5 rounded ${map[status] ?? map["INSUFFICIENT_DATA"]}`}>
      PARITY: {status}
    </span>
  );
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({ title, badge, children }: { title: string; badge?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-[var(--card-border)] bg-[var(--card)] overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--card-border)]">
        <span className="font-semibold text-sm">{title}</span>
        {badge}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

// ── Metric table ──────────────────────────────────────────────────────────────

function MetricTable({ snapshots }: { snapshots: MetricSnapshot[] }) {
  const fmt = (name: string, value: string, unit: string) => {
    if (unit === "currency") return `$${parseFloat(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (unit === "fraction" || unit === "ratio") return `${(parseFloat(value) * 100).toFixed(2)}%`;
    if (unit === "count") return parseInt(value, 10).toLocaleString();
    if (unit === "hours") return `${parseFloat(value).toFixed(1)}h`;
    return value;
  };

  const labels: Record<string, string> = {
    trade_count: "Trade Count",
    gross_profit: "Gross Profit",
    gross_loss: "Gross Loss",
    net_profit: "Net Profit (net)",
    profit_factor: "Profit Factor",
    win_rate: "Win Rate",
    avg_win: "Avg Win",
    avg_loss: "Avg Loss",
    payoff_ratio: "Payoff Ratio",
    max_drawdown_abs: "Max Drawdown",
    max_drawdown_pct: "Max Drawdown %",
    longest_losing_streak: "Longest Losing Streak",
    total_commission: "Total Commission (deducted)",
    avg_holding_hours: "Avg Holding Duration",
  };

  return (
    <div className="space-y-0.5">
      <div className="text-xs text-[var(--muted-fg)] mb-2">
        Source: ARF-OS independent calculation · Calculation version: {snapshots[0]?.calculationVersion ?? "—"}
      </div>
      <div className="grid grid-cols-2 gap-px">
        {snapshots.map((s) => (
          <div key={s.id} className="flex justify-between py-1.5 text-sm border-b border-[var(--card-border)]/40">
            <span className="text-[var(--muted-fg)]">{labels[s.name] ?? s.name}</span>
            <span className="font-mono font-medium">{fmt(s.name, s.value, s.unit)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Equity chart ──────────────────────────────────────────────────────────────

function EquityChart({ points }: { points: EquityPoint[] }) {
  const data = points.map((p) => ({
    trade: p.tradeNumber,
    equity: parseFloat(p.equity),
    date: new Date(p.timestamp).toLocaleDateString(),
  }));

  const initial = data[0]?.equity ?? 0;

  return (
    <div>
      <div className="text-xs text-[var(--muted-fg)] mb-3">
        Source: ARF-OS independently reconstructed from TradingView CSV trades · Net of commissions · Simulated fills
      </div>
      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2d3748" />
            <XAxis
              dataKey="trade"
              tick={{ fontSize: 10, fill: "#a0aec0" }}
              label={{ value: "Trade #", position: "insideBottomRight", offset: -4, fontSize: 10, fill: "#a0aec0" }}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "#a0aec0" }}
              tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
              width={52}
            />
            <Tooltip
              formatter={(value: number) => [`$${value.toLocaleString("en-US", { minimumFractionDigits: 2 })}`, "Equity (net, simulated)"]}
              labelFormatter={(label) => `Trade ${label} · ${data[label as number]?.date ?? ""}`}
              contentStyle={{ background: "#1a1f2e", border: "1px solid #2d3748", borderRadius: 4, fontSize: 11 }}
            />
            <ReferenceLine y={initial} stroke="#4a5568" strokeDasharray="3 3" label={{ value: "Initial", fill: "#4a5568", fontSize: 10 }} />
            <Line type="monotone" dataKey="equity" stroke="#3b82f6" dot={false} strokeWidth={1.5} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── Drawdown chart ────────────────────────────────────────────────────────────

function DrawdownChart({ points }: { points: DrawdownPoint[] }) {
  const data = points.map((p) => ({
    trade: p.tradeNumber,
    pct: parseFloat(p.drawdownPct) * -100, // invert for visual
    abs: parseFloat(p.drawdownAbs),
    date: new Date(p.timestamp).toLocaleDateString(),
  }));

  return (
    <div>
      <div className="text-xs text-[var(--muted-fg)] mb-3">
        Source: ARF-OS independent drawdown calculation from reconstructed equity · Peak-to-trough
      </div>
      <div className="h-36">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2d3748" />
            <XAxis dataKey="trade" tick={{ fontSize: 10, fill: "#a0aec0" }} />
            <YAxis
              tick={{ fontSize: 10, fill: "#a0aec0" }}
              tickFormatter={(v: number) => `${v.toFixed(1)}%`}
              width={44}
            />
            <Tooltip
              formatter={(value: number) => [`${Math.abs(value).toFixed(2)}%`, "Drawdown (ARF-OS calculated)"]}
              contentStyle={{ background: "#1a1f2e", border: "1px solid #2d3748", borderRadius: 4, fontSize: 11 }}
            />
            <Line type="monotone" dataKey="pct" stroke="#fc8181" dot={false} strokeWidth={1.5} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── Parity section ────────────────────────────────────────────────────────────

function ParitySection({ report }: { report: ParityReport }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <ParityBadge status={report.status} />
        <span className="text-xs text-[var(--muted-fg)]">Policy v{report.policyVersion}</span>
      </div>

      {report.warnings.length > 0 && (
        <div className="space-y-1">
          {report.warnings.map((w, i) => (
            <div key={i} className="text-xs font-mono text-[var(--warning)] bg-yellow-900/20 border border-yellow-900/40 rounded px-3 py-1">
              {w}
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-3 gap-3 text-sm">
        <div className="space-y-1">
          <div className="text-xs text-[var(--muted-fg)]">Trade Count</div>
          <div className="font-mono">TV: {report.tvTradeCount ?? "—"}</div>
          <div className="font-mono text-[var(--accent)]">ARF: {report.arfTradeCount ?? "—"}</div>
        </div>
        <div className="space-y-1">
          <div className="text-xs text-[var(--muted-fg)]">Net Profit</div>
          <div className="font-mono">TV: {report.tvNetProfit ? `$${parseFloat(report.tvNetProfit).toFixed(2)}` : "—"}</div>
          <div className="font-mono text-[var(--accent)]">ARF: {report.arfNetProfit ? `$${parseFloat(report.arfNetProfit).toFixed(2)}` : "—"}</div>
        </div>
        <div className="space-y-1">
          <div className="text-xs text-[var(--muted-fg)]">Max Drawdown</div>
          <div className="font-mono">TV: {report.tvMaxDrawdown ? `$${parseFloat(report.tvMaxDrawdown).toFixed(2)}` : "—"}</div>
          <div className="font-mono text-[var(--accent)]">ARF: {report.arfMaxDrawdown ? `$${parseFloat(report.arfMaxDrawdown).toFixed(2)}` : "—"}</div>
        </div>
      </div>
    </div>
  );
}

// ── Verification creation ─────────────────────────────────────────────────────

function VerificationSection({ version }: { version: StrategyVersion }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ symbol: "", timeframe: "", dateFrom: "", dateTo: "" });
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);

  if (!version.pineRevisionId) {
    return (
      <div className="text-sm text-[var(--muted-fg)]">
        Upload a Pine source revision for this version before starting a TradingView verification.
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setErr(null);
    try {
      const verif = await verificationsApi.create({
        strategyVersionId: version.id,
        pineRevisionId: version.pineRevisionId!,
        symbol: form.symbol,
        timeframe: form.timeframe,
        dateFrom: form.dateFrom || null,
        dateTo: form.dateTo || null,
      });
      setCreatedId(verif.id);
      setShowForm(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to create verification");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="text-xs text-[var(--muted-fg)]">
        Reproduce this exact strategy version in TradingView, then upload the Performance Summary and List of Trades CSV exports.
      </div>
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div>
          <div className="text-[var(--muted-fg)]">Strategy Version</div>
          <div className="font-mono">{version.id.slice(0, 16)}…</div>
        </div>
        <div>
          <div className="text-[var(--muted-fg)]">Pine Hash</div>
          <div className="font-mono">{version.pineSourceHash?.slice(0, 12) ?? "—"}…</div>
        </div>
      </div>

      {createdId ? (
        <Link
          href={`/verifications/${createdId}`}
          className="inline-block px-3 py-1.5 text-xs rounded bg-[var(--accent)] text-white"
        >
          Verification created — go to upload page →
        </Link>
      ) : (
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-3 py-1.5 text-xs rounded border border-[var(--accent)] text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white transition-colors"
        >
          Start New Verification
        </button>
      )}

      {showForm && (
        <form onSubmit={(e) => void handleSubmit(e)} className="rounded border border-[var(--card-border)] p-4 space-y-3">
          <div>
            <label className="block text-xs text-[var(--muted-fg)] mb-1">Symbol</label>
            <input
              value={form.symbol}
              onChange={(e) => setForm((f) => ({ ...f, symbol: e.target.value }))}
              placeholder="e.g. BINANCE:BTCUSDT"
              className="w-full bg-[var(--background)] border border-[var(--card-border)] rounded px-3 py-2 text-sm"
              required
            />
          </div>
          <div>
            <label className="block text-xs text-[var(--muted-fg)] mb-1">Timeframe</label>
            <input
              value={form.timeframe}
              onChange={(e) => setForm((f) => ({ ...f, timeframe: e.target.value }))}
              placeholder="e.g. 1h, 4h, 1D"
              className="w-full bg-[var(--background)] border border-[var(--card-border)] rounded px-3 py-2 text-sm"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-[var(--muted-fg)] mb-1">Date From (optional)</label>
              <input
                type="date"
                value={form.dateFrom}
                onChange={(e) => setForm((f) => ({ ...f, dateFrom: e.target.value }))}
                className="w-full bg-[var(--background)] border border-[var(--card-border)] rounded px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--muted-fg)] mb-1">Date To (optional)</label>
              <input
                type="date"
                value={form.dateTo}
                onChange={(e) => setForm((f) => ({ ...f, dateTo: e.target.value }))}
                className="w-full bg-[var(--background)] border border-[var(--card-border)] rounded px-3 py-2 text-sm"
              />
            </div>
          </div>
          {err && <div className="text-xs text-[var(--danger)]">{err}</div>}
          <div className="flex gap-2">
            <button type="submit" disabled={creating} className="px-3 py-1.5 text-xs rounded bg-[var(--accent)] text-white disabled:opacity-50">
              {creating ? "Creating..." : "Create Verification"}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="px-3 py-1.5 text-xs rounded border border-[var(--card-border)]">
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

// ── Decision list ─────────────────────────────────────────────────────────────

function DecisionList({
  decisions,
  versionId,
  onRefresh,
  parity,
  hasEvidence,
}: {
  decisions: CommitteeDecision[];
  versionId: string;
  onRefresh: () => void;
  parity: ParityReport | null;
  hasEvidence: boolean;
}) {
  const [form, setForm] = useState({ decision: "RESEARCH_APPROVED", summary: "", humanOverride: false });
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  // CLAUDE.md §18.3 / build-prompt Decision screen spec: never permit
  // PAPER_APPROVED when required verification evidence is missing or
  // parity is FAIL. The workflow engine is the real authority (it will
  // reject an invalid transition server-side regardless), but the UI must
  // not offer a one-click path that looks approved while hiding that gate.
  const parityFail = parity?.status === "FAIL";
  const paperApprovedBlocked = !hasEvidence || parityFail;
  const blockReason = !hasEvidence
    ? "No independent metrics/evidence recorded for this version yet."
    : parityFail
      ? "TradingView parity check is FAIL — resolve the divergence before paper approval."
      : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (form.decision === "PAPER_APPROVED" && paperApprovedBlocked && !form.humanOverride) {
      setErr(`Cannot select Paper Approved: ${blockReason} Use human override to bypass (audited).`);
      return;
    }
    setCreating(true);
    setErr(null);
    try {
      await decisionsApi.create({
        strategyVersionId: versionId,
        decision: form.decision,
        summary: form.summary,
        humanOverride: form.humanOverride,
      });
      setForm({ decision: "RESEARCH_APPROVED", summary: "", humanOverride: false });
      setShowForm(false);
      onRefresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to create decision");
    } finally {
      setCreating(false);
    }
  }

  const decisionColour = (d: string) => {
    if (d === "RESEARCH_APPROVED" || d === "PAPER_APPROVED") return "text-[var(--success)]";
    if (d === "REJECT") return "text-[var(--danger)]";
    if (d === "REWORK_WITH_NEW_VERSION") return "text-[var(--warning)]";
    return "text-[var(--muted-fg)]";
  };

  return (
    <div className="space-y-3">
      <button
        onClick={() => setShowForm(!showForm)}
        className="px-3 py-1.5 text-xs rounded border border-[var(--accent)] text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white transition-colors"
      >
        New Decision
      </button>

      {showForm && (
        <form onSubmit={(e) => void handleSubmit(e)} className="rounded border border-[var(--card-border)] p-4 space-y-3">
          <div className="text-xs text-[var(--warning)] bg-yellow-900/20 border border-yellow-900/40 rounded px-3 py-2">
            Committee decision — the workflow machine will verify the transition is valid for this role and lifecycle state.
          </div>

          <div className="text-xs rounded border border-[var(--card-border)] px-3 py-2 space-y-1">
            <div className="font-semibold text-[var(--muted-fg)]">Decision readiness</div>
            <div className="flex items-center gap-2">
              <span className={hasEvidence ? "text-[var(--success)]" : "text-[var(--danger)]"}>
                {hasEvidence ? "✓" : "✗"}
              </span>
              <span>Independent metrics recorded</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={parity && !parityFail ? "text-[var(--success)]" : parity ? "text-[var(--danger)]" : "text-[var(--muted-fg)]"}>
                {parity ? (parityFail ? "✗" : "✓") : "—"}
              </span>
              <span>TradingView parity: {parity?.status ?? "no report yet"}</span>
            </div>
            {paperApprovedBlocked && (
              <div className="text-[var(--danger)] mt-1">
                Paper Approved is blocked: {blockReason} Requires human override to proceed.
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs text-[var(--muted-fg)] mb-1">Decision</label>
            <select
              value={form.decision}
              onChange={(e) => setForm((f) => ({ ...f, decision: e.target.value }))}
              className="w-full bg-[var(--background)] border border-[var(--card-border)] rounded px-3 py-2 text-sm"
            >
              <option value="RESEARCH_APPROVED">Research Approved</option>
              <option value="PAPER_APPROVED" disabled={paperApprovedBlocked && !form.humanOverride}>
                Paper Approved{paperApprovedBlocked ? " (blocked — see readiness above)" : ""}
              </option>
              <option value="REWORK_WITH_NEW_VERSION">Rework with New Version</option>
              <option value="REJECT">Reject</option>
              <option value="INSUFFICIENT_EVIDENCE">Insufficient Evidence</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-[var(--muted-fg)] mb-1">Summary / Rationale</label>
            <textarea
              value={form.summary}
              onChange={(e) => setForm((f) => ({ ...f, summary: e.target.value }))}
              className="w-full bg-[var(--background)] border border-[var(--card-border)] rounded px-3 py-2 text-sm h-16 resize-none"
              placeholder="Provide a written rationale for this decision"
              required
            />
          </div>
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={form.humanOverride}
              onChange={(e) => setForm((f) => ({ ...f, humanOverride: e.target.checked }))}
            />
            Human override (bypasses role/evidence checks — audited)
          </label>
          {err && <div className="text-xs text-[var(--danger)]">{err}</div>}
          <div className="flex gap-2">
            <button type="submit" disabled={creating} className="px-3 py-1.5 text-xs rounded bg-[var(--accent)] text-white disabled:opacity-50">
              {creating ? "Submitting..." : "Submit Decision"}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="px-3 py-1.5 text-xs rounded border border-[var(--card-border)]">
              Cancel
            </button>
          </div>
        </form>
      )}

      {decisions.length === 0 ? (
        <div className="text-sm text-[var(--muted-fg)]">No decisions recorded for this version.</div>
      ) : (
        <div className="space-y-2">
          {decisions.map((d) => (
            <div key={d.id} className="rounded border border-[var(--card-border)] p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className={`font-semibold ${decisionColour(d.decision)}`}>{d.decision.replace(/_/g, " ")}</span>
                <span className="text-xs text-[var(--muted-fg)]">{new Date(d.createdAt).toLocaleDateString()}</span>
              </div>
              <div className="text-xs text-[var(--muted-fg)] mt-1">
                {d.fromState} → {d.toState}
                {d.humanOverride && (
                  <span className="ml-2 text-[var(--warning)]"> (HUMAN OVERRIDE)</span>
                )}
              </div>
              <div className="text-xs mt-1">{d.summary}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function StrategyDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [strategy, setStrategy] = useState<Strategy | null>(null);
  const [versions, setVersions] = useState<StrategyVersion[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<MetricSnapshot[]>([]);
  const [equity, setEquity] = useState<EquityPoint[]>([]);
  const [drawdown, setDrawdown] = useState<DrawdownPoint[]>([]);
  const [parity, setParity] = useState<ParityReport | null>(null);
  const [decisionsList, setDecisionsList] = useState<CommitteeDecision[]>([]);
  const [tradesData, setTradesData] = useState<Trade[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadVersionData = useCallback(async (versionId: string, strategyId?: string) => {
    const [m, e, d, p, dec, trades, auditRes] = await Promise.allSettled([
      strategyApi.getMetrics(versionId),
      strategyApi.getEquity(versionId),
      strategyApi.getDrawdown(versionId),
      strategyApi.getParity(versionId),
      decisionsApi.list(versionId),
      fetch(`${process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3001/api/v1"}/versions/${versionId}/trades`, {
        headers: {
          ...(process.env["NEXT_PUBLIC_STUB_AUTH"] === "true" ? {
            "X-Stub-User-Id": process.env["NEXT_PUBLIC_STUB_USER_ID"] ?? "user_dev",
            "X-Stub-Org-Id": process.env["NEXT_PUBLIC_STUB_ORG_ID"] ?? "org_dev",
            "X-Stub-Role": process.env["NEXT_PUBLIC_STUB_ROLE"] ?? "ADMIN",
          } : {}),
        },
      }).then((r) => r.ok ? r.json() as Promise<{ items: Trade[] }> : { items: [] as Trade[] }),
      strategyId ? audit.list("strategy", strategyId, undefined).catch(() => ({ items: [] as AuditEvent[], nextCursor: null })) : Promise.resolve({ items: [] as AuditEvent[], nextCursor: null }),
    ]);

    if (m.status === "fulfilled") setMetrics(m.value.snapshots);
    if (e.status === "fulfilled") setEquity(e.value.points);
    if (d.status === "fulfilled") setDrawdown(d.value.points);
    if (p.status === "fulfilled") setParity(p.value);
    if (dec.status === "fulfilled") setDecisionsList(dec.value);
    if (trades.status === "fulfilled") setTradesData(trades.value.items);
    if (auditRes.status === "fulfilled") setAuditEvents(auditRes.value.items);
  }, []);

  useEffect(() => {
    if (!id) return;
    void (async () => {
      setLoading(true);
      try {
        const [s, v] = await Promise.all([
          strategyApi.get(id),
          strategyApi.listVersions(id),
        ]);
        setStrategy(s);
        setVersions(v);
        const initial = s.currentVersionId ?? v[0]?.id ?? null;
        setSelectedVersionId(initial);
        if (initial) await loadVersionData(initial, s.id);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load strategy");
      } finally {
        setLoading(false);
      }
    })();
  }, [id, loadVersionData]);

  const handleVersionSwitch = useCallback(async (vId: string) => {
    setSelectedVersionId(vId);
    setMetrics([]);
    setEquity([]);
    setDrawdown([]);
    setParity(null);
    setDecisionsList([]);
    setTradesData([]);
    await loadVersionData(vId, id);
  }, [loadVersionData, id]);

  const selectedVersion = versions.find((v) => v.id === selectedVersionId);

  if (loading) return <div className="text-[var(--muted-fg)] text-sm">Loading...</div>;
  if (error) return <div className="text-[var(--danger)] text-sm">{error}</div>;
  if (!strategy) return null;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-sm text-[var(--muted-fg)] mb-2">
          <Link href="/strategies" className="hover:text-[var(--foreground)]">Strategies</Link>
          <span>/</span>
          <span>{strategy.name}</span>
        </div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">{strategy.name}</h1>
            <div className="text-sm text-[var(--muted-fg)] mt-1">
              Family: {strategy.family} · Status: {strategy.status}
            </div>
          </div>
          {selectedVersion && (
            <LifecycleBadge state={selectedVersion.lifecycleState} />
          )}
        </div>
      </div>

      {/* Version selector */}
      <Section title="Version History">
        <div className="text-xs text-[var(--muted-fg)] mb-3">
          Tested versions are immutable. All changes create a new version with lineage tracking.
        </div>
        <div className="flex flex-wrap gap-2">
          {versions.map((v) => (
            <button
              key={v.id}
              onClick={() => void handleVersionSwitch(v.id)}
              className={`px-3 py-1.5 text-xs rounded border transition-colors ${
                v.id === selectedVersionId
                  ? "border-[var(--accent)] text-[var(--accent)] bg-blue-900/20"
                  : "border-[var(--card-border)] text-[var(--muted-fg)] hover:border-[var(--accent)]"
              }`}
            >
              v{v.versionNumber} · {v.lifecycleState.replace(/_/g, " ")}
              {v.id === strategy.currentVersionId && " · CURRENT"}
            </button>
          ))}
        </div>
        {selectedVersion && (
          <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div>
              <div className="text-[var(--muted-fg)]">Version ID</div>
              <div className="font-mono">{selectedVersion.id.slice(0, 16)}…</div>
            </div>
            <div>
              <div className="text-[var(--muted-fg)]">Pine Hash</div>
              <div className="font-mono">{selectedVersion.pineSourceHash?.slice(0, 12) ?? "—"}…</div>
            </div>
            <div>
              <div className="text-[var(--muted-fg)]">Change Reason</div>
              <div>{selectedVersion.changeReason ?? "Initial version"}</div>
            </div>
            <div>
              <div className="text-[var(--muted-fg)]">Created</div>
              <div>{new Date(selectedVersion.createdAt).toLocaleDateString()}</div>
            </div>
          </div>
        )}
      </Section>

      {selectedVersion && (
        <Section title="TradingView Verification">
          <VerificationSection version={selectedVersion} />
        </Section>
      )}

      {/* Evidence panels — only shown once we have data */}
      {metrics.length > 0 && (
        <Section
          title="Independent Metrics"
          badge={<span className="text-xs text-[var(--muted-fg)]">ARF-OS calculated · net · simulated · backtest</span>}
        >
          <MetricTable snapshots={metrics} />
        </Section>
      )}

      {equity.length > 0 && (
        <Section
          title="Equity Curve"
          badge={<span className="text-xs text-[var(--muted-fg)]">ARF-OS reconstructed · net of commissions · simulated</span>}
        >
          <EquityChart points={equity} />
        </Section>
      )}

      {drawdown.length > 0 && (
        <Section
          title="Drawdown Curve"
          badge={<span className="text-xs text-[var(--muted-fg)]">ARF-OS calculated · peak-to-trough</span>}
        >
          <DrawdownChart points={drawdown} />
        </Section>
      )}

      {parity && (
        <Section
          title="TradingView Parity Check"
          badge={<ParityBadge status={parity.status} />}
        >
          <ParitySection report={parity} />
        </Section>
      )}

      {tradesData.length > 0 && (
        <Section title="Trades" badge={<span className="text-xs text-[var(--muted-fg)]">TradingView CSV · historical · simulated</span>}>
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="text-[var(--muted-fg)] border-b border-[var(--card-border)]">
                  <th className="text-left py-1 pr-3">#</th>
                  <th className="text-left py-1 pr-3">Dir</th>
                  <th className="text-left py-1 pr-3">Entry</th>
                  <th className="text-left py-1 pr-3">Exit</th>
                  <th className="text-right py-1 pr-3">Entry $</th>
                  <th className="text-right py-1 pr-3">Exit $</th>
                  <th className="text-right py-1 pr-3">Net P&amp;L</th>
                  <th className="text-right py-1">Commission</th>
                </tr>
              </thead>
              <tbody>
                {tradesData.slice(0, 100).map((t) => (
                  <tr key={t.id} className="border-b border-[var(--card-border)]/50 hover:bg-white/5">
                    <td className="py-1 pr-3 text-[var(--muted-fg)]">{t.tradeNumber}</td>
                    <td className={`py-1 pr-3 font-bold ${t.direction === "LONG" ? "text-[var(--success)]" : "text-[var(--danger)]"}`}>{t.direction}</td>
                    <td className="py-1 pr-3 text-[var(--muted-fg)]">{new Date(t.entryTime).toLocaleDateString()}</td>
                    <td className="py-1 pr-3 text-[var(--muted-fg)]">{new Date(t.exitTime).toLocaleDateString()}</td>
                    <td className="py-1 pr-3 text-right">{parseFloat(t.entryPrice).toFixed(2)}</td>
                    <td className="py-1 pr-3 text-right">{parseFloat(t.exitPrice).toFixed(2)}</td>
                    <td className={`py-1 pr-3 text-right font-bold ${parseFloat(t.netPnl) >= 0 ? "text-[var(--success)]" : "text-[var(--danger)]"}`}>
                      {parseFloat(t.netPnl) >= 0 ? "+" : ""}{parseFloat(t.netPnl).toFixed(2)}
                    </td>
                    <td className="py-1 text-right text-[var(--muted-fg)]">{parseFloat(t.commission).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {tradesData.length > 100 && (
              <div className="text-xs text-[var(--muted-fg)] mt-2">Showing first 100 of {tradesData.length} trades</div>
            )}
          </div>
        </Section>
      )}

      {selectedVersionId && (
        <Section title="Committee Decisions">
          <DecisionList
            decisions={decisionsList}
            versionId={selectedVersionId}
            onRefresh={() => void loadVersionData(selectedVersionId, id)}
            parity={parity}
            hasEvidence={metrics.length > 0}
          />
        </Section>
      )}

      {auditEvents.length > 0 && (
        <Section title="Audit Trail">
          <div className="space-y-2">
            {auditEvents.map((e) => (
              <div key={e.id} className="flex items-start gap-3 text-xs">
                <div className="text-[var(--muted-fg)] font-mono whitespace-nowrap pt-0.5">
                  {new Date(e.createdAt).toLocaleString()}
                </div>
                <div>
                  <span className="font-semibold">{e.action}</span>
                  {e.actorId && <span className="text-[var(--muted-fg)]"> · {e.actorType}/{e.actorId}</span>}
                  {e.reason && <div className="text-[var(--muted-fg)] mt-0.5">{e.reason}</div>}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {metrics.length === 0 && equity.length === 0 && !parity && (
        <div className="rounded-lg border border-[var(--card-border)] bg-[var(--card)] p-8 text-center text-[var(--muted-fg)] text-sm">
          No backtest data yet for this version. Upload TradingView CSV exports via the API to populate metrics, equity curve, and parity check.
        </div>
      )}
    </div>
  );
}
