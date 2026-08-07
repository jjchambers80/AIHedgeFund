"use client";
/**
 * Campaign Detail — shows research tasks and linked strategies.
 */
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { campaigns as campaignApi, type Campaign } from "@/lib/api-client";

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    void (async () => {
      setLoading(true);
      try {
        const [c, t] = await Promise.all([
          campaignApi.get(id),
          fetch(`${process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3001/api/v1"}/campaigns/${id}/tasks`, {
            headers: {
              "X-Stub-User-Id": "user_dev",
              "X-Stub-Org-Id": "org_dev",
              "X-Stub-Role": "ADMIN",
            },
          }).then((r) => r.json() as Promise<ResearchTask[]>),
        ]);
        setCampaign(c);
        setTasks(t);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load campaign");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

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
