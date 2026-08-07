"use client";
/**
 * Strategy Library — shows all strategies for the org.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { strategies as strategyApi, type Strategy } from "@/lib/api-client";

export default function StrategyLibraryPage() {
  const [items, setItems] = useState<Strategy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const data = await strategyApi.list();
        setItems(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load strategies");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const statusColour = (status: string) => {
    if (status === "LIVE_CANDIDATE" || status === "LIVE_APPROVED") return "text-[var(--success)]";
    if (status === "REJECTED" || status === "ARCHIVED") return "text-[var(--danger)]";
    if (status === "RESEARCH_APPROVED" || status === "PAPER_APPROVED") return "text-[var(--warning)]";
    return "text-[var(--muted-fg)]";
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Strategy Library</h1>
        <p className="text-sm text-[var(--muted-fg)]">
          All strategy versions are immutable. Changes create new versions with full lineage.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-700 bg-red-900/20 p-4 text-sm text-[var(--danger)]">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-[var(--muted-fg)] text-sm">Loading strategies...</div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-[var(--card-border)] bg-[var(--card)] p-8 text-center text-[var(--muted-fg)] text-sm">
          No strategies yet. Strategies are created by the Pine Engineer agent or via the API.
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((s) => (
            <Link
              key={s.id}
              href={`/strategies/${s.id}`}
              className="block rounded-lg border border-[var(--card-border)] bg-[var(--card)] p-4 hover:border-[var(--accent)] transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="font-medium">{s.name}</div>
                  <div className="text-xs text-[var(--muted-fg)] mt-1">
                    Family: {s.family} · ID: <span className="font-mono">{s.id.slice(0, 12)}…</span>
                  </div>
                  {s.currentVersionId && (
                    <div className="text-xs text-[var(--muted-fg)] mt-0.5">
                      Current version: <span className="font-mono">{s.currentVersionId.slice(0, 12)}…</span>
                    </div>
                  )}
                </div>
                <div className="flex-shrink-0 text-right">
                  <div className={`text-xs font-mono ${statusColour(s.status)}`}>{s.status}</div>
                  <div className="text-xs text-[var(--muted-fg)] mt-1">
                    {new Date(s.updatedAt).toLocaleDateString()}
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
