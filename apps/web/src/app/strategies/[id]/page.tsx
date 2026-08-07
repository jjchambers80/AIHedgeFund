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
  type Strategy,
  type StrategyVersion,
  type MetricSnapshot,
  type EquityPoint,
  type DrawdownPoint,
  type ParityReport,
  type CommitteeDecision,
} from "@/lib/api-client";

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

// ── Decision list ─────────────────────────────────────────────────────────────

function DecisionList({ decisions, versionId, onRefresh }: { decisions: CommitteeDecision[]; versionId: string; onRefresh: () => void }) {
  const [form, setForm] = useState({ decision: "RESEARCH_APPROVED", summary: "", humanOverride: false });
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
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
          <div>
            <label className="block text-xs text-[var(--muted-fg)] mb-1">Decision</label>
            <select
              value={form.decision}
              onChange={(e) => setForm((f) => ({ ...f, decision: e.target.value }))}
              className="w-full bg-[var(--background)] border border-[var(--card-border)] rounded px-3 py-2 text-sm"
            >
              <option value="RESEARCH_APPROVED">Research Approved</option>
              <option value="PAPER_APPROVED">Paper Approved</option>
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadVersionData = useCallback(async (versionId: string) => {
    const [m, e, d, p, dec] = await Promise.allSettled([
      strategyApi.getMetrics(versionId),
      strategyApi.getEquity(versionId),
      strategyApi.getDrawdown(versionId),
      strategyApi.getParity(versionId),
      decisionsApi.list(versionId),
    ]);

    if (m.status === "fulfilled") setMetrics(m.value.snapshots);
    if (e.status === "fulfilled") setEquity(e.value.points);
    if (d.status === "fulfilled") setDrawdown(d.value.points);
    if (p.status === "fulfilled") setParity(p.value);
    if (dec.status === "fulfilled") setDecisionsList(dec.value);
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
        if (initial) await loadVersionData(initial);
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
    await loadVersionData(vId);
  }, [loadVersionData]);

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

      {selectedVersionId && (
        <Section title="Committee Decisions">
          <DecisionList
            decisions={decisionsList}
            versionId={selectedVersionId}
            onRefresh={() => void loadVersionData(selectedVersionId)}
          />
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
