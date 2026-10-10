# Paid model runs: ledger

Every paid run, newest last. The standing budget is **$25 per calendar month** (UTC). A request whose cap would take the month past $25, counting the actual cost of the month's earlier runs, is refused before any call. `agent/run.mjs --live` appends a row after each run, including runs that stop early or fail partway, so a partial spend is counted too. Cost is computed from the token usage each reply reported, priced with `PRICES` in `agent/runs.mjs`.

| Date | PR | Models | Tickets | Repeats | Cap | Actual cost | Status |
|---|---|---|---|---|---|---|---|
| 2026-10-10 | #86 | claude-opus-5-5, claude-haiku-5-5 | standard | 1 | $11.50 | $0.3629 | finished (run locally, earlier account) |
| 2026-10-10 | #86 | claude-haiku-5-5 (shared session) | standard | 1 | $0.50 | $0.0109 | finished |
| 2026-10-10 | #87 | claude-haiku-5-5, claude-sonnet-5-5, claude-opus-5-5 | standard, stress | 5 | $15.00 | $4.7099 | cancelled at the 30-minute job limit during Opus on the stress tickets; $3.5899 logged exactly for the five finished parts, plus $1.1200 estimated (the full Opus stress part, to be safe; about half had run). Recordings lost: the job was cancelled before its commit step. Exact cost is in the Console. |
