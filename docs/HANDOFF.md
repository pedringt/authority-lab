# Handoff: where Authority Lab stands (2026-10-12)

Read this first, then `CLAUDE.md` (the working rules) and `docs/DECISIONS.md` (every product rule, with the "Redesign (2026-10-12, Paige)" entry at the top of the Interface section). Verify the live state with `gh pr list` and `git log origin/main -3` before trusting anything here.

## Right now: the redesign is built and waiting for Paige to merge

Eight stacked PRs, CI green, all left open for Paige. Paige approved the direction and the clickable mockup; she hasn't yet reviewed the built PRs.

| PR | Branch → base | What |
|---|---|---|
| #106 | `redesign/foundation` → `main` | Four capability tabs (Status, Decide, Monitor, History) in a header panel; quiet dark global bar; "Demo as"; one view module per tab (`src/views/cap-*.js`); old addresses rewritten in `src/routes.js` |
| #107 | `redesign/status` → foundation | Status tells one story: what it does now, why it's here, what happens next, then. Waiting actions as rows; boundaries and people as one-liners |
| #108 | `redesign/decide` → status | Decide as one vertical flow; four plain choices mapping to the recorded options |
| #109 | `redesign/monitor` → decide | Monitor leads with one verdict; History is a timeline |
| #110 | `redesign/overview` → monitor | Overview as compact work rows; "Current autonomy" table |
| #111 | `redesign/setup` → overview | One person can start a workspace; four-question Add capability ("what it does today" is context, never above Level 1); three setup stages; simple People table |
| #112 | `redesign/guide` → setup | First-visit welcome choice and the seven-step guided demo (on its own in-memory copy of the demo) |
| #113 | `redesign/finish` → guide | Follow-ups, docs, and Paige's two decisions: founding roster narrowed, 20-case minimum production sample |

**To deploy once:** merge from the top down (#113 into `redesign/guide`, then #112, … #107 into `redesign/foundation`), waiting for CI on each new head, then #106 into `main`. Every merge to `main` is a Vercel production deploy. Confirm the deploy (GitHub deployment status, then fetch `https://authority-lab.vercel.app/` and check for new code, e.g. `settings-menu` and `src/views/guide.js`). After the deploy, close nothing automatically: these PRs have no linked issues.

Tests at the top of the stack: `node --test scripts/*.test.mjs` 290 pass, `npm test --prefix agent` 46 pass.

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

Nothing is queued after the merge. After Paige reviews the deployed redesign, expect feedback on it; the roadmap in DECISIONS.md is otherwise complete.
