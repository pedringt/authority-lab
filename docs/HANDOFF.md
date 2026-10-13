# Handoff: where Authority Lab stands (2026-10-13, end of day)

Read this first, then `CLAUDE.md` (the working rules) and `docs/DECISIONS.md` (every product rule, with the "Redesign (2026-10-12, Paige)" entry at the top of the Interface section). Verify the live state with `gh pr list` and `git log origin/main -3` before trusting anything here.

## Right now: everything is merged; the next exercise is Question Investigator

`main` = `a398483` (published records, #133), live on https://authority-lab.vercel.app/ and checked there. Nothing Authority Lab-side is waiting in a PR.

**On `main`:**
- **The redesign** (#106 to #114).
- **External evidence** (#118 to #120: `src/store/external.js`, `src/store/measures.js`, `docs/EXTERNAL_EVIDENCE.md`).
- **The evidence-configuration model** (#126: evidence sources, manual results, Configure evidence, coverage, the Evidence setup stage, Monitor's evidence signals, the Northstar example).
- **State's workspace** (#121), built from `src/data/workspaces/state.js` by the generic `buildWorkspace`.
- **State's first real evidence** (#132: run 38411808397, 16/16; it reads 5 of 5 checks met).
- **Published records** (#133). A client workspace shows its published record read-only to every visitor. "Try changes in this browser" is local only. A decision becomes real only when its `authority-lab-record/1` file is committed to `src/data/published-records/`; it is replayed through the same checks on every load.

**Not done:**
- **Paige's Draft decision for State** exists only in her browser; she hasn't published it yet. When she pastes its file (Copy on the record page, in "try changes" mode), commit it under `src/data/published-records/`, add it to `index.json`, and open a PR. CI replays it. Merging needs her OK.
- **The design round 1 package** (Paige's Cowork mockups, research and a design HANDOFF, in `~/Desktop/authority-lab-design-round-1.zip`) is **on hold**: the visual redesign is paused. Don't commit it or open its gap report unless she asks.

**Process rules (Paige, 2026-10-13; also in CLAUDE.md):**
- **Paige makes product decisions.** Claude builds mechanics and reports technical facts; it stops and asks at any setup step that needs product judgment.
- **Merges need her named destination.**
- **The visual redesign is paused:** no styling or layout changes.

**The next Authority Lab work comes from State's Question Investigator** (pedringt/ai-learning#142). After it's built and measured there, it becomes a new, otherwise blank workspace here: only its source pre-connected, with every product decision Paige's, done from scratch. See `docs/PROJECT_STATUS.md` in ai-learning for the decisions so far.

Tests: `npm test` 351 pass, `npm test --prefix agent` 46 pass (on `a398483`).

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

1. **Question Investigator, in State first** (pedringt/ai-learning#142). Decisions 1 to 4 are made. Decision 5 (the eval cases) is in progress: the Q-101 test card waits for Paige's approval (`docs/evals/question-investigator-cases.md` in ai-learning, on its handoff branch).
2. **Publish Paige's Draft decision for State** when she sends its file (see "Not done").
3. **Later:**
   - #130: judge a check across runs;
   - #134: setup summaries (paused with the redesign);
   - #117: runtime policy check;
   - #105: stakeholder tradeoff.
