"use client";
/**
 * Campaign Detail — shows research tasks and linked strategies.
 */
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { campaigns as campaignApi, strategies as strategyApi, type Campaign, type Strategy } from "@/lib/api-client";

interface ResearchTask {
  id: string;
  title: string;
  description: string;
  state: string;
  assignedRole: string | null;
  strategyId: string | null;
  strategyVersionId: string | null;
  createdAt: string;
}

export default function CampaignDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [tasks, setTasks] = useState<ResearchTask[]>([]);
  const [linkedStrategies, setLinkedStrategies] = useState<Strategy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showStrategyForm, setShowStrategyForm] = useState(false);
  const [strategyName, setStrategyName] = useState("");
  const [strategyFamily, setStrategyFamily] = useState("momentum");
  const [strategyError, setStrategyError] = useState<string | null>(null);
  const [strategySubmitting, setStrategySubmitting] = useState(false);

  useEffect(() => {
    if (!id) return;
    void (async () => {
      setLoading(true);
      try {
        const [c, t, s] = await Promise.all([
          campaignApi.get(id),
          fetch(`${process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3001/api/v1"}/campaigns/${id}/tasks`, {
            headers: {
              "X-Stub-User-Id": "user_dev",
              "X-Stub-Org-Id": "org_dev",
              "X-Stub-Role": "ADMIN",
            },
          }).then((r) => r.json() as Promise<ResearchTask[]>),
          strategyApi.list().then((all) => all.filter((s) => s.campaignId === id)).catch(() => [] as Strategy[]),
        ]);
        setCampaign(c);
        setTasks(t);
        setLinkedStrategies(s);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load campaign");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const handleCreateStrategy = async () => {
    if (!strategyName.trim() || !id) return;
    setStrategySubmitting(true);
    setStrategyError(null);
    try {
      const s = await strategyApi.create({ name: strategyName.trim(), family: strategyFamily, campaignId: id });
      setLinkedStrategies((prev) => [...prev, s]);
      setStrategyName("");
      setShowStrategyForm(false);
    } catch (e) {
      setStrategyError(e instanceof Error ? e.message : "Failed to create strategy");
    } finally {
      setStrategySubmitting(false);
    }
  };

  if (loading) return <div className="text-[var(--muted-fg)] text-sm">Loading...</div>;
  if (error) return <div className="text-[var(--danger)] text-sm">{error}</div>;
  if (!campaign) return null;

  const stateBadge = (state: string) => {
    if (state.includes("APPROVED") || state === "LIVE_CANDIDATE") return "text-[var(--success)]";
    if (state === "REJECTED") return "text-[var(--danger)]";
    if (state === "BLOCKED") return "text-[var(--warning)]";
    return "text-[var(--muted-fg)]";
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <div className="flex items-center gap-2 text-sm text-[var(--muted-fg)] mb-2">
          <Link href="/campaigns" className="hover:text-[var(--foreground)]">Campaigns</Link>
          <span>/</span>
          <span>{campaign.title}</span>
        </div>
        <h1 className="text-2xl font-bold">{campaign.title}</h1>
        <p className="text-[var(--muted-fg)] mt-1">{campaign.objective}</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <div className="rounded-lg border border-[var(--card-border)] bg-[var(--card)] p-3">
          <div className="text-[var(--muted-fg)] text-xs">Status</div>
          <div className="font-mono text-xs mt-1">{campaign.status}</div>
        </div>
        <div className="rounded-lg border border-[var(--card-border)] bg-[var(--card)] p-3">
          <div className="text-[var(--muted-fg)] text-xs">Markets</div>
          <div className="mt-1">{campaign.markets.length > 0 ? campaign.markets.join(", ") : "—"}</div>
        </div>
        <div className="rounded-lg border border-[var(--card-border)] bg-[var(--card)] p-3">
          <div className="text-[var(--muted-fg)] text-xs">Budget</div>
          <div className="mt-1">{campaign.modelBudgetUsd ? `$${campaign.modelBudgetUsd}` : "Unlimited"}</div>
        </div>
        <div className="rounded-lg border border-[var(--card-border)] bg-[var(--card)] p-3">
          <div className="text-[var(--muted-fg)] text-xs">Created</div>
          <div className="mt-1">{new Date(campaign.createdAt).toLocaleDateString()}</div>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">Strategies ({linkedStrategies.length})</h2>
          <button
            onClick={() => { setShowStrategyForm((v) => !v); setStrategyError(null); }}
            className="text-sm px-3 py-1 rounded bg-[var(--accent)] text-white hover:opacity-90"
          >
            {showStrategyForm ? "Cancel" : "+ Add Strategy"}
          </button>
        </div>

        {showStrategyForm && (
          <div className="rounded-lg border border-[var(--card-border)] bg-[var(--card)] p-4 mb-3 space-y-3">
            <div>
              <label className="text-xs text-[var(--muted-fg)] block mb-1">Strategy Name</label>
              <input
                className="w-full rounded border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm"
                placeholder="e.g. RSI Reversal BTCUSDT 1h"
                value={strategyName}
                onChange={(e) => setStrategyName(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-[var(--muted-fg)] block mb-1">Family</label>
              <select
                className="w-full rounded border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm"
                value={strategyFamily}
                onChange={(e) => setStrategyFamily(e.target.value)}
              >
                <option value="momentum">Momentum</option>
                <option value="mean-reversion">Mean Reversion</option>
                <option value="trend-following">Trend Following</option>
                <option value="breakout">Breakout</option>
                <option value="volatility">Volatility</option>
                <option value="unknown">Other</option>
              </select>
            </div>
            {strategyError && <div className="text-xs text-[var(--danger)]">{strategyError}</div>}
            <button
              onClick={() => void handleCreateStrategy()}
              disabled={strategySubmitting || !strategyName.trim()}
              className="px-4 py-2 rounded bg-[var(--accent)] text-white text-sm disabled:opacity-50"
            >
              {strategySubmitting ? "Creating…" : "Create Strategy"}
            </button>
          </div>
        )}

        {linkedStrategies.length === 0 && !showStrategyForm ? (
          <div className="rounded-lg border border-[var(--card-border)] bg-[var(--card)] p-4 text-center text-[var(--muted-fg)] text-sm mb-3">
            No strategies yet. Add one to start building.
          </div>
        ) : (
          <div className="space-y-2 mb-3">
            {linkedStrategies.map((s) => (
              <Link
                key={s.id}
                href={`/strategies/${s.id}`}
                className="flex items-center justify-between rounded-lg border border-[var(--card-border)] bg-[var(--card)] p-3 hover:border-[var(--accent)] transition-colors"
              >
                <div>
                  <div className="text-sm font-medium">{s.name}</div>
                  <div className="text-xs text-[var(--muted-fg)] mt-0.5">{s.family} · v{s.currentVersionId ? "1+" : "1"}</div>
                </div>
                <div className="text-xs font-mono text-[var(--muted-fg)]">{s.status}</div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div>
        <h2 className="font-semibold mb-3">Research Tasks ({tasks.length})</h2>
        {tasks.length === 0 ? (
          <div className="rounded-lg border border-[var(--card-border)] bg-[var(--card)] p-6 text-center text-[var(--muted-fg)] text-sm">
            No research tasks yet. Tasks are created by research agents.
          </div>
        ) : (
          <div className="space-y-2">
            {tasks.map((task) => (
              <div
                key={task.id}
                className="rounded-lg border border-[var(--card-border)] bg-[var(--card)] p-4"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-medium text-sm">{task.title}</div>
                    {task.description && (
                      <div className="text-xs text-[var(--muted-fg)] mt-1">{task.description}</div>
                    )}
                    {task.strategyVersionId && (
                      <Link
                        href={`/strategies/${task.strategyId ?? ""}`}
                        className="text-xs text-[var(--accent)] mt-1 inline-block hover:underline"
                      >
                        View Strategy →
                      </Link>
                    )}
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <div className={`text-xs font-mono ${stateBadge(task.state)}`}>
                      {task.state.replace(/_/g, " ")}
                    </div>
                    {task.assignedRole && (
                      <div className="text-xs text-[var(--muted-fg)] mt-1">{task.assignedRole}</div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
