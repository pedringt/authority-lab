# Handoff: where Authority Lab stands (2026-10-12, after the redesign shipped)

Read this first, then `CLAUDE.md` (the working rules) and `docs/DECISIONS.md` (every product rule, with the "Redesign (2026-10-12, Paige)" entry at the top of the Interface section). Verify the live state with `gh pr list` and `git log origin/main -3` before trusting anything here.

## Right now: the redesign is live and reviewed

The eight redesign PRs (#106–#113) merged to `main` on 2026-10-12 (merge `908b803`) and deployed to https://authority-lab.vercel.app/. Paige reviewed the live site: structurally in a good place, polish only. The two fixes from that review (the "Needs a decision" heading, the ladder's screen-reader label) and these doc updates went in together. Her keep list is in DECISIONS.md ("Review of the live redesign"): don't redesign further on the strength of that review.

**Merging:** for now `main` is the testing ground (Paige, 2026-10-12). Merge your own PRs to `main` once CI is green; batch them, because each merge is a Vercel deploy. Still stop for product decisions, governance rules and paid runs (CLAUDE.md, "How to work"). After a merge, confirm the deploy: GitHub deployment status, then fetch a changed file from the live site.

The redesign's structure, for reference: four capability tabs (Status, Decide, Monitor, History) in a header panel; a quiet global bar (Overview, Capabilities, Records) and Settings menu; "Demo as"; one view module per tab (`src/views/cap-*.js`); old addresses rewritten in `src/routes.js`; first-visit welcome and the seven-step guided demo.

Tests: `node --test scripts/*.test.mjs` 291 pass, `npm test --prefix agent` 46 pass.

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

- **#105, a realistic stakeholder tradeoff on one autonomy decision** (Paige's issue): positions stay distinct instead of averaging into consensus, the decision says which evidence mattered, the approved limits reflect the tradeoff, and the record says what would reopen it. Keep it subordinate to the core decision flow; not a stakeholder-management tool. Not scoped yet: propose a plan before building.
- Otherwise the roadmap in DECISIONS.md is complete.
