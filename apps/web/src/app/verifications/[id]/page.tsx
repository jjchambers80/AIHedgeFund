"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  verifications,
  type TradingViewVerification,
  type ReportUpload,
} from "@/lib/api-client";

type ReportType = "PERFORMANCE_SUMMARY" | "LIST_OF_TRADES";

const REPORT_LABELS: Record<ReportType, string> = {
  PERFORMANCE_SUMMARY: "Performance Summary",
  LIST_OF_TRADES: "List of Trades",
};

const STATUS_COLORS: Record<string, string> = {
  PENDING: "var(--warning)",
  AWAITING_PARITY: "var(--warning)",
  VERIFIED: "var(--success)",
  PARITY_FAILED: "var(--danger)",
  QUEUED: "var(--muted-fg)",
  PARSING: "var(--warning)",
  COMPLETE: "var(--success)",
  FAILED: "var(--danger)",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      style={{
        color: STATUS_COLORS[status] ?? "var(--muted-fg)",
        fontWeight: 600,
        fontSize: "0.75rem",
        letterSpacing: "0.05em",
        textTransform: "uppercase",
      }}
    >
      {status}
    </span>
  );
}

type UploadState = { phase: "idle" } | { phase: "uploading"; pct: number } | { phase: "completing" } | { phase: "error"; message: string };

/** Report parses asynchronously via the worker queue — keep polling until it lands. */
const TERMINAL_PARSE_STATUSES = new Set(["COMPLETE", "FAILED"]);

function UploadSection({
  verificationId,
  reportType,
  existingUpload,
  onUploaded,
}: {
  verificationId: string;
  reportType: ReportType;
  existingUpload: ReportUpload | undefined;
  onUploaded: () => void;
}) {
  const [state, setState] = useState<UploadState>({ phase: "idle" });

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setState({ phase: "uploading", pct: 0 });

    try {
      const presign = await verifications.presign(verificationId, reportType);
      setState({ phase: "uploading", pct: 10 });

      const putRes = await fetch(presign.presignedUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": "text/csv" },
      });
      if (!putRes.ok) throw new Error(`Upload failed: HTTP ${putRes.status}`);
      setState({ phase: "completing" });

      const buf = await file.arrayBuffer();
      const hashBuf = await crypto.subtle.digest("SHA-256", buf);
      const hashHex = Array.from(new Uint8Array(hashBuf))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      await verifications.completeUpload(verificationId, presign.uploadId, {
        checksumSha256: hashHex,
        fileSizeBytes: file.size,
      });
      setState({ phase: "idle" });
      onUploaded();
    } catch (err) {
      setState({ phase: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }

  const label = REPORT_LABELS[reportType];
  const active = existingUpload;

  return (
    <div
      style={{
        background: "var(--card)",
        border: "1px solid var(--card-border)",
        borderRadius: 8,
        padding: "1.25rem",
        display: "flex",
        flexDirection: "column",
        gap: "0.75rem",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontWeight: 600 }}>{label}</span>
        {active && <StatusBadge status={active.parseStatus} />}
      </div>

      {active && (
        <div style={{ fontSize: "0.8rem", color: "var(--muted-fg)" }}>
          <div>Uploaded: {new Date(active.createdAt).toLocaleString()}</div>
          {active.parseWarnings.length > 0 && (
            <ul style={{ margin: "0.25rem 0 0 1rem", padding: 0 }}>
              {active.parseWarnings.map((w, i) => (
                <li key={i} style={{ color: "var(--warning)" }}>
                  {w.code}: {w.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {state.phase === "uploading" && (
        <div style={{ fontSize: "0.85rem", color: "var(--muted-fg)" }}>Uploading…</div>
      )}
      {state.phase === "completing" && (
        <div style={{ fontSize: "0.85rem", color: "var(--muted-fg)" }}>Completing upload…</div>
      )}
      {state.phase === "error" && (
        <div style={{ fontSize: "0.85rem", color: "var(--danger)" }}>{state.message}</div>
      )}

      <label
        style={{
          display: "inline-block",
          cursor: state.phase === "uploading" || state.phase === "completing" ? "not-allowed" : "pointer",
          opacity: state.phase === "uploading" || state.phase === "completing" ? 0.5 : 1,
        }}
      >
        <span
          style={{
            display: "inline-block",
            padding: "0.4rem 0.9rem",
            background: "var(--accent)",
            color: "#fff",
            borderRadius: 5,
            fontSize: "0.85rem",
            fontWeight: 600,
          }}
        >
          {active ? "Re-upload CSV" : "Upload CSV"}
        </span>
        <input
          type="file"
          accept=".csv,text/csv"
          style={{ display: "none" }}
          disabled={state.phase === "uploading" || state.phase === "completing"}
          onChange={handleFile}
        />
      </label>
    </div>
  );
}

export default function VerificationPage() {
  const { id } = useParams<{ id: string }>();
  const [verification, setVerification] = useState<TradingViewVerification | null>(null);
  const [uploads, setUploads] = useState<ReportUpload[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    const [verif, uploadList] = await Promise.all([
      verifications.get(id),
      verifications.listUploads(id),
    ]);
    setVerification(verif);
    setUploads(uploadList);
  };

  useEffect(() => {
    refresh()
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    const hasPending = uploads.some((u) => !TERMINAL_PARSE_STATUSES.has(u.parseStatus) && u.parseStatus !== "AWAITING_UPLOAD");
    if (!hasPending) return;
    const interval = setInterval(() => {
      refresh().catch(() => {
        /* transient poll failure — next tick retries */
      });
    }, 2000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uploads, id]);

  if (loading) {
    return (
      <div style={{ padding: "2rem", color: "var(--muted-fg)" }}>Loading verification…</div>
    );
  }
  if (error) {
    return <div style={{ padding: "2rem", color: "var(--danger)" }}>Error: {error}</div>;
  }
  if (!verification) {
    return <div style={{ padding: "2rem", color: "var(--muted-fg)" }}>Verification not found.</div>;
  }

  return (
    <div style={{ padding: "2rem", maxWidth: 720, margin: "0 auto", display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <div>
        <h1 style={{ fontSize: "1.25rem", fontWeight: 700, margin: 0 }}>TradingView Verification</h1>
        <p style={{ margin: "0.25rem 0 0", fontSize: "0.8rem", color: "var(--muted-fg)" }}>
          HISTORICAL / SIMULATED results only — past performance does not guarantee future results.
        </p>
      </div>

      <div
        style={{
          background: "var(--card)",
          border: "1px solid var(--card-border)",
          borderRadius: 8,
          padding: "1.25rem",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "0.6rem 1.5rem",
          fontSize: "0.85rem",
        }}
      >
        <Detail label="Verification ID" value={verification.id} mono />
        <Detail label="Status" value={<StatusBadge status={verification.status} />} />
        <Detail label="Strategy Version" value={verification.strategyVersionId} mono />
        <Detail label="Pine Revision" value={verification.pineRevisionId} mono />
        <Detail label="Symbol" value={verification.symbol} />
        <Detail label="Timeframe" value={verification.timeframe} />
        {verification.dateFrom && <Detail label="Date From" value={verification.dateFrom} />}
        {verification.dateTo && <Detail label="Date To" value={verification.dateTo} />}
      </div>

      <div>
        <h2 style={{ fontSize: "1rem", fontWeight: 600, margin: "0 0 0.75rem" }}>Required Reports</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <UploadSection
            verificationId={id}
            reportType="PERFORMANCE_SUMMARY"
            existingUpload={uploads.find((u) => u.reportType === "PERFORMANCE_SUMMARY")}
            onUploaded={refresh}
          />
          <UploadSection
            verificationId={id}
            reportType="LIST_OF_TRADES"
            existingUpload={uploads.find((u) => u.reportType === "LIST_OF_TRADES")}
            onUploaded={refresh}
          />
        </div>
      </div>

      <p style={{ fontSize: "0.75rem", color: "var(--muted-fg)", margin: 0 }}>
        All results are SIMULATED / HISTORICAL. Labels HISTORICAL and SIMULATED apply to all data shown on this page.
        This platform does not represent live trading performance.
      </p>
    </div>
  );
}

function Detail({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div>
      <div style={{ color: "var(--muted-fg)", fontSize: "0.75rem", marginBottom: 2 }}>{label}</div>
      <div style={{ fontFamily: mono ? "monospace" : undefined, wordBreak: "break-all" }}>{value}</div>
    </div>
  );
}
