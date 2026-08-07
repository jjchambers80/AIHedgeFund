/**
 * Command Centre — the dashboard/home screen.
 * Server component: fetches campaigns and recent strategies server-side.
 */
import Link from "next/link";

export default function CommandCentre() {
  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Command Centre</h1>
        <p className="text-[var(--muted-fg)] text-sm mt-1">
          Algorithmic Research Framework — Operating System
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link
          href="/campaigns"
          className="block p-5 rounded-lg border border-[var(--card-border)] bg-[var(--card)] hover:border-[var(--accent)] transition-colors"
        >
          <div className="text-3xl mb-2">📋</div>
          <div className="font-semibold">Campaigns</div>
          <div className="text-sm text-[var(--muted-fg)] mt-1">
            Manage research campaigns and track strategy development lifecycle
          </div>
        </Link>

        <Link
          href="/strategies"
          className="block p-5 rounded-lg border border-[var(--card-border)] bg-[var(--card)] hover:border-[var(--accent)] transition-colors"
        >
          <div className="text-3xl mb-2">📈</div>
          <div className="font-semibold">Strategy Library</div>
          <div className="text-sm text-[var(--muted-fg)] mt-1">
            Browse immutable strategy versions with equity curves and parity reports
          </div>
        </Link>

        <div className="p-5 rounded-lg border border-[var(--card-border)] bg-[var(--card)] opacity-50">
          <div className="text-3xl mb-2">🔬</div>
          <div className="font-semibold">Backtest Lab</div>
          <div className="text-sm text-[var(--muted-fg)] mt-1">
            Coming soon — independent metric verification and parity comparison
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-[var(--card-border)] bg-[var(--card)] p-5">
        <h2 className="font-semibold mb-3">System Status</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <div className="text-[var(--muted-fg)]">Mode</div>
            <div className="font-mono text-[var(--accent)]">
              {process.env["NEXT_PUBLIC_STUB_AUTH"] === "true" ? "STUB DEV" : "PRODUCTION"}
            </div>
          </div>
          <div>
            <div className="text-[var(--muted-fg)]">API</div>
            <div className="font-mono text-xs">
              {process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3001"}
            </div>
          </div>
          <div>
            <div className="text-[var(--muted-fg)]">Platform</div>
            <div>ARF-OS v0.1.0</div>
          </div>
          <div>
            <div className="text-[var(--muted-fg)]">Pine</div>
            <div>v6 (TradingView)</div>
          </div>
        </div>
      </div>
    </div>
  );
}
