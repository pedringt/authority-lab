# Handoff: where Authority Lab stands (2026-10-13)

Read this first, then `CLAUDE.md` (the working rules) and `docs/DECISIONS.md` (every product rule, with the "Redesign (2026-10-12, Paige)" entry at the top of the Interface section). Verify the live state with `gh pr list` and `git log origin/main -3` before trusting anything here.

## Right now: State is onboarded as the first real client (PR open, not merged)

- **On `main`:**
  - the redesign (#106 to #113) and its review polish (#114);
  - the external evidence contract (#118, #119, #120: `src/store/external.js`, `src/store/measures.js`, `docs/EXTERNAL_EVIDENCE.md`);
  - the evidence-configuration model (#126: evidence sources, manual results, Configure evidence, coverage, the Evidence setup stage, Monitor's evidence signals, and the Northstar example).
- **#121, State's workspace, is on `main`** (merged with Paige's OK, `ab54dee`).
  - A second built-in workspace, built from configuration (`src/data/workspaces/state.js`) by the generic `buildWorkspace` (`src/store/workspaces.js`), plus a workspace switcher in the Settings menu.
  - No State-specific code; a test checks this.
  - No fictional evidence: State shows "0 of 5 decision requirements have sufficient evidence" until its results arrive.
- **Merging:** Paige must name the destination each time (CLAUDE.md, "How to work").
- **#518, State's first evidence file, is on `main`** (#132, `f372cb9`). Later deliveries follow the same steps:
  - Take the envelope from a State AI quality check run's artifact (`authority-lab-evidence-<run>-<attempt>`, kept 90 days).
  - Commit it under `src/data/external-evidence/`, add it to `index.json`, and open a PR. CI checks it.
  - The first delivered run is the Oct 13 verification run, 38411808397 (16/16, staging).
  - Decisions stay runtime records, never configuration (DECISIONS: "Configuration is the starting point").
- **State side (pedringt/ai-learning):** #517 (the export) is on State's `staging`, not promoted. #519 to #522 are side issues it found.
- **Known limit (#130):** a check is judged on the newest run only; State's own rule reads its suite across runs. Recorded, not built (Paige).

Tests: `npm test` 345 pass, `npm test --prefix agent` 46 pass.

## Reference material Paige approved (claude.ai artifacts, private to Paige)

- Redesign mockup (the approved target): https://claude.ai/artifact/MJjyZUmDJ4hfjgwfNBcjKy
- Copy audit (terms and wording rules): https://claude.ai/artifact/PWZJsUjKsNymyPcT8121q5
- Earlier simplification mockup (superseded): https://claude.ai/artifact/FrGwuVKKoT43f7rsn4wcBf

## Decisions made in this stretch (all in DECISIONS.md)

- Four capability tabs; single actions waiting for a person live on Status, Decide is only about overall authority.
- Four decision choices: Expand autonomy (then explicitly Within limits or Broad autonomy), Keep current limits, Reduce autonomy (one level down, or back to Observe), Pause and redesign. The record keeps the exact option.
- One person can start a workspace. **Founding roster:** a sole founding admin may make ONE other person a workspace admin without approval, recorded; nothing else skips approval.
- "What does it do today?" is context; new capabilities start at Level 1 at most.
- **Minimum production sample:** rollout goals are "Too early to judge" until 20 production cases (session or recorded real-model actions; never seeded or dry-run), or the number a goal names; an unjudged goal is never shown as missed.
- "Recommendation" (was "System recommendation"), with "Worked out from the evidence. You decide." (also in CLAUDE.md).
- Language: capability, automation, autonomy, human review; no anthropomorphic "the AI…". Levels are secondary except in onboarding, the decision flow and a quiet label.
- A7 live run mode: decided not to build (#71 closed).

## Small things noted but not changed (mention to Paige if relevant)

- Setup shows "Name who decides" under the Decide stage, though people are still named before the first test run (order and gating unchanged).
- Decide's "Propose a move to Level N" is still offered only below Level 2, as before.
- Coverage warnings ("add a second Risk approver") appear on the Overview, not on the capability page.
- Model runs call temptation tickets "trap" tickets.
- Seeded activity entries and any demo state saved in a visitor's browser keep older wording until Reset demo.
- Old `.ov-*` rules in `styles/app.css` are unused since the Overview rewrite.
- `ladder()` in `src/views/overview.js` (the five-square autonomy ladder) is exported but rendered nowhere today; its screen-reader label was fixed anyway in the review polish.
- Mobile layout is low priority for this project (Paige); don't chase phone widths.

## How the work is organised

- Views: `src/views/capability.js` is the frame; tabs are `cap-status.js`, `cap-decide.js`, `cap-monitor.js`, `cap-history.js`, shared helpers in `cap-shared.js`. Overview: `overview.js` + `src/store/overview.js`. Guided demo: `src/views/guide.js` (state lives in `src/main.js`, `guide`/`guideDo`).
- Styles: `styles/app.css` plus `styles/redesign.css` (one section per area).
- Tests: `scripts/store.test.mjs` plus per-area files `scripts/{status,decide,monitor,overview,setup,guide}.test.mjs`; agent tests in `agent/`.
- Screenshots for PRs go on the `pr-screenshots` branch (never merged), referenced by raw.githubusercontent.com URLs.
- Local preview: `python3 -m http.server 8140`. A first visit redirects to `#/welcome`; set `localStorage['authority-lab-welcomed'] = '1'` to skip it.

## Paid model runs (unchanged rules, see CLAUDE.md)

Standing budget $25 per calendar month; October spend is $11.20 (`agent/runs/ledger.md`). Paige OKs the plan, adds the `run-models` label herself and approves each run in GitHub. Claude never adds the label, approves a deployment, or reads the key. No paid runs are planned.

## What comes next

1. **Published records** (this work): State is read-only for visitors and shows only committed decisions. Paige recorded the Draft decision in her own browser on Oct 13; to publish it, she turns on "Try changes in this browser", opens the record, and its file is committed to `src/data/published-records/`.
3. Later: #130 (judging across runs), #117 (runtime policy check), #105 (stakeholder tradeoff).
