"use client";
/**
 * Campaigns list — Command Centre screen.
 * Client component: fetches campaigns on mount, supports create.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { campaigns as campaignApi, type Campaign } from "@/lib/api-client";

export default function CampaignsPage() {
  const [items, setItems] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: "", objective: "" });
  const [showForm, setShowForm] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await campaignApi.list();
      setItems(res.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load campaigns");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim() || !form.objective.trim()) return;
    setCreating(true);
    try {
      await campaignApi.create({ title: form.title.trim(), objective: form.objective.trim() });
      setForm({ title: "", objective: "" });
      setShowForm(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create campaign");
    } finally {
      setCreating(false);
    }
  }

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      CAMPAIGN_BACKLOG: "bg-gray-700 text-gray-300",
      IDEA_RESEARCH: "bg-blue-900 text-blue-300",
      PINE_DEVELOPMENT: "bg-purple-900 text-purple-300",
      TRADINGVIEW_VERIFICATION: "bg-yellow-900 text-yellow-300",
      RESEARCH_APPROVED: "bg-green-900 text-green-300",
      REJECTED: "bg-red-900 text-red-300",
      LIVE_CANDIDATE: "bg-emerald-900 text-emerald-300",
    };
    return colors[status] ?? "bg-gray-700 text-gray-300";
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Campaigns</h1>
          <p className="text-sm text-[var(--muted-fg)]">Research campaigns drive strategy discovery</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 rounded bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-medium"
        >
          New Campaign
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={(e) => void handleCreate(e)}
          className="rounded-lg border border-[var(--card-border)] bg-[var(--card)] p-5 space-y-4"
        >
          <h2 className="font-semibold text-sm">Create Campaign</h2>
          <div>
            <label className="block text-xs text-[var(--muted-fg)] mb-1">Title</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              className="w-full bg-[var(--background)] border border-[var(--card-border)] rounded px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
              placeholder="e.g. Trend Following Futures 2025"
              required
            />
          </div>
          <div>
            <label className="block text-xs text-[var(--muted-fg)] mb-1">Research Objective</label>
            <textarea
              value={form.objective}
              onChange={(e) => setForm((f) => ({ ...f, objective: e.target.value }))}
              className="w-full bg-[var(--background)] border border-[var(--card-border)] rounded px-3 py-2 text-sm outline-none focus:border-[var(--accent)] h-20 resize-none"
              placeholder="Describe the research hypothesis and goals"
              required
            />
          </div>
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={creating}
              className="px-4 py-2 rounded bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-medium disabled:opacity-50"
            >
              {creating ? "Creating..." : "Create Campaign"}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-2 rounded border border-[var(--card-border)] text-sm hover:border-[var(--accent)]"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {error && (
        <div className="rounded-lg border border-red-700 bg-red-900/20 p-4 text-sm text-[var(--danger)]">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-[var(--muted-fg)] text-sm">Loading campaigns...</div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-[var(--card-border)] bg-[var(--card)] p-8 text-center text-[var(--muted-fg)] text-sm">
          No campaigns yet. Create one to start tracking research.
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((c) => (
            <Link
              key={c.id}
              href={`/campaigns/${c.id}`}
              className="block rounded-lg border border-[var(--card-border)] bg-[var(--card)] p-4 hover:border-[var(--accent)] transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="font-medium truncate">{c.title}</div>
                  <div className="text-sm text-[var(--muted-fg)] mt-1 line-clamp-2">{c.objective}</div>
                </div>
                <div className="flex-shrink-0 text-right space-y-1">
                  <span className={`inline-block text-xs px-2 py-0.5 rounded ${statusBadge(c.status)}`}>
                    {c.status.replace(/_/g, " ")}
                  </span>
                  <div className="text-xs text-[var(--muted-fg)]">
                    {new Date(c.createdAt).toLocaleDateString()}
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
