# ADR-004: TradingView Verification — Human-Assisted CSV Upload

**Status:** Accepted

## Context

ARF-OS treats TradingView as the canonical acceptance environment for Pine Script strategy behaviour. Before a strategy version can advance to the committee review stage, its backtest results must be verified against a TradingView run using the identical Pine source, symbol, timeframe, date range, and cost model. The key technical question is how to obtain TradingView output reliably.

TradingView does not provide a public API for programmatic backtest execution or report retrieval. The two mechanically possible approaches are browser automation (Playwright or Puppeteer controlling a logged-in TradingView session) and human-assisted export of the CSV backtest report from the TradingView UI.

## Decision

Use **human-assisted CSV upload** as the verification path. A human operator opens the strategy in TradingView, runs the backtest with the exact parameters recorded in the strategy manifest, exports the List of Trades CSV from the Strategy Tester panel, and uploads the file through the ARF-OS verification UI.

The platform handles the rest: it issues a presigned S3 upload URL, accepts the file, validates the checksum and content type, stores the raw CSV immutably in object storage, and enqueues a parsing job. The parser identifies the report format, maps columns through a versioned adapter, and produces a structured `TradingViewReport` record. A parity worker then compares the parsed trades against the ARF-OS backtest run for the same strategy version, producing a `ParityReport` with pass/warn/fail status.

Parser adapters are versioned and tested against fixture CSVs for each known TradingView export format (`pine/fixtures/tradingview-exports/`). The raw CSV is always preserved; re-parsing with a newer adapter is possible without re-uploading.

**Scope note on "first trade divergence" (added after initial implementation):** TradingView's Performance Summary export carries only aggregate metrics — it has no trade-level detail, and the List of Trades export *is* ARF-OS's only trade-level data source for a given verification. There is therefore no independent TradingView trade sequence to diff against; a literal TV-vs-ARF first-trade comparison isn't computable from these two report types. `firstTradeDivergence` is implemented instead as an internal-consistency check: the first trade (by trade number) where the CSV-reported net P&L disagrees, beyond a one-cent tolerance, with the net P&L recomputed independently from entry price, exit price, quantity, and commission (`packages/metrics/src/parity.ts::findFirstTradeDivergence`). This catches parser bugs and data corruption (e.g. a misaligned CSV column) rather than TV-vs-ARF drift, and forces the parity status to `FAIL` when triggered. A true cross-source first-divergence check would require TradingView to expose a second, independent trade-level export — not available today.

## Alternatives

**Playwright browser automation** — would allow unattended verification and could support continuous overnight parity runs. Rejected for MVP under CLAUDE.md §3.8: browser automation against an external UI is a fragile dependency. TradingView's DOM structure, login flows, and rate limits are outside our control. A breakage at any point silently blocks the entire verification pipeline. An ADR approving automation must document reliability guarantees and security implications (storing TradingView credentials) before this path is opened.

**TradingView Pine API (if/when available)** — would be the preferred automated path if TradingView exposes a stable programmatic interface. No such interface exists at the time of this decision.

**Screenshot-based extraction** — explicitly prohibited by CLAUDE.md §26. CSV structured data is available; screenshots must never be treated as canonical when structured data exists.

## Consequences

- Verification throughput is limited by human operator availability. Automated research pipelines must pause at the TradingView verification stage until a human completes the upload.
- The upload UI must clearly display the exact Pine source hash, symbol, timeframe, date range, commission, slippage, and sizing that the operator must reproduce in TradingView.
- Parser failures surface as verification-task errors, not silent successes. Operators are notified and can re-export with corrected settings.
- Each supported TradingView export format requires a fixture CSV in the test suite. Parser changes must pass the full fixture suite before merge.

## Security implications

Uploaded CSVs are stored in org-scoped object paths and are accessible only to members of the owning organisation. The upload endpoint validates that the file matches an active verification task owned by the requesting user's organisation, preventing cross-org file injection. File size is capped at 50 MB. Content-type is validated before parsing begins. Raw provider output (the CSV) is stored separately from the parsed structured record to allow forensic review if a parity discrepancy is disputed.

## Migration/rollback

If a parser bug is discovered after verification has already occurred, the raw CSV is still in object storage. Re-parsing can be triggered by resetting the verification task to the `UPLOADED` state and re-enqueuing the parse job. Parity reports reference both the parser version and the raw object key, so the audit trail is preserved regardless of how many times the file is re-parsed.
